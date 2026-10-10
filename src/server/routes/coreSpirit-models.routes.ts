import { Router, type Response } from 'express';
import { compileCoreSpirit } from '../../services/coreSpirit/coreSpiritPipeline.js';
import {
  createResearchArtifact,
  coreSpiritSha256,
  coreSpiritDatasetVersion,
  loadModelForInference,
  verifyModelArtifactIntegrity,
  type ResearchArtifact,
} from '../../services/coreSpirit/modelArtifacts.js';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_IR_VERSION } from '../../services/coreSpirit/VERSION.js';
import { extractCoreSpiritSurfaceMetadata } from '../../services/coreSpirit/languageConcepts.js';
import { CoreSpiritGaussianHMM, type CoreSpiritGaussianHMMState } from '../../services/coreSpirit/quantMath.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { FyersMarketDataService } from '../fyers/market/FyersMarketDataService.js';
import { CoreSpiritDatasetProviderError, fetchCoreSpiritDatasetBars } from '../marketData/CoreSpiritDatasetProvider.js';
import { enqueueBackgroundJob } from '../jobs/queue.js';
import { CoreSpiritArtifactRepository } from '../storage/CoreSpiritArtifactRepository.js';
import { materializeCoreSpiritFeatureRows } from '../../services/coreSpirit/coreSpiritFeatureMaterializer.js';
import { lowerCoreSpiritResearchSource, parseCoreSpiritModelLifecycleSurface, type CoreSpiritModelLifecyclePlan } from '../../services/coreSpirit/modelLifecycleSurface.js';

export const coreSpiritModelRoutes = Router();
coreSpiritModelRoutes.use(requireUser);

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_ROWS = 1024;
const MAX_FEATURES = 16;

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

async function fetchFyersResearchBars(
  ownerUserId: string,
  datasetName: string,
  trainingRange: { from: string; to: string },
) {
  const session = await BrokerRepository.getSession('fyers', ownerUserId);
  if (!session || session.status !== 'Connected') {
    throw new CoreSpiritDatasetProviderError('Connect a FYERS account to fetch a named market dataset.', 401);
  }
  let accessToken: string;
  try {
    accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
  } catch {
    throw new CoreSpiritDatasetProviderError('Unable to decrypt the connected FYERS session. Reconnect FYERS and retry.', 401);
  }
  if (!process.env.FYERS_CLIENT_ID) {
    throw new CoreSpiritDatasetProviderError('FYERS_CLIENT_ID is not configured for market-history requests.', 503);
  }
  if (!accessToken.trim()) {
    throw new CoreSpiritDatasetProviderError('The connected FYERS session has no access token. Reconnect FYERS and retry.', 401);
  }
  const marketData = new FyersMarketDataService(new FyersApiClient(accessToken));
  return fetchCoreSpiritDatasetBars(datasetName, trainingRange, (dataset, from, to) =>
    marketData.history(dataset.symbol, dataset.resolution, from, to, { dateFormat: '1' }));
}

function parseFeatureNames(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_FEATURES ||
      value.some(name => typeof name !== 'string' || !name.trim() || name.length > 80)) {
    throw new Error('Provide 1–16 non-empty feature names (maximum 80 characters each).');
  }
  const names = value.map(name => String(name).trim());
  if (new Set(names).size !== names.length) throw new Error('Feature names must be unique.');
  return names;
}

function splitCallArguments(text: string): string[] {
  const args: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (character === '\\') { escaped = true; continue; }
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth = Math.max(0, depth - 1);
    else if (character === ',' && depth === 0) {
      args.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) args.push(tail);
  return args;
}

