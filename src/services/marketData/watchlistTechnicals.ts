import type { HistoricalCandle } from '../brokers/BrokerAdapter';

export type WatchlistTechnicalTrend = 'Bullish' | 'Neutral' | 'Bearish';

export type WatchlistTechnicalSummary = Readonly<{
  trend: WatchlistTechnicalTrend;
  rsi14: number;
  ema20: number;
  ema50: number;
  macdHistogram: number;
  candleCount: number;
  asOf: string;
}>;

function ema(values: readonly number[], period: number): number[] {
  if (!values.length) return [];
  const alpha = 2 / (Math.max(1, period) + 1);
  const result = new Array<number>(values.length);
  let current = values[0]!;
  result[0] = current;
  for (let i = 1; i < values.length; i += 1) {
    current = values[i]! * alpha + current * (1 - alpha);
    result[i] = current;
  }
  return result;
}

function wilderRsi(values: readonly number[], period = 14): number | null {
  if (values.length <= period) return null;
  let averageGain = 0;
  let averageLoss = 0;
  for (let i = 1; i <= period; i += 1) {
    const delta = values[i]! - values[i - 1]!;
    averageGain += Math.max(0, delta);
    averageLoss += Math.max(0, -delta);
  }
  averageGain /= period;
  averageLoss /= period;
  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i]! - values[i - 1]!;
    averageGain = (averageGain * (period - 1) + Math.max(0, delta)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(0, -delta)) / period;
  }
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

/** Calculate a compact, deterministic watchlist view from the validated candle history. */
export function buildWatchlistTechnicalSummary(candles: readonly HistoricalCandle[]): WatchlistTechnicalSummary | null {
  const valid = (candles || []).filter(row => {
    const time = Date.parse(String(row?.timestamp));
    const open = Number(row?.open), high = Number(row?.high), low = Number(row?.low), close = Number(row?.close);
    const volume = Number(row?.volume ?? 0);
    return Number.isFinite(time) && time > 0
      && [open, high, low, close].every(Number.isFinite)
      && high >= Math.max(open, close) && low <= Math.min(open, close)
      && high >= low && Number.isFinite(volume) && volume >= 0;
  }).slice().sort((a, b) => Date.parse(String(a.timestamp)) - Date.parse(String(b.timestamp)));

  if (valid.length < 50) return null;
  const closes = valid.map(row => Number(row.close));
  const close = closes[closes.length - 1]!;
  const ema20Series = ema(closes, 20);
  const ema50Series = ema(closes, 50);
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macd = closes.map((_value, i) => fast[i]! - slow[i]!);
  const signal = ema(macd, 9);
  const ema20 = ema20Series[ema20Series.length - 1]!;
  const ema50 = ema50Series[ema50Series.length - 1]!;
  const rsi14 = wilderRsi(closes, 14);
  const macdHistogram = macd[macd.length - 1]! - signal[signal.length - 1]!;

  if (rsi14 == null || ![close, ema20, ema50, macdHistogram, rsi14].every(Number.isFinite)) return null;
  const bullishVotes = Number(close > ema20) + Number(ema20 > ema50) + Number(rsi14 >= 55) + Number(macdHistogram > 0);
  const bearishVotes = Number(close < ema20) + Number(ema20 < ema50) + Number(rsi14 <= 45) + Number(macdHistogram < 0);
  const trend: WatchlistTechnicalTrend = bullishVotes >= 3 && bullishVotes > bearishVotes
    ? 'Bullish'
    : bearishVotes >= 3 && bearishVotes > bullishVotes
      ? 'Bearish'
      : 'Neutral';

  return Object.freeze({
    trend,
    rsi14,
    ema20,
    ema50,
    macdHistogram,
    candleCount: valid.length,
    asOf: String(valid[valid.length - 1]!.timestamp),
  });
}
