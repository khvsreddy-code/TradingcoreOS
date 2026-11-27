import assert from 'node:assert/strict';
import {
  CoreSpiritExternalModelRegistry,
  CoreSpiritModelOrchestrator,
  CoreSpiritPythonModelAdapter,
  validateCoreSpiritStrictModelManifest,
} from './modelOrchestration.ts';

const version = 'a'.repeat(64);
const makeManifest = (overrides = {}) => ({
  contractVersion: 2,
  abiVersion: 1,
  modelId: 'secure-model',
  version,
  implementation: 'python',
  transport: 'host',
  deterministic: true,
  state: 'stateless',
  rollbackSafe: true,
  inputSchema: [{ name: 'features', dtype: 'f64', shape: [2], required: true, semantic: 'feature' }],
  outputSchema: [{ name: 'prediction', dtype: 'f64', shape: [1], required: true, semantic: 'prediction' }],
  primaryPredictionField: 'prediction',
  metadataFields: ['direction'],
  maxMemoryBytes: 64 * 1024,
  maxSteps: 10_000,
  maxInputBytes: 1024,
  maxOutputBytes: 1024,
  maxLatencyMs: 1_000,
  capabilities: ['read-features', 'write-output'],
  ...overrides,
});
const makeRequest = (overrides = {}) => ({
  requestId: 'request-1',
  modelId: 'secure-model',
  version,
  context: {
    runId: 'run-1',
    programChecksum: 'b'.repeat(64),
    modelVersion: version,
    barIndex: 1,
    timestamp: 1_700_000_000_000,
    symbol: 'NSE:NIFTY50-INDEX',
    timeframe: '5m',
    mode: 'historical',
    revision: 0,
    confirmed: true,
    deterministicSeed: 'seed-1',
  },
  features: { features: { dtype: 'f64', shape: [2], data: [1, 2] } },
  marketState: {
    timestamp: 1_700_000_000_000,
    instrument: { instrumentId: 'NSE:NIFTY50-INDEX', symbol: 'NSE:NIFTY50-INDEX' },
    timeframe: '5m',
  },
  ...overrides,
});
const validResult = {
  prediction: { dtype: 'f64', shape: [1], data: [0.25] },
  metadata: { direction: 'LONG' },
  outputChecksum: 'c'.repeat(64),
  stateChecksum: 'd'.repeat(64),
};

assert.throws(() => validateCoreSpiritStrictModelManifest(makeManifest({
  inputSchema: [
    { name: 'features', dtype: 'f64', shape: [2], required: true },
    { name: 'features', dtype: 'f64', shape: [2], required: true },
  ],
})), /unique/);
assert.throws(() => validateCoreSpiritStrictModelManifest(makeManifest({
  maxOutputBytes: Number.MAX_SAFE_INTEGER + 1,
})), /maxOutputBytes/);
assert.throws(() => validateCoreSpiritStrictModelManifest(makeManifest({
  inputSchema: [{ name: 'features', dtype: 'f64', shape: [2, -1], required: true }],
})), /dynamic tensor dimensions/);

const manifest = makeManifest();
const registry = new CoreSpiritExternalModelRegistry();
registry.register(manifest, new CoreSpiritPythonModelAdapter(async () => validResult));
manifest.maxInputBytes = 1;
assert.equal(registry.get('secure-model', version).manifest.maxInputBytes, 1024,
  'registered model ABI must be snapshotted and unaffected by caller mutation');
assert.ok(Object.isFrozen(registry.get('secure-model', version).manifest));
assert.ok(Object.isFrozen(registry.get('secure-model', version).manifest.inputSchema[0].shape));

const orchestrator = new CoreSpiritModelOrchestrator(registry, {
  maxCallsPerBar: 2,
  maxInputBytes: 1024,
  maxOutputBytes: 1024,
});
assert.deepEqual((await orchestrator.infer(makeRequest())).prediction, validResult.prediction);
await assert.rejects(() => orchestrator.infer(makeRequest({
  features: {
    features: { dtype: 'f64', shape: [2], data: [1, 2] },
    hidden: { dtype: 'f64', shape: [1], data: [3] },
  },
})), /undeclared model feature/);
await assert.rejects(() => orchestrator.infer(makeRequest({
  features: { features: { dtype: 'bool', shape: [2], data: [1, 2] } },
})), /non-boolean tensor/);
await assert.rejects(() => orchestrator.infer(makeRequest({
  context: { ...makeRequest().context, modelVersion: 'e'.repeat(64) },
})), /execution context is invalid/);

let concurrentCalls = 0;
const concurrentRegistry = new CoreSpiritExternalModelRegistry();
concurrentRegistry.register(makeManifest(), new CoreSpiritPythonModelAdapter(async () => {
  concurrentCalls += 1;
  await Promise.resolve();
  return validResult;
}));
const concurrentOrchestrator = new CoreSpiritModelOrchestrator(concurrentRegistry, {
  maxCallsPerBar: 1,
  maxInputBytes: 1024,
  maxOutputBytes: 1024,
});
const concurrent = await Promise.allSettled([
  concurrentOrchestrator.infer(makeRequest({ requestId: 'parallel-1' })),
  concurrentOrchestrator.infer(makeRequest({ requestId: 'parallel-2' })),
]);
assert.equal(concurrent.filter(item => item.status === 'fulfilled').length, 1,
  'the per-bar quota must be reserved synchronously before concurrent host invocation');
assert.equal(concurrentCalls, 1, 'the host must never observe more calls than the per-bar limit');

const metadataRegistry = new CoreSpiritExternalModelRegistry();
metadataRegistry.register(makeManifest(), new CoreSpiritPythonModelAdapter(async () => ({
  ...validResult,
  metadata: { direction: 'LONG', undeclared: 'secret' },
})));
const metadataOrchestrator = new CoreSpiritModelOrchestrator(metadataRegistry, {
  maxCallsPerBar: 1, maxInputBytes: 1024, maxOutputBytes: 1024,
});
await assert.rejects(() => metadataOrchestrator.infer(makeRequest()), /undeclared model metadata/);

const requiredConfidenceManifest = makeManifest({
  outputSchema: [
    { name: 'prediction', dtype: 'f64', shape: [1], required: true, semantic: 'prediction' },
    { name: 'confidence', dtype: 'f64', shape: [], required: true, semantic: 'confidence', representation: 'scalar' },
  ],
  confidenceField: 'confidence',
});
const confidenceRegistry = new CoreSpiritExternalModelRegistry();
confidenceRegistry.register(requiredConfidenceManifest, new CoreSpiritPythonModelAdapter(async () => validResult));
const confidenceOrchestrator = new CoreSpiritModelOrchestrator(confidenceRegistry, {
  maxCallsPerBar: 1, maxInputBytes: 1024, maxOutputBytes: 1024,
});
await assert.rejects(() => confidenceOrchestrator.infer(makeRequest()), /confidence output is required/);

console.log('CORESPIRIT_MODEL_ORCHESTRATION_SECURITY_OK');
