import assert from 'node:assert/strict';
import { createCoreSpiritBackendRegistry, planCoreSpiritBackend, executePlannedExternalCoreSpiritBackend } from './backendRegistry.ts';

const defaults = createCoreSpiritBackendRegistry();
assert.equal(defaults.get('js-scalar')?.available, true);
assert.equal(defaults.get('cpu-optimized')?.available, true);
assert.equal(defaults.get('wasm-simd')?.available, false);
assert.equal(defaults.get('webgpu')?.available, false);
assert.equal(defaults.get('remote-research')?.available, false);

const liveRecurrence = planCoreSpiritBackend({
  operation: 'ema', purpose: 'live', workload: 'series',
  workUnits: 10_000_000, inputElements: 100_000, stateful: true,
}, defaults);
assert.equal(liveRecurrence.backend, 'cpu-optimized');
assert.match(liveRecurrence.reason, /live stateful/);

let wasmRuns = 0;
const wasm = {
  isLoaded: () => true,
  profile: () => ({ backend: 'wasm', available: true, deterministic: true, vectorized: true }),
  hasKernel: (name) => name === 'rollingMean' || name === 'matrixMultiply',
  kernelVariant: (name) => name === 'rollingMean' || name === 'matrixMultiply' ? 'simd' : undefined,
};
const accelerated = createCoreSpiritBackendRegistry({
  wasm,
  webgpu: {
    isAvailable: () => true, deterministic: false, vectorized: true,
    maxInputElements: 4_194_304, supportedOperations: ['rollingMean'],
    execute: () => { wasmRuns += 1; },
  },
  remoteResearch: {
    isAvailable: () => true, deterministic: true, vectorized: false,
    maxInputElements: 4_194_304, supportedOperations: ['model-training'],
    execute: () => ({ accepted: true }),
  },
});
assert.equal(accelerated.get('wasm-simd')?.available, true);
assert.equal(accelerated.get('webgpu')?.available, true);
const medium = planCoreSpiritBackend({
  operation: 'rollingMean', purpose: 'historical', workload: 'series',
  workUnits: 30_000, inputElements: 20_000,
}, accelerated);
assert.equal(medium.backend, 'wasm-simd');
const gpuNeedsOptOutOfDeterminism = planCoreSpiritBackend({
  operation: 'rollingMean', purpose: 'historical', workload: 'series',
  workUnits: 2_000_000, inputElements: 2_000_000,
}, accelerated);
assert.equal(gpuNeedsOptOutOfDeterminism.backend, 'wasm-simd');
const gpuAllowed = planCoreSpiritBackend({
  operation: 'rollingMean', purpose: 'historical', workload: 'series',
  workUnits: 2_000_000, inputElements: 2_000_000, deterministic: false,
}, accelerated);
assert.equal(gpuAllowed.backend, 'webgpu');
const trainingNotRemoteByDefault = planCoreSpiritBackend({
  operation: 'model-training', purpose: 'research-training', workload: 'model-training',
  workUnits: 3_000_000, inputElements: 100_000,
}, accelerated);
assert.notEqual(trainingNotRemoteByDefault.backend, 'remote-research');
const trainingOptedIn = planCoreSpiritBackend({
  operation: 'model-training', purpose: 'research-training', workload: 'model-training',
  workUnits: 3_000_000, inputElements: 100_000, allowRemoteResearch: true,
}, accelerated);
assert.equal(trainingOptedIn.backend, 'remote-research');
const remoteResult = await executePlannedExternalCoreSpiritBackend(trainingOptedIn, {
  operation: 'model-training', purpose: 'research-training', workload: 'model-training',
  workUnits: 3_000_000, inputElements: 100_000, allowRemoteResearch: true,
}, accelerated);
assert.deepEqual(remoteResult, { accepted: true });
const gpuResult = await executePlannedExternalCoreSpiritBackend(gpuAllowed, {
  operation: 'rollingMean', purpose: 'historical', workload: 'series',
  workUnits: 2_000_000, inputElements: 2_000_000, deterministic: false,
}, accelerated);
assert.equal(gpuResult, undefined, 'registered adapter must actually be invoked');
assert.equal(wasmRuns, 1);
await assert.rejects(() => executePlannedExternalCoreSpiritBackend(gpuAllowed, {
  operation: 'rollingMean', purpose: 'live', workload: 'series',
  workUnits: 2_000_000, inputElements: 2_000_000, deterministic: false,
}, accelerated), /live chart path/);
assert.throws(() => planCoreSpiritBackend({
  operation: 'x', purpose: 'live', workload: 'scalar', workUnits: -1, inputElements: 1,
}, accelerated), /workUnits/);

assert.throws(() => planCoreSpiritBackend({
  operation: 'rollingMean', purpose: 'live', workload: 'series',
  workUnits: 5_000_000, inputElements: 4_194_305,
}, defaults), /split it into bounded batches/);

console.log('CoreSpirit backend capability planner contract: OK');
