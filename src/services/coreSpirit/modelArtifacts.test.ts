import {
  createResearchArtifact,
  coreSpiritDatasetVersion,
  InMemoryModelArtifactStore,
  loadModelForInference,
  sealModelArtifact,
  type ModelProvenance,
} from './modelArtifacts.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const research = await createResearchArtifact({
    name: 'NiftyRegimeV7',
    source: 'model NiftyRegimeV7: HMM<float> { states = 3 }',
    compilerVersion: 'corespirit-1.0.0',
    irVersion: 'ir-1',
    featureGraph: { fields: ['ret1', 'ret5', 'atr20', 'volumeZ'] },
    ir: { kind: 'research-ir', version: 1 },
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const datasetRows = Array.from({ length: 12 }, (_, index) => ({
    timestamp: Date.parse('2025-01-01T09:15:00.000Z') + index * 300_000,
    values: [index / 100, Math.sin(index / 4)],
  }));
  const datasetIdentity = {
    datasetName: 'NIFTY_5M',
    datasetSource: 'fyers-history' as const,
    featureNames: ['ret1', 'momentum'],
    rows: datasetRows,
    trainingRange: { from: '2025-01-01', to: '2025-01-02' },
  };
  const datasetHash = await coreSpiritDatasetVersion(datasetIdentity);
  assert(/^[a-f0-9]{64}$/.test(datasetHash), 'dataset snapshots must have a SHA-256 content identity');
  assert(datasetHash !== await coreSpiritDatasetVersion({ ...datasetIdentity, datasetName: 'BANKNIFTY_5M' }),
    'dataset identity must bind the logical market dataset name');
  assert(datasetHash !== await coreSpiritDatasetVersion({ ...datasetIdentity, datasetSource: 'provided-ohlcv' }),
    'dataset identity must distinguish broker history from caller-provided data');
  let unorderedDatasetRejected = false;
  try {
    await coreSpiritDatasetVersion({ ...datasetIdentity, rows: [...datasetRows].reverse() });
  } catch (error) {
    unorderedDatasetRejected = error instanceof Error && /strictly chronological/.test(error.message);
  }
  assert(unorderedDatasetRejected, 'dataset identity must reject unordered observations before hashing');

  const provenance: ModelProvenance = {
    sourceHash: research.sourceHash,
    compilerVersion: research.compilerVersion,
    irVersion: research.irVersion,
    featureGraphHash: research.featureGraphHash,
    datasetVersion: 'a'.repeat(64),
    trainingRange: { from: '2018-01-01', to: '2025-12-31' },
    trainingParameters: { epochs: 20, learningRate: 0.001 },
    randomSeed: 42,
    modelImplementation: 'gaussian-hmm-v1',
    backend: 'cpu',
    dependencyVersions: { corespirit: '1.0.0' },
  };
  const artifact = await sealModelArtifact({
    research,
    provenance,
    weights: { means: [[-0.2], [0.0], [0.3]], transitions: [[0.9, 0.1, 0], [0.1, 0.8, 0.1], [0, 0.1, 0.9]] },
    metrics: { logLikelihood: -12.5, validationAccuracy: 0.71 },
    createdAt: '2026-01-02T00:00:00.000Z',
  });
  assert(/^[a-f0-9]{64}$/.test(artifact.hash), 'model artifact must have a SHA-256 identity');
  assert(Object.isFrozen(artifact) && Object.isFrozen(artifact.provenance), 'artifact metadata must be immutable');
  const store = new InMemoryModelArtifactStore<typeof artifact.weights>();
  await store.put(artifact);
  const inference = await loadModelForInference(store, 'NiftyRegimeV7', async loaded => ({
    predict: async (features: number[]) => ({
      modelHash: loaded.hash,
      score: features.reduce((sum, value, index) => sum + value * (index + 1), 0),
    }),
  }));
  const prediction = await inference.predict([0.1, 0.2, 0.3]);
  assert(prediction.modelHash === artifact.hash, 'inference must use the immutable loaded model hash');
  assert(inference.artifactHash === artifact.hash, 'inference handle must expose its pinned hash');

  let overwriteRejected = false;
  try {
    await store.put({ ...artifact, hash: '0'.repeat(64) });
  } catch {
    overwriteRejected = true;
  }
  assert(overwriteRejected, 'a published model name must not silently point to another hash');

  let mismatchRejected = false;
  try {
    await sealModelArtifact({
      research,
      provenance: { ...provenance, sourceHash: 'f'.repeat(64) },
      weights: {},
    });
  } catch {
    mismatchRejected = true;
  }
  assert(mismatchRejected, 'artifact sealing must reject source/provenance mismatches');

  let invalidRangeRejected = false;
  try {
    await sealModelArtifact({
      research,
      provenance: { ...provenance, trainingRange: { from: '2025-01-01', to: '2024-01-01' } },
      weights: {},
    });
  } catch {
    invalidRangeRejected = true;
  }
  assert(invalidRangeRejected, 'artifact sealing must reject invalid training ranges');
}

void main().catch(error => {
  setTimeout(() => { throw error; }, 0);
});
