/**
 * Immutable research/train artifact contract. This module does not import the
 * realtime chart runtime: training is dispatched to a research worker backend.
 */
import { sha256HexSync } from './artifactIdentity';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_IR_VERSION } from './VERSION';

export const CORE_SPIRIT_RESEARCH_ARTIFACT_SCHEMA = 1 as const;
export const CORE_SPIRIT_MODEL_ARTIFACT_SCHEMA = 1 as const;

export type CoreSpiritModelImplementation = 'python' | 'cpp' | 'rust' | 'wasm' | 'onnx' | 'remote';
export type CoreSpiritModelBackend = 'cpu' | 'gpu' | 'wasm' | 'onnx-runtime' | 'native-rpc' | 'remote';
export type CoreSpiritFeatureDefinition = Readonly<{ name: string; expression: string }>;

export type CoreSpiritModelTrainingPlan = Readonly<{
  modelName: string;
  featureSetName: string;
  features: readonly CoreSpiritFeatureDefinition[];
  datasetId: string;
  trainStart: string;
  trainEnd: string;
  saveAs: string;
  randomSeed: string;
  trainingParameters: Readonly<Record<string, unknown>>;
  implementation: CoreSpiritModelImplementation;
  backend: CoreSpiritModelBackend;
}>;

export type CoreSpiritModelTrainingPlanResult =
  | Readonly<{ ok: true; plan: CoreSpiritModelTrainingPlan }>
  | Readonly<{ ok: false; diagnostics: readonly string[] }>;

export type CoreSpiritResearchArtifact = Readonly<{
  schemaVersion: typeof CORE_SPIRIT_RESEARCH_ARTIFACT_SCHEMA;
  sourceHash: string;
  normalizedSourceHash: string;
  compilerVersion: string;
  irVersion: number;
  featureGraphHash: string;
  semanticFingerprintHash: string;
  researchArtifactHash: string;
}>;

export type CoreSpiritModelArtifactProvenance = Readonly<{
  schemaVersion: typeof CORE_SPIRIT_MODEL_ARTIFACT_SCHEMA;
  algorithm: 'SHA-256';
  sourceHash: string;
  researchArtifactHash: string;
  compilerVersion: string;
  irVersion: number;
  featureGraphHash: string;
  datasetId: string;
  datasetVersion: string;
  trainingRange: Readonly<{ from: string; to: string }>;
  trainingParameters: Readonly<Record<string, unknown>>;
  randomSeed: string;
  modelImplementation: CoreSpiritModelImplementation;
  backend: CoreSpiritModelBackend;
  dependencyVersions: Readonly<Record<string, string>>;
  modelPayloadSha256: string;
}>;

export type CoreSpiritImmutableModelArtifact = Readonly<{
  artifactHash: string;
  modelName: string;
  modelVersion: string;
  alias: string;
  ownerUserId: string;
  artifactUri: string;
  payloadSha256: string;
  provenance: CoreSpiritModelArtifactProvenance;
  metrics: Readonly<Record<string, number>>;
  createdAt: string;
}>;

export type CoreSpiritResolvedModelArtifact = Readonly<{
  modelName: string;
  modelVersion: string;
  artifactHash: string;
  alias: string;
  inputNames: readonly string[];
  outputNames: readonly string[];
}>;

export type CoreSpiritDatasetSnapshot = Readonly<{
  datasetId: string;
  datasetVersion: string;
  artifactUri: string;
  contentSha256: string;
  actualStart: string;
  actualEnd: string;
  rowCount: number;
}>;

export type CoreSpiritModelTrainingResult = Readonly<{
  artifactUri: string;
  payloadSha256: string;
  metrics: Readonly<Record<string, number>>;
  inputNames: readonly string[];
  outputNames: readonly string[];
}>;

export interface CoreSpiritModelArtifactRepository {
  beginTrainingRun(input: Readonly<{
    ownerUserId: string; modelName: string; alias: string; researchArtifactHash: string;
    datasetId: string; requestedFrom: string; requestedTo: string; randomSeed: string;
    trainingParameters: Readonly<Record<string, unknown>>;
  }>): Promise<string>;
  markTrainingRunRunning(runId: string, dataset: CoreSpiritDatasetSnapshot): Promise<void>;
  markTrainingRunFailed(runId: string, failure: string): Promise<void>;
  commitImmutableArtifact(artifact: CoreSpiritImmutableModelArtifact, inputNames: readonly string[], outputNames: readonly string[]): Promise<void>;
  markTrainingRunCompleted(runId: string, artifactHash: string, metrics: Readonly<Record<string, number>>): Promise<void>;
  resolveAlias(ownerUserId: string, alias: string): Promise<CoreSpiritResolvedModelArtifact | undefined>;
  getArtifactByHash(ownerUserId: string, artifactHash: string): Promise<CoreSpiritResolvedModelArtifact | undefined>;
}

