import assert from 'node:assert/strict';
import { planCoreSpiritExecution } from './executionPlanner.ts';
import { createCoreSpiritBackendRegistry } from './backendRegistry.ts';

// Exercise the actual Core IR planner boundary directly. The frontend/compiler
// already produces this same call instruction shape; avoiding a full parser here
// keeps this contract focused on backend planning rather than grammar fixtures.
const program = {
  version: 1,
  sourceId: 'backend-planner-integration',
  entry: { instructions: [{ op: 'call', dest: 'average', name: 'sma', args: ['close', 'period'] }] },
  locals: ['average'],
  maxLookback: 20,
  diagnostics: [],
  sourceMap: { version: 1, sourceId: 'backend-planner-integration', entries: [] },
};

assert.throws(() => planCoreSpiritExecution(program, { maxBatchSize: 0 }), /maxBatchSize must be positive/);
assert.throws(() => planCoreSpiritExecution(program, { minWasmWorkUnits: 2.5 }), /minWasmWorkUnits must be positive/);

const live = planCoreSpiritExecution(program, { barCount: 20_000 });
assert.ok(live.backendCapabilityPlans.some(item => item.operation === 'rollingMean'));
assert.equal(live.backendCapabilityPlans.find(item => item.operation === 'rollingMean')?.backend, 'cpu-optimized',
  'live defaults remain local even with a large historical-looking bar count');

const wasm = {
  isLoaded: () => true,
  profile: () => ({ backend: 'wasm', available: true, deterministic: true, vectorized: true }),
  hasKernel: (name) => name === 'rollingMean',
  kernelVariant: (name) => name === 'rollingMean' ? 'simd' : undefined,
};
const historical = planCoreSpiritExecution(program, {
  barCount: 20_000,
  backendPurpose: 'historical',
  backendRegistry: createCoreSpiritBackendRegistry({ wasm }),
});
const smaPlan = historical.backendCapabilityPlans.find(item => item.operation === 'rollingMean');
assert.equal(smaPlan?.backend, 'wasm-simd', 'historical plans use a registered exact SIMD kernel when the threshold is crossed');
assert.equal(historical.strategy, 'wasm-portable',
  'the whole-program plan should only expose WASM when its actual registered kernel plan qualifies');
assert.equal(historical.assignments[0]?.backend, 'wasm',
  'the compatibility planner must bridge live registry capabilities into its legacy backend enum');
assert.ok(historical.explanation.some(line => line.includes('kernel rollingMean: planned wasm-simd')));
assert.notEqual(historical.cacheKey, live.cacheKey, 'cache identity includes execution purpose and backend capability plan');

const boundedBatch = planCoreSpiritExecution(program, {
  barCount: 5_000_000,
  maxBatchSize: 32_768,
  backendPurpose: 'historical',
  backendRegistry: createCoreSpiritBackendRegistry({ wasm }),
});
const boundedSmaPlan = boundedBatch.backendCapabilityPlans.find(item => item.operation === 'rollingMean');
assert.equal(boundedSmaPlan?.backend, 'wasm-simd');
assert.equal(boundedSmaPlan?.inputElements, 32_768,
  'capability planning must use bounded batch input size while thresholds account for total work');

const statelessWithGpu = createCoreSpiritBackendRegistry({
  wasm,
  webgpu: {
    isAvailable: () => true,
    deterministic: false,
    vectorized: true,
    maxInputElements: 4_194_304,
    supportedOperations: ['rollingMean'],
    execute: () => ({ executed: true }),
  },
});
const deterministic = planCoreSpiritExecution(program, {
  barCount: 2_000_000,
  backendPurpose: 'historical',
  backendRegistry: statelessWithGpu,
  requireDeterministic: true,
});
assert.equal(deterministic.backendCapabilityPlans.find(item => item.operation === 'rollingMean')?.backend, 'wasm-simd',
  'deterministic plans must not select nondeterministic WebGPU');

const forgedLegacyProfiles = planCoreSpiritExecution(program, {
  barCount: 20_000,
  backendPurpose: 'historical',
  // Caller-supplied legacy profiles are hints, not proof of executable adapters.
  backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: false, maxBatchSize: 1_000_000, sharedMemoryBytes: 0 },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true, maxBatchSize: 65_536, sharedMemoryBytes: 64 * 1024 * 1024 },
    { backend: 'gpu', available: true, deterministic: true, vectorized: true, maxBatchSize: 262_144, sharedMemoryBytes: 512 * 1024 * 1024 },
  ],
});
assert.equal(forgedLegacyProfiles.strategy, 'cpu-fallback',
  'legacy profiles cannot manufacture WASM/GPU availability without a registered executable kernel');
assert.equal(forgedLegacyProfiles.assignments[0]?.backend, 'cpu');

console.log('CoreSpirit integrated multibackend execution planner contract: OK');
