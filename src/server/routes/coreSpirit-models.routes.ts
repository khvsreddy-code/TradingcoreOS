import { Router, type Response } from 'express';
import { compileCoreSpirit, parseCoreSpirit } from '../../services/coreSpirit/coreSpiritPipeline.js';
import { analyzeCoreSpiritCausality } from '../../services/coreSpirit/causalityAnalysis.js';
import { analyzeCoreSpiritRepaintSafety } from '../../services/coreSpirit/repaintSafety.js';
import {
  assertNoKnownLabelLeakage,
  summarizeResearchSafety,
  validateConfirmedResearchRows,
  DEFAULT_RESEARCH_VALIDATION_FRACTION,
  MIN_RESEARCH_VALIDATION_ROWS,
  type ResearchFeatureRow,
  type ResearchSafetySummary,
} from '../../services/coreSpirit/researchValidation.js';
import {
  createResearchArtifact,
  assertModelArtifactRuntimeCompatibility,
  coreSpiritSha256,
  loadModelForInference,
  verifyModelArtifactIntegrity,
  type ResearchArtifact,
} from '../../services/coreSpirit/modelArtifacts.js';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_IR_VERSION, CORE_SPIRIT_RUNTIME_VERSION } from '../../services/coreSpirit/VERSION.js';
import { validateModelPromotion } from '../../services/coreSpirit/modelPromotionValidation.js';
import { extractCoreSpiritSurfaceMetadata } from '../../services/coreSpirit/languageConcepts.js';
import { CoreSpiritGaussianHMM, type CoreSpiritGaussianHMMState } from '../../services/coreSpirit/quantMath.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { enqueueBackgroundJob } from '../jobs/queue.js';
import { CoreSpiritArtifactRepository } from '../storage/CoreSpiritArtifactRepository.js';
import { CoreSpiritDatasetBatchRepository } from '../storage/CoreSpiritDatasetBatchRepository.js';
import { getCoreSpiritResearchLimits } from '../coreSpiritResearchLimits.js';
import { AuditLogRepository } from '../storage/AuditLogRepository.js';
import {
  CoreSpiritExternalModelRegistry,
  CoreSpiritModelOrchestrator,
  type CoreSpiritStrictModelRequest,
} from '../../services/coreSpirit/modelOrchestration.js';
import { registerCoreSpiritPythonMlModel } from '../../services/coreSpirit/pythonMlModelAdapter.js';

export const coreSpiritModelRoutes = Router();
coreSpiritModelRoutes.use(requireUser);

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_ROWS = getCoreSpiritResearchLimits('interactive').maxRows;
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
    throw new Error('Training snapshot must contain 12–5000 confirmed historical rows.');
  }
  const bounds = rangeBounds(range);
  const confirmedRows = validateConfirmedResearchRows(
    value as ResearchFeatureRow[],
    featureNames,
    { maxRows: MAX_ROWS },
  );
  return confirmedRows.map((row, index) => {
    if (row.timestamp < bounds.from || row.timestamp > bounds.to) {
      throw new Error('Training row ' + index + ' must fall inside the supplied research range.');
    }
    return {
      timestamp: row.timestamp,
      availableAt: row.availableAt,
      confirmed: true as const,
      phase: row.phase,
      values: [...row.values] as number[],
    };
  });
}

