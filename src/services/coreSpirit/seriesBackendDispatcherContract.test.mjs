import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  selectCoreSpiritSeriesBackend,
  executeCoreSpiritSeriesFusionGroupDispatched,
  loadCoreSpiritBundledWasmSeriesRuntime,
} from './seriesBackendDispatcher.ts';
import { executeCoreSpiritSeriesFusionGroupInto } from './seriesFusion.ts';

const group = {
  id: 'g', nodeIds: ['a', 'b'], instructions: [1, 2],
  inputRegister: 'src', outputRegister: 'out',
  operations: [{ name: 'sma', length: 20 }, { name: 'highest', length: 20 }],
  maxLookback: 39, strategy: 'single-pass-streaming',
  eligibleBackends: ['cpu', 'wasm', 'gpu'], intermediateSeriesAllocations: 0,
};

assert.equal(selectCoreSpiritSeriesBackend(group, { realtime: true, bars: 100_000 }).requested, 'cpu');

const deterministic = selectCoreSpiritSeriesBackend(group, {
  realtime: false, bars: 2_000_000, deterministic: true,
  backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: false, vectorized: true, supportedOperations: ['rollingMean', 'rollingMax'] },
    { backend: 'gpu', available: true, deterministic: false, vectorized: true, supportedOperations: ['rollingMean', 'rollingMax'] },
  ],
});
assert.equal(deterministic.requested, 'cpu', 'a nondeterministic WASM kernel must not pass deterministic mode');

const partialWasm = selectCoreSpiritSeriesBackend(group, {
  realtime: false, bars: 20_000,
  backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true, supportedOperations: ['rollingMean'] },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ],
});
assert.equal(partialWasm.requested, 'cpu', 'WASM must advertise both rollingMean and rollingMax before accepting the fused group');

const ineligible = { ...group, eligibleBackends: ['cpu'] };
assert.equal(selectCoreSpiritSeriesBackend(ineligible, {
  realtime: false, bars: 100_000,
  backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true, supportedOperations: ['rollingMean', 'rollingMax'] },
    { backend: 'gpu', available: true, deterministic: true, vectorized: true, supportedOperations: ['rollingMean', 'rollingMax'] },
  ],
}).requested, 'cpu', 'group backend eligibility must be respected');

const recurrenceGroup = {
  ...group,
  operations: [{ name: 'ema', length: 20 }, { name: 'sma', length: 20 }],
};
const recurrenceProfiles = [
  { backend: 'cpu', available: true, deterministic: true, vectorized: true },
  { backend: 'wasm', available: true, deterministic: true, vectorized: true, supportedOperations: ['ema', 'rollingMean'], supportsStatefulSeries: true },
  { backend: 'gpu', available: true, deterministic: true, vectorized: true, supportedOperations: ['ema', 'rollingMean'] },
];
assert.equal(selectCoreSpiritSeriesBackend(recurrenceGroup, {
  realtime: false, bars: 500, minWasmWorkUnits: 1_000, backends: recurrenceProfiles,
}).requested, 'cpu', 'historical recurrence stays on CPU unless bounded SIMD is explicitly enabled');
assert.equal(selectCoreSpiritSeriesBackend(recurrenceGroup, {
  realtime: false, bars: 500, minWasmWorkUnits: 1_000,
  allowStatefulWasm: true, maxStatefulWasmBars: 1_000, backends: recurrenceProfiles,
}).requested, 'wasm', 'explicitly validated stateful SIMD may run only within the configured bound');
assert.equal(selectCoreSpiritSeriesBackend(recurrenceGroup, {
  realtime: false, bars: 1_500, minWasmWorkUnits: 1_000,
  allowStatefulWasm: true, maxStatefulWasmBars: 1_000, backends: recurrenceProfiles,
}).requested, 'cpu', 'stateful SIMD must fall back when input exceeds the configured bound');

let called = false;
const output = new Float64Array(2);
const actual = executeCoreSpiritSeriesFusionGroupDispatched(
  group, { register: 'src', values: Float64Array.from([1, 2]) }, output,
  { realtime: false, bars: 20_000, minWasmWorkUnits: 1, backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true, supportedOperations: ['rollingMean', 'rollingMax'] },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ] },
);
assert.equal(actual, 'cpu', 'the dispatcher must report the executed fallback, not the unavailable requested backend');
assert.equal(called, false);


let executorCalled = false;
const acceleratedOutput = new Float64Array(2);
const acceleratedBackend = executeCoreSpiritSeriesFusionGroupDispatched(
  group, { register: 'src', values: Float64Array.from([1, 2]) }, acceleratedOutput,
  { realtime: false, bars: 20_000, minWasmWorkUnits: 1, backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true, supportedOperations: ['rollingMean', 'rollingMax'] },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ] },
  { wasm: (_group, _input, target) => { executorCalled = true; target.set([9, 9]); } },
);
assert.equal(acceleratedBackend, 'wasm');
assert.equal(executorCalled, true);
assert.deepEqual(Array.from(acceleratedOutput), [9, 9], 'successful WASM execution publishes staged results');

let fallbackObserved = false;
let fallbackExecution;
const fallbackOutput = new Float64Array(2);
const failedBackend = executeCoreSpiritSeriesFusionGroupDispatched(
  group, { register: 'src', values: Float64Array.from([1, 2]) }, fallbackOutput,
  { realtime: false, bars: 20_000, minWasmWorkUnits: 1, onBackendExecution: event => { fallbackExecution = event; }, onBackendFallback: (backend, error) => {
    assert.equal(backend, 'wasm');
    assert.ok(error instanceof Error);
    fallbackObserved = true;
  }, backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true, supportedOperations: ['rollingMean', 'rollingMax'] },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ] },
  { wasm: (_group, _input, target) => { target[0] = 999; throw new Error('simulated WASM trap'); } },
);
assert.equal(failedBackend, 'cpu');
assert.equal(fallbackObserved, true, 'accelerator failure must be observable');
assert.equal(fallbackExecution.selected, 'wasm');
assert.equal(fallbackExecution.executed, 'cpu');
assert.match(fallbackExecution.fallbackReason, /simulated WASM trap/);
assert.ok(fallbackExecution.elapsedMs >= 0);

