import type { HistoricalCandle } from '../brokers/BrokerAdapter';
import { buildWatchlistTechnicalSummary, type WatchlistTechnicalSummary } from './watchlistTechnicals';

export type WatchlistAdvancedTechnicalSummary = WatchlistTechnicalSummary & Readonly<{
  atr14: number | null;
  adx14: number | null;
  sessionVwap: number | null;
  relativeVolume20: number | null;
}>;

function wilder(values: readonly number[], period: number): number[] {
  const result = new Array<number>(values.length).fill(Number.NaN);
  let seed = 0;
  let count = 0;
  let previous = Number.NaN;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i]!;
    if (!Number.isFinite(value)) continue;
    if (count < period) {
      seed += value;
      count += 1;
      if (count === period) {
        previous = seed / period;
        result[i] = previous;
      }
    } else {
      previous = (previous * (period - 1) + value) / period;
      result[i] = previous;
    }
  }
  return result;
}

function lastFinite(values: readonly number[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i])) return values[i]!;
  }
  return null;
}

function adx(high: readonly number[], low: readonly number[], ranges: readonly number[], length = 14): number | null {
  const plusMove = new Array<number>(high.length).fill(Number.NaN);
  const minusMove = new Array<number>(high.length).fill(Number.NaN);
  for (let i = 1; i < high.length; i += 1) {
    const up = high[i]! - high[i - 1]!;
    const down = low[i - 1]! - low[i]!;
    plusMove[i] = up > down && up > 0 ? up : 0;
    minusMove[i] = down > up && down > 0 ? down : 0;
  }
  const atr = wilder(ranges, length);
  const plus = wilder(plusMove, length);
  const minus = wilder(minusMove, length);
  const dx = plus.map((value, index) => {
    const tr = atr[index]!;
    const down = minus[index]!;
    if (!Number.isFinite(value) || !Number.isFinite(down) || !Number.isFinite(tr) || tr <= 0) return Number.NaN;
    const plusDi = 100 * value / tr;
    const minusDi = 100 * down / tr;
    return plusDi + minusDi === 0 ? 0 : 100 * Math.abs(plusDi - minusDi) / (plusDi + minusDi);
  });
  return lastFinite(wilder(dx, length));
}

function sessionVwap(candles: readonly HistoricalCandle[]): number | null {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const last = candles[candles.length - 1];
  if (!last) return null;
  const session = formatter.format(new Date(String(last.timestamp)));
  let value = 0;
  let volume = 0;
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const candle = candles[i]!;
    if (formatter.format(new Date(String(candle.timestamp))) !== session) break;
    const currentVolume = Number(candle.volume ?? 0);
    if (!Number.isFinite(currentVolume) || currentVolume <= 0) continue;
    const typical = (Number(candle.high) + Number(candle.low) + Number(candle.close)) / 3;
    value += typical * currentVolume;
    volume += currentVolume;
  }
  return volume > 0 ? value / volume : null;
}

/** Add trend-strength, volatility, session-VWAP and relative-volume context to the base snapshot. */
export function buildWatchlistAdvancedTechnicalSummary(
  candles: readonly HistoricalCandle[],
): WatchlistAdvancedTechnicalSummary | null {
  const base = buildWatchlistTechnicalSummary(candles);
  if (!base) return null;
  const valid = candles.filter(row => {
    const time = Date.parse(String(row?.timestamp));
    const open = Number(row?.open), high = Number(row?.high), low = Number(row?.low), close = Number(row?.close);
    const volume = Number(row?.volume ?? 0);
    return Number.isFinite(time) && time > 0
      && [open, high, low, close].every(Number.isFinite)
      && high >= Math.max(open, close) && low <= Math.min(open, close)
      && high >= low && Number.isFinite(volume) && volume >= 0;
  }).slice().sort((a, b) => Date.parse(String(a.timestamp)) - Date.parse(String(b.timestamp)));
  if (!valid.length) return null;
  const high = valid.map(row => Number(row.high));
  const low = valid.map(row => Number(row.low));
  const ranges = valid.map((row, index) => {
    const h = Number(row.high), l = Number(row.low);
    const previousClose = index ? Number(valid[index - 1]!.close) : Number.NaN;
    return Number.isFinite(previousClose)
      ? Math.max(h - l, Math.abs(h - previousClose), Math.abs(l - previousClose))
      : h - l;
  });
  const atrSeries = wilder(ranges, 14);
  const volumeWindow = valid.slice(Math.max(0, valid.length - 21), -1)
    .map(row => Number(row.volume ?? 0)).filter(Number.isFinite);
  const averageVolume = volumeWindow.length
    ? volumeWindow.reduce((sum, item) => sum + item, 0) / volumeWindow.length
    : 0;
  const currentVolume = Number(valid[valid.length - 1]!.volume ?? 0);
  return Object.freeze({
    ...base,
    atr14: lastFinite(atrSeries),
    adx14: adx(high, low, ranges, 14),
    sessionVwap: sessionVwap(valid),
    relativeVolume20: averageVolume > 0 ? currentVolume / averageVolume : null,
  });
}
