import assert from 'node:assert/strict';
import { compileCoreSpirit } from './coreSpiritPipeline.ts';
import { planCoreSpiritExecution } from './executionPlanner.ts';
import { createCoreSpiritBackendRegistry } from './backendRegistry.ts';

const source = `
indicator "Historical SMA"
average = sma(close, 20)
plot average
`;
const compiled = compileCoreSpirit(source, 'backend-planner-integration', { layer: 'indicator' });
assert.ok(compiled.ir, compiled.diagnostics.map(item => item.message).join('; '));

assert.throws(() => planCoreSpiritExecution(compiled.ir!, { maxBatchSize: 0 }), /maxBatchSize must be positive/);
assert.throws(() => planCoreSpiritExecution(compiled.ir!, { minWasmWorkUnits: 2.5 }), /minWasmWorkUnits must be positive/);

const live = planCoreSpiritExecution(compiled.ir!, { barCount: 20_000 });
assert.ok(live.backendCapabilityPlans.some(item => item.operation === 'rollingMean'));
assert.equal(live.backendCapabilityPlans.find(item => item.operation === 'rollingMean')?.backend, 'cpu-optimized',
  'live defaults remain local even with a large historical-looking bar count');

const wasm = {
  isLoaded: () => true,
  profile: () => ({ backend: 'wasm', available: true, deterministic: true, vectorized: true }),
  hasKernel: (name: string) => name === 'rollingMean',
  kernelVariant: (name: string) => name === 'rollingMean' ? 'simd' as const : undefined,
};
const historical = planCoreSpiritExecution(compiled.ir!, {
  barCount: 20_000,
  backendPurpose: 'historical',
  backendRegistry: createCoreSpiritBackendRegistry({ wasm }),
});
const smaPlan = historical.backendCapabilityPlans.find(item => item.operation === 'rollingMean');
assert.equal(smaPlan?.backend, 'wasm-simd', 'historical plans use a registered exact SIMD kernel when the threshold is crossed');
assert.ok(historical.explanation.some(line => line.includes('kernel rollingMean: planned wasm-simd')));
assert.notEqual(historical.cacheKey, live.cacheKey, 'cache identity includes execution purpose and backend capability plan');

const boundedBatch = planCoreSpiritExecution(compiled.ir!, {
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
const deterministic = planCoreSpiritExecution(compiled.ir!, {
  barCount: 2_000_000,
  backendPurpose: 'historical',
  backendRegistry: statelessWithGpu,
  requireDeterministic: true,
});
assert.equal(deterministic.backendCapabilityPlans.find(item => item.operation === 'rollingMean')?.backend, 'wasm-simd',
  'deterministic plans must not select nondeterministic WebGPU');

console.log('CoreSpirit integrated multibackend execution planner contract: OK');
