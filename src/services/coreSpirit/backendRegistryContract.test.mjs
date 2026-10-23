import assert from 'node:assert/strict';
import { createCoreSpiritBackendRegistry, planCoreSpiritBackend, executePlannedExternalCoreSpiritBackend, toLegacyCoreSpiritBackendProfiles } from './backendRegistry.ts';

const failingWasmProbes = createCoreSpiritBackendRegistry({
  wasm: {
    isLoaded: () => { throw new Error('module detached'); },
    profile: () => { throw new Error('module disposed'); },
    hasKernel: () => { throw new Error('module disposed'); },
    kernelVariant: () => { throw new Error('module disposed'); },
  },
});
assert.equal(failingWasmProbes.get('wasm-simd')?.available, false,
  'WASM capability probes that throw must fail closed instead of crashing the planner');
assert.equal(planCoreSpiritBackend({
  operation: 'rollingMean', purpose: 'historical', workload: 'series',
  workUnits: 100_000, inputElements: 20_000,
}, failingWasmProbes).backend, 'cpu-optimized',
  'a detached WASM module must leave the CPU path eligible');

const defaults = createCoreSpiritBackendRegistry();
assert.equal(defaults.get('js-scalar')?.available, true);
assert.equal(defaults.get('cpu-optimized')?.available, true);
assert.equal(defaults.get('wasm-simd')?.available, false);
assert.equal(defaults.get('wasm-scalar')?.available, false);
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
  hasKernel: (name) => ['rollingMean', 'rollingSum', 'matrixMultiply'].includes(name),
  kernelVariant: (name) => name === 'rollingMean' || name === 'matrixMultiply' ? 'simd' : name === 'rollingSum' ? 'scalar' : undefined,
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
assert.equal(accelerated.get('wasm-scalar')?.available, true);
assert.deepEqual(accelerated.get('wasm-scalar')?.supportedOperations, ['rollingSum']);
assert.equal(accelerated.get('webgpu')?.available, true);
const legacyProfiles = toLegacyCoreSpiritBackendProfiles(accelerated);
assert.deepEqual(
  [...(legacyProfiles.find(profile => profile.backend === 'wasm')?.supportedOperations ?? [])].sort(),
  ['matrixMultiply', 'rollingMean'],
  'legacy dispatcher bridge must preserve exact per-kernel capabilities',
);
const medium = planCoreSpiritBackend({
  operation: 'rollingMean', purpose: 'historical', workload: 'series',
  workUnits: 30_000, inputElements: 20_000,
}, accelerated);
assert.equal(medium.backend, 'wasm-simd');
const scalarWasmPlan = planCoreSpiritBackend({
  operation: 'rollingSum', purpose: 'historical', workload: 'series',
  workUnits: 30_000, inputElements: 20_000,
}, accelerated);
assert.equal(scalarWasmPlan.backend, 'wasm-scalar',
  'scalar kernels must be available without being mislabeled as SIMD');

const gpuNeedsOptOutOfDeterminism = planCoreSpiritBackend({
  operation: 'rollingMean', purpose: 'historical', workload: 'series',
  workUnits: 2_000_000, inputElements: 2_000_000,
}, accelerated);
assert.equal(gpuNeedsOptOutOfDeterminism.backend, 'wasm-simd');
const gpuRemainsOptIn = planCoreSpiritBackend({
  operation: 'rollingMean', purpose: 'historical', workload: 'series',
  workUnits: 2_000_000, inputElements: 2_000_000, deterministic: false,
}, accelerated);
assert.equal(gpuRemainsOptIn.backend, 'wasm-simd',
  'a registered WebGPU adapter must not be selected without explicit allowWebGpu');

const gpuAllowed = planCoreSpiritBackend({
  operation: 'rollingMean', purpose: 'historical', workload: 'series',
  workUnits: 2_000_000, inputElements: 2_000_000, deterministic: false, allowWebGpu: true,
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
  workUnits: 2_000_000, inputElements: 2_000_000, deterministic: false, allowWebGpu: true,
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
