import assert from 'node:assert/strict';
import { getPreferredHistoryPageRange, historicalFallbackCacheTtlMs, historicalSourcePriority } from './HistoricalDataService';

const sources = ['nse', 'investiny', 'fyers', 'tvdatafeed'] as const;
const ordered = [...sources].sort((left, right) => historicalSourcePriority(right) - historicalSourcePriority(left));
assert.deepEqual(ordered, ['nse', 'investiny', 'fyers', 'tvdatafeed']);
assert.ok(historicalSourcePriority('nse') > historicalSourcePriority('investiny'));
assert.ok(historicalSourcePriority('investiny') > historicalSourcePriority('fyers'));
assert.ok(historicalSourcePriority('fyers') > historicalSourcePriority('tvdatafeed'));

const now = 1_000_000;
const anchor = Date.UTC(2026, 9, 29, 12);
const oneMinute = getPreferredHistoryPageRange({ timezone: 'Asia/Kolkata' }, '1m', 5_000, anchor);
const fiveMinute = getPreferredHistoryPageRange({ timezone: 'Asia/Kolkata' }, '5minute', 5_000, anchor);
const fifteenMinute = getPreferredHistoryPageRange({ timezone: 'Asia/Kolkata' }, '15minute', 5_000, anchor);
const oneMonth = getPreferredHistoryPageRange({ timezone: 'Asia/Kolkata' }, '1M', 5_000, anchor);
assert.ok(oneMinute.toMs - oneMinute.fromMs < 40 * 86_400_000, 'lowercase 1m is one-minute history');
assert.ok(fiveMinute.toMs - fiveMinute.fromMs > 80 * 86_400_000, '5-minute history should size requests for the 5k target');
assert.ok(fifteenMinute.toMs - fifteenMinute.fromMs > 250 * 86_400_000, '15-minute history needs a wider range than 5-minute history');
assert.ok(oneMonth.toMs - oneMonth.fromMs > 30 * 365 * 86_400_000, 'uppercase 1M is monthly, not one-minute');
assert.equal(fiveMinute.requestedBars, 5_000);
assert.equal(historicalFallbackCacheTtlMs('investiny', { status: 'error', health: { nextProbeAt: now + 15_000 } }, now), 15_000,
  'Investiny fallback cache should expire when the NSE breaker permits its next recovery probe');
assert.equal(historicalFallbackCacheTtlMs('fyers', { status: 'circuit-open', health: { nextProbeAt: now + 120_000 } }, now), 60_000,
  'fallback cache expiry should be capped while NSE has a longer exponential cooldown');
assert.equal(historicalFallbackCacheTtlMs('investiny', { status: 'not-configured' }, now), 60_000,
  'do not aggressively retry a primary source that is not configured');
assert.equal(historicalFallbackCacheTtlMs('nse', { status: 'ok' }, now), 60_000,
  'validated NSE history keeps the normal successful cache TTL');
assert.ok(historicalFallbackCacheTtlMs('nse', { status: 'partial-error', health: { nextProbeAt: now + 9_000 } }, now) <= 9_000,
  'a failed NSE older-page probe expires partial history before automatic recovery');
console.log('MARKET_DATA_SOURCE_PRIORITY_OK');
