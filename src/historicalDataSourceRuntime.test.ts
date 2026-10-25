import assert from 'node:assert/strict';
import { getRecentHistoryRequestRange, normalizeHistoricalCandles, recentHistorySessionsForInstrument } from './server/marketData/HistoricalDataService.js';

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

assert.equal(recentHistorySessionsForInstrument('equity', 'NSE:SBIN-EQ'), 3, 'stocks keep three observed FYERS sessions');
assert.equal(recentHistorySessionsForInstrument('index', 'NSE:NIFTY50-INDEX'), 3, 'indices keep three observed FYERS sessions');
assert.equal(recentHistorySessionsForInstrument('options', 'NSE:NIFTY2610CE'), 5, 'typed option contracts keep one trading week');
assert.equal(recentHistorySessionsForInstrument('unknown', 'NSE:NIFTY2610PE'), 5, 'option suffix can recover a missing instrument type');

const now = new Date('2026-10-19T07:00:00.000Z');
const range = getRecentHistoryRequestRange({
  timezone: 'Asia/Kolkata',
  sessionOpen: '09:15',
  calendarHolidays: ['2026-10-19'],
  calendarComplete: true,
}, now);
assert.equal(range.fromDate, '2026-10-14', 'complete calendar should skip the Monday holiday and count three prior sessions');
assert.equal(new Date(range.fromMs).toISOString(), '2026-10-13T18:30:00.000Z', 'request starts at local midnight so daily bars stamped at midnight remain included');

const optionRange = getRecentHistoryRequestRange({
  timezone: 'Asia/Kolkata',
  sessionOpen: '09:15',
  calendarHolidays: ['2026-10-19'],
  calendarComplete: true,
  instrumentType: 'option',
  fyersSymbol: 'NSE:NIFTY2610CE',
}, now);
assert.equal(optionRange.fromDate, '2026-10-12', 'option contract should retain five observed sessions (one trading week), skipping weekends and the holiday');
assert.equal(new Date(optionRange.fromMs).toISOString(), '2026-10-11T18:30:00.000Z', 'option range must include the whole oldest retained session');
console.log('TRADINGCOREOS_HISTORICAL_DATA_RUNTIME_OK');
