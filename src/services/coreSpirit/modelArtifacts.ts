/**
 * Immutable CoreSpirit research/model artifact contracts.
 *
 * Training is intentionally outside CoreSpiritRuntime and the chart update loop.
 * Storage/training backends are injected by the application; this module provides
 * deterministic provenance, artifact validation, and hash-pinned inference handles.
 */

export const CORESPIRIT_RESEARCH_ARTIFACT_VERSION = '1';
export const CORESPIRIT_MODEL_ARTIFACT_VERSION = '2';

export type TrainingRange = Readonly<{ from: string; to: string }>;
export type ArtifactBackend = 'cpu' | 'wasm' | 'webgpu' | 'remote';
export type CoreSpiritModelReleaseStatus = 'candidate' | 'approved' | 'revoked' | 'retired';
export type CoreSpiritModelTargetKind = 'direction' | 'return' | 'volatility' | 'regime' | 'range' | 'price';

export type CoreSpiritDatasetSnapshotSource = 'user_supplied' | 'broker_history' | 'trusted_feature_pipeline';
export type CoreSpiritModelDatasetSnapshot = Readonly<{
  hash: string;
  version: string;
  rows: number;
  source: CoreSpiritDatasetSnapshotSource;
  from: string;
  to: string;
  immutable: true;
}>;

export type CoreSpiritModelContract = Readonly<{
  contractVersion: 1;
  identity: Readonly<{ id: string; version: string }>;
  /** Content-addressed, immutable training rows used to seal this artifact. */
  datasetSnapshot?: CoreSpiritModelDatasetSnapshot;
  featureSchema: Readonly<{
    version: string;
    orderedNames: readonly string[];
    types: readonly string[];
    hash: string;
  }>;
  lookback: Readonly<{ minBars: number; preferredBars: number; maxBars: number }>;
  target: Readonly<{ kind: CoreSpiritModelTargetKind; forecastHorizonBars: number }>;
  temporal: Readonly<{
    trainingRequiresConfirmedBars: true;
    availabilityRule: 'availableAt<=timestamp';
    validationProtocol: 'chronological-holdout-v1' | 'purged-chronological-v1';
  }>;
  validation: Readonly<{
    protocol: 'chronological-holdout-v1' | 'purged-chronological-v1';
    metrics: Readonly<Record<string, number>>;
    calibrationStatus: 'calibrated' | 'not_calibrated' | 'not_applicable';
  }>;
  /** Immutable artifact metadata remains candidate; approval lives in the audited release-control record. */
  releaseStatus: CoreSpiritModelReleaseStatus;
}>;

export type ModelValidationResults = Readonly<{
  protocol: 'chronological-holdout-v1' | 'purged-chronological-v1';
  trainingSampleCount: number;
  sampleCount: number;
  distinctPredictedStates: number;
  meanConfidence: number;
  minConfidence: number;
  maxConfidence: number;
  forwardOnly: boolean;
  noTimestampOverlap: boolean;
  featureSchemaMatched: boolean;
  labelLeakageCheckPassed: boolean;
  featureAvailabilityCheckPassed: boolean;
  datasetHashVerified: boolean;
  sourceCausalityPassed: boolean;
  lookaheadCheckPassed: boolean;
}>;

export type ModelProvenance = Readonly<{
  sourceHash: string;
  compilerVersion: string;
  runtimeVersion: string;
  irVersion: string;
  featureGraphHash: string;
  datasetVersion: string;
  /** Hash integrity is independent of whether a trusted provider attested the source. */
  datasetSource: 'user_supplied' | 'broker_history' | 'trusted_feature_pipeline';
  datasetSourceVerified: boolean;
  datasetSourceAttestationHash: string | null;
  trainingRange: TrainingRange;
  validationRange: TrainingRange;
  validationResults: ModelValidationResults;
  researchSafety: import('./researchValidation.js').ResearchSafetySummary;
  trainingParameters: Readonly<Record<string, string | number | boolean | null>>;
  randomSeed: number;
  modelImplementation: string;
  backend: ArtifactBackend;
  dependencyVersions: Readonly<Record<string, string>>;
}>;