export interface CoreSpiritModelTrainingBackend {
  readonly implementation: CoreSpiritModelImplementation;
  readonly backend: CoreSpiritModelBackend;
  snapshotDataset(input: Readonly<{ datasetId: string; from: string; to: string }>): Promise<CoreSpiritDatasetSnapshot>;
  /** Runs in an isolated research worker; never from executeBar or the chart VM. */
  train(input: Readonly<{
    plan: CoreSpiritModelTrainingPlan;
    researchArtifact: CoreSpiritResearchArtifact;
    dataset: CoreSpiritDatasetSnapshot;
    sourceText: string;
    provenanceWithoutPayload: Omit<CoreSpiritModelArtifactProvenance, 'modelPayloadSha256'>;
  }>): Promise<CoreSpiritModelTrainingResult>;
};

export function canonicalCoreSpiritJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Provenance cannot contain non-finite numbers');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonicalCoreSpiritJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return '{' + Object.keys(object).filter(key => object[key] !== undefined).sort()
      .map(key => JSON.stringify(key) + ':' + canonicalCoreSpiritJson(object[key])).join(',') + '}';
  }
  throw new Error('Provenance supports only JSON-compatible values');
}
export function sha256Canonical(value: unknown): string {
  return sha256HexSync(canonicalCoreSpiritJson(value));
}
function validSha256(value: string): boolean { return /^[a-f0-9]{64}$/i.test(value); }
function normalizeDate(value: string, label: string): string {
  const parsed = new Date(String(value || '').trim());
  if (!String(value || '').trim() || !Number.isFinite(parsed.getTime())) throw new Error(label + ' must be a valid date or timestamp');
  return parsed.toISOString();
}
function parseObjectLiteral(value: string): Record<string, unknown> {
  let json = value.trim();
  if (json.startsWith('{') && json.endsWith('}')) json = json.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('trainingParameters must be a JSON object such as {"epochs":40,"batchSize":256}');
  }
}