function extractDeclaredFeatureNames(source: string, modelFeatures: readonly string[]): string[] {
  const block = source.match(/(?:^|\n)\s*(?:features?|inputs?)\s*[:=]\s*(?:dataset|featureSet)\s*\{([\s\S]*?)\}/i);
  if (block) {
    const names = block[1]!.split(/\r?\n/)
      .map(line => line.trim().replace(/,$/, ''))
      .map(line => line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?::|$)/)?.[1])
      .filter((name): name is string => Boolean(name));
    if (names.length) return [...new Set(names)];
  }
  const datasetStart = /\bdataset\s*\(/gi;
  for (const match of source.matchAll(datasetStart)) {
    const open = (match.index ?? 0) + match[0].lastIndexOf('(');
    let depth = 0;
    let quote: '"' | "'" | null = null;
    let escaped = false;
    let close = -1;
    for (let index = open; index < source.length; index += 1) {
      const character = source[index]!;
      if (quote) {
        if (escaped) { escaped = false; continue; }
        if (character === '\\') { escaped = true; continue; }
        if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") { quote = character; continue; }
      if (character === '(') depth += 1;
      else if (character === ')' && --depth === 0) { close = index; break; }
    }
    if (close < 0) continue;
    const args = splitCallArguments(source.slice(open + 1, close));
    const names = args.filter((_, index) => index % 2 === 0)
      .map(argument => argument.match(/^(?:"([^"]+)"|'([^']+)')$/)?.[1] ??
        argument.match(/^(?:"([^"]+)"|'([^']+)')$/)?.[2])
      .filter((name): name is string => Boolean(name));
    if (names.length) return [...new Set(names)];
  }
  return [...modelFeatures];
}

function parseRange(value: unknown): { from: string; to: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('trainingRange with from and to is required.');
  const range = value as Record<string, unknown>;
  if (typeof range.from !== 'string' || typeof range.to !== 'string') throw new Error('trainingRange.from and trainingRange.to must be strings.');
  const from = Date.parse(range.from);
  const dateOnlyTo = /^\d{4}-\d{2}-\d{2}$/.test(range.to);
  const to = Date.parse(range.to) + (dateOnlyTo ? 86_399_999 : 0);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new Error('Training range must contain valid dates with from < to.');
  return { from: range.from, to: range.to };
}

function rangeBounds(range: { from: string; to: string }): { from: number; to: number } {
  const dateOnlyTo = /^\d{4}-\d{2}-\d{2}$/.test(range.to);
  return {
    from: Date.parse(range.from),
    to: Date.parse(range.to) + (dateOnlyTo ? 86_399_999 : 0),
  };
}

function parseRows(value: unknown, featureNames: readonly string[], range: { from: string; to: string }) {
  if (!Array.isArray(value) || value.length < 12 || value.length > MAX_ROWS) {
    throw new Error('Training snapshot must contain 12–1024 historical rows.');
  }
  const bounds = rangeBounds(range);
  let previous = Number.NEGATIVE_INFINITY;
  return value.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid training row at index ' + index + '.');
    const row = raw as Record<string, unknown>;
    if (typeof row.timestamp !== 'number' || !Number.isFinite(row.timestamp) ||
        row.timestamp < bounds.from || row.timestamp > bounds.to ||
        !Array.isArray(row.values) || row.values.length !== featureNames.length ||
        row.values.some(item => typeof item !== 'number' || !Number.isFinite(item))) {
      throw new Error('Training row ' + index + ' must have an in-range timestamp and finite values matching the feature schema.');
    }
    if (row.timestamp <= previous) throw new Error('Training rows must be strictly chronological and contain no duplicate timestamps.');
    previous = row.timestamp;
    return { timestamp: row.timestamp, values: [...row.values] as number[] };
  });
}

function featureGraphOf(artifact: ResearchArtifact): {
  featureNames: string[];
  modelType: string;
  states: number;
  covariance: 'full' | 'diagonal';
} {
  const graph = artifact.featureGraph as Record<string, unknown>;
  if (!graph || !Array.isArray(graph.featureNames) || typeof graph.modelType !== 'string') {
    throw new Error('Research artifact does not contain a valid compiled feature graph.');
  }
  return {
    featureNames: graph.featureNames as string[],
    modelType: graph.modelType,
    states: Number(graph.states ?? 3),
    covariance: graph.covariance === 'diagonal' ? 'diagonal' : 'full',
  };
}

