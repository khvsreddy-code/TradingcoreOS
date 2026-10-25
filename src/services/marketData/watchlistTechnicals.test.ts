import assert from 'node:assert/strict';
import { buildWatchlistTechnicalSummary } from './watchlistTechnicals';

const candles = (closes: number[]) => closes.map((close, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 9, i)).toISOString(),
  open: close - 0.25,
  high: close + 1,
  low: close - 1,
  close,
  volume: 100 + i,
}));

const rising = buildWatchlistTechnicalSummary(candles(Array.from({ length: 90 }, (_, i) => 100 + i)));
assert.ok(rising);
assert.equal(rising.trend, 'Bullish');
assert.ok(rising.rsi14 > 90);
assert.ok(rising.ema20 > rising.ema50);
assert.ok(rising.macdHistogram > 0);
assert.equal(rising.candleCount, 90);

const falling = buildWatchlistTechnicalSummary(candles(Array.from({ length: 90 }, (_, i) => 190 - i)));
assert.ok(falling);
assert.equal(falling.trend, 'Bearish');
assert.ok(falling.rsi14 < 10);
assert.ok(falling.ema20 < falling.ema50);
assert.ok(falling.macdHistogram < 0);

assert.equal(buildWatchlistTechnicalSummary(candles(Array.from({ length: 40 }, (_, i) => 100 + i))), null,
  'do not display premature trend votes before the slow EMA has warmed up');
assert.equal(buildWatchlistTechnicalSummary([]), null);
console.log('WATCHLIST_TECHNICALS_SUMMARY_OK');
