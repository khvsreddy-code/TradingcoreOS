/** Pure scalar indicator helpers used by CoreSpirit. Production rolling work is delegated to canonical stateful kernels. */
import {
  RollingMean,
  RollingMinMax,
  RollingVariance,
  WMAState,
} from './statefulIndicatorKernel';

export function mean(values: readonly number[]): number | null {
  if (!values.length) return null;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += Number(values[i]);
  return sum / values.length;
}

function finiteWindowMean(values: readonly number[], length: number): number | null {
  const state = new RollingMean(length);
  const count = Math.min(values.length, Math.max(1, Math.floor(length)));
  for (let i = 0; i < count; i += 1) state.update(Number(values[i]));
  return state.size === count && count === Math.max(1, Math.floor(length)) ? state.value() : null;
}

export function sma(values: readonly number[], length: number): number | null {
  if (length < 1 || values.length < length) return null;
  return finiteWindowMean(values, length);
}

export function highest(values: readonly number[], length: number): number | null {
  if (length < 1 || values.length < length) return null;
  const state = new RollingMinMax(length);
  for (let i = 0; i < length; i += 1) state.update(Number(values[i]));
  return state.max();
}

export function lowest(values: readonly number[], length: number): number | null {
  if (length < 1 || values.length < length) return null;
  const state = new RollingMinMax(length);
  for (let i = 0; i < length; i += 1) state.update(Number(values[i]));
  return state.min();
}

export function emaStep(
  current: number,
  previous: number | null,
  seedValues: readonly number[],
  length: number,
): number | null {
  if (!Number.isFinite(current) || length < 1 || seedValues.length < length) return null;
  const seed = finiteWindowMean(seedValues, length);
  if (seed == null) return null;
  if (previous == null || !Number.isFinite(previous)) return seed;
  const alpha = 2 / (length + 1);
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
  if (length < 1 || values.length < length) return null;
  const state = new RollingVariance(length);
  for (let i = 0; i < length; i += 1) state.update(Number(values[i]));
  return state.value();
}

export function wma(values: readonly number[], length: number): number | null {
  if (length < 1 || values.length < length) return null;
  const state = new WMAState(length);
  for (let i = 0; i < length; i += 1) state.update(Number(values[i]));
  return state.value ?? null;
}

export function stochastic(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  length: number,
): number | null {
  if (length < 1 || highs.length < length || lows.length < length || closes.length < length) return null;
  const highState = new RollingMinMax(length);
  const lowState = new RollingMinMax(length);
  for (let i = 0; i < length; i += 1) {
    highState.update(Number(highs[i]));
    lowState.update(Number(lows[i]));
  }
  const hi = highState.max();
  const lo = lowState.min();
  const c = Number(closes[0]);
  if (hi == null || lo == null || !Number.isFinite(c) || hi === lo) return 0;
  return ((c - lo) / (hi - lo)) * 100;
}

export function bollinger(
  values: readonly number[],
  length: number,
  multiplier = 2,
): { middle: number; upper: number; lower: number } | null {
  const middle = sma(values, length);
  const dev = standardDeviation(values, length);
  if (middle == null || dev == null) return null;
  return { middle, upper: middle + dev * multiplier, lower: middle - dev * multiplier };
}