coreSpiritModelRoutes.post('/research', async (req: AuthenticatedRequest, res: Response) => {
  const name = String(req.body?.name ?? '').trim();
  const source = typeof req.body?.source === 'string' ? req.body.source : '';
  if (!name || name.length > 120) return fail(res, 400, 'Research artifact name must be 1–120 characters.');
  if (!source || new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
    return fail(res, 413, 'CoreScript source is required and limited to 64 KiB.');
  }

  let featureNames: string[] = [];
  try {
    if (req.body?.featureNames !== undefined) featureNames = parseFeatureNames(req.body.featureNames);
  } catch (error) {
    return fail(res, 400, error instanceof Error ? error.message : 'Invalid feature schema.');
  }

  let lifecyclePlan: CoreSpiritModelLifecyclePlan;
  try { lifecyclePlan = parseCoreSpiritModelLifecycleSurface(source); }
  catch (error) { return fail(res, 422, error instanceof Error ? error.message : 'Invalid model lifecycle directives.'); }
  const compilerSource = lowerCoreSpiritResearchSource(source, lifecyclePlan);
  let compiled: ReturnType<typeof compileCoreSpirit>;
  try {
    compiled = compileCoreSpirit(compilerSource, 'research:' + name, { layer: 'model' });
  } catch (error) {
    return fail(res, 422, error instanceof Error ? 'CoreScript compilation failed: ' + error.message : 'CoreScript compilation failed.');
  }
  const errors = compiled.diagnostics.filter(item => item.severity === 'error');
  if (!compiled.ir || errors.length) {
    res.status(422).json({
      success: false,
      error: 'CoreScript did not compile as a model research program.',
      diagnostics: errors.slice(0, 30).map(item => ({ message: item.message, code: item.code, line: item.line, column: item.column })),
    });
    return;
  }

  const surface = extractCoreSpiritSurfaceMetadata(source);
  const declaration = surface.declarations.find(item => item.kind === 'model');
  if (!declaration || declaration.kind !== 'model' || !['hmm<float>', 'hmm'].includes((declaration.modelType ?? '').toLowerCase())) {
    return fail(res, 422, 'The first production training backend supports typed Gaussian HMM models. Other model families need their own registered trainer.');
  }
  if (lifecyclePlan.artifactSymbol && lifecyclePlan.artifactSymbol !== declaration.name) {
    return fail(res, 422, 'model artifact declaration must match the compiled model declaration name.');
  }
  if (lifecyclePlan.training && lifecyclePlan.training.modelName !== declaration.name) {
    return fail(res, 422, 'train directive model name must match the compiled model declaration name.');
  }
  if (declaration.unsupportedEmission || declaration.unsupportedCovariance || declaration.unsupportedStateLabels) {
    return fail(res, 422, 'Unsupported HMM configuration: ' + (declaration.unsupportedEmission || declaration.unsupportedCovariance || declaration.unsupportedStateLabels));
  }
  const states = Number(declaration.states ?? 3);
  if (!Number.isInteger(states) || states < 2 || states > 12) return fail(res, 422, 'HMM states must be between 2 and 12.');

  const declaredFeatureNames = extractDeclaredFeatureNames(source, declaration.features);
  if (!declaredFeatureNames.length) {
    return fail(res, 422, 'Declare named feature fields with features = dataset { name: expression } or dataset("name", expression, ...) before creating a research artifact.');
  }
  if (!featureNames.length) {
    try { featureNames = parseFeatureNames(declaredFeatureNames); }
    catch (error) { return fail(res, 422, error instanceof Error ? error.message : 'Invalid declared feature names.'); }
  }
  if (declaredFeatureNames.length !== featureNames.length ||
      declaredFeatureNames.some((name, index) => name !== featureNames[index])) {
    return fail(res, 422, 'featureNames must exactly match the ordered feature names declared in the CoreScript dataset expression.');
  }

  const featureGraphBase = {
    version: 1,
    featureNames,
    declaredFeatureNames,
    modelName: declaration.name,
    modelType: (declaration.modelType ?? '').toLowerCase() === 'hmm' ? 'HMM' : 'HMM<float>',
    states,
    covariance: declaration.covariance ?? 'full',
    ...(declaration.stateLabels ? { stateLabels: [...declaration.stateLabels] } : {}),
    lifecyclePlan,
  };
  try {
    const featureGraph = { ...featureGraphBase, executionPlanHash: await coreSpiritSha256(compiled.ir) };
    const research = await createResearchArtifact({
      name,
      source,
      compilerVersion: CORE_SPIRIT_COMPILER_VERSION,
      irVersion: String(CORE_SPIRIT_IR_VERSION),
      featureGraph,
      ir: compiled.ir,
    });
    const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!);
    const stored = await repository.putResearchArtifact(research);
    res.status(201).json({
      success: true,
      data: {
        researchArtifactId: stored.id,
        name: stored.artifact.name,
        sourceHash: stored.artifact.sourceHash,
        featureGraphHash: stored.artifact.featureGraphHash,
        compilerVersion: stored.artifact.compilerVersion,
        irVersion: stored.artifact.irVersion,
        supportedTrainer: 'corespirit-gaussian-hmm-v1',
        lifecyclePlan,
        warnings: compiled.diagnostics.filter(item => item.severity === 'warning').map(item => item.message),
      },
    });
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : 'Unable to persist research artifact.');
  }
});