function featureGraphOf(artifact: ResearchArtifact): {
  featureNames: string[];
  modelType: string;
  states: number;
  covariance: 'full' | 'diagonal';
  target?: string;
  binding?: { kind?: string; locator?: string };
} {
  const graph = artifact.featureGraph as Record<string, unknown>;
  if (!graph || !Array.isArray(graph.featureNames) || typeof graph.modelType !== 'string') {
    throw new Error('Research artifact does not contain a valid compiled feature graph.');
  }
  const binding = graph.binding && typeof graph.binding === 'object' && !Array.isArray(graph.binding)
    ? graph.binding as { kind?: string; locator?: string }
    : undefined;
  return {
    featureNames: graph.featureNames as string[],
    modelType: graph.modelType,
    states: Number(graph.states ?? 3),
    covariance: graph.covariance === 'diagonal' ? 'diagonal' : 'full',
    ...(typeof graph.target === 'string' ? { target: graph.target } : {}),
    ...(binding ? { binding } : {}),
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
    assertNoKnownLabelLeakage(featureNames);
  } catch (error) {
    return fail(res, 422, error instanceof Error ? error.message : 'Invalid or leaky feature schema.');
  }

  let compiled: ReturnType<typeof compileCoreSpirit>;
  try {
    compiled = compileCoreSpirit(source, 'research:' + name, { layer: 'model' });
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
  if (!declaration || declaration.kind !== 'model') {
    return fail(res, 422, 'Declare a typed CoreSpirit model before creating a research artifact.');
  }
  const normalizedModelType = String(declaration.modelType ?? '').toLowerCase();
  const isHmmModel = normalizedModelType === 'hmm<float>' || normalizedModelType === 'hmm';
  const isPythonXgboostModel = normalizedModelType === 'xgboost<float>' || normalizedModelType === 'xgboost';
  if (!isHmmModel && !isPythonXgboostModel) {
    return fail(res, 422, 'Supported CoreSpirit research trainers are Gaussian HMM and the registered Python XGBoost direction model.');
  }
  let states: number | undefined;
  let target: string | undefined;
  let binding: { kind: string; locator: string } | undefined;
  if (isHmmModel) {
    if (declaration.unsupportedEmission || declaration.unsupportedCovariance) {
      return fail(res, 422, 'Unsupported HMM configuration: ' + (declaration.unsupportedEmission || declaration.unsupportedCovariance));
    }
    states = Number(declaration.states ?? 3);
    if (!Number.isInteger(states) || states < 2 || states > 12) return fail(res, 422, 'HMM states must be between 2 and 12.');
  } else {
    const rawBinding = declaration.binding;
    if (rawBinding?.kind !== 'python' || rawBinding.locator !== 'xgb-direction') {
      return fail(res, 422, 'XGBoost currently requires the registered Python binding: use python "xgb-direction".');
    }
    const canonical = ['open', 'high', 'low', 'close', 'volume'];
    const declaredTarget = String(declaration.target ?? '').trim();
    const targetMatch = declaredTarget.match(/^forward_return\(\s*close\s*,\s*(\d+)\s*\)$/i);
    if (!targetMatch || Number(targetMatch[1]) < 1 || Number(targetMatch[1]) > 100) {
      return fail(res, 422, 'XGBoost target must be forward_return(close, H), with H from 1 to 100 bars.');
    }
    if (featureNames.length !== canonical.length || featureNames.some((name, index) => name !== canonical[index])) {
      return fail(res, 422, 'XGBoost currently requires the ordered OHLCV feature schema: open, high, low, close, volume.');
    }
    target = declaredTarget;
    binding = { kind: 'python', locator: 'xgb-direction' };
  }

  const declaredFeatureNames = extractDeclaredFeatureNames(source, declaration.features);
  if (!declaredFeatureNames.length) {
    return fail(res, 422, 'Declare named feature fields with features = dataset { name: expression } or dataset("name", expression, ...) before creating a research artifact.');
  }
  if (declaredFeatureNames.length !== featureNames.length ||
      declaredFeatureNames.some((name, index) => name !== featureNames[index])) {
    return fail(res, 422, 'featureNames must exactly match the ordered feature names declared in the CoreScript dataset expression.');
  }

  let researchSafety;
  try {
    const ast = parseCoreSpirit(source);
    const causality = analyzeCoreSpiritCausality(ast);
    const repaintSafety = analyzeCoreSpiritRepaintSafety(ast);
    researchSafety = summarizeResearchSafety(causality, repaintSafety);
    if (researchSafety.blockers.length) {
      res.status(422).json({
        success: false,
        error: 'CoreSpirit model source failed the causal/lookahead safety gate. Resolve the diagnostics before training.',
        diagnostics: researchSafety.blockers.slice(0, 30),
        warnings: researchSafety.warnings.slice(0, 30),
      });
      return;
    }
  } catch (error) {
    return fail(res, 422, error instanceof Error ? 'Unable to verify research causality: ' + error.message : 'Unable to verify research causality.');
  }

  const featureGraphBase = {
    version: 2,
    featureNames,
    declaredFeatureNames,
    modelName: declaration.name,
    modelType: isHmmModel ? (normalizedModelType === 'hmm' ? 'HMM' : 'HMM<float>') : 'XGBOOST<float>',
    ...(states === undefined ? {} : { states }),
    ...(isHmmModel ? { covariance: declaration.covariance ?? 'full' } : {}),
    ...(target ? { target } : {}),
    ...(binding ? { binding } : {}),
    researchSafety,
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
        supportedTrainer: isHmmModel ? 'corespirit-gaussian-hmm-v1' : 'python-xgboost-direction-v1',
        warnings: compiled.diagnostics.filter(item => item.severity === 'warning').map(item => item.message),
      },
    });
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : 'Unable to persist research artifact.');
  }
});


/**
 * Large research inputs use a three-step immutable upload. The chart-facing
 * request path still accepts at most MAX_ROWS rows; batch chunks are written to
 * separate bounded records and only become trainable after manifest finalization.
 */
