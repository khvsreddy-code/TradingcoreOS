import assert from 'node:assert/strict';
import { getBoundedHistoryPageRange, getRecentHistoryRequestRange, historicalFallbackCacheTtlMs, normalizeHistoricalCandles } from './server/marketData/HistoricalDataService.js';

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

const nseRows = normalizeHistoricalCandles([
  [1_800_000_060, 101, 106, 100, 105, 500],
], 'nse');
const investinyRows = normalizeHistoricalCandles([
  [1_800_000_120, 105, 107, 104, 106, 450],
], 'investiny');
assert.equal(nseRows[0]?.source, 'nse', 'the normalizer must preserve NSE provenance');
assert.equal(investinyRows[0]?.source, 'investiny', 'the normalizer must preserve Investiny provenance');
const probeNow = 100_000;
assert.equal(
  historicalFallbackCacheTtlMs('investiny', { status: 'error', health: { nextProbeAt: probeNow + 17_000 } }, probeNow),
  17_000,
  'fallback history should not hide NSE recovery behind the successful-cache TTL',
);

const range = getRecentHistoryRequestRange({
  timezone: 'Asia/Kolkata',
  sessionOpen: '09:15',
  calendarHolidays: ['2026-10-19'],
  calendarComplete: true,
}, new Date('2026-10-19T07:00:00.000Z'));
assert.equal(range.fromDate, '2026-10-12', 'complete calendar should skip the Monday holiday and include five prior trading sessions');
assert.equal(new Date(range.fromMs).toISOString(), '2026-10-11T18:30:00.000Z', 'five-session India-local calendar range remains deterministic');

const pageEnd = new Date('2026-10-19T07:00:00.000Z').getTime();
const intradayPage = getBoundedHistoryPageRange({
  timezone: 'Asia/Kolkata',
}, '1minute', 2_000, 1, pageEnd);
assert.equal(intradayPage.requestedBars, 2_000);
assert.ok(intradayPage.toMs - intradayPage.fromMs <= 10 * 86_400_000, '1-minute history pages should request a bounded range sized for approximately 2,000 bars');
assert.ok(intradayPage.lookbackFloorMs != null, 'Standard-plan intraday history must have a plan-derived lookback floor');
assert.ok(intradayPage.fromMs < intradayPage.toMs && intradayPage.toMs <= pageEnd);

const dailyPage = getBoundedHistoryPageRange({
  timezone: 'Asia/Kolkata',
}, 'day', 2_000, 5, pageEnd);
assert.ok(dailyPage.toMs - dailyPage.fromMs <= 360 * 86_400_000, 'individual daily ranges must remain within the provider-safe 360-day window');
assert.ok(dailyPage.lookbackFloorMs != null, 'Standard daily history must use the published five-year cap');

console.log('TRADINGCOREOS_HISTORICAL_DATA_RUNTIME_OK');