export type ResearchArtifact = Readonly<{
  kind: 'corespirit-research';
  schemaVersion: typeof CORESPIRIT_RESEARCH_ARTIFACT_VERSION;
  name: string;
  source: string;
  sourceHash: string;
  compilerVersion: string;
  irVersion: string;
  featureGraphHash: string;
  featureGraph: unknown;
  ir: unknown;
  createdAt: string;
}>;

export type ModelArtifact<TWeights = unknown> = Readonly<{
  kind: 'corespirit-model';
  schemaVersion: typeof CORESPIRIT_MODEL_ARTIFACT_VERSION;
  name: string;
  hash: string;
  provenance: ModelProvenance;
  weights: TWeights;
  metrics: Readonly<Record<string, number>>;
  /** Optional only for legacy v2 artifacts. Newly sealed artifacts always carry this ABI contract. */
  contract?: CoreSpiritModelContract;
  createdAt: string;
}>;

export type ResearchCompileInput = Readonly<{
  name: string;
  source: string;
  compilerVersion: string;
  irVersion: string;
  featureGraph: unknown;
  ir: unknown;
  createdAt?: string;
}>;

export type TrainModelInput<TWeights = unknown> = Readonly<{
  research: ResearchArtifact;
  provenance: ModelProvenance;
  weights: TWeights;
  metrics?: Readonly<Record<string, number>>;
  contract?: CoreSpiritModelContract;
  createdAt?: string;
}>;

export type ModelArtifactStore<TWeights = unknown> = {
  put(artifact: ModelArtifact<TWeights>): Promise<void>;
  getByName(name: string): Promise<ModelArtifact<TWeights> | null>;
  getByHash(hash: string): Promise<ModelArtifact<TWeights> | null>;
};

export type ModelInference<TFeatures, TPrediction> = {
  predict(features: TFeatures): Promise<TPrediction>;
};

export type ModelInferenceFactory<TWeights, TFeatures, TPrediction> = (
  artifact: ModelArtifact<TWeights>,
) => ModelInference<TFeatures, TPrediction> | Promise<ModelInference<TFeatures, TPrediction>>;

const encoder = new TextEncoder();

/** Convert supported values to an acyclic, JSON-safe tree before hashing/publishing. */
function normalizeArtifactValue(value: unknown, ancestors = new WeakSet<object>()): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Artifact payload cannot contain non-finite numbers');
    return value;
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<unknown>, item => normalizeArtifactValue(item, ancestors));
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error('Artifact payload cannot contain circular references');
    ancestors.add(value);
    const result = value.map(item => normalizeArtifactValue(item, ancestors) ?? null);
    ancestors.delete(value);
    return result;
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Artifact payload contains an invalid Date');
    return value.toISOString();
  }
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Artifact payload only supports plain objects, arrays and numeric typed arrays');
    }
    if (ancestors.has(value)) throw new Error('Artifact payload cannot contain circular references');
    ancestors.add(value);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(object).sort()) {
      if (object[key] === undefined) continue;
      result[key] = normalizeArtifactValue(object[key], ancestors);
    }
    ancestors.delete(value);
    return result;
  }
  throw new Error('Artifact payload cannot contain ' + typeof value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Artifact payload cannot contain non-finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + canonical(record[key])).join(',') + '}';
  }
  throw new Error('Artifact payload cannot contain ' + typeof value);
}

function modelArtifactHashPayload<TWeights>(
  artifact: Pick<ModelArtifact<TWeights>, 'schemaVersion' | 'name' | 'provenance' | 'weights' | 'metrics'> &
    Partial<Pick<ModelArtifact<TWeights>, 'contract'>>,
): unknown {
  return {
    schemaVersion: artifact.schemaVersion,
    name: artifact.name,
    provenance: artifact.provenance,
    weights: artifact.weights,
    metrics: artifact.metrics,
    ...(artifact.contract ? { contract: artifact.contract } : {}),
  };
}

/** Stable SHA-256 of canonical JSON; fails closed where WebCrypto is unavailable. */
export async function coreSpiritSha256(value: unknown): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 requires WebCrypto; refusing to create an unhashed model artifact');
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(canonical(normalizeArtifactValue(value))));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function validateDateRange(range: TrainingRange): void {
  const from = Date.parse(range.from);
  const to = Date.parse(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    throw new Error('Training range must contain valid dates with from < to');
  }
}

