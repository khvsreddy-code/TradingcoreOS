import {
  CoreSpiritExternalModelRegistry,
  CoreSpiritModelOrchestrator,
  CoreSpiritNativeRpcModelAdapter,
  CoreSpiritOnnxModelAdapter,
  CoreSpiritPythonModelAdapter,
  CoreSpiritRemoteModelAdapter,
  CoreSpiritWasmModelAdapter,
  type CoreSpiritStrictModelManifest,
  type CoreSpiritStrictModelRequest,
} from './modelOrchestration';

const manifest: CoreSpiritStrictModelManifest = {
  contractVersion: 2,
  abiVersion: 1,
  modelId: 'trend-probability',
  version: '2.0.0',
  implementation: 'python',
  transport: 'host',
  deterministic: true,
  state: 'stateless',
  rollbackSafe: true,
  inputSchema: [
    { name: 'returns20', dtype: 'f64', shape: [1], required: true, semantic: 'feature', representation: 'tensor' },
    { name: 'volatility20', dtype: 'f64', shape: [1], required: true, semantic: 'feature', representation: 'tensor' },
  ],
  outputSchema: [
    { name: 'prediction', dtype: 'f64', shape: [1], required: true, semantic: 'prediction', representation: 'tensor' },
    { name: 'confidence', dtype: 'f64', shape: [], required: true, semantic: 'confidence', representation: 'scalar' },
  ],
  primaryPredictionField: 'prediction',
  confidenceField: 'confidence',
  metadataFields: ['reason'],
  maxMemoryBytes: 1024 * 1024,
  maxSteps: 10000,
  maxInputBytes: 64 * 1024,
  maxOutputBytes: 64 * 1024,
  capabilities: ['read-features', 'read-market-state', 'write-output'],
};

const request: CoreSpiritStrictModelRequest = {
  requestId: 'req:67:1',
  modelId: manifest.modelId,
  version: manifest.version,
  context: {
    runId: 'run:67', programChecksum: 'artifact:67', modelVersion: manifest.version,
    barIndex: 10, timestamp: 1758800000000, symbol: 'NSE:NIFTY50', timeframe: '5m',
    mode: 'replay', revision: 0, confirmed: true, deterministicSeed: 'seed:67',
  },
  features: {
    returns20: { dtype: 'f64', shape: [1], data: [0.02] },
    volatility20: { dtype: 'f64', shape: [1], data: [0.01] },
  },
  marketState: {
    timestamp: 1758800000000,
    instrument: { instrumentId: 'NIFTY50', symbol: 'NIFTY50', assetClass: 'index', exchange: 'NSE' },
    timeframe: '5m',
    bar: { open: 25000, high: 25020, low: 24990, close: 25015, volume: 100000 },
  },
};

const python = new CoreSpiritPythonModelAdapter(async (_manifest, input) => ({
  prediction: { dtype: 'f64', shape: [1], data: [0.84] },
  confidence: 0.91,
  metadata: { reason: 'momentum' },
  outputChecksum: 'out:0.84',
  stateChecksum: 'state:stateless',
}));

const registry = new CoreSpiritExternalModelRegistry();
registry.register(manifest, python);
const orchestrator = new CoreSpiritModelOrchestrator(registry, {
  maxCallsPerBar: 4,
  maxInputBytes: 64 * 1024,
  maxOutputBytes: 64 * 1024,
}, 'research');

async function main(): Promise<void> {
  const first = await orchestrator.infer(request);
  const second = await orchestrator.infer({ ...request, requestId: 'req:67:2' });
  if (first.prediction.data[0] !== 0.84 || first.confidence !== 0.91) throw new Error('strict model result mismatch');
  if (!first.requestChecksum || !second.requestChecksum || first.modelId !== manifest.modelId) throw new Error('strict model provenance missing');
  if (first.requestChecksum === second.requestChecksum) throw new Error('request checksum must include request identity');

  const marketLessManifest: CoreSpiritStrictModelManifest = {
    ...manifest,
    modelId: 'feature-only',
    implementation: 'cpp',
    transport: 'native-rpc',
    capabilities: ['read-features', 'write-output'],
  };
  let observedMarketState: unknown = undefined;
  const cpp = new CoreSpiritNativeRpcModelAdapter('cpp', async (_manifest, input) => {
    observedMarketState = input.marketState.bar;
    return { prediction: { dtype: 'f64', shape: [1], data: [0.5] }, metadata: {}, outputChecksum: 'cpp:0.5', stateChecksum: 'cpp:state' };
  });
  const registry2 = new CoreSpiritExternalModelRegistry();
  registry2.register(marketLessManifest, cpp);
  const result2 = await new CoreSpiritModelOrchestrator(registry2, { maxCallsPerBar: 2, maxInputBytes: 4096, maxOutputBytes: 4096 }, 'server').infer({ ...request, modelId: 'feature-only', version: '2.0.0', requestId: 'req:67:3' });
  if (result2.prediction.data[0] !== 0.5 || observedMarketState !== undefined) throw new Error('market-state capability leak');

  // Adapter contracts for the supported external ecosystem.
  if (new CoreSpiritWasmModelAdapter(async () => ({ prediction: { dtype: 'f64', shape: [1], data: [0] }, metadata: {}, outputChecksum: 'w', stateChecksum: 's' })).implementation !== 'wasm') throw new Error('WASM adapter contract failed');
  if (new CoreSpiritOnnxModelAdapter(async () => ({ prediction: { dtype: 'f64', shape: [1], data: [0] }, metadata: {}, outputChecksum: 'o', stateChecksum: 's' })).transport !== 'onnx-runtime') throw new Error('ONNX adapter contract failed');
  if (new CoreSpiritRemoteModelAdapter(async () => ({ prediction: { dtype: 'f64', shape: [1], data: [0] }, metadata: {}, outputChecksum: 'r', stateChecksum: 's' })).transport !== 'remote-rpc') throw new Error('remote adapter contract failed');

  let denied = false;
  try {
    await new CoreSpiritModelOrchestrator(registry, { maxCallsPerBar: 2, maxInputBytes: 4096, maxOutputBytes: 4096 }, 'automation').infer(request);
  } catch { denied = true; }
  if (!denied) throw new Error('automation target must not infer models by default');

  let invalid = false;
  try {
    const bad = { ...manifest, state: 'stateful' as const, rollbackSafe: false };
    const badRegistry = new CoreSpiritExternalModelRegistry();
    badRegistry.register(bad, python);
  } catch { invalid = true; }
  if (!invalid) throw new Error('stateful non-rollback-safe model should be rejected');

  console.log('STAGE67_68_EXTERNAL_MODEL_ABI_OK');
}

void main().catch(error => { console.error(error); throw error; });