coreSpiritModelRoutes.post('/training-runs', async (req: AuthenticatedRequest, res: Response) => {
  const researchArtifactId = String(req.body?.researchArtifactId ?? '').trim();
  if (!researchArtifactId) return fail(res, 400, 'researchArtifactId is required.');
  const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!, researchArtifactId);
  let research: ResearchArtifact;
  try {
    const loadedResearch = await repository.getResearchArtifact(researchArtifactId);
    if (!loadedResearch) return fail(res, 404, 'Research artifact not found.');
    research = loadedResearch;
  } catch (error) {
    return fail(res, 503, error instanceof Error ? error.message : 'Unable to load research artifact.');
  }
  const graph = featureGraphOf(research);
  const lifecyclePlan = (research.featureGraph as Record<string, unknown>).lifecyclePlan as CoreSpiritModelLifecyclePlan | undefined;
  let range: { from: string; to: string };
  let featureNames: string[];
  let rows: ReturnType<typeof parseRows> | null = null;
  let rawBars: unknown = req.body?.bars;
  let datasetName = '';
  let datasetSource: 'fyers-history' | 'provided-ohlcv' | 'precomputed-features' = 'precomputed-features';
  try {
    const declaredDatasetName = lifecyclePlan?.training?.datasetName?.trim() ?? '';
    if (req.body?.datasetName !== undefined &&
        (typeof req.body.datasetName !== 'string' || !req.body.datasetName.trim() || req.body.datasetName.trim().length > 120)) {
      throw new Error('datasetName must be a non-empty string of at most 120 characters.');
    }
    const requestedDatasetName = typeof req.body?.datasetName === 'string' ? req.body.datasetName.trim() : '';
    if (declaredDatasetName && requestedDatasetName &&
        declaredDatasetName.toUpperCase() !== requestedDatasetName.toUpperCase()) {
      throw new Error('datasetName must match the immutable dataset declared in the CoreScript train directive.');
    }
    datasetName = declaredDatasetName || requestedDatasetName;
    const plannedRange = lifecyclePlan?.training?.from && lifecyclePlan.training.to
      ? { from: lifecyclePlan.training.from, to: lifecyclePlan.training.to }
      : undefined;
    if (plannedRange && req.body?.trainingRange !== undefined) {
      const requestedRange = parseRange(req.body.trainingRange);
      if (requestedRange.from !== plannedRange.from || requestedRange.to !== plannedRange.to) {
        throw new Error('trainingRange must match the immutable from/to dates declared in the CoreScript train directive.');
      }
    }
    range = parseRange(req.body?.trainingRange ?? plannedRange);
    featureNames = req.body?.featureNames === undefined
      ? [...graph.featureNames]
      : parseFeatureNames(req.body.featureNames);
    if (Array.isArray(req.body?.rows)) {
      rows = parseRows(req.body.rows, featureNames, range);
      datasetSource = 'precomputed-features';
    } else if (Array.isArray(rawBars)) {
      datasetSource = 'provided-ohlcv';
    } else if (datasetName) {
      datasetSource = 'fyers-history';
    } else {
      throw new Error('Provide rows/bars or declare a named market dataset such as NIFTY_5M in the CoreScript train directive.');
    }
    if (!datasetName) datasetName = 'uploaded-feature-snapshot';
  } catch (error) {
    return fail(res, 400, error instanceof Error ? error.message : 'Invalid training request.');
  }
  const randomSeed = req.body?.randomSeed ?? 42;
  if (!Number.isSafeInteger(randomSeed) || randomSeed < 0) return fail(res, 400, 'randomSeed must be a non-negative safe integer.');
  const rawParameters = req.body?.trainingParameters;
  if (rawParameters !== undefined && (!rawParameters || typeof rawParameters !== 'object' || Array.isArray(rawParameters))) {
    return fail(res, 400, 'trainingParameters must be an object.');
  }
  const suppliedTrainingParameters = (rawParameters ?? {}) as Record<string, string | number | boolean | null>;
  if (Object.prototype.hasOwnProperty.call(suppliedTrainingParameters, 'datasetName') ||
      Object.prototype.hasOwnProperty.call(suppliedTrainingParameters, 'datasetSource')) {
    return fail(res, 400, 'datasetName and datasetSource are reserved provenance fields; supply datasetName at the request top level or in the CoreScript train directive.');
  }
  const trainingParameters: Record<string, string | number | boolean | null> = {
    ...suppliedTrainingParameters,
    datasetName,
    datasetSource,
  };
  if (req.body?.modelArtifactName !== undefined &&
      (typeof req.body.modelArtifactName !== 'string' || !req.body.modelArtifactName.trim() || req.body.modelArtifactName.trim().length > 120)) {
    return fail(res, 400, 'modelArtifactName must be a non-empty string of at most 120 characters.');
  }
  const requestedModelArtifactName = typeof req.body?.modelArtifactName === 'string' ? req.body.modelArtifactName.trim() : '';
  if (requestedModelArtifactName && lifecyclePlan?.saveAs && requestedModelArtifactName !== lifecyclePlan.saveAs) {
    return fail(res, 422, 'modelArtifactName must match the immutable save-as name declared in the research source.');
  }
  if (trainingParameters.fitIterations !== undefined &&
      (typeof trainingParameters.fitIterations !== 'number' || !Number.isInteger(trainingParameters.fitIterations) ||
       trainingParameters.fitIterations < 1 || trainingParameters.fitIterations > 6)) {
    return fail(res, 400, 'fitIterations must be an integer from 1 to 6.');
  }
  if (trainingParameters.fitEvery !== undefined &&
      (typeof trainingParameters.fitEvery !== 'number' || !Number.isInteger(trainingParameters.fitEvery) ||
       trainingParameters.fitEvery < 1 || trainingParameters.fitEvery > 64)) {
    return fail(res, 400, 'fitEvery must be an integer from 1 to 64.');
  }
  for (const [key, value] of Object.entries(trainingParameters)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) ||
        !(value === null || typeof value === 'string' || typeof value === 'boolean' ||
          typeof value === 'number' && Number.isFinite(value))) {
      return fail(res, 400, 'Training parameters must be simple finite JSON scalar values.');
    }
  }

  try {
    if (graph.featureNames.length !== featureNames.length ||
        graph.featureNames.some((name, index) => name !== featureNames[index])) {
      return fail(res, 422, 'Training feature names must exactly match the compiled research artifact feature schema.');
    }
    if (!rows) {
      try {
        if (!Array.isArray(rawBars)) {
          try {
            rawBars = await fetchFyersResearchBars(req.tradingCoreUserId!, datasetName, range);
          } catch (error) {
            if (error instanceof CoreSpiritDatasetProviderError) return fail(res, error.statusCode, error.message);
            const providerStatus = Number((error as { status?: unknown } | null)?.status);
            return fail(res, providerStatus === 429 ? 429 : 503,
              error instanceof Error ? 'Unable to fetch named FYERS dataset: ' + error.message : 'Unable to fetch named FYERS dataset.');
          }
        }
        const materialized = materializeCoreSpiritFeatureRows({
          source: research.source,
          bars: rawBars,
          trainingRange: range,
          expectedFeatureNames: featureNames,
        });
        rows = parseRows(materialized.rows, featureNames, range);
      } catch (error) {
        return fail(res, 422, error instanceof Error ? error.message : 'Unable to materialize research features.');
      }
    }
    if (graph.modelType !== 'HMM<float>' && graph.modelType !== 'HMM') {
      return fail(res, 422, 'No training backend is registered for this model family.');
    }
    if (!Number.isInteger(graph.states) || graph.states < 2 || graph.states > 12 ||
        rows.length < Math.max(12, graph.states * 4)) {
      return fail(res, 422, 'This HMM configuration needs at least max(12, states × 4) historical rows.');
    }
    const datasetVersion = await coreSpiritDatasetVersion({ datasetName, datasetSource, featureNames, rows, trainingRange: range });
    const snapshot = await repository.putDatasetSnapshot({
      datasetVersion,
      featureNames,
      trainingRange: range,
      rows,
    });
    const trainingRunId = await repository.createTrainingRun({
      researchArtifactId,
      datasetSnapshotId: snapshot.id,
      datasetVersion,
      datasetRowCount: rows.length,
      featureNames,
      trainingRange: range,
      trainingParameters,
      randomSeed,
    });
    try {
      const queued = await enqueueBackgroundJob(req.tradingCoreUserId!, 'corespirit_model_training', {
        trainingRunId,
        researchArtifactId,
        datasetSnapshotId: snapshot.id,
        datasetVersion,
        trainingParameters,
        randomSeed,
        ...(() => {
          const planned = typeof lifecyclePlan?.saveAs === 'string' ? lifecyclePlan.saveAs : '';
          const modelArtifactName = requestedModelArtifactName || planned;
          return modelArtifactName ? { modelArtifactName } : {};
        })(),
      });
      res.status(202).json({
        success: true,
        data: {
          trainingRunId,
          jobId: queued.job.id,
          status: 'queued',
          datasetVersion,
          datasetName,
          datasetSource,
          rowCount: rows.length,
          researchArtifactId,
        },
      });
    } catch (error) {
      await repository.updateTrainingRun(trainingRunId, {
        status: 'failed',
        progress: 100,
        error: error instanceof Error ? error.message : 'Unable to enqueue training job',
      });
      throw error;
    }
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : 'Unable to queue CoreSpirit training.');
  }
});