assert.notEqual(fallbackOutput[0], 999, 'partial accelerator writes must not leak into the published output');

const callbackThrowsOutput = new Float64Array(2);
const callbackThrowsResult = executeCoreSpiritSeriesFusionGroupDispatched(
  group, { register: 'src', values: Float64Array.from([1, 2]) }, callbackThrowsOutput,
  { realtime: false, bars: 20_000, minWasmWorkUnits: 1, onBackendFallback: () => { throw new Error('telemetry backend unavailable'); }, backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true, supportedOperations: ['rollingMean', 'rollingMax'] },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ] },
);
assert.equal(callbackThrowsResult, 'cpu', 'telemetry failures must not prevent safe CPU fallback');

const gpuOnlyGroup = { ...group, eligibleBackends: ['cpu', 'gpu'] };
const gpuProfiles = [
  { backend: 'cpu', available: true, deterministic: true, vectorized: true },
  { backend: 'wasm', available: false, deterministic: true, vectorized: true },
  { backend: 'gpu', available: true, deterministic: false, vectorized: true, supportedOperations: ['rollingMean', 'rollingMax'] },
];
assert.equal(selectCoreSpiritSeriesBackend(gpuOnlyGroup, {
  realtime: false, bars: 2_000_000, deterministic: false, backends: gpuProfiles,
}).requested, 'cpu', 'GPU must stay disabled unless explicitly opted in');
assert.equal(selectCoreSpiritSeriesBackend(gpuOnlyGroup, {
  realtime: false, bars: 2_000_000, deterministic: false, allowGpu: true, backends: gpuProfiles,
}).requested, 'gpu', 'explicit research/batch opt-in may select the available stateless GPU profile');



// Exercise the actual bundled binary through the series dispatcher, not only a
// synthetic executor profile. Loading includes the module's per-kernel warm-up.
const wasmBytes = await readFile(new URL('../../../public/coreSpirit/numerical-kernels-simd.wasm', import.meta.url));
const wasmRuntime = await loadCoreSpiritBundledWasmSeriesRuntime({ source: wasmBytes });
assert.equal(wasmRuntime.backend.lifecycle().state, 'ready');
assert.equal(wasmRuntime.backend.kernelVariant('rollingMean'), 'simd');
assert.equal(wasmRuntime.backend.kernelVariant('rollingMax'), 'scalar');
const parityGroup = {
  ...group,
  id: 'bundled-wasm-series-parity',
  operations: [{ name: 'sma', length: 3 }, { name: 'highest', length: 2 }],
};
const parityInput = {
  register: 'src',
  values: Float64Array.from([10, 12, 11, 14, 13, 15, 12, 14, 18, 17, 19, 16]),
};
const cpuParityOutput = new Float64Array(parityInput.values.length);
const wasmParityOutput = new Float64Array(parityInput.values.length);
executeCoreSpiritSeriesFusionGroupInto(parityGroup, parityInput, cpuParityOutput);
let actualExecution;
const actualBackend = executeCoreSpiritSeriesFusionGroupDispatched(
  parityGroup,
  parityInput,
  wasmParityOutput,
  {
    realtime: false,
    bars: parityInput.values.length,
    minWasmWorkUnits: 1,
    onBackendExecution: event => { actualExecution = event; },
    backends: wasmRuntime.backends,
  },
  wasmRuntime.executors,
);
assert.equal(actualBackend, 'wasm', 'a real warm WASM executor should run the supported historical fusion group');
assert.equal(actualExecution.selected, 'wasm');
assert.equal(actualExecution.executed, 'wasm');
assert.ok(actualExecution.elapsedMs >= 0);
for (let index = 0; index < cpuParityOutput.length; index += 1) {
  const expected = cpuParityOutput[index];
  const actual = wasmParityOutput[index];
  if (Number.isNaN(expected)) {
    assert.ok(Number.isNaN(actual), 'WASM parity: expected NaN at index ' + index);
  } else {
    assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-7 * Math.max(1, Math.abs(expected)),
      'WASM/CPU fused series mismatch at index ' + index + ': expected ' + expected + ', got ' + actual);
  }
}

// The exact same available metadata without its executor must never masquerade
// as acceleration; the published output must come from the CPU reference path.
const missingExecutorOutput = new Float64Array(parityInput.values.length).fill(999);
let missingExecutorTelemetry;
const missingExecutorBackend = executeCoreSpiritSeriesFusionGroupDispatched(
  parityGroup,
  parityInput,
  missingExecutorOutput,
  {
    realtime: false,
    bars: parityInput.values.length,
    minWasmWorkUnits: 1,
    onBackendExecution: event => { missingExecutorTelemetry = event; },
    backends: wasmRuntime.backends,
  },
);
assert.equal(missingExecutorBackend, 'cpu');
assert.equal(missingExecutorTelemetry.selected, 'wasm');
assert.equal(missingExecutorTelemetry.executed, 'cpu');
assert.match(missingExecutorTelemetry.fallbackReason, /executor unavailable/);
assert.deepEqual(missingExecutorOutput, cpuParityOutput);

console.log('CoreSpirit series backend dispatcher safety contract: OK');
