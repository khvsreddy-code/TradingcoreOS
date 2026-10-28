import assert from 'node:assert/strict';
import { historicalFallbackCacheTtlMs, historicalSourcePriority } from './HistoricalDataService';

const sources = ['nse', 'investiny', 'fyers', 'tvdatafeed'] as const;
const ordered = [...sources].sort((left, right) => historicalSourcePriority(right) - historicalSourcePriority(left));
assert.deepEqual(ordered, ['nse', 'investiny', 'fyers', 'tvdatafeed']);
assert.ok(historicalSourcePriority('nse') > historicalSourcePriority('investiny'));
assert.ok(historicalSourcePriority('investiny') > historicalSourcePriority('fyers'));
assert.ok(historicalSourcePriority('fyers') > historicalSourcePriority('tvdatafeed'));

const now = 1_000_000;
assert.equal(historicalFallbackCacheTtlMs('investiny', { status: 'error', health: { nextProbeAt: now + 15_000 } }, now), 15_000,
  'Investiny fallback cache should expire when the NSE breaker permits its next recovery probe');
assert.equal(historicalFallbackCacheTtlMs('fyers', { status: 'circuit-open', health: { nextProbeAt: now + 120_000 } }, now), 60_000,
  'fallback cache expiry should be capped while NSE has a longer exponential cooldown');
assert.equal(historicalFallbackCacheTtlMs('investiny', { status: 'not-configured' }, now), 60_000,
  'do not aggressively retry a primary source that is not configured');
assert.equal(historicalFallbackCacheTtlMs('nse', { status: 'ok' }, now), 60_000,
  'validated NSE history keeps the normal successful cache TTL');
console.log('MARKET_DATA_SOURCE_PRIORITY_OK');
