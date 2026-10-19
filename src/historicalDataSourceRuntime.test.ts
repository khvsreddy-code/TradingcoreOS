import assert from 'node:assert/strict';
import { getRecentHistoryRequestRange, normalizeHistoricalCandles } from './server/marketData/HistoricalDataService.js';

const rows = normalizeHistoricalCandles([
  [1_800_000_000, 100, 105, 99, 104, 1000],
  [1_800_000_000, 100, 105, 99, 104, 1000],
  [1_800_000_060, 104, 103, 102, 102, 4], // impossible high/close geometry
  [1_800_000_120, 105, 106, 104, 105, -1], // invalid negative volume
  { timestamp: '2026-10-19T04:00:00.000Z', open: 99, high: 101, low: 98, close: 100, volume: 1, liveSeed: true },
], 'fyers');
assert.equal(rows.length, 1, 'invalid rows, duplicate timestamps, and quote-derived seed rows must be excluded');
assert.equal(rows[0].source, 'fyers');
assert.equal(rows[0].open, 100);
assert.ok(rows[0].timestampMs > 0);

const range = getRecentHistoryRequestRange({
  timezone: 'Asia/Kolkata',
  sessionOpen: '09:15',
  calendarHolidays: ['2026-10-19'],
  calendarComplete: true,
}, new Date('2026-10-19T07:00:00.000Z'));
assert.equal(range.fromDate, '2026-10-14', 'complete calendar should skip the Monday holiday and count three prior sessions');
assert.equal(new Date(range.fromMs).toISOString(), '2026-10-13T18:30:00.000Z', 'request starts at local midnight so daily bars stamped at midnight remain included');
console.log('TRADINGCOREOS_HISTORICAL_DATA_RUNTIME_OK');
