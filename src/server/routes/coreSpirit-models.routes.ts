import { Router, type Response } from 'express';
import { compileCoreSpirit } from '../../services/coreSpirit/coreSpiritPipeline.js';
import {
  createResearchArtifact,
  coreSpiritSha256,
  loadModelForInference,
  verifyModelArtifactIntegrity,
  type ResearchArtifact,
} from '../../services/coreSpirit/modelArtifacts.js';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_IR_VERSION } from '../../services/coreSpirit/VERSION.js';
import { extractCoreSpiritSurfaceMetadata } from '../../services/coreSpirit/languageConcepts.js';
import { CoreSpiritGaussianHMM, type CoreSpiritGaussianHMMState } from '../../services/coreSpirit/quantMath.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { enqueueBackgroundJob } from '../jobs/queue.js';
import { CoreSpiritArtifactRepository } from '../storage/CoreSpiritArtifactRepository.js';

export const coreSpiritModelRoutes = Router();
coreSpiritModelRoutes.use(requireUser);

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_ROWS = 1024;
const MAX_FEATURES = 16;

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
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
  const to = Date.parse(range.to);
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

  let featureNames: string[];
  try {
    featureNames = parseFeatureNames(req.body?.featureNames);
  } catch (error) {
    return fail(res, 400, error instanceof Error ? error.message : 'Invalid feature schema.');
  }

  const compiled = compileCoreSpirit(source, 'research:' + name, { layer: 'model' });
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
  if (!declaration || declaration.kind !== 'model' || !/^HMM(?:<.*>)?$/i.test(declaration.modelType ?? '')) {
    return fail(res, 422, 'The first production training backend supports typed Gaussian HMM models. Other model families need their own registered trainer.');
  }
  if (declaration.unsupportedEmission || declaration.unsupportedCovariance) {
    return fail(res, 422, 'Unsupported HMM configuration: ' + (declaration.unsupportedEmission || declaration.unsupportedCovariance));
  }
  const states = Number(declaration.states ?? 3);
  if (!Number.isInteger(states) || states < 2 || states > 12) return fail(res, 422, 'HMM states must be between 2 and 12.');

  const declaredFeatureNames = extractDeclaredFeatureNames(source, declaration.features);
  if (!declaredFeatureNames.length) {
    return fail(res, 422, 'Declare named feature fields with features = dataset { name: expression } or dataset("name", expression, ...) before creating a research artifact.');
  }
  if (declaredFeatureNames.length !== featureNames.length ||
      declaredFeatureNames.some((name, index) => name !== featureNames[index])) {
    return fail(res, 422, 'featureNames must exactly match the ordered feature names declared in the CoreScript dataset expression.');
  }

  const featureGraphBase = {
    version: 1,
    featureNames,
    featureExpressions: declaredFeatureNames,
    modelName: declaration.name,
    modelType: declaration.modelType ?? 'HMM<float>',
    states,
    covariance: declaration.covariance ?? 'full',
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
  let range: { from: string; to: string };
  let featureNames: string[];
  let rows: ReturnType<typeof parseRows>;
  try {
    range = parseRange(req.body?.trainingRange);
    featureNames = parseFeatureNames(req.body?.featureNames);
    rows = parseRows(req.body?.rows, featureNames, range);
  } catch (error) {
    return fail(res, 400, error instanceof Error ? error.message : 'Invalid training request.');
  }
  const randomSeed = req.body?.randomSeed ?? 42;
  if (!Number.isSafeInteger(randomSeed) || randomSeed < 0) return fail(res, 400, 'randomSeed must be a non-negative safe integer.');
  const rawParameters = req.body?.trainingParameters;
  if (rawParameters !== undefined && (!rawParameters || typeof rawParameters !== 'object' || Array.isArray(rawParameters))) {
    return fail(res, 400, 'trainingParameters must be an object.');
  }
  const trainingParameters = (rawParameters ?? {}) as Record<string, string | number | boolean | null>;
  for (const [key, value] of Object.entries(trainingParameters)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) ||
        !(value === null || typeof value === 'string' || typeof value === 'boolean' ||
          typeof value === 'number' && Number.isFinite(value))) {
      return fail(res, 400, 'Training parameters must be simple finite JSON scalar values.');
    }
  }

  const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!, researchArtifactId);
  try {
    const research = await repository.getResearchArtifact(researchArtifactId);
    if (!research) return fail(res, 404, 'Research artifact not found.');
    const graph = featureGraphOf(research);
    if (graph.featureNames.length !== featureNames.length ||
        graph.featureNames.some((name, index) => name !== featureNames[index])) {
      return fail(res, 422, 'Training feature names must exactly match the compiled research artifact feature schema.');
    }
    if (graph.modelType !== 'HMM<float>' && graph.modelType !== 'HMM') {
      return fail(res, 422, 'No training backend is registered for this model family.');
    }
    const datasetVersion = await coreSpiritSha256({ featureNames, rows, trainingRange: range });
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
      });
      res.status(202).json({
        success: true,
        data: {
          trainingRunId,
          jobId: queued.job.id,
          status: 'queued',
          datasetVersion,
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

coreSpiritModelRoutes.get('/models/:hash', async (req: AuthenticatedRequest, res: Response) => {
  const hash = String(req.params.hash ?? '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return fail(res, 400, 'Model hash must be a SHA-256 hex digest.');
  try {
    const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!);
    const artifact = await repository.getByHash(hash);
    if (!artifact) return fail(res, 404, 'Model artifact not found.');
    if (!(await verifyModelArtifactIntegrity(artifact))) return fail(res, 409, 'Model artifact integrity check failed.');
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
    if (!(await verifyModelArtifactIntegrity(storedArtifact))) return fail(res, 409, 'Model artifact integrity check failed.');
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