coreSpiritModelRoutes.post('/dataset-batches', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const researchArtifactId = String(req.body?.researchArtifactId ?? '').trim();
    if (!researchArtifactId) return fail(res, 400, 'researchArtifactId is required.');
    const featureNames = parseFeatureNames(req.body?.featureNames);
    assertNoKnownLabelLeakage(featureNames);
    const trainingRange = parseRange(req.body?.trainingRange);
    const rowCount = req.body?.rowCount;
    const chunkSize = req.body?.chunkSize;
    const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!, researchArtifactId);
    const research = await repository.getResearchArtifact(researchArtifactId);
    if (!research) return fail(res, 404, 'Research artifact not found.');
    const graph = featureGraphOf(research);
    if (graph.modelType !== 'HMM<float>' && graph.modelType !== 'HMM') {
      return fail(res, 422, 'No batch training backend is registered for this model family.');
    }
    if (graph.featureNames.length !== featureNames.length ||
        graph.featureNames.some((name, index) => name !== featureNames[index])) {
      return fail(res, 422, 'Batch feature names must exactly match the compiled research artifact schema.');
    }
    const batchRepository = new CoreSpiritDatasetBatchRepository(req.tradingCoreUserId!);
    const session = await batchRepository.createSession({
      researchArtifactId, featureNames, trainingRange,
      rowCount: Number(rowCount),
      ...(chunkSize === undefined ? {} : { chunkSize: Number(chunkSize) }),
    });
    res.status(201).json({
      success: true,
      data: {
        uploadSessionId: session.id,
        status: session.status,
        expectedRowCount: session.expectedRowCount,
        chunkSize: session.chunkSize,
        expectedChunkCount: session.expectedChunkCount,
        featureSchemaHash: await coreSpiritSha256({ version: '1', orderedNames: session.featureNames, types: session.featureNames.map(() => 'number') }),
        trainingRange: session.trainingRange,
      },
    });
  } catch (error) {
    fail(res, 400, error instanceof Error ? error.message : 'Unable to initialize batch dataset upload.');
  }
});

coreSpiritModelRoutes.put('/dataset-batches/:sessionId/chunks/:chunkIndex', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const chunkIndex = Number(req.params.chunkIndex);
    if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0) return fail(res, 400, 'chunkIndex must be a non-negative integer.');
    const repository = new CoreSpiritDatasetBatchRepository(req.tradingCoreUserId!);
    const result = await repository.appendChunk(String(req.params.sessionId), chunkIndex, req.body?.rows);
    res.status(result.idempotent ? 200 : 201).json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to store dataset chunk.';
    fail(res, /not found/i.test(message) ? 404 : 400, message);
  }
});

coreSpiritModelRoutes.get('/dataset-batches/:sessionId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repository = new CoreSpiritDatasetBatchRepository(req.tradingCoreUserId!);
    const session = await repository.getSession(String(req.params.sessionId));
    if (!session) return fail(res, 404, 'Dataset batch session not found.');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        uploadSessionId: session.id,
        status: session.status,
        expectedRowCount: session.expectedRowCount,
        chunkSize: session.chunkSize,
        expectedChunkCount: session.expectedChunkCount,
        datasetVersion: session.datasetHash,
        datasetSnapshotId: session.datasetSnapshotId,
        manifest: session.datasetManifest,
      },
    });
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : 'Unable to inspect batch dataset upload.');
  }
});

coreSpiritModelRoutes.post('/dataset-batches/:sessionId/finalize', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const repository = new CoreSpiritDatasetBatchRepository(req.tradingCoreUserId!);
    const result = await repository.finalize(String(req.params.sessionId));
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to finalize immutable dataset manifest.';
    fail(res, /not found/i.test(message) ? 404 : 422, message);
  }
});

