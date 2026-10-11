import assert from 'node:assert/strict';
import {
  selectCoreSpiritSeriesBackend,
  executeCoreSpiritSeriesFusionGroupDispatched,
} from './seriesBackendDispatcher.ts';

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
  { realtime: false, bars: 20_000, backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ] },
);
assert.equal(actual, 'cpu', 'the dispatcher must report the executed fallback, not the unavailable requested backend');
assert.equal(called, false);


let executorCalled = false;
const acceleratedOutput = new Float64Array(2);
const acceleratedBackend = executeCoreSpiritSeriesFusionGroupDispatched(
  group, { register: 'src', values: Float64Array.from([1, 2]) }, acceleratedOutput,
  { realtime: false, bars: 20_000, backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ] },
  { wasm: (_group, _input, target) => { executorCalled = true; target.set([9, 9]); } },
);
assert.equal(acceleratedBackend, 'wasm');
assert.equal(executorCalled, true);
assert.deepEqual(Array.from(acceleratedOutput), [9, 9], 'successful WASM execution publishes staged results');

let fallbackObserved = false;
const fallbackOutput = new Float64Array(2);
const failedBackend = executeCoreSpiritSeriesFusionGroupDispatched(
  group, { register: 'src', values: Float64Array.from([1, 2]) }, fallbackOutput,
  { realtime: false, bars: 20_000, onBackendFallback: (backend, error) => {
    assert.equal(backend, 'wasm');
    assert.ok(error instanceof Error);
    fallbackObserved = true;
  }, backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ] },
  { wasm: (_group, _input, target) => { target[0] = 999; throw new Error('simulated WASM trap'); } },
);
assert.equal(failedBackend, 'cpu');
assert.equal(fallbackObserved, true, 'accelerator failure must be observable');
assert.notEqual(fallbackOutput[0], 999, 'partial accelerator writes must not leak into the published output');

const callbackThrowsOutput = new Float64Array(2);
const callbackThrowsResult = executeCoreSpiritSeriesFusionGroupDispatched(
  group, { register: 'src', values: Float64Array.from([1, 2]) }, callbackThrowsOutput,
  { realtime: false, bars: 20_000, onBackendFallback: () => { throw new Error('telemetry backend unavailable'); }, backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true, supportedOperations: ['rollingMean', 'rollingMax'] },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ] },
);
assert.equal(callbackThrowsResult, 'cpu', 'telemetry failures must not prevent safe CPU fallback');

console.log('CoreSpirit series backend dispatcher safety contract: OK');
