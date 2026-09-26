import { CoreSpiritExternalModelRegistry, CoreSpiritModelOrchestrator, CoreSpiritPythonModelAdapter, type CoreSpiritStrictModelManifest } from './modelOrchestration';
import { CoreSpiritAiModelCatalog } from './aiModel';
import { buildCoreSpiritModelExplanationSurface } from './modelVisualization';

const manifest: CoreSpiritStrictModelManifest = {
  contractVersion: 2,
  abiVersion: 1,
  modelId: 'NiftyRegimeModel',
  version: '1.0.0',
  modelKind: 'ai',
  aiOutput: {
    directionMetadataKey: 'direction',
    regimeMetadataKey: 'regime',
    longProbabilityMetadataKey: 'p_long',
    shortProbabilityMetadataKey: 'p_short',
  },
  implementation: 'python',
  transport: 'host',
  deterministic: true,
  state: 'stateless',
  rollbackSafe: true,
  inputSchema: [
    { name: 'price', dtype: 'f64', shape: [1], required: true, semantic: 'feature' },
    { name: 'volatility', dtype: 'f64', shape: [1], required: true, semantic: 'feature' },
    { name: 'volume', dtype: 'f64', shape: [1], required: true, semantic: 'feature' },
  ],
  outputSchema: [{ name: 'probability', dtype: 'f64', shape: [1], required: true, semantic: 'prediction' }],
  primaryPredictionField: 'probability',
  metadataFields: ['direction', 'regime', 'p_long', 'p_short'],
  maxMemoryBytes: 1024 * 1024,
  maxSteps: 10000,
  maxInputBytes: 64 * 1024,
  maxOutputBytes: 64 * 1024,
  capabilities: ['read-features', 'write-output'],
};

const registry = new CoreSpiritExternalModelRegistry();
registry.register(manifest, new CoreSpiritPythonModelAdapter(async () => ({
  prediction: { dtype: 'f64', shape: [1], data: [0.78] },
  confidence: 0.81,
  metadata: { direction: 'LONG', regime: 'TRENDING', p_long: 0.78, p_short: 0.17 },
  outputChecksum: 'ai:out',
  stateChecksum: 'ai:state',
})));

async function main(): Promise<void> {
  const orchestrator = new CoreSpiritModelOrchestrator(registry, { maxCallsPerBar: 2, maxInputBytes: 64 * 1024, maxOutputBytes: 64 * 1024 }, 'research');
  const catalog = new CoreSpiritAiModelCatalog(registry, orchestrator);
  const model = catalog.load('NiftyRegimeModel');
  const prediction = await model.predict({
    requestId: 'ai:1', modelId: model.modelId, version: model.version,
    context: { runId: 'ai-run', programChecksum: 'prog', modelVersion: model.version, barIndex: 10, timestamp: 1758800000, symbol: 'NIFTY50', timeframe: '5m', mode: 'replay', revision: 0, confirmed: true, deterministicSeed: 'seed' },
    features: {
      price: { dtype: 'f64', shape: [1], data: [25000] },
      volatility: { dtype: 'f64', shape: [1], data: [0.01] },
      volume: { dtype: 'f64', shape: [1], data: [100000] },
    },
    marketState: { timestamp: 1758800000, instrument: { instrumentId: 'NIFTY50', symbol: 'NIFTY50' }, timeframe: '5m' },
  });
  if (prediction.direction !== 'LONG' || prediction.probability !== 0.78 || prediction.confidence !== 0.81 || prediction.regime !== 'TRENDING') throw new Error('AI structured prediction mismatch');
  if (prediction.probabilities?.LONG !== 0.78) throw new Error('AI probability map missing');

  const surface = buildCoreSpiritModelExplanationSurface(prediction, { modelId: model.modelId, version: model.version, timestamp: 1758800000, sourceId: 'ai-test', instrument: 'NIFTY50', timeframe: '5m' });
  if (surface.visuals.length !== 3) throw new Error('AI explanation surface should emit probability, model field and regime visuals');
  if (!surface.visuals.some(v => v.kind === 'probability_surface')) throw new Error('probability surface missing');
  if (!surface.visuals.some(v => v.kind === 'model_field')) throw new Error('model field missing');
  if (!surface.visuals.some(v => v.kind === 'regime_band')) throw new Error('regime band missing');
  if (surface.visuals.some(v => Object.values(v.properties).some(value => typeof value === 'function'))) throw new Error('AI visual properties must remain serializable');

  console.log('STAGE69_70_AI_MODEL_VISUALIZATION_OK');
}

void main().catch(error => { console.error(error); throw error; });
