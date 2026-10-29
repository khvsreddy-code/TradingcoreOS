import assert from 'node:assert/strict';
import { normalizeHistory, columnarHistoryToCandles } from './chartHistoryNormalization';

const rows = normalizeHistory([
  { timestamp: '2026-10-24T10:00:00.000Z', open: 100, high: 103, low: 99, close: 101, volume: 10, source: 'fyers', phase: 'historical', confirmed: true, availableAt: '2026-10-24T10:00:02.000Z', revision: 2 },
  { timestamp: '2026-10-24T10:00:00.700Z', open: 101, high: 104, low: 100, close: 102, volume: 12, source: 'tvdatafeed', phase: 'confirmed', confirmed: false, revision: 3 },
  { timestamp: '2026-10-24T10:02:00.000Z', open: 102, high: 104, low: 101, close: 103, volume: 15, source: 'unknown' },
  { timestamp: 'invalid', open: 1, high: 1, low: 1, close: 1, volume: 0 },
  { timestamp: '2026-10-24T10:01:00.000Z', open: Number.NaN, high: 2, low: 0, close: 1, volume: 0 },
] as any);
assert.equal(rows.length, 1, 'invalid rows are dropped and whole-second duplicates collapse');
assert.equal(rows[0]?.timestamp, '2026-10-24T10:00:00.000Z');
assert.equal(rows[0]?.close, 102, 'last valid row for a second wins');
assert.equal(rows[0]?.source, 'tvdatafeed');
assert.equal(rows[0]?.phase, 'confirmed');
assert.equal(rows[0]?.confirmed, false);
assert.equal(rows[0]?.revision, 3);

const seconds = Date.parse('2026-10-24T10:00:00.000Z') / 1000;
const converted = columnarHistoryToCandles({
  time: [seconds, seconds, Number.NaN, seconds + 300],
  open: [100, 100, 1, 101], high: [102, 102, 1, 104], low: [99, 99, 1, 100], close: [101, 101, 1, 103], volume: [10, 10, 1, 15],
  timeUnit: 'seconds', phase: ['historical', 'historical', 'historical', 'realtime'], confirmed: [true, true, true, false], revision: [1, 1, 1, 2],
}, 5000);
assert.equal(converted.length, 2, 'invalid timestamps and adjacent duplicate timestamps are dropped');
assert.equal(converted[0]?.timestamp, '2026-10-24T10:00:00.000Z');
assert.equal(converted[1]?.timestamp, '2026-10-24T10:05:00.000Z');
assert.equal(converted[1]?.phase, 'realtime');
assert.equal(converted[1]?.confirmed, false);
assert.equal(converted[1]?.revision, 2);
const untrustedColumns = columnarHistoryToCandles({
  time: [seconds + 600],
  open: [102], high: [104], low: [101], close: [103], volume: [12],
  timeUnit: 'seconds', source: ['unknown'],
}, 5000);
assert.equal(untrustedColumns.length, 0, 'unknown-source columnar candles are rejected before chart hydration');
const sourceRows = normalizeHistory([
  { timestamp: '2026-10-26T09:15:00.000Z', open: 100, high: 102, low: 99, close: 101, volume: 10, source: 'nse' },
  { timestamp: '2026-10-26T09:20:00.000Z', open: 101, high: 103, low: 100, close: 102, volume: 15, source: 'investiny' },
] as any);
assert.equal(sourceRows[0]?.source, 'nse');
assert.equal(sourceRows[1]?.source, 'investiny');
console.log('CHART_HISTORY_NORMALIZATION_CONTRACT_OK');
