import assert from 'node:assert/strict';

import { historicalRowsToVelaColumns } from '../src/services/marketData/historicalColumns.ts';

const day = (dayOfMonth) => `2026-11-${String(dayOfMonth).padStart(2, '0')}T09:15:00.000Z`;
const rows = [
  { timestamp: day(1), open: 100, high: 110, low: 95, close: 105, volume: 10 },
  { timestamp: day(2), open: 105, high: 112, low: 102, close: 110, volume: 20 },
  { timestamp: day(3), open: 110, high: 118, low: 108, close: 116 },
  { timestamp: day(4), open: 116, high: 120, low: 114, close: 118, volume: 'bad-volume' },
  { timestamp: day(5), open: 118, high: 125, low: 117, close: 123, volume: 50 },
];

const from = Date.parse(day(2));
const to = Date.parse(day(5));
const columns = historicalRowsToVelaColumns(rows, { from, to }, 2);
assert.equal(columns.length, 2, 'range filtering is inclusive and the row limit keeps the newest selected bars');
assert.equal(columns.timeUnit, 'milliseconds');
for (const channel of ['time', 'open', 'high', 'low', 'close', 'volume']) {
  assert.ok(columns[channel] instanceof Float64Array, `${channel} must remain a Float64Array`);
  assert.equal(columns[channel].length, columns.length, `${channel} length must match the emitted row count`);
}
assert.deepEqual(Array.from(columns.time), [Date.parse(day(4)), Date.parse(day(5))]);
assert.deepEqual(Array.from(columns.close), [118, 123]);
assert.deepEqual(Array.from(columns.volume), [0, 50], 'invalid and missing volume values preserve the zero-volume fallback');

const malformedTail = historicalRowsToVelaColumns([
  { timestamp: day(1), open: 1, high: 2, low: 0, close: 1 },
  { timestamp: day(2), open: 2, high: 3, low: 1, close: 2 },
  { timestamp: day(3), open: 3, high: Number.NaN, low: 2, close: 3 },
], undefined, 2);
assert.equal(malformedTail.length, 1,
  'the newest source window is capped before malformed OHLC rows are discarded, preserving adapter semantics');
assert.deepEqual(Array.from(malformedTail.close), [2]);

const epochSeconds = historicalRowsToVelaColumns([
  { timestamp: 1_794_000_000, open: 10, high: 11, low: 9, close: 10 },
], undefined, 5);
assert.equal(epochSeconds.time[0], 1_794_000_000_000,
  'numeric epoch-second timestamps are normalized to Vela milliseconds');

console.log('TCO_CANONICAL_HISTORICAL_COLUMNS_RUNTIME_OK');