coreSpiritModelRoutes.get('/training-runs/:runId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!);
    const run = await repository.getTrainingRun(String(req.params.runId));
    if (!run) return fail(res, 404, 'Training run not found.');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: run });
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : 'Unable to load training run.');
  }
});

coreSpiritModelRoutes.get('/models/by-name/:name', async (req: AuthenticatedRequest, res: Response) => {
  const name = String(req.params.name ?? '').trim();
  if (!name || name.length > 120) return fail(res, 400, 'Model name must be 1–120 characters.');
  try {
    const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!);
    const artifact = await repository.getByName(name);
    if (!artifact) return fail(res, 404, 'Model artifact not found.');
    if (!(await verifyModelArtifactIntegrity(artifact))) return fail(res, 409, 'Model artifact integrity check failed.');
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, data: { artifact, artifactHash: artifact.hash } });
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : 'Unable to load model artifact.');
  }
});

coreSpiritModelRoutes.get('/models/:hash', async (req: AuthenticatedRequest, res: Response) => {
  const hash = String(req.params.hash ?? '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return fail(res, 400, 'Model hash must be a SHA-256 hex digest.');
  try {
    const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!);
    const artifact = await repository.getByHash(hash);
    if (!artifact) return fail(res, 404, 'Model artifact not found.');
    if (artifact.hash.toLowerCase() !== hash || !(await verifyModelArtifactIntegrity(artifact))) return fail(res, 409, 'Model artifact integrity check failed.');
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, data: { artifact } });
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : 'Unable to load model artifact.');
  }
});