function validateProvenance(provenance: ModelProvenance): void {
  if (!provenance || typeof provenance !== 'object') throw new Error('Model provenance is required');
  validateDateRange(provenance.trainingRange);
  validateDateRange(provenance.validationRange);
  const trainingEnd = Date.parse(provenance.trainingRange.to) +
    (/^\d{4}-\d{2}-\d{2}$/.test(provenance.trainingRange.to) ? 86_399_999 : 0);
  const validationStart = Date.parse(provenance.validationRange.from);
  if (!Number.isFinite(trainingEnd) || !Number.isFinite(validationStart) || trainingEnd >= validationStart) {
    throw new Error('Validation range must be strictly after the training range; overlapping time-series samples are not allowed');
  }
  const validation = provenance.validationResults;
  if (!validation || !['chronological-holdout-v1', 'purged-chronological-v1'].includes(validation.protocol) ||
      !Number.isSafeInteger(validation.trainingSampleCount) || validation.trainingSampleCount < 12 ||
      !Number.isSafeInteger(validation.sampleCount) || validation.sampleCount < 12 ||
      !Number.isSafeInteger(validation.distinctPredictedStates) || validation.distinctPredictedStates < 1 ||
      !Number.isFinite(validation.meanConfidence) || validation.meanConfidence < 0 || validation.meanConfidence > 1 ||
      !Number.isFinite(validation.minConfidence) || validation.minConfidence < 0 || validation.minConfidence > 1 ||
      !Number.isFinite(validation.maxConfidence) || validation.maxConfidence < 0 || validation.maxConfidence > 1 ||
      validation.minConfidence > validation.meanConfidence || validation.meanConfidence > validation.maxConfidence ||
      ['forwardOnly','noTimestampOverlap','featureSchemaMatched','labelLeakageCheckPassed',
        'featureAvailabilityCheckPassed','datasetHashVerified','sourceCausalityPassed','lookaheadCheckPassed']
        .some(key => typeof (validation as unknown as Record<string, unknown>)[key] !== 'boolean')) {
    throw new Error('Model provenance must contain a valid chronological holdout validation report');
  }
  const safety = provenance.researchSafety;
  if (!safety || safety.version !== 1 || typeof safety.approvalEligible !== 'boolean' ||
      !Array.isArray(safety.blockers) || !Array.isArray(safety.warnings) ||
      typeof safety.causality !== 'string' || typeof safety.lookahead !== 'string' ||
      ![true, false, 'unknown'].includes(safety.realtimeSafe) ||
      ![true, false, 'unknown'].includes(safety.backtestLiveEquivalent)) {
    throw new Error('Model provenance must contain a complete static research-safety report');
  }
  if (!provenance.runtimeVersion || typeof provenance.runtimeVersion !== 'string') {
    throw new Error('Model provenance must record the CoreSpirit runtime version');
  }
  if (!/^[a-f0-9]{64}$/.test(provenance.sourceHash) ||
      !/^[a-f0-9]{64}$/.test(provenance.featureGraphHash) ||
      !/^[a-f0-9]{64}$/.test(provenance.datasetVersion) ||
      !provenance.compilerVersion || !provenance.irVersion || !provenance.modelImplementation) {
    throw new Error('Model provenance is incomplete or contains an invalid SHA-256 identity');
  }
  if (!['user_supplied','broker_history','trusted_feature_pipeline'].includes(provenance.datasetSource) ||
      typeof provenance.datasetSourceVerified !== 'boolean') {
    throw new Error('Model provenance must distinguish dataset integrity from verified source provenance');
  }
  if (provenance.datasetSourceVerified) {
    if (provenance.datasetSource === 'user_supplied' ||
        typeof provenance.datasetSourceAttestationHash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(provenance.datasetSourceAttestationHash)) {
      throw new Error('Verified dataset source requires a non-user-supplied source and a SHA-256 attestation hash');
    }
  } else if (provenance.datasetSourceAttestationHash !== null) {
    throw new Error('Unverified dataset sources must not contain a trusted-source attestation hash');
  }
  if (!['cpu', 'wasm', 'webgpu', 'remote'].includes(provenance.backend)) {
    throw new Error('Model provenance backend is unsupported');
  }
  if (!provenance.dependencyVersions || typeof provenance.dependencyVersions !== 'object' ||
      !Object.keys(provenance.dependencyVersions).length ||
      Object.values(provenance.dependencyVersions).some(version => typeof version !== 'string' || !version.trim())) {
    throw new Error('Model provenance must record at least one dependency version');
  }
  if (!provenance.trainingParameters || typeof provenance.trainingParameters !== 'object' ||
      Array.isArray(provenance.trainingParameters)) {
    throw new Error('Model provenance trainingParameters must be an object');
  }
  for(const [name,value] of Object.entries(provenance.trainingParameters)){
    if(!name.trim()||!(value===null||typeof value==='string'||typeof value==='boolean'||
      (typeof value==='number'&&Number.isFinite(value)))){
      throw new Error('Model training parameter values must be named, finite JSON primitives');
    }
  }
  if (!Number.isSafeInteger(provenance.randomSeed) || provenance.randomSeed < 0) {
    throw new Error('Model randomSeed must be a non-negative safe integer');
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/** Produces a deterministic research artifact from compiler output, not from a live chart session. */
export async function createResearchArtifact(input: ResearchCompileInput): Promise<ResearchArtifact> {
  if (!input.name.trim()) throw new Error('Research artifact name is required');
  const normalizedFeatureGraph = normalizeArtifactValue(input.featureGraph);
  const normalizedIr = normalizeArtifactValue(input.ir);
  const sourceHash = await coreSpiritSha256(input.source);
  const featureGraphHash = await coreSpiritSha256(normalizedFeatureGraph);
  return deepFreeze({
    kind: 'corespirit-research',
    schemaVersion: CORESPIRIT_RESEARCH_ARTIFACT_VERSION,
    name: input.name,
    source: input.source,
    sourceHash,
    compilerVersion: input.compilerVersion,
    irVersion: input.irVersion,
    featureGraphHash,
    featureGraph: normalizedFeatureGraph,
    ir: normalizedIr,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

function featureNamesFromResearchGraph(graphValue: unknown): string[] {
  if (!graphValue || typeof graphValue !== 'object' || Array.isArray(graphValue)) return [];
  const graph = graphValue as Record<string, unknown>;
  const candidate = Array.isArray(graph.featureNames) ? graph.featureNames
    : Array.isArray(graph.fields) ? graph.fields
    : Array.isArray(graph.features) ? graph.features
    : graph.features && typeof graph.features === 'object' && !Array.isArray(graph.features)
      ? Object.keys(graph.features as Record<string, unknown>)
      : [];
  return candidate.map(value => typeof value === 'string'
    ? value.trim()
    : value && typeof value === 'object' && 'name' in value
      ? String((value as Record<string, unknown>).name).trim()
      : '').filter(Boolean);
}

function assertModelContract(contract: CoreSpiritModelContract): void {
  if (!contract || contract.contractVersion !== 1 ||
      !contract.identity || !contract.identity.id.trim() || !contract.identity.version.trim()) {
    throw new Error('Model contract must include a stable identity and supported contract version.');
  }
  if (contract.datasetSnapshot) {
    const snapshot = contract.datasetSnapshot;
    const from = Date.parse(snapshot.from);
    const to = Date.parse(snapshot.to);
    if (!/^[a-f0-9]{64}$/.test(snapshot.hash) || snapshot.version !== snapshot.hash ||
        !Number.isSafeInteger(snapshot.rows) || snapshot.rows < 12 || snapshot.rows > 1_000_000 ||
        !['user_supplied', 'broker_history', 'trusted_feature_pipeline'].includes(snapshot.source) ||
        snapshot.immutable !== true || !Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
      throw new Error('Model dataset snapshot must be immutable, content-addressed, bounded, and time-ranged.');
    }
  }
  const schema = contract.featureSchema;
  if (!schema || !schema.version.trim() || !Array.isArray(schema.orderedNames) ||
      schema.orderedNames.length < 1 || schema.orderedNames.length > 64 ||
      schema.orderedNames.some(name => typeof name !== 'string' || !name.trim()) ||
      new Set(schema.orderedNames).size !== schema.orderedNames.length ||
      !/^[a-f0-9]{64}$/.test(schema.hash) ||
      !Array.isArray(schema.types) || schema.types.length !== schema.orderedNames.length ||
      schema.types.some(type => typeof type !== 'string' || !type.trim())) {
    throw new Error('Model contract feature schema must preserve ordered named types and a SHA-256 hash.');
  }
  const lookback = contract.lookback;
  if (!lookback ||
      !Number.isSafeInteger(lookback.minBars) || lookback.minBars < 1 ||
      !Number.isSafeInteger(lookback.preferredBars) || lookback.preferredBars < lookback.minBars ||
      !Number.isSafeInteger(lookback.maxBars) || lookback.maxBars < lookback.preferredBars ||
      lookback.maxBars > 5000) {
    throw new Error('Model lookback must satisfy 1 <= minimum <= preferred <= maximum <= 5000 bars.');
  }
  if (!contract.target || !['direction', 'return', 'volatility', 'regime', 'range', 'price'].includes(contract.target.kind) ||
      !Number.isSafeInteger(contract.target.forecastHorizonBars) ||
      contract.target.forecastHorizonBars < 1 || contract.target.forecastHorizonBars > 500) {
    throw new Error('Model target must identify its output semantics and a bounded forecast horizon.');
  }
  if (!contract.temporal || contract.temporal.trainingRequiresConfirmedBars !== true ||
      contract.temporal.availabilityRule !== 'availableAt<=timestamp' ||
      !['chronological-holdout-v1', 'purged-chronological-v1'].includes(contract.temporal.validationProtocol)) {
    throw new Error('Model temporal contract must require confirmed rows and a declared availability/validation protocol.');
  }
  if (!contract.validation ||
      contract.validation.protocol !== contract.temporal.validationProtocol ||
      !['calibrated', 'not_calibrated', 'not_applicable'].includes(contract.validation.calibrationStatus) ||
      !contract.validation.metrics || typeof contract.validation.metrics !== 'object' ||
      Array.isArray(contract.validation.metrics) ||
      Object.entries(contract.validation.metrics).some(([name, value]) => !name.trim() || !Number.isFinite(value))) {
    throw new Error('Model validation contract is incomplete or contains non-finite metrics.');
  }
  if (!['candidate', 'approved', 'revoked', 'retired'].includes(contract.releaseStatus)) {
    throw new Error('Model release status is unsupported.');
  }
}

async function defaultModelContract<TWeights>(input: TrainModelInput<TWeights>, metrics: Readonly<Record<string, number>>): Promise<CoreSpiritModelContract> {
  if (input.contract) {
    const supplied = normalizeArtifactValue(input.contract) as CoreSpiritModelContract;
    const provenance = input.provenance;
    const purgedRows = provenance.trainingParameters.purgedDatasetRows ?? provenance.trainingParameters.purgedCount ?? 0;
    const snapshotRows = provenance.validationResults.trainingSampleCount +
      provenance.validationResults.sampleCount + (typeof purgedRows === 'number' && Number.isSafeInteger(purgedRows) && purgedRows >= 0 ? purgedRows : 0);
    const generatedSnapshot: CoreSpiritModelDatasetSnapshot = {
      hash: provenance.datasetVersion,
      version: provenance.datasetVersion,
      rows: snapshotRows,
      source: provenance.datasetSource,
      from: provenance.trainingRange.from,
      to: provenance.validationRange.to,
      immutable: true,
    };
    const contract = { ...supplied, datasetSnapshot: supplied.datasetSnapshot ?? generatedSnapshot };
    if (contract.datasetSnapshot.hash !== provenance.datasetVersion ||
        contract.datasetSnapshot.source !== provenance.datasetSource) {
      throw new Error('Model contract dataset snapshot does not match the verified training provenance.');
    }
    assertModelContract(contract);
    return deepFreeze(contract);
  }
  const names = featureNamesFromResearchGraph(input.research.featureGraph);
  if (!names.length) {
    throw new Error('Research feature graph must declare ordered feature names before a model can be sealed.');
  }
  const graph = input.research.featureGraph && typeof input.research.featureGraph === 'object'
    ? input.research.featureGraph as Record<string, unknown> : {};
  const schemaVersion = typeof graph.featureSchemaVersion === 'string' && graph.featureSchemaVersion.trim()
    ? graph.featureSchemaVersion : 'corespirit-feature-schema/v1';
  const featureSchema = {
    version: schemaVersion,
    orderedNames: names,
    // Logical numeric ABI matches Python's float64 inference column contract.
    types: names.map(() => 'float64'),
  };
  const featureSchemaHash = await coreSpiritSha256({
    version: featureSchema.version,
    orderedNames: featureSchema.orderedNames,
    types: featureSchema.types,
  });
  const parameters = input.provenance.trainingParameters;
  const numericParameter = (keys: string[], fallback: number) => {
    for (const key of keys) {
      const value = parameters[key];
      if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
    }
    return fallback;
  };
  const modelType = String(graph.modelType ?? '');
  const targetKindRaw = String(parameters.targetKind ?? (modelType.includes('HMM') ? 'regime' : 'direction'));
  const targetKind: CoreSpiritModelTargetKind = ['direction', 'return', 'volatility', 'regime', 'range', 'price'].includes(targetKindRaw)
    ? targetKindRaw as CoreSpiritModelTargetKind : 'direction';
  const horizon = Math.min(500, numericParameter(['forecastHorizonBars', 'targetHorizonBars', 'horizon'], 1));
  const minBars = Math.min(5000, numericParameter(['minLookbackBars', 'lookbackBars'], Math.min(64, Math.max(1, names.length * 4))));
  const preferredBars = Math.min(5000, Math.max(minBars, numericParameter(['preferredLookbackBars'], Math.max(minBars, 512))));
  const maxBars = Math.min(5000, Math.max(preferredBars, numericParameter(['maxLookbackBars'], 5000)));
  const validationProtocol = input.provenance.validationResults.protocol;
  const calibrationValue = parameters.calibrationStatus;
  const calibrationStatus = calibrationValue === 'calibrated' || calibrationValue === 'not_applicable'
    ? calibrationValue : 'not_calibrated';
  const contract: CoreSpiritModelContract = {
    contractVersion: 1,
    identity: { id: input.research.name, version: input.provenance.datasetVersion.slice(0, 16) },
    featureSchema: { ...featureSchema, hash: featureSchemaHash },
    datasetSnapshot: {
      hash: input.provenance.datasetVersion,
      version: input.provenance.datasetVersion,
      rows: input.provenance.validationResults.trainingSampleCount +
        input.provenance.validationResults.sampleCount +
        (typeof parameters.purgedDatasetRows === 'number' && Number.isSafeInteger(parameters.purgedDatasetRows) && parameters.purgedDatasetRows >= 0 ? parameters.purgedDatasetRows : 0),
      source: input.provenance.datasetSource,
      from: input.provenance.trainingRange.from,
      to: input.provenance.validationRange.to,
      immutable: true,
    },
    lookback: { minBars, preferredBars, maxBars },
    target: { kind: targetKind, forecastHorizonBars: horizon },
    temporal: {
      trainingRequiresConfirmedBars: true,
      availabilityRule: 'availableAt<=timestamp',
      validationProtocol,
    },
    validation: {
      protocol: validationProtocol,
      metrics,
      calibrationStatus,
    },
    releaseStatus: 'candidate',
  };
  assertModelContract(contract);
  return deepFreeze(contract);
}

/** Seals trained weights together with every declared reproducibility input. */
export async function sealModelArtifact<TWeights>(input: TrainModelInput<TWeights>): Promise<ModelArtifact<TWeights>> {
  validateProvenance(input.provenance);
  if (input.provenance.sourceHash !== input.research.sourceHash) {
    throw new Error('Model sourceHash does not match the compiled research artifact');
  }
  if (input.provenance.compilerVersion !== input.research.compilerVersion ||
      input.provenance.irVersion !== input.research.irVersion ||
      input.provenance.featureGraphHash !== input.research.featureGraphHash) {
    throw new Error('Model provenance does not match research compiler/IR/feature graph metadata');
  }
  const provenance = normalizeArtifactValue(input.provenance) as ModelProvenance;
  const weights = normalizeArtifactValue(input.weights) as TWeights;
  const metrics = normalizeArtifactValue(input.metrics ?? {}) as Readonly<Record<string, number>>;
  for (const [key, value] of Object.entries(metrics)) {
    if (!Number.isFinite(value)) throw new Error('Model metric "' + key + '" must be finite');
  }
  const contract = await defaultModelContract(input, metrics);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const hash = await coreSpiritSha256(modelArtifactHashPayload({
    schemaVersion: CORESPIRIT_MODEL_ARTIFACT_VERSION,
    name: input.research.name,
    provenance,
    weights,
    metrics,
    contract,
  }));
  return deepFreeze({
    kind: 'corespirit-model',
    schemaVersion: CORESPIRIT_MODEL_ARTIFACT_VERSION,
    name: input.research.name,
    hash,
    provenance,
    weights,
    metrics,
    contract,
    createdAt,
  });
}

/**
 * Immutable-by-hash store useful for local development/tests. Production adapters
 * should persist artifacts durably and enforce uniqueness by hash server-side.
 */
export class InMemoryModelArtifactStore<TWeights = unknown> implements ModelArtifactStore<TWeights> {
  private readonly byHash = new Map<string, ModelArtifact<TWeights>>();
  private readonly nameToHash = new Map<string, string>();

  async put(artifact: ModelArtifact<TWeights>): Promise<void> {
    if(!(await verifyModelArtifactIntegrity(artifact))){
      throw new Error('Refusing to store an invalid CoreSpirit model artifact');
    }
    const existing = this.byHash.get(artifact.hash);
    if (existing) {
      if (canonical(modelArtifactHashPayload(existing)) !== canonical(modelArtifactHashPayload(artifact))) {
        throw new Error('Model artifact hash collision or inconsistent artifact payload');
      }
      return;
    }
    const namedHash = this.nameToHash.get(artifact.name);
    if (namedHash && namedHash !== artifact.hash) {
      throw new Error('Model name "' + artifact.name + '" already points to a different immutable hash; publish a new versioned name');
    }
    this.byHash.set(artifact.hash, artifact);
    this.nameToHash.set(artifact.name, artifact.hash);
  }

  async getByName(name: string): Promise<ModelArtifact<TWeights> | null> {
    const hash = this.nameToHash.get(name);
    return hash ? this.getByHash(hash) : null;
  }

  async getByHash(hash: string): Promise<ModelArtifact<TWeights> | null> {
    return this.byHash.get(hash) ?? null;
  }
}

/** Recomputes a sealed artifact's content identity before persistence or inference. */
export async function verifyModelArtifactIntegrity<TWeights>(artifact: ModelArtifact<TWeights>): Promise<boolean> {
  try{
    if (!artifact || artifact.kind !== 'corespirit-model' ||
        artifact.schemaVersion !== CORESPIRIT_MODEL_ARTIFACT_VERSION ||
        !/^[a-f0-9]{64}$/.test(artifact.hash) ||
        typeof artifact.name!=='string'||!artifact.name.trim() ||
        !artifact.metrics||typeof artifact.metrics!=='object'||Array.isArray(artifact.metrics)) return false;
    validateProvenance(artifact.provenance);
    if (artifact.contract) assertModelContract(artifact.contract);
    for(const [name,value] of Object.entries(artifact.metrics)){
      if(!name.trim()||typeof value!=='number'||!Number.isFinite(value))return false;
    }
    if(typeof artifact.createdAt!=='string'||!Number.isFinite(Date.parse(artifact.createdAt)))return false;
    const expectedHash = await coreSpiritSha256(modelArtifactHashPayload(artifact));
    return expectedHash === artifact.hash;
  }catch{
    return false;
  }
}

/**
 * Re-checks the immutable model ABI on every production inference path.
 * A historical approval cannot authorize running an artifact after the compiler,
 * IR, runtime, feature schema, target horizon, or model implementation has changed.
 */
export async function assertModelArtifactRuntimeCompatibility(
  artifact: ModelArtifact<unknown>,
  currentVersions: { compiler: string; ir: string; runtime: string },
): Promise<void> {
  const provenance = artifact?.provenance;
  const contract = artifact?.contract;
  if (!provenance || !contract ||
      provenance.compilerVersion !== currentVersions.compiler ||
      provenance.irVersion !== currentVersions.ir ||
      provenance.runtimeVersion !== currentVersions.runtime ||
      provenance.dependencyVersions.corespiritCompiler !== currentVersions.compiler ||
      provenance.dependencyVersions.corespiritIr !== currentVersions.ir ||
      provenance.dependencyVersions.corespiritRuntime !== currentVersions.runtime ||
      provenance.modelImplementation !== 'corespirit-gaussian-hmm-v1') {
    throw new Error('CoreSpirit model ABI/version compatibility changed; retrain and re-approve this exact artifact hash before inference.');
  }
  const weights = artifact.weights && typeof artifact.weights === 'object'
    ? artifact.weights as Record<string, unknown> : {};
  const featureNames = Array.isArray(weights.featureNames) ? weights.featureNames : [];
  const schema = contract.featureSchema;
  const schemaHash = await coreSpiritSha256({
    version: schema.version,
    orderedNames: schema.orderedNames,
    types: schema.types,
  });
  const targetHorizon = Number(
    provenance.trainingParameters.forecastHorizonBars ??
    provenance.trainingParameters.targetHorizonBars ??
    provenance.trainingParameters.horizon ??
    contract.target.forecastHorizonBars,
  );
  if (weights.modelType !== 'gaussian-hmm' || !weights.hmm ||
      !contract.datasetSnapshot ||
      contract.datasetSnapshot.hash !== provenance.datasetVersion ||
      contract.datasetSnapshot.version !== provenance.datasetVersion ||
      !Array.isArray(featureNames) ||
      schemaHash !== schema.hash ||
      schema.orderedNames.length !== featureNames.length ||
      schema.orderedNames.some((name, index) => name !== featureNames[index]) ||
      contract.validation.protocol !== provenance.validationResults.protocol ||
      contract.temporal.validationProtocol !== provenance.validationResults.protocol ||
      contract.target.forecastHorizonBars !== targetHorizon) {
    throw new Error('CoreSpirit model feature/validation ABI is incompatible with its immutable artifact contract.');
  }
}

/** Pins inference to one immutable artifact; it never invokes training. */
export async function loadModelForInference<TWeights, TFeatures, TPrediction>(
  store: ModelArtifactStore<TWeights>,
  nameOrHash: string,
  createInference: ModelInferenceFactory<TWeights, TFeatures, TPrediction>,
  options: { environment?: 'research' | 'paper' | 'production'; approvedReleaseStatus?: CoreSpiritModelReleaseStatus } = {},
): Promise<ModelInference<TFeatures, TPrediction> & { readonly artifactHash: string; readonly artifactName: string; readonly contract?: CoreSpiritModelContract }> {
  const artifact = /^[a-f0-9]{64}$/i.test(nameOrHash)
    ? await store.getByHash(nameOrHash)
    : await store.getByName(nameOrHash);
  if (!artifact) throw new Error('Model artifact "' + nameOrHash + '" was not found');
  if (/^[a-f0-9]{64}$/i.test(nameOrHash) && artifact.hash.toLowerCase() !== nameOrHash.toLowerCase()) {
    throw new Error('Model artifact lookup hash does not match the stored artifact identity');
  }
  if (!(await verifyModelArtifactIntegrity(artifact))) {
    throw new Error('Model artifact integrity check failed for "' + artifact.name + '"');
  }
  const environment = options.environment ?? 'research';
  if (environment === 'production' &&
      (!artifact.contract || options.approvedReleaseStatus !== 'approved' ||
       artifact.contract.releaseStatus === 'revoked' || artifact.contract.releaseStatus === 'retired')) {
    throw new Error('Production inference requires an audited approved release status for this hash-pinned model artifact.');
  }
  const inference = await createInference(artifact);
  return Object.freeze({
    artifactHash: artifact.hash,
    artifactName: artifact.name,
    ...(artifact.contract ? { contract: artifact.contract } : {}),
    predict: (features: TFeatures) => inference.predict(features),
  });
}
