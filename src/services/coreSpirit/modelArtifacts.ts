/**
 * Immutable CoreSpirit research/model artifact contracts.
 *
 * Training is intentionally outside CoreSpiritRuntime and the chart update loop.
 * Storage/training backends are injected by the application; this module provides
 * deterministic provenance, artifact validation, and hash-pinned inference handles.
 */

export const CORESPIRIT_RESEARCH_ARTIFACT_VERSION = '1';
export const CORESPIRIT_MODEL_ARTIFACT_VERSION = '1';

export type TrainingRange = Readonly<{ from: string; to: string }>;
export type CoreSpiritDatasetSource = 'fyers-history' | 'provided-ohlcv' | 'precomputed-features';
export type CoreSpiritDatasetRow = Readonly<{ timestamp: number; values: readonly number[] }>;
export type ArtifactBackend = 'cpu' | 'wasm' | 'webgpu' | 'remote';

export type ModelProvenance = Readonly<{
  sourceHash: string;
  compilerVersion: string;
  irVersion: string;
  featureGraphHash: string;
  datasetVersion: string;
  trainingRange: TrainingRange;
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
  name?: string;
  provenance: ModelProvenance;
  weights: TWeights;
  metrics?: Readonly<Record<string, number>>;
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
) => ModelInference<TFeatures, TPrediction>;

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

function modelArtifactHashPayload<TWeights>(artifact: Pick<ModelArtifact<TWeights>, 'schemaVersion' | 'name' | 'provenance' | 'weights' | 'metrics'>): unknown {
  return {
    schemaVersion: artifact.schemaVersion,
    name: artifact.name,
    provenance: artifact.provenance,
    weights: artifact.weights,
    metrics: artifact.metrics,
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
  const dateOnlyTo = /^\d{4}-\d{2}-\d{2}$/.test(range.to);
  const to = Date.parse(range.to) + (dateOnlyTo ? 86_399_999 : 0);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    throw new Error('Training range must contain valid dates with from < to');
  }
}

/**
 * Canonical content identity for an immutable research dataset. Keep this in
 * one place so API enqueue and worker verification cannot drift apart.
 */
export async function coreSpiritDatasetVersion(input: Readonly<{
  datasetName: string;
  datasetSource: CoreSpiritDatasetSource;
  featureNames: readonly string[];
  rows: readonly CoreSpiritDatasetRow[];
  trainingRange: TrainingRange;
}>): Promise<string> {
  const datasetName = input.datasetName.trim();
  const sources: readonly CoreSpiritDatasetSource[] = ['fyers-history', 'provided-ohlcv', 'precomputed-features'];
  if (!datasetName || datasetName.length > 120 || !sources.includes(input.datasetSource)) {
    throw new Error('Dataset identity requires a name and a supported source');
  }
  if (input.featureNames.length < 1 || input.featureNames.length > 16 ||
      input.featureNames.some(name => typeof name !== 'string' || !name.trim()) ||
      new Set(input.featureNames).size !== input.featureNames.length) {
    throw new Error('Dataset identity requires 1–16 unique named features');
  }
  if (input.rows.length < 12 || input.rows.length > 1024) {
    throw new Error('Dataset identity requires 12–1,024 observations');
  }
  validateDateRange(input.trainingRange);
  const from = Date.parse(input.trainingRange.from);
  const dateOnlyTo = /^\d{4}-\d{2}-\d{2}$/.test(input.trainingRange.to);
  const to = Date.parse(input.trainingRange.to) + (dateOnlyTo ? 86_399_999 : 0);
  let previous = Number.NEGATIVE_INFINITY;
  const rows = input.rows.map((row, index) => {
    if (!Number.isFinite(row.timestamp) || row.timestamp < from || row.timestamp > to ||
        row.values.length !== input.featureNames.length ||
        row.values.some(value => !Number.isFinite(value))) {
      throw new Error('Dataset row ' + index + ' is outside the range or does not match the finite feature schema');
    }
    if (row.timestamp <= previous) throw new Error('Dataset rows must be strictly chronological with no duplicate timestamps');
    previous = row.timestamp;
    return { timestamp: row.timestamp, values: [...row.values] };
  });
  return coreSpiritSha256({
    datasetName,
    datasetSource: input.datasetSource,
    featureNames: [...input.featureNames],
    rows,
    trainingRange: { from: input.trainingRange.from, to: input.trainingRange.to },
  });
}

function validateProvenance(provenance: ModelProvenance): void {
  validateDateRange(provenance.trainingRange);
  if (!/^[a-f0-9]{64}$/.test(provenance.sourceHash) ||
      !/^[a-f0-9]{64}$/.test(provenance.featureGraphHash) ||
      !/^[a-f0-9]{64}$/.test(provenance.datasetVersion) ||
      !provenance.compilerVersion || !provenance.irVersion || !provenance.modelImplementation) {
    throw new Error('Model provenance is incomplete or contains an invalid SHA-256 identity');
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

/** Seals trained weights together with every declared reproducibility input. */
export async function sealModelArtifact<TWeights>(input: TrainModelInput<TWeights>): Promise<ModelArtifact<TWeights>> {
  const artifactName = String(input.name ?? input.research.name).trim();
  if (!artifactName || artifactName.length > 120) throw new Error('Model artifact name must be 1–120 characters');
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
  const createdAt = input.createdAt ?? new Date().toISOString();
  const hash = await coreSpiritSha256(modelArtifactHashPayload({
    schemaVersion: CORESPIRIT_MODEL_ARTIFACT_VERSION,
    name: artifactName,
    provenance,
    weights,
    metrics,
  }));
  return deepFreeze({
    kind: 'corespirit-model',
    schemaVersion: CORESPIRIT_MODEL_ARTIFACT_VERSION,
    name: artifactName,
    hash,
    provenance,
    weights,
    metrics,
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
  if (!artifact || artifact.kind !== 'corespirit-model' ||
      artifact.schemaVersion !== CORESPIRIT_MODEL_ARTIFACT_VERSION ||
      !/^[a-f0-9]{64}$/.test(artifact.hash)) return false;
  const expectedHash = await coreSpiritSha256(modelArtifactHashPayload(artifact));
  return expectedHash === artifact.hash;
}

/** Pins inference to one immutable artifact; it never invokes training. */
export async function loadModelForInference<TWeights, TFeatures, TPrediction>(
  store: ModelArtifactStore<TWeights>,
  nameOrHash: string,
  createInference: ModelInferenceFactory<TWeights, TFeatures, TPrediction>,
): Promise<ModelInference<TFeatures, TPrediction> & { readonly artifactHash: string; readonly artifactName: string }> {
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
  const inference = createInference(artifact);
  return Object.freeze({
    artifactHash: artifact.hash,
    artifactName: artifact.name,
    predict: (features: TFeatures) => inference.predict(features),
  });
}
