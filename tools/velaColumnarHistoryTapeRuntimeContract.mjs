import assert from 'node:assert/strict';

import { ColumnarHistoryTape } from '../vendor/vela/src/core/model/ColumnarHistoryTape.ts';

const tape = new ColumnarHistoryTape(5, 5);
const columns = (times, base) => ({
  time: Float64Array.from(times),
  open: Float64Array.from(times, (_, i) => base + i),
  high: Float64Array.from(times, (_, i) => base + i + 2),
  low: Float64Array.from(times, (_, i) => base + i - 2),
  close: Float64Array.from(times, (_, i) => base + i + 1),
  volume: Float64Array.from(times, (_, i) => (base + i) * 10),
  length: times.length,
  timeUnit: 'seconds',
});

tape.replaceColumns(columns([1000, 2000, 3000], 10));
assert.equal(tape.length, 3);
assert.deepEqual(Array.from(tape.time), [1_000_000, 2_000_000, 3_000_000],
  'second-based provider columns are normalized into Vela millisecond storage');
assert.deepEqual(Array.from(tape.close), [11, 12, 13]);

const prepended = tape.prependColumns(columns([400, 700], 4));
assert.equal(prepended, 2, 'only the strictly older prefix is prepended');
assert.equal(tape.length, 5);
assert.deepEqual(Array.from(tape.time), [400_000, 700_000, 1_000_000, 2_000_000, 3_000_000]);

tape.appendValues(4_000_000, 40, 42, 38, 41, 400);
assert.equal(tape.length, 5, 'the retained tape remains bounded at maxCapacity');
assert.deepEqual(Array.from(tape.time), [700_000, 1_000_000, 2_000_000, 3_000_000, 4_000_000],
  'overflow drops the oldest candle and retains the newest tail');

tape.replaceLastValues(4_000_000, 41, 44, 39, 43, 430);
assert.equal(tape.close[tape.length - 1], 43, 'forming-candle updates replace the current tail in place');
assert.equal(tape.volume[tape.length - 1], 430);

assert.equal(tape.lastIndexAtOrBefore(2_500_000), 2);
assert.equal(tape.firstIndexAtOrAfter(2_500_000), 3);
assert.equal(tape.countTimeRange(2_000_000, 4_000_000), 3);

tape.trimTo(3);
assert.equal(tape.length, 3);
assert.deepEqual(Array.from(tape.time), [2_000_000, 3_000_000, 4_000_000],
  'depth trimming preserves the newest retained candles');

const restored = tape.snapshotColumns('seconds');
assert.deepEqual(Array.from(restored.time), [2000, 3000, 4000],
  'snapshotColumns converts Vela milliseconds back to explicit epoch seconds');
assert.deepEqual(tape.toOHLCVRange(1, 3).map(bar => bar.close), [13, 43],
  'object compatibility projections remain index-correct after prepend/trim');

console.log('VELA_COLUMNAR_HISTORY_TAPE_RUNTIME_OK');
