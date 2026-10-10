import { compileCoreSpirit } from './coreSpiritPipeline.ts';
import { extractCoreSpiritSurfaceMetadata } from './languageConcepts.ts';
import { CoreSpiritGaussianHMM } from './quantMath.ts';
import {
  createResearchArtifact,
  InMemoryModelArtifactStore,
  loadModelForInference,
  sealModelArtifact,
  type ModelProvenance,
} from './modelArtifacts.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const source = [
    'model regime: HMM<float> {',
    '  states = 3',
    '  emission = gaussian',
    '  covariance = diagonal',
    '}',
    'features = dataset("returns", 0.1, "volatility", 0.2)',
    'fit regime on features',
    'state = hmmDecode("regime", features)',
  ].join('\n');
  const compiled = compileCoreSpirit(source, 'model-lifecycle-contract', { layer: 'model' });
  assert(Boolean(compiled.ir), 'the CoreScript HMM research source must compile: ' + compiled.diagnostics.map(item => item.message).join('; '));
  const declaration = extractCoreSpiritSurfaceMetadata(source).declarations.find(item => item.kind === 'model');
  assert(declaration?.kind === 'model' && declaration.modelType === 'HMM<float>', 'compiled research must preserve the typed model declaration');

  const featureGraph = {
    version: 1,
    featureNames: ['returns', 'volatility'],
    modelType: declaration.modelType,
    states: declaration.states ?? 3,
    covariance: declaration.covariance ?? 'full',
  };
  const research = await createResearchArtifact({
    name: 'nifty-regime-v7',
    source,
    compilerVersion: 'corespirit-compiler-test',
    irVersion: '1',
    featureGraph,
    ir: compiled.ir,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  const hmm = new CoreSpiritGaussianHMM({
    states: 3,
    covariance: 'diagonal',
    maxObservations: 64,
    fitEvery: 16,
    fitIterations: 2,
  });
  for (let index = 0; index < 64; index += 1) {
    const regime = index < 22 ? -1.5 : index < 43 ? 0.1 : 1.8;
    hmm.observe([
      regime + Math.sin(index * 0.31) * 0.15,
      Math.abs(Math.cos(index * 0.19)) * 0.2 + Math.abs(regime) * 0.1,
    ], Date.UTC(2025, 0, 1) + index * 300_000, featureGraph.featureNames);
  }
  const snapshot = hmm.exportTrainedState();
  const provenance: ModelProvenance = {
    sourceHash: research.sourceHash,
    compilerVersion: research.compilerVersion,
    irVersion: research.irVersion,
    featureGraphHash: research.featureGraphHash,
    datasetVersion: 'a'.repeat(64),
    trainingRange: { from: '2025-01-01', to: '2025-12-31' },
    trainingParameters: { states: 3, fitEvery: 16, fitIterations: 2, seedSemantics: 'deterministic-initializer-v1' },
    randomSeed: 42,
    modelImplementation: 'corespirit-gaussian-hmm-v1',
    backend: 'cpu',
    dependencyVersions: { corespiritCompiler: research.compilerVersion, corespiritIr: research.irVersion },
  };
  const artifact = await sealModelArtifact({
    research,
    provenance,
    weights: { modelType: 'gaussian-hmm', featureNames: featureGraph.featureNames, hmm: snapshot },
    metrics: { observations: 64, featureCount: 2, stateCount: 3 },
    createdAt: '2026-01-02T00:00:00.000Z',
  });
  const store = new InMemoryModelArtifactStore<typeof artifact.weights>();
  await store.put(artifact);
  const inference = await loadModelForInference(store, artifact.hash, async loaded => {
    const weights = loaded.weights as typeof artifact.weights;
    const model = CoreSpiritGaussianHMM.fromTrainedState(weights.hmm);
    return { predict: async (features: readonly number[]) => model.predict(features, weights.featureNames) };
  });
  const prediction = await inference.predict([0.2, 0.1]);
  assert(inference.artifactHash === artifact.hash, 'live inference must remain pinned to the exact immutable artifact hash');
  assert(Number.isInteger(prediction.state) && prediction.state >= 0 && prediction.state < 3, 'HMM inference must produce a valid state');
  assert(Math.abs(prediction.probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-5, 'posterior probabilities must sum to one');
  assert(!('fit' in inference) && !('train' in inference), 'the inference handle must not expose training methods');

  let schemaMismatchRejected = false;
  try {
    await inference.predict([0.1]);
  } catch {
    schemaMismatchRejected = true;
  }
  assert(schemaMismatchRejected, 'inference must reject a feature vector with the wrong shape');

  const tamperedStore = new InMemoryModelArtifactStore<typeof artifact.weights>();
  await tamperedStore.put({ ...artifact, weights: { ...artifact.weights, featureNames: ['tampered'] } });
  let integrityMismatchRejected = false;
  try {
    await loadModelForInference(tamperedStore, artifact.hash, async () => ({ predict: async () => null }));
  } catch {
    integrityMismatchRejected = true;
  }
  assert(integrityMismatchRejected, 'tampered weights must fail the artifact SHA-256 integrity check');
}

void main().catch(error => {
  setTimeout(() => { throw error; }, 0);
});