coreSpiritModelRoutes.post('/training-runs/from-dataset', async (req: AuthenticatedRequest, res: Response) => {
  const researchArtifactId = String(req.body?.researchArtifactId ?? '').trim();
  const datasetSnapshotId = String(req.body?.datasetSnapshotId ?? '').trim();
  if (!researchArtifactId || !datasetSnapshotId) {
    return fail(res, 400, 'researchArtifactId and datasetSnapshotId are required.');
  }
  const validationFraction = req.body?.validationFraction ?? DEFAULT_RESEARCH_VALIDATION_FRACTION;
  if (typeof validationFraction !== 'number' || !Number.isFinite(validationFraction) ||
      validationFraction < 0.1 || validationFraction > 0.4) {
    return fail(res, 400, 'validationFraction must be a number between 0.10 and 0.40.');
  }
  const randomSeed = req.body?.randomSeed ?? 42;
  if (!Number.isSafeInteger(randomSeed) || randomSeed < 0) return fail(res, 400, 'randomSeed must be a non-negative safe integer.');
  const rawParameters = req.body?.trainingParameters;
  if (rawParameters !== undefined && (!rawParameters || typeof rawParameters !== 'object' || Array.isArray(rawParameters))) {
    return fail(res, 400, 'trainingParameters must be an object.');
  }
  const batchLimits = getCoreSpiritResearchLimits('batch');
  const trainingParameters: Record<string, string | number | boolean | null> = {
    ...((rawParameters ?? {}) as Record<string, string | number | boolean | null>),
    validationFraction,
  };
  for (const [key, value] of Object.entries(trainingParameters)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) ||
        !(value === null || typeof value === 'string' || typeof value === 'boolean' ||
          typeof value === 'number' && Number.isFinite(value))) {
      return fail(res, 400, 'Training parameters must be simple finite JSON scalar values.');
    }
  }
  const fitIterations = trainingParameters.fitIterations;
  if (fitIterations !== undefined &&
      (typeof fitIterations !== 'number' || !Number.isInteger(fitIterations) || fitIterations < 1 || fitIterations > 6)) {
    return fail(res, 400, 'fitIterations must be an integer from 1 to 6.');
  }
  const fitEvery = trainingParameters.fitEvery;
  if (fitEvery !== undefined &&
      (typeof fitEvery !== 'number' || !Number.isInteger(fitEvery) || fitEvery < 1 || fitEvery > batchLimits.maxTrainingFitEvery)) {
    return fail(res, 400, 'fitEvery must be an integer from 1 to ' + batchLimits.maxTrainingFitEvery + ' for batch training.');
  }
  const trainingWindowRows = trainingParameters.trainingWindowRows;
  if (trainingWindowRows !== undefined &&
      (typeof trainingWindowRows !== 'number' || !Number.isInteger(trainingWindowRows) || trainingWindowRows < 48 || trainingWindowRows > batchLimits.maxTrainingWindowRows)) {
    return fail(res, 400, 'trainingWindowRows must be an integer from 48 to ' + batchLimits.maxTrainingWindowRows + ' for batch training.');
  }
  const rawPurge = trainingParameters.purgeBars ?? trainingParameters.forecastHorizonBars ?? trainingParameters.horizon ?? 1;
  const purgeBars = rawPurge;
  const rawEmbargo = trainingParameters.embargoBars ?? 0;
  const embargoBars = rawEmbargo;
  if (typeof purgeBars !== 'number' || !Number.isInteger(purgeBars) || purgeBars < 0 || purgeBars > 500) {
    return fail(res, 400, 'purgeBars must be an integer from 0 to 500.');
  }
  if (typeof embargoBars !== 'number' || !Number.isInteger(embargoBars) || embargoBars < 0 || embargoBars > 500) {
    return fail(res, 400, 'embargoBars must be an integer from 0 to 500.');
  }

  const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!, researchArtifactId);
  try {
    const snapshot = await repository.getDatasetSnapshot(datasetSnapshotId);
    if (!snapshot) return fail(res, 404, 'Immutable dataset snapshot not found for this owner.');
    if (snapshot.storageMode !== 'chunked-v1' || !snapshot.datasetManifest) {
      return fail(res, 422, 'This endpoint requires a finalized chunked dataset manifest.');
    }
    const manifest = snapshot.datasetManifest;
    if (manifest.researchArtifactId !== researchArtifactId || manifest.datasetVersion !== snapshot.datasetVersion) {
      return fail(res, 409, 'Dataset manifest identity does not match the requested research artifact.');
    }
    const rowCount = Number(manifest.rowCount);
    const limits = batchLimits;
    if (!Number.isSafeInteger(rowCount) || rowCount < 24 || rowCount > limits.maxRows) {
      return fail(res, 422, 'Dataset row count exceeds the currently configured batch workload class.');
    }
    const research = await repository.getResearchArtifact(researchArtifactId);
    if (!research) return fail(res, 404, 'Research artifact not found.');
    const graph = featureGraphOf(research);
    if (graph.modelType !== 'HMM<float>' && graph.modelType !== 'HMM') {
      return fail(res, 422, 'No batch training backend is registered for this model family.');
    }
    if (!Number.isInteger(graph.states) || graph.states < 2 || graph.states > 12) {
      return fail(res, 422, 'Batch HMM state count must be an integer from 2 to 12.');
    }
    if (graph.featureNames.length !== snapshot.featureNames.length ||
        graph.featureNames.some((name, index) => name !== snapshot.featureNames[index])) {
      return fail(res, 422, 'Dataset feature schema does not match the compiled research artifact.');
    }
    const safety = (research.featureGraph as Record<string, unknown>).researchSafety as ResearchSafetySummary | undefined;
    if (!safety || safety.version !== 1 || safety.blockers.length > 0) {
      return fail(res, 422, 'Research source does not satisfy the causal/lookahead safety gate.');
    }
    const boundaryGap = purgeBars + embargoBars;
    const evaluableRows = rowCount - boundaryGap;
    const validationCount = Math.floor(evaluableRows * validationFraction);
    const trainingCount = evaluableRows - validationCount;
    if (boundaryGap >= rowCount || validationCount < MIN_RESEARCH_VALIDATION_ROWS ||
        trainingCount < Math.max(12, graph.states * 4)) {
      return fail(res, 422, 'Purged chronological holdout requires at least 12 validation rows and max(12, states × 4) earlier training rows.');
    }
    const trainingRunId = await repository.createTrainingRun({
      researchArtifactId, datasetSnapshotId, datasetVersion: snapshot.datasetVersion,
      datasetRowCount: rowCount, featureNames: snapshot.featureNames,
      trainingRange: snapshot.trainingRange, trainingParameters, randomSeed: Number(randomSeed),
    });
    try {
      const queued = await enqueueBackgroundJob(req.tradingCoreUserId!, 'corespirit_model_training', {
        trainingRunId, researchArtifactId, datasetSnapshotId,
        datasetVersion: snapshot.datasetVersion, trainingParameters, randomSeed: Number(randomSeed),
      });
      res.status(202).json({
        success: true,
        data: {
          trainingRunId, jobId: queued.job.id, status: 'queued',
          datasetVersion: snapshot.datasetVersion, rowCount, researchArtifactId,
          datasetSnapshotId, validationProtocol: boundaryGap > 0 ? 'purged-chronological-v1' : 'chronological-holdout-v1',
        },
      });
    } catch (error) {
      await repository.updateTrainingRun(trainingRunId, {
        status: 'failed', progress: 100,
        error: error instanceof Error ? error.message : 'Unable to enqueue training job',
      });
      throw error;
    }
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : 'Unable to queue batch CoreSpirit training.');
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
    assertNoKnownLabelLeakage(featureNames);
    rows = parseRows(req.body?.rows, featureNames, range);
  } catch (error) {
    return fail(res, 400, error instanceof Error ? error.message : 'Invalid training request.');
  }
  const validationFraction = req.body?.validationFraction ?? DEFAULT_RESEARCH_VALIDATION_FRACTION;
  if (typeof validationFraction !== 'number' || !Number.isFinite(validationFraction) ||
      validationFraction < 0.1 || validationFraction > 0.4) {
    return fail(res, 400, 'validationFraction must be a number between 0.10 and 0.40.');
  }
  const randomSeed = req.body?.randomSeed ?? 42;
  if (!Number.isSafeInteger(randomSeed) || randomSeed < 0) return fail(res, 400, 'randomSeed must be a non-negative safe integer.');
  const rawParameters = req.body?.trainingParameters;
  if (rawParameters !== undefined && (!rawParameters || typeof rawParameters !== 'object' || Array.isArray(rawParameters))) {
    return fail(res, 400, 'trainingParameters must be an object.');
  }
  const trainingParameters: Record<string, string | number | boolean | null> = {
    ...((rawParameters ?? {}) as Record<string, string | number | boolean | null>),
    validationFraction,
  };
  // Read optional backend parameters from the scalar map explicitly so TypeScript
  // checks the runtime guards rather than inferring an object with only one key.
  const fitIterations = trainingParameters['fitIterations'];
  if (fitIterations !== undefined &&
      (typeof fitIterations !== 'number' || !Number.isInteger(fitIterations) ||
       fitIterations < 1 || fitIterations > 6)) {
    return fail(res, 400, 'fitIterations must be an integer from 1 to 6.');
  }
  const interactiveLimits = getCoreSpiritResearchLimits('interactive');
  const fitEvery = trainingParameters['fitEvery'];
  if (fitEvery !== undefined &&
      (typeof fitEvery !== 'number' || !Number.isInteger(fitEvery) ||
       fitEvery < 1 || fitEvery > interactiveLimits.maxTrainingFitEvery)) {
    return fail(res, 400, 'fitEvery must be an integer from 1 to ' + interactiveLimits.maxTrainingFitEvery + ' for interactive training.');
  }
  const trainingWindowRows = trainingParameters['trainingWindowRows'];
  if (trainingWindowRows !== undefined &&
      (typeof trainingWindowRows !== 'number' || !Number.isInteger(trainingWindowRows) ||
       trainingWindowRows < 48 || trainingWindowRows > interactiveLimits.maxTrainingWindowRows)) {
    return fail(res, 400, 'trainingWindowRows must be an integer from 48 to ' + interactiveLimits.maxTrainingWindowRows + ' for interactive training.');
  }
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
    const isHmmModel = graph.modelType === 'HMM<float>' || graph.modelType === 'HMM';
    const isPythonXgboostModel = graph.modelType.toLowerCase() === 'xgboost<float>' || graph.modelType.toLowerCase() === 'xgboost';
    if (!isHmmModel && !isPythonXgboostModel) {
      return fail(res, 422, 'No CoreSpirit training backend is registered for model family "' + graph.modelType + '".');
    }

    let forecastHorizon = 1;
    if (isPythonXgboostModel) {
      if (rows.length < 240 || rows.length > 5_000) {
        return fail(res, 422, 'CoreSpirit Python XGBoost requires 240–5000 confirmed OHLCV rows.');
      }
      const canonical = ['open', 'high', 'low', 'close', 'volume'];
      if (featureNames.length !== canonical.length || featureNames.some((name, index) => name !== canonical[index])) {
        return fail(res, 422, 'XGBoost currently requires the ordered OHLCV feature schema: open, high, low, close, volume.');
      }
      if (graph.binding?.kind !== 'python' || graph.binding.locator !== 'xgb-direction') {
        return fail(res, 422, 'XGBoost requires the registered Python binding "xgb-direction".');
      }
      const targetMatch = String(graph.target ?? '').trim().match(/^forward_return\(\s*close\s*,\s*(\d+)\s*\)$/i);
      if (!targetMatch) return fail(res, 422, 'XGBoost target must be forward_return(close, H) with H from 1 to 100.');
      forecastHorizon = Number(targetMatch[1]);
      if (!Number.isSafeInteger(forecastHorizon) || forecastHorizon < 1 || forecastHorizon > 100) {
        return fail(res, 422, 'XGBoost target horizon must be an integer from 1 to 100 bars.');
      }
      const suppliedHorizon = trainingParameters.forecastHorizonBars ?? trainingParameters.horizon;
      if (suppliedHorizon !== undefined && Number(suppliedHorizon) !== forecastHorizon) {
        return fail(res, 422, 'Training horizon must match the CoreScript forward_return target.');
      }
      const symbol = String(trainingParameters.symbol ?? '').trim();
      const timeframe = String(trainingParameters.timeframe ?? '').trim();
      if (!symbol || symbol.length > 128 || !timeframe || timeframe.length > 32) {
        return fail(res, 400, 'XGBoost trainingParameters must include symbol and timeframe.');
      }
      trainingParameters.forecastHorizonBars = forecastHorizon;
      trainingParameters.horizon = forecastHorizon;
    } else if (!Number.isInteger(graph.states) || graph.states < 2 || graph.states > 12) {
      return fail(res, 422, 'HMM states must be an integer from 2 to 12.');
    }

    const rawPurge = trainingParameters.purgeBars ?? trainingParameters.forecastHorizonBars ?? forecastHorizon;
    const purgeBars = Number(rawPurge);
    const embargoBars = Number(trainingParameters.embargoBars ?? 0);
    if (!Number.isInteger(purgeBars) || purgeBars < forecastHorizon || purgeBars > 500) {
      return fail(res, 400, 'purgeBars must be an integer at least as large as the model horizon and no greater than 500.');
    }
    if (!Number.isInteger(embargoBars) || embargoBars < 0 || embargoBars > 500) {
      return fail(res, 400, 'embargoBars must be an integer from 0 to 500.');
    }
    const boundaryGap = purgeBars + embargoBars;
    const evaluableRows = rows.length - boundaryGap;
    const validationCount = Math.floor(evaluableRows * validationFraction);
    const trainingCount = evaluableRows - validationCount;
    const minimumTrainingRows = isPythonXgboostModel ? 24 : Math.max(12, graph.states * 4);
    if (boundaryGap >= rows.length ||
        validationCount < MIN_RESEARCH_VALIDATION_ROWS ||
        trainingCount < minimumTrainingRows) {
      return fail(res, 422, 'Purged chronological holdout does not contain enough training and validation rows for this model.');
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


/**
 * Runs a version-pinned Python model through the strict CoreSpirit external-model
 * ABI. The model identity is read from the caller-owned completed training run;
 * callers cannot substitute a different model version or symbol.
 */
coreSpiritModelRoutes.post('/training-runs/:runId/infer', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const runId = String(req.params.runId ?? '').trim();
    if (!runId || runId.length > 128) return fail(res, 400, 'A valid training run ID is required.');
    const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!);
    const run = await repository.getTrainingRun(runId);
    if (!run) return fail(res, 404, 'Training run not found for this account.');
    if (run.status !== 'succeeded') return fail(res, 409, 'The model training run has not completed successfully.');

    const metrics = run.metrics && typeof run.metrics === 'object' && !Array.isArray(run.metrics)
      ? run.metrics as Record<string, unknown>
      : {};
    const modelId = String(metrics.external_model_id ?? '');
    const modelVersion = String(metrics.external_model_version ?? '');
    const artifactHash = String(metrics.external_artifact_hash ?? '');
    const horizon = Number(metrics.model_horizon_bars);
    const symbol = String(metrics.model_symbol ?? '');
    const timeframe = String(metrics.model_timeframe ?? '');
    const programChecksum = String(metrics.program_checksum ?? '');
    if (metrics.external_backend !== 'python' || modelId !== 'xgb-direction' ||
        !/^[a-f0-9]{64}$/.test(modelVersion) || !/^[a-f0-9]{64}$/.test(artifactHash) ||
        !Number.isSafeInteger(horizon) || horizon < 1 || horizon > 100 ||
        !symbol || !timeframe || !/^[a-f0-9]{64}$/.test(programChecksum)) {
      return fail(res, 409, 'Training run does not contain a complete registered Python model identity.');
    }

    const rawCandles = req.body?.candles;
    if (!Array.isArray(rawCandles) || rawCandles.length < 80 || rawCandles.length > 5_000) {
      return fail(res, 422, 'Model inference requires 80–5000 confirmed candles.');
    }
    const candles: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }> = [];
    let previousTimestamp = 0;
    for (let index = 0; index < rawCandles.length; index += 1) {
      const raw = rawCandles[index];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) ||
          raw.confirmed !== true ||
          (raw.phase !== undefined && !['historical', 'confirmed'].includes(String(raw.phase).toLowerCase()))) {
        return fail(res, 422, 'Every model input candle must be explicitly confirmed historical data.');
      }
      const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : Date.parse(String(raw.timestamp ?? ''));
      const values = ['open', 'high', 'low', 'close', 'volume'].map(key => raw[key]);
      if (!Number.isSafeInteger(timestamp) || timestamp <= previousTimestamp ||
          values.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
        return fail(res, 422, 'Model candles must have strictly increasing timestamps and finite OHLCV values.');
      }
      const [open, high, low, close, volume] = values as number[];
      if (open! <= 0 || high! <= 0 || low! <= 0 || close! <= 0 || volume! < 0 ||
          high! < Math.max(open!, close!, low!) || low! > Math.min(open!, close!, high!)) {
        return fail(res, 422, 'Model input candle ' + index + ' contains invalid OHLCV values.');
      }
      previousTimestamp = timestamp;
      candles.push({ timestamp, open: open!, high: high!, low: low!, close: close!, volume: volume! });
    }

    const mode = String(req.body?.mode ?? 'historical');
    if (!['historical', 'realtime', 'replay', 'backtest'].includes(mode)) {
      return fail(res, 400, 'Model inference mode must be historical, realtime, replay or backtest.');
    }
    const last = candles[candles.length - 1]!;
    const ohlcvData: number[] = [];
    const timestamps: number[] = [];
    for (const candle of candles) {
      ohlcvData.push(candle.open, candle.high, candle.low, candle.close, candle.volume);
      timestamps.push(candle.timestamp);
    }

    const registry = new CoreSpiritExternalModelRegistry();
    registerCoreSpiritPythonMlModel(registry, {
      modelId,
      version: modelVersion,
      forecastHorizonBars: horizon,
      maxLatencyMs: 20_000,
    }, {
      baseUrl: String(process.env.ML_SERVICE_URL || ''),
      serviceSecret: String(process.env.ML_SERVICE_SECRET || ''),
      timeoutMs: 20_000,
    });
    const orchestrator = new CoreSpiritModelOrchestrator(registry, {
      maxCallsPerBar: 1,
      maxInputBytes: 512 * 1024,
      maxOutputBytes: 4 * 1024,
    });
    const barIndex = Number.isSafeInteger(req.body?.barIndex) && req.body.barIndex >= 0
      ? Math.min(10_000_000, Number(req.body.barIndex))
      : candles.length - 1;
    const revision = Number.isSafeInteger(req.body?.revision) && req.body.revision >= 0
      ? Math.min(1_000_000, Number(req.body.revision))
      : 0;
    const context = {
      runId,
      programChecksum,
      modelVersion,
      barIndex,
      timestamp: last.timestamp,
      symbol,
      timeframe,
      mode: mode as CoreSpiritStrictModelRequest['context']['mode'],
      revision,
      confirmed: true,
      deterministicSeed: modelVersion,
    };
    const modelRequest: CoreSpiritStrictModelRequest = {
      requestId: await coreSpiritSha256({ runId, modelVersion, symbol, timeframe, timestamp: last.timestamp, revision }),
      modelId,
      version: modelVersion,
      context,
      features: {
        ohlcv: { dtype: 'f64', shape: [candles.length, 5], data: ohlcvData },
        timestamps_ms: { dtype: 'f64', shape: [candles.length], data: timestamps },
        confirmed: { dtype: 'bool', shape: [candles.length], data: candles.map(() => 1) },
      },
      marketState: {
        timestamp: last.timestamp,
        instrument: { instrumentId: symbol, symbol },
        timeframe,
        bar: { open: last.open, high: last.high, low: last.low, close: last.close, volume: last.volume },
      },
    };
    const prediction = await orchestrator.infer(modelRequest);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      success: true,
      data: {
        modelId: prediction.modelId,
        modelVersion: prediction.version,
        artifactHash,
        prediction: Array.from(prediction.prediction.data),
        confidence: prediction.confidence ?? null,
        metadata: prediction.metadata,
        releaseStatus: metrics.release_status ?? 'candidate',
        calibrationStatus: metrics.calibration_status ?? 'not_calibrated',
        productionEligible: false,
        requestChecksum: prediction.requestChecksum,
        outputChecksum: prediction.outputChecksum,
        stateChecksum: prediction.stateChecksum,
        asOf: new Date(last.timestamp).toISOString(),
        horizonBars: horizon,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to execute Python model through CoreSpirit ABI.';
    fail(res, /not found/i.test(message) ? 404 : 503, message.slice(0, 500));
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
    const release = await repository.ensureModelReleaseControl(hash);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      success: true,
      data: {
        artifact,
        release: {
          status: release.status,
          validationReport: release.validationReport,
          approvalChecks: release.approvalChecks,
          decisionReason: release.decisionReason,
          approvedAt: release.approvedAt,
        },
      },
    });
  } catch (error) {
    fail(res, 503, error instanceof Error ? error.message : 'Unable to load model artifact.');
  }
});