/** Parses research DSL only. train/save never become realtime chart builtins. */
export function parseCoreSpiritModelTrainingPlan(source: string): CoreSpiritModelTrainingPlanResult {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const diagnostics: string[] = [];
  let modelName = '', featureSetName = '', datasetId = '', trainStart = '', trainEnd = '', saveAs = '';
  let features: CoreSpiritFeatureDefinition[] = [];
  let randomSeed = '0';
  let trainingParameters: Record<string, unknown> = {};
  let implementation: CoreSpiritModelImplementation = 'python';
  let backend: CoreSpiritModelBackend = 'cpu';

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!, line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    const declaration = line.match(/^model\s+artifact\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?$/i);
    if (declaration) { if (modelName) diagnostics.push('Only one model artifact declaration is allowed'); modelName = declaration[1]!; continue; }

    const featureHeader = line.match(/^(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*featureSet\s*\{\s*$/i);
    if (featureHeader) {
      featureSetName = featureHeader[1]!;
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const candidate = lines[j]!.trim();
        if (candidate === '}') break;
        if (!candidate || candidate.startsWith('//') || candidate.startsWith('#')) continue;
        const feature = candidate.replace(/,$/, '').match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*(.+))?$/);
        if (!feature) { diagnostics.push('Invalid feature entry on line ' + (j + 1)); continue; }
        const name = feature[1]!, expression = feature[2]?.trim() || name;
        if (features.some(item => item.name === name)) diagnostics.push("Duplicate feature '" + name + "'");
        else features.push(Object.freeze({ name, expression }));
      }
      if (j >= lines.length) diagnostics.push('Unterminated featureSet block');
      i = j;
      continue;
    }

    const train = line.match(/^train\s+([A-Za-z_][A-Za-z0-9_]*)\s+using\s+dataset\s*\(\s*["']([^"']+)["']\s*\)\s*;?$/i);
    if (train) {
      if (modelName && train[1] !== modelName) diagnostics.push('Training target does not match model artifact declaration');
      modelName = modelName || train[1]!;
      datasetId = train[2]!.trim();
      for (let j = i + 1; j < lines.length; j += 1) {
        const next = lines[j]!.trim();
        if (!next || next.startsWith('//') || next.startsWith('#')) continue;
        const from = next.match(/^from\s+["']([^"']+)["']\s*;?$/i);
        const to = next.match(/^to\s+["']([^"']+)["']\s*;?$/i);
        const seed = next.match(/^(?:seed|randomSeed)\s*=\s*(["'])(.*?)\1\s*;?$/i);
        const params = next.match(/^(?:trainingParameters|parameters)\s*=\s*(\{.*\})\s*;?$/i);
        const impl = next.match(/^implementation\s*=\s*["'](python|cpp|rust|wasm|onnx|remote)["']\s*;?$/i);
        const backendMatch = next.match(/^backend\s*=\s*["'](cpu|gpu|wasm|onnx-runtime|native-rpc|remote)["']\s*;?$/i);
        const save = next.match(/^save\s+([A-Za-z_][A-Za-z0-9_]*)\s+as\s+["']([^"']+)["']\s*;?$/i);
        if (from) trainStart = from[1]!;
        else if (to) trainEnd = to[1]!;
        else if (seed) randomSeed = seed[2]!;
        else if (params) { try { trainingParameters = parseObjectLiteral(params[1]!); } catch (error) { diagnostics.push((error as Error).message); } }
        else if (impl) implementation = impl[1]!.toLowerCase() as CoreSpiritModelImplementation;
        else if (backendMatch) backend = backendMatch[1]!.toLowerCase() as CoreSpiritModelBackend;
        else if (save) {
          if (save[1] !== modelName) diagnostics.push('Save target does not match model artifact declaration');
          saveAs = save[2]!.trim();
          i = j;
          break;
        } else diagnostics.push('Unexpected training directive on line ' + (j + 1));
        i = j;
      }
    }
  }

  if (!modelName) diagnostics.push('Declare model artifact Name before training');
  if (!featureSetName || !features.length) diagnostics.push('A non-empty featureSet is required');
  if (!datasetId) diagnostics.push('Training source must use dataset("DATASET_ID")');
  if (!trainStart || !trainEnd) diagnostics.push('Training requires both from and to dates');
  if (!saveAs) diagnostics.push('Training must end with save ModelName as "immutable-alias"');
  try {
    if (trainStart && trainEnd) {
      const start = normalizeDate(trainStart, 'training from'), end = normalizeDate(trainEnd, 'training to');
      if (Date.parse(start) > Date.parse(end)) diagnostics.push('Training range start must be at or before end');
      trainStart = start; trainEnd = end;
    }
  } catch (error) { diagnostics.push((error as Error).message); }
  if (diagnostics.length) return Object.freeze({ ok: false, diagnostics: Object.freeze([...new Set(diagnostics)]) });
  return Object.freeze({ ok: true, plan: Object.freeze({
    modelName, featureSetName, features: Object.freeze(features), datasetId, trainStart, trainEnd,
    saveAs, randomSeed, trainingParameters: Object.freeze({ ...trainingParameters }), implementation, backend,
  }) });
}

export function buildCoreSpiritResearchArtifact(input: Readonly<{
  source: string; normalizedSource?: string; featureSet: readonly CoreSpiritFeatureDefinition[];
  compilerVersion?: string; irVersion?: number; semanticFingerprint?: string;
}>): CoreSpiritResearchArtifact {
  const sourceHash = sha256HexSync(input.source);
  const normalizedSourceHash = sha256HexSync(input.normalizedSource ?? input.source);
  const featureGraphHash = sha256Canonical(input.featureSet.map(feature => ({ name: feature.name, expression: feature.expression.trim() })));
  const semanticFingerprintHash = sha256HexSync(input.semanticFingerprint ?? '');
  const core = {
    schemaVersion: CORE_SPIRIT_RESEARCH_ARTIFACT_SCHEMA,
    sourceHash, normalizedSourceHash,
    compilerVersion: input.compilerVersion ?? CORE_SPIRIT_COMPILER_VERSION,
    irVersion: input.irVersion ?? CORE_SPIRIT_IR_VERSION,
    featureGraphHash, semanticFingerprintHash,
  };
  return Object.freeze({ ...core, researchArtifactHash: sha256Canonical(core) });
}

export function buildCoreSpiritModelArtifactProvenance(input: Readonly<{
  sourceHash: string; researchArtifactHash: string; compilerVersion: string; irVersion: number;
  featureGraphHash: string; datasetId: string; datasetVersion: string;
  trainingRange: Readonly<{ from: string; to: string }>;
  trainingParameters: Readonly<Record<string, unknown>>; randomSeed: string;
  modelImplementation: CoreSpiritModelImplementation; backend: CoreSpiritModelBackend;
  dependencyVersions: Readonly<Record<string, string>>; modelPayloadSha256: string;
}>): CoreSpiritModelArtifactProvenance {
  for (const [key, value] of [
    ['sourceHash', input.sourceHash], ['researchArtifactHash', input.researchArtifactHash],
    ['featureGraphHash', input.featureGraphHash], ['modelPayloadSha256', input.modelPayloadSha256],
  ] as const) if (!validSha256(value)) throw new Error(key + ' must be a 64-character SHA-256 digest');
  if (!input.datasetId.trim() || !input.datasetVersion.trim()) throw new Error('datasetId and immutable datasetVersion are required');
  if (!input.compilerVersion.trim() || !Number.isInteger(input.irVersion) || input.irVersion < 1) throw new Error('compilerVersion and a positive IR version are required');
  if (!input.randomSeed.length) throw new Error('randomSeed must be pinned; use "0" for a deterministic default');
  const from = normalizeDate(input.trainingRange.from, 'training range from');
  const to = normalizeDate(input.trainingRange.to, 'training range to');
  if (Date.parse(from) > Date.parse(to)) throw new Error('training range start must be at or before end');
  const trainingParameters = JSON.parse(canonicalCoreSpiritJson(input.trainingParameters)) as Record<string, unknown>;
  const dependencyVersions = Object.fromEntries(Object.entries(input.dependencyVersions)
    .map(([key, value]) => [key.trim(), String(value).trim()])
    .sort(([a], [b]) => a.localeCompare(b)));
  if (Object.entries(dependencyVersions).some(([key, value]) => !key || !value)) throw new Error('dependencyVersions must contain non-empty names and versions');
  return Object.freeze({
    schemaVersion: CORE_SPIRIT_MODEL_ARTIFACT_SCHEMA, algorithm: 'SHA-256',
    sourceHash: input.sourceHash, researchArtifactHash: input.researchArtifactHash,
    compilerVersion: input.compilerVersion, irVersion: input.irVersion,
    featureGraphHash: input.featureGraphHash, datasetId: input.datasetId.trim(), datasetVersion: input.datasetVersion.trim(),
    trainingRange: Object.freeze({ from, to }), trainingParameters: Object.freeze(trainingParameters),
    randomSeed: input.randomSeed, modelImplementation: input.modelImplementation, backend: input.backend,
    dependencyVersions: Object.freeze(dependencyVersions), modelPayloadSha256: input.modelPayloadSha256.toLowerCase(),
  });
}
export function hashCoreSpiritModelArtifact(provenance: CoreSpiritModelArtifactProvenance): string {
  return sha256Canonical({ domain: 'TradingCoreOS/CoreSpirit/ModelArtifact/v1', provenance });
}
export function createCoreSpiritImmutableModelArtifact(input: Readonly<{
  plan: CoreSpiritModelTrainingPlan; ownerUserId: string; artifactUri: string; modelPayloadSha256: string;
  datasetVersion: string; researchArtifact: CoreSpiritResearchArtifact;
  dependencyVersions: Readonly<Record<string, string>>; metrics?: Readonly<Record<string, number>>; createdAt?: string;
}>): CoreSpiritImmutableModelArtifact {
  if (!input.ownerUserId.trim()) throw new Error('ownerUserId is required');
  if (!input.artifactUri.trim()) throw new Error('artifactUri is required for model bytes');
  const provenance = buildCoreSpiritModelArtifactProvenance({
    sourceHash: input.researchArtifact.sourceHash, researchArtifactHash: input.researchArtifact.researchArtifactHash,
    compilerVersion: input.researchArtifact.compilerVersion, irVersion: input.researchArtifact.irVersion,
    featureGraphHash: input.researchArtifact.featureGraphHash, datasetId: input.plan.datasetId,
    datasetVersion: input.datasetVersion, trainingRange: { from: input.plan.trainStart, to: input.plan.trainEnd },
    trainingParameters: input.plan.trainingParameters, randomSeed: input.plan.randomSeed,
    modelImplementation: input.plan.implementation, backend: input.plan.backend,
    dependencyVersions: input.dependencyVersions, modelPayloadSha256: input.modelPayloadSha256,
  });
  const metrics = Object.fromEntries(Object.entries(input.metrics ?? {}).map(([key, value]) => {
    if (!Number.isFinite(value)) throw new Error('Model metric ' + key + ' must be finite');
    return [key, value];
  }));
  const artifactHash = hashCoreSpiritModelArtifact(provenance);
  return Object.freeze({
    artifactHash, modelName: input.plan.modelName, modelVersion: artifactHash.slice(0, 16),
    alias: input.plan.saveAs, ownerUserId: input.ownerUserId, artifactUri: input.artifactUri,
    payloadSha256: input.modelPayloadSha256.toLowerCase(), provenance, metrics: Object.freeze(metrics),
    createdAt: normalizeDate(input.createdAt ?? new Date().toISOString(), 'createdAt'),
  });
}

/** Training is an injected host capability; the chart/runtime is not referenced. */
export class CoreSpiritModelTrainingService {
  constructor(
    private readonly repository: CoreSpiritModelArtifactRepository,
    private readonly backend: CoreSpiritModelTrainingBackend,
    private readonly dependencyVersions: Readonly<Record<string, string>>,
  ) {}

  async trainAndSave(input: Readonly<{
    ownerUserId: string; sourceText: string; plan: CoreSpiritModelTrainingPlan; researchArtifact: CoreSpiritResearchArtifact;
  }>): Promise<CoreSpiritImmutableModelArtifact> {
    if (input.plan.implementation !== this.backend.implementation || input.plan.backend !== this.backend.backend) {
      throw new Error('Training backend does not match the explicitly requested implementation/backend');
    }
    if (input.researchArtifact.sourceHash !== sha256HexSync(input.sourceText)) {
      throw new Error('Research source changed after compilation; rebuild the research artifact before training');
    }
    const runId = await this.repository.beginTrainingRun({
      ownerUserId: input.ownerUserId, modelName: input.plan.modelName, alias: input.plan.saveAs,
      researchArtifactHash: input.researchArtifact.researchArtifactHash, datasetId: input.plan.datasetId,
      requestedFrom: input.plan.trainStart, requestedTo: input.plan.trainEnd, randomSeed: input.plan.randomSeed,
      trainingParameters: input.plan.trainingParameters,
    });
    try {
      const dataset = await this.backend.snapshotDataset({ datasetId: input.plan.datasetId, from: input.plan.trainStart, to: input.plan.trainEnd });
      if (!dataset.datasetVersion.trim() || !validSha256(dataset.contentSha256)) throw new Error('Dataset backend must return a pinned version and SHA-256 content digest');
      if (!Number.isInteger(dataset.rowCount) || dataset.rowCount < 1) throw new Error('Training dataset must contain at least one row');
      if (Date.parse(dataset.actualStart) < Date.parse(input.plan.trainStart) ||
          Date.parse(dataset.actualEnd) > Date.parse(input.plan.trainEnd) ||
          Date.parse(dataset.actualStart) > Date.parse(dataset.actualEnd)) {
        throw new Error('Pinned dataset snapshot falls outside the requested training range');
      }
      await this.repository.markTrainingRunRunning(runId, dataset);
      const provenanceWithoutPayload = {
        schemaVersion: CORE_SPIRIT_MODEL_ARTIFACT_SCHEMA, algorithm: 'SHA-256' as const,
        sourceHash: input.researchArtifact.sourceHash, researchArtifactHash: input.researchArtifact.researchArtifactHash,
        compilerVersion: input.researchArtifact.compilerVersion, irVersion: input.researchArtifact.irVersion,
        featureGraphHash: input.researchArtifact.featureGraphHash, datasetId: dataset.datasetId,
        datasetVersion: dataset.datasetVersion, trainingRange: { from: input.plan.trainStart, to: input.plan.trainEnd },
        trainingParameters: input.plan.trainingParameters, randomSeed: input.plan.randomSeed,
        modelImplementation: input.plan.implementation, backend: input.plan.backend, dependencyVersions: this.dependencyVersions,
      };
      const trained = await this.backend.train({
        plan: input.plan, researchArtifact: input.researchArtifact, dataset, sourceText: input.sourceText,
        provenanceWithoutPayload,
      });
      const artifact = createCoreSpiritImmutableModelArtifact({
        plan: input.plan, ownerUserId: input.ownerUserId, artifactUri: trained.artifactUri,
        modelPayloadSha256: trained.payloadSha256, datasetVersion: dataset.datasetVersion,
        researchArtifact: input.researchArtifact, dependencyVersions: this.dependencyVersions, metrics: trained.metrics,
      });
      await this.repository.commitImmutableArtifact(artifact, trained.inputNames, trained.outputNames);
      await this.repository.markTrainingRunCompleted(runId, artifact.artifactHash, trained.metrics);
      return artifact;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 4000);
      try { await this.repository.markTrainingRunFailed(runId, message); } catch { /* preserve original failure */ }
      throw error;
    }
  }
}
