import { compileCoreSpirit } from './coreSpiritPipeline.ts';
import { extractCoreSpiritSurfaceMetadata } from './languageConcepts.ts';
import { CoreSpiritGaussianHMM } from './quantMath.ts';
import { fetchCoreSpiritHMMArtifact, fetchCoreSpiritHMMArtifactByName } from './modelArtifactClient.ts';
import { lowerCoreSpiritLiveInferenceSource, parseCoreSpiritModelLifecycleSurface } from './modelLifecycleSurface.ts';
import { CoreSpiritRuntime } from './runtime.ts';
import { makeCoreSpiritProgram } from './coreSpiritPipeline.ts';
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
    weights: { modelType: 'gaussian-hmm', modelAlias: 'regime', featureNames: featureGraph.featureNames, stateLabels: ['bear', 'flat', 'bull'], hmm: snapshot },
    metrics: { observations: 64, featureCount: 2, stateCount: 3 },
    createdAt: '2026-01-02T00:00:00.000Z',
  });
  const republished = await sealModelArtifact({
    research,
    provenance,
    weights: { modelType: 'gaussian-hmm', modelAlias: 'regime', featureNames: featureGraph.featureNames, hmm: snapshot },
    metrics: { observations: 64, featureCount: 2, stateCount: 3 },
    createdAt: '2026-02-02T00:00:00.000Z',
  });
  assert(republished.hash === artifact.hash, 'artifact identity must not change solely because publication time changed');

  const typedArrayArtifact = await sealModelArtifact({
    research,
    provenance,
    weights: { buffer: new Float64Array([1, 2, 3]) },
    metrics: { observations: 64 },
    createdAt: '2026-01-02T00:00:00.000Z',
  });
  assert(Array.isArray((typedArrayArtifact.weights as { buffer: unknown }).buffer),
    'typed-array weights must normalize into immutable JSON-safe arrays before sealing');

  const store = new InMemoryModelArtifactStore<typeof artifact.weights>();
  await store.put(artifact);
  await store.put(republished);
  const inference = await loadModelForInference(store, artifact.hash, async loaded => {
    const weights = loaded.weights as typeof artifact.weights;
    const model = CoreSpiritGaussianHMM.fromTrainedState(weights.hmm);
    return { predict: async (features: readonly number[]) => model.predict(features, weights.featureNames) };
  });
  const prediction = await inference.predict([0.2, 0.1]);
  const loadedClientArtifact = await fetchCoreSpiritHMMArtifact(
    artifact.hash,
    'contract-access-token',
    async () => new Response(JSON.stringify({ success: true, data: { artifact } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const loadedByName = await fetchCoreSpiritHMMArtifactByName(
    artifact.name,
    'contract-access-token',
    async (input) => {
      assert(String(input).includes('/api/corespirit/models/by-name/'), 'name-based loading must use the dedicated authenticated name route');
      return new Response(JSON.stringify({ success: true, data: { artifact, artifactHash: artifact.hash } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  );
  assert(loadedByName.artifactHash === artifact.hash && loadedByName.artifactName === artifact.name && loadedByName.stateLabels[2] === 'bull',
    'name-based model loading must verify the artifact and pin to its immutable hash');
  const workerBinding = loadedClientArtifact.toWorkerBinding();
  assert(workerBinding.artifactHash === artifact.hash && workerBinding.modelAlias === 'regime' && Number.isFinite(workerBinding.trainingEndTimestampMs), 'the client loader must produce a hash-pinned, cutoff-aware binding for the persistent chart worker');
  const runtimeResolver = loadedClientArtifact.createRuntimeResolver();
  const clientRuntimeModel = runtimeResolver('regime');
  assert(Boolean(clientRuntimeModel), 'a verified model artifact should resolve by its CoreScript model alias');
  assert(!clientRuntimeModel!.canPredictAt(Math.floor(Date.UTC(2025, 0, 1) / 1000)), 'chart-loaded artifacts must reject bars inside the training range');
  let missingTimestampRejected = false;
  try {
    clientRuntimeModel!.predict([0.2, 0.1], featureGraph.featureNames);
  } catch {
    missingTimestampRejected = true;
  }
  assert(missingTimestampRejected, 'a boundary-protected artifact must require timestamps on every inference call');
  const clientPrediction = clientRuntimeModel!.predict([0.2, 0.1], featureGraph.featureNames, Math.floor(Date.UTC(2026, 0, 1) / 1000));
  assert(Number.isInteger(clientPrediction.state), 'the client-loaded artifact must provide an inference-ready HMM instance');
  const declarativeLiveSource = [
    'features = dataset("returns", 0.2, "volatility", 0.1)',
    'model = loadModel("nifty-regime-v7")',
    'prediction = model.predict(features)',
    'bullProbability = prediction.probability("bull")',
    'plot bullProbability',
  ].join('\\n');
  const declarativePlan = parseCoreSpiritModelLifecycleSurface(declarativeLiveSource);
  const loweredDeclarative = lowerCoreSpiritLiveInferenceSource(declarativeLiveSource, declarativePlan);
  const declarativeCompile = compileCoreSpirit(loweredDeclarative, 'model-lifecycle-loaded-model-prediction', { layer: 'model' });
  assert(Boolean(declarativeCompile.ir) && !declarativeCompile.diagnostics.some(item => item.severity === 'error'),
    'loadModel/model.predict/probability syntax should compile after lifecycle lowering: ' +
    declarativeCompile.diagnostics.filter(item => item.severity === 'error').map(item => item.message).join('; '));
  const declarativeRuntime = new CoreSpiritRuntime({
    layer: 'model',
    symbol: 'NIFTY',
    timeframe: '5m',
    hmmArtifactResolver: loadedClientArtifact.createRuntimeResolver(),
  });
  declarativeRuntime.loadProgram(makeCoreSpiritProgram(loweredDeclarative, 'model-lifecycle-loaded-model-prediction'));
  const declarativeExecution = declarativeRuntime.executeIr(declarativeCompile.ir!, chartBars);
  assert(!declarativeExecution.diagnostics.some(message => /Unknown model state label|No immutable HMM artifact|model.predict expects/.test(message)),
    'named artifact prediction should run with its verified state labels');
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

  const chartSource = [
    'model regime: HMM<float> {',
    '  states = 3',
    '  emission = gaussian',
    '  covariance = diagonal',
    '}',
    'features = dataset("returns", 0.2, "volatility", 0.1)',
    'state = hmmDecode("regime", features)',
    'confidence = hmmProbability("regime", features)',
    'plot state',
  ].join('\\n');
  const chartCompile = compileCoreSpirit(chartSource, 'model-lifecycle-chart-inference', { layer: 'model' });
  assert(Boolean(chartCompile.ir), 'inference-only chart source must compile: ' + chartCompile.diagnostics.map(item => item.message).join('; '));
  const chartRuntime = new CoreSpiritRuntime({
    layer: 'model',
    symbol: 'NIFTY',
    timeframe: '5m',
    hmmArtifactResolver: loadedClientArtifact.createRuntimeResolver(),
  });
  chartRuntime.loadProgram(makeCoreSpiritProgram(chartSource, 'model-lifecycle-chart-inference'));
  const chartBars = Array.from({ length: 3 }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 0, 2) + index * 300_000).toISOString(),
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 1000 + index * 10,
  }));
  const chartExecution = chartRuntime.executeIr(chartCompile.ir!, chartBars);
  assert(!chartExecution.diagnostics.some(message => /HMM fitting is disabled|No immutable HMM artifact/.test(message)),
    'a loaded model artifact must run inference without training inside the chart runtime');
  assert(chartExecution.outputs.some(output => output.kind === 'series'),
    'inference-only model outputs should remain available to chart rendering');

  const revisedTimestamp = Date.UTC(2025, 0, 3);
  const rollbackModel = CoreSpiritGaussianHMM.fromTrainedState(snapshot);
  rollbackModel.predict([0.2, 0.1], featureGraph.featureNames, revisedTimestamp);
  const revisedPrediction = rollbackModel.predict([0.7, 0.4], featureGraph.featureNames, revisedTimestamp);
  const cleanPrediction = CoreSpiritGaussianHMM.fromTrainedState(snapshot)
    .predict([0.7, 0.4], featureGraph.featureNames, revisedTimestamp);
  assert(revisedPrediction.probabilities.every((value, index) => Math.abs(value - cleanPrediction.probabilities[index]!) < 1e-10),
    'a developing-bar revision must be recomputed from the posterior before that bar');

  const blockedRuntime = new CoreSpiritRuntime({ layer: 'model', symbol: 'NIFTY', timeframe: '5m' });
  blockedRuntime.loadProgram(makeCoreSpiritProgram(source, 'model-lifecycle-training-guard'));
  const blockedExecution = blockedRuntime.executeIr(compiled.ir!, chartBars);
  assert(blockedExecution.diagnostics.some(message => /HMM fitting is disabled in chart execution/.test(message)),
    'default chart runtimes must reject HMM fitting instead of learning from live candles');
}

void main().catch(error => {
  setTimeout(() => { throw error; }, 0);
});