coreSpiritModelRoutes.post('/models/:hash/approval', async (req: AuthenticatedRequest, res: Response) => {
  const hash = String(req.params.hash ?? '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return fail(res, 400, 'Model hash must be a SHA-256 hex digest.');
  const action = String(req.body?.action ?? '').trim().toLowerCase();
  if (!['approve','revoke','retire'].includes(action)) return fail(res, 400, 'action must be approve, revoke, or retire.');
  if (req.body?.confirm !== true) return fail(res, 400, 'Explicit confirmation is required for model release decisions.');
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (reason.length < 8 || reason.length > 1000) return fail(res, 400, 'Provide an 8–1000 character reason for this model release decision.');

  try {
    const repository = new CoreSpiritArtifactRepository(req.tradingCoreUserId!);
    const artifact = await repository.getByHash(hash);
    if (!artifact) return fail(res, 404, 'Model artifact not found.');
    if (artifact.hash.toLowerCase() !== hash || !(await verifyModelArtifactIntegrity(artifact))) {
      return fail(res, 409, 'Model artifact integrity check failed.');
    }
    const currentRelease = await repository.ensureModelReleaseControl(hash);
    const provenance = artifact.provenance;
    const researchArtifactId = String(provenance.trainingParameters.researchArtifactId ?? '');
    const datasetSnapshotId = String(provenance.trainingParameters.datasetSnapshotId ?? '');
    const research = researchArtifactId ? await repository.getResearchArtifact(researchArtifactId) : null;
    const snapshot = datasetSnapshotId ? await repository.getDatasetSnapshot(datasetSnapshotId) : null;
    const validated = await validateModelPromotion({
      artifact,
      research,
      researchArtifactId,
      snapshot,
      currentVersions: {
        compiler: CORE_SPIRIT_COMPILER_VERSION,
        ir: String(CORE_SPIRIT_IR_VERSION),
        runtime: CORE_SPIRIT_RUNTIME_VERSION,
      },
    });
    const approvalChecks: Record<string, unknown> = {
      ...validated.checks,
      productionEligible: validated.productionEligible,
    };
    const productionEligible = validated.productionEligible;
    const validationReport: Record<string, unknown> = {
      ...validated.report,
      evaluatedAt: new Date().toISOString(),
      actorUserId: req.tradingCoreUserId!,
    };

    if (action === 'approve' && !productionEligible) {
      res.status(422).json({
        success: false,
        error: 'Model is not eligible for production inference. Immutable rows, split boundaries, holdout predictions, feature schema, source provenance, compiler/runtime compatibility and causal safety were independently revalidated; inspect approvalChecks.',
        releaseStatus: currentRelease.status,
        approvalChecks,
        validationReport,
      });
      return;
    }
    const targetStatus = action === 'approve' ? 'approved' : action === 'revoke' ? 'revoked' : 'retired';
    if (action === 'revoke' && currentRelease.status !== 'approved') {
      return fail(res, 409, 'Only an approved model can have its production approval revoked.');
    }
    const release = await repository.transitionModelRelease({
      artifactHash: hash,
      status: targetStatus,
      actorUserId: req.tradingCoreUserId!,
      reason,
      approvalChecks,
      validationReport,
    });
    await AuditLogRepository.append({
      userId: req.tradingCoreUserId!,
      actorType: 'user',
      eventType: 'corespirit.model.release.' + action,
      correlationId: hash,
      payload: { modelHash: hash, previousStatus: currentRelease.status, status: release.status, reason, approvalChecks },
    }).catch(() => undefined);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, data: { modelHash: hash, release } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update model release status.';
    const status = /not found/i.test(message) ? 404 : /only candidate|only an approved|failed the server-side/i.test(message) ? 409 : 503;
    fail(res, status, message);
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
    await assertModelArtifactRuntimeCompatibility(storedArtifact, {
      compiler: CORE_SPIRIT_COMPILER_VERSION,
      ir: String(CORE_SPIRIT_IR_VERSION),
      runtime: CORE_SPIRIT_RUNTIME_VERSION,
    });
    const release = await store.ensureModelReleaseControl(hash);
    if (release.status !== 'approved' || release.approvalChecks.productionEligible !== true) {
      return fail(res, 409, 'Model candidate is not approved for production inference. Review chronological holdout, source causality, lookahead and provenance before approving the exact artifact hash.');
    }
    const validationEnd = storedArtifact.provenance.validationRange.to;
    const validationEndIsDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(validationEnd);
    const validatedThrough = Date.parse(validationEnd) + (validationEndIsDateOnly ? 86_399_999 : 0);
    if (!Number.isFinite(validatedThrough) || timestamp <= validatedThrough) {
      return fail(res, 422, 'Inference timestamp must be after the chronological training and validation windows to prevent holdout contamination.');
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
      hmm.setInferenceBoundaryExclusive(validatedThrough);
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
    const status = /not found/i.test(message) ? 404 : /ABI\/version compatibility|feature\/validation ABI/i.test(message) ? 409 : /feature count|feature schema/i.test(message) ? 422 : 400;
    fail(res, status, message);
  }
});
