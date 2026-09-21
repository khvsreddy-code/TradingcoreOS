/** Pure indicator math shared by CoreSpirit runtime/tests. No chart, network or broker dependencies. */
export function mean(values: readonly number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function sma(values: readonly number[], length: number): number | null {
  if (length < 1 || values.length < length) return null;
  return mean(values.slice(0, length));
}

export function highest(values: readonly number[], length: number): number | null {
  if (length < 1 || values.length < length) return null;
  return Math.max(...values.slice(0, length));
}

export function lowest(values: readonly number[], length: number): number | null {
  if (length < 1 || values.length < length) return null;
  return Math.min(...values.slice(0, length));
}

export function emaStep(current: number, previous: number | null, seedValues: readonly number[], length: number): number | null {
  if (!Number.isFinite(current) || length < 1 || seedValues.length < length) return null;
  const alpha = 2 / (length + 1);
  const seed = mean(seedValues.slice(0, length));
  return seed == null ? null : previous == null || !Number.isFinite(previous) ? seed : alpha * current + (1 - alpha) * previous;
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
  const window = values.slice(0, length); const m = mean(window); if (m == null) return null;
  return Math.sqrt(mean(window.map(v => (v - m) ** 2)) || 0);
}

export function wma(values: readonly number[], length: number): number | null {
  if (length < 1 || values.length < length) return null;
  const w = length * (length + 1) / 2; let total = 0;
  for (let i=0;i<length;i++) total += values[i] * (length-i);
  return total / w;
}

export function stochastic(highs: readonly number[], lows: readonly number[], closes: readonly number[], length: number): number | null {
  if (length < 1 || highs.length < length || lows.length < length || closes.length < length) return null;
  const hi = Math.max(...highs.slice(0,length)); const lo = Math.min(...lows.slice(0,length));
  const c = closes[0]; if (!Number.isFinite(c) || hi === lo) return 0;
  return ((c-lo)/(hi-lo))*100;
}

export function bollinger(values: readonly number[], length: number, multiplier=2): { middle:number; upper:number; lower:number } | null {
  const middle = sma(values,length); const dev = standardDeviation(values,length); if (middle == null || dev == null) return null;
  return { middle, upper: middle + dev*multiplier, lower: middle - dev*multiplier };
}
