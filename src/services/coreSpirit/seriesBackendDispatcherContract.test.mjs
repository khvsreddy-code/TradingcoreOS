import assert from 'node:assert/strict';
import {
  selectCoreSpiritSeriesBackend,
  executeCoreSpiritSeriesFusionGroupDispatched,
} from './seriesBackendDispatcher.ts';

const group = {
  id: 'g',
  nodeIds: ['a', 'b'],
  instructions: [1, 2],
  inputRegister: 'src',
  outputRegister: 'out',
  operations: [{ name: 'sma', length: 20 }, { name: 'highest', length: 20 }],
  maxLookback: 39,
  strategy: 'single-pass-streaming',
  eligibleBackends: ['cpu', 'wasm', 'gpu'],
  intermediateSeriesAllocations: 0,
};

assert.equal(
  selectCoreSpiritSeriesBackend(group, { realtime: true, bars: 100_000 }).requested,
  'cpu',
);

const longHistorical = selectCoreSpiritSeriesBackend(group, {
  realtime: false,
  bars: 20_000,
  backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ],
});
assert.equal(longHistorical.requested, 'wasm');

const hugeStateless = selectCoreSpiritSeriesBackend(group, {
  realtime: false,
  bars: 2_000_000,
  deterministic: false,
  backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true },
    { backend: 'gpu', available: true, deterministic: false, vectorized: true },
  ],
});
assert.equal(hugeStateless.requested, 'gpu');

const output = new Float64Array(2);
let called = false;
const backend = executeCoreSpiritSeriesFusionGroupDispatched(
  group,
  { register: 'src', values: new Float64Array([1, 2]) },
  output,
  { realtime: false, bars: 20_000, backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: true },
    { backend: 'wasm', available: true, deterministic: true, vectorized: true },
    { backend: 'gpu', available: false, deterministic: false, vectorized: true },
  ] },
  { wasm: (_group, _input, target) => { called = true; target.set([9, 9]); } },
);
assert.equal(backend, 'wasm');
assert.equal(called, true);
assert.deepEqual(Array.from(output), [9, 9]);

console.log('CoreSpirit series backend dispatcher contract: OK');