coreSpiritModelRoutes.post('/models/:hash/predict', async (req: AuthenticatedRequest, res: Response) => {
  const hash = String(req.params.hash ?? '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return fail(res, 400, 'Model hash must be a SHA-256 hex digest.');
  const timestamp = req.body?.timestamp;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return fail(res, 400, 'timestamp must be an epoch-millisecond number for forward-only inference.');
  }
  const values = req.body?.features;
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_FEATURES ||
      values.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    return fail(res, 400, 'features must be an array of 1–16 finite numbers.');
  }
  try {
    const store = new CoreSpiritArtifactRepository(req.tradingCoreUserId!);
    const storedArtifact = await store.getByHash(hash);
    if (!storedArtifact) return fail(res, 404, 'Model artifact not found.');
    if (storedArtifact.hash.toLowerCase() !== hash || !(await verifyModelArtifactIntegrity(storedArtifact))) return fail(res, 409, 'Model artifact integrity check failed.');
    const rangeEnd = storedArtifact.provenance.trainingRange.to;
    const rangeEndIsDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(rangeEnd);
    const trainedThrough = Date.parse(rangeEnd) + (rangeEndIsDateOnly ? 86_399_999 : 0);
    if (!Number.isFinite(trainedThrough) || timestamp <= trainedThrough) {
      return fail(res, 422, 'Inference timestamp must be after the model training range to prevent in-sample leakage.');
    }
    const inference = await loadModelForInference<
      unknown,
      readonly number[],
      Readonly<{ state: number; probabilities: readonly number[]; confidence: number }>
    >(store, hash, artifact => {
      const weights = artifact.weights as {
        modelType?: string;
        modelAlias?: string;
        featureNames?: string[];
        hmm?: CoreSpiritGaussianHMMState;
      };
      if (weights.modelType !== 'gaussian-hmm' || !weights.hmm || !Array.isArray(weights.featureNames)) {
        throw new Error('Model artifact does not contain a supported inference payload.');
      }
      if (weights.featureNames.length !== values.length) throw new Error('Feature count does not match the trained model schema.');
      const hmm = CoreSpiritGaussianHMM.fromTrainedState(weights.hmm);
      hmm.setInferenceBoundaryExclusive(trainedThrough);
      return { predict: async (features: readonly number[]) => hmm.predict(features, weights.featureNames, timestamp) };
    });
    const prediction = await inference.predict(values as number[]);
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        modelName: inference.artifactName,
        modelHash: inference.artifactHash,
        prediction,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Model inference failed.';
    const status = /not found/i.test(message) ? 404 : /feature count|feature schema/i.test(message) ? 422 : 400;
    fail(res, status, message);
  }
});
