/**
 * CoreSpirit scalar indicator compatibility helpers.
 *
 * Historical execution belongs to the canonical stateful kernel layer. These
 * helpers keep the small scalar API used by older callers/tests, but they no
 * longer construct period-sized windows with slice/reduce/spread operations.
 *
 * For full-history work prefer the incremental/fused executors. A scalar
 * helper intentionally evaluates only the requested input window.
 */
import {
  RollingMean,
  RollingVariance,
  RollingMinMax,
  WMAState,
} from './statefulIndicatorKernel';

export function mean(values: readonly number[]): number | null {
  if (!values.length) return null;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += Number(values[i]);
  return sum / values.length;
}

export function sma(values: readonly number[], length: number): number | null {
  const period = Math.max(1, Math.floor(length));
  if (values.length < period) return null;
  const state = new RollingMean(period);
  for (let i = 0; i < period; i += 1) state.update(Number(values[i]));
  return state.value();
}

export function highest(values: readonly number[], length: number): number | null {
  const period = Math.max(1, Math.floor(length));
  if (values.length < period) return null;
  const state = new RollingMinMax(period);
  for (let i = 0; i < period; i += 1) state.update(Number(values[i]));
  return state.max();
}

export function lowest(values: readonly number[], length: number): number | null {
  const period = Math.max(1, Math.floor(length));
  if (values.length < period) return null;
  const state = new RollingMinMax(period);
  for (let i = 0; i < period; i += 1) state.update(Number(values[i]));
  return state.min();
}

export function emaStep(
  current: number,
  previous: number | null,
  seedValues: readonly number[],
  length: number,
): number | null {
  const period = Math.max(1, Math.floor(length));
  if (!Number.isFinite(current) || seedValues.length < period) return null;

  let seedSum = 0;
  for (let i = 0; i < period; i += 1) seedSum += Number(seedValues[i]);
  const seed = seedSum / period;
  if (!Number.isFinite(seed)) return null;

  if (previous == null || !Number.isFinite(previous)) return seed;
  const alpha = 2 / (period + 1);
  return alpha * current + (1 - alpha) * previous;
}

export function trueRange(high: number, low: number, previousClose: number | null): number | null {
  if (![high, low].every(Number.isFinite)) return null;
  const pc = previousClose == null || !Number.isFinite(previousClose) ? low : previousClose;
  return Math.max(high - low, Math.abs(high - pc), Math.abs(low - pc));
}

export function rsiFromAverages(avgGain: number, avgLoss: number): number | null {
  if (!Number.isFinite(avgGain) || !Number.isFinite(avgLoss)) return null;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function standardDeviation(values: readonly number[], length: number): number | null {
  const period = Math.max(1, Math.floor(length));
  if (values.length < period) return null;
  const state = new RollingVariance(period);
  for (let i = 0; i < period; i += 1) state.update(Number(values[i]));
  return state.value();
}

export function wma(values: readonly number[], length: number): number | null {
  const period = Math.max(1, Math.floor(length));
  if (values.length < period) return null;
  const state = new WMAState(period);
  for (let i = 0; i < period; i += 1) state.update(Number(values[i]));
  return state.update(Number(values[period - 1]), 'replace');
}

export function stochastic(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  length: number,
): number | null {
  const period = Math.max(1, Math.floor(length));
  if (highs.length < period || lows.length < period || closes.length < period) return null;

  const highState = new RollingMinMax(period);
  const lowState = new RollingMinMax(period);
  for (let i = 0; i < period; i += 1) {
    highState.update(Number(highs[i]));
    lowState.update(Number(lows[i]));
  }

  const hi = highState.max();
  const lo = lowState.min();
  const close = Number(closes[0]);
  if (hi == null || lo == null || !Number.isFinite(close)) return null;
  if (hi === lo) return 0;
  return ((close - lo) / (hi - lo)) * 100;
}

export function bollinger(
  values: readonly number[],
  length: number,
  multiplier = 2,
): { middle: number; upper: number; lower: number } | null {
  const middle = sma(values, length);
  const deviation = standardDeviation(values, length);
  if (middle == null || deviation == null) return null;
  return {
    middle,
    upper: middle + deviation * multiplier,
    lower: middle - deviation * multiplier,
  };
}
