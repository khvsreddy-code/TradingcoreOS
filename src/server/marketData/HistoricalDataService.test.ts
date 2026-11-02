import assert from 'node:assert/strict';
import { HISTORICAL_SOURCE_POLICY, getPreferredHistoryPageRange, historicalFallbackCacheTtlMs, historicalSourcePriority, normalizeHistoricalCandles, mergeStoredBars } from './HistoricalDataService';

const sources = ['nse', 'investiny', 'fyers', 'tvdatafeed'] as const;
const ordered = [...sources].sort((left, right) => historicalSourcePriority(right) - historicalSourcePriority(left));
assert.deepEqual(ordered, ['fyers', 'investiny', 'nse', 'tvdatafeed']);
assert.ok(historicalSourcePriority('fyers') > historicalSourcePriority('investiny'));
assert.ok(historicalSourcePriority('investiny') > historicalSourcePriority('nse'));
assert.match(HISTORICAL_SOURCE_POLICY, /fyers-primary-7d\+investiny-2to5y-historical-backfill/);
assert.ok(historicalSourcePriority('fyers') > historicalSourcePriority('tvdatafeed'));
const collisionTimestamp = '2026-10-29T09:15:00.000Z';
const olderInvestiny = normalizeHistoricalCandles([{ timestamp: collisionTimestamp, open: 100, high: 102, low: 99, close: 101, volume: 10 }], 'investiny', '5minute');
const recentFyers = normalizeHistoricalCandles([{ timestamp: collisionTimestamp, open: 101, high: 103, low: 100, close: 102, volume: 12 }], 'fyers', '5minute');
const handedOver = mergeStoredBars(olderInvestiny, recentFyers);
assert.equal(handedOver.length, 1, 'provider collisions collapse to one canonical timestamp');
assert.equal(handedOver[0]?.source, 'fyers', 'FYERS deterministically wins timestamp collisions in the recent window');
assert.equal(handedOver[0]?.close, 102, 'selected provider controls OHLC values for the shared timestamp');
assert.equal(normalizeHistoricalCandles([{ timestamp: collisionTimestamp, liveSeed: true, open: 100, high: 102, low: 99, close: 101, volume: 10 }], 'fyers').length, 0, 'quote-only rows never enter OHLCV normalization');
const provenance = normalizeHistoricalCandles([{ timestamp: collisionTimestamp, exchangeTimestamp: collisionTimestamp, ingestedAt: '2026-10-29T09:15:00.250Z', timeframe: '5minute', open: 100, high: 102, low: 99, close: 101, volume: 10 }], 'fyers', '5minute');
assert.equal(provenance[0]?.source, 'fyers');
assert.equal(provenance[0]?.exchangeTimestamp, collisionTimestamp);
assert.equal(provenance[0]?.ingestedAt, '2026-10-29T09:15:00.250Z');
assert.equal(provenance[0]?.timeframe, '5minute');
const newlyIngested = normalizeHistoricalCandles([[1793265300, 100, 102, 99, 101, 10]], 'investiny', '5minute');
assert.ok(Date.parse(String(newlyIngested[0]?.ingestedAt)) > 0, 'new provider rows receive server-ingest time');
assert.equal(newlyIngested[0]?.exchangeTimestamp, collisionTimestamp);

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
  'Investiny history fallback cache expires when its breaker permits a recovery probe');
assert.equal(historicalFallbackCacheTtlMs('fyers', { status: 'circuit-open', health: { nextProbeAt: now + 120_000 } }, now), 60_000,
  'fallback cache expiry stays bounded during provider cooldown');
assert.equal(historicalFallbackCacheTtlMs('investiny', { status: 'not-configured' }, now), 60_000,
  'do not aggressively retry a primary source that is not configured');
assert.equal(historicalFallbackCacheTtlMs('fyers', { status: 'ok' }, now), 60_000,
  'validated recent FYERS history keeps the normal successful cache TTL');
assert.ok(historicalFallbackCacheTtlMs('investiny', { status: 'partial-error', health: { nextProbeAt: now + 9_000 } }, now) <= 9_000,
  'failed Investiny older-page probes expire partial history before automatic recovery');
console.log('MARKET_DATA_SOURCE_PRIORITY_OK');
