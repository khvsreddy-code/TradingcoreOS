import { HistoricalCandle } from '../brokers/BrokerAdapter';

/** Canonical deterministic time-series math used by the native indicator layer. */
export function sma(values: number[], period: number): Array<number | null> {
  const p = Math.max(1, Math.floor(period));
  const out: Array<number | null> = [];
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= p) sum -= values[i - p];
    out.push(i + 1 >= p ? sum / p : null);
  }
  return out;
}

/** EMA seeded from the first complete SMA window, then recursively updated. */
/** Weighted moving average shared by HMA-family dependency nodes. */
export function wma(values: Array<number | null>, period: number): Array<number | null> {
  const p = Math.max(1, Math.floor(period));
  const out: Array<number | null> = values.map(() => null);
  const denom = (p * (p + 1)) / 2;
  let rollingSum = 0;
  let weightedSum = 0;
  let validRun = 0;
  for (let i = 0; i < values.length; i += 1) {
    const current = values[i];
    if (current == null || !Number.isFinite(current)) {
      rollingSum = 0;
      weightedSum = 0;
      validRun = 0;
      continue;
    }
    if (validRun < p) {
      validRun += 1;
      rollingSum += current;
      weightedSum += current * validRun;
      if (validRun === p) out[i] = weightedSum / denom;
      continue;
    }
    const leaving = Number(values[i - p]);
    const previousWindowSum = rollingSum;
    rollingSum = rollingSum + current - leaving;
    // Shift every existing weight down by one, then give the new value the
    // highest weight p.
    weightedSum = weightedSum + current * p - previousWindowSum;
    out[i] = weightedSum / denom;
  }
  return out;
}

export function ema(values: number[], period: number): Array<number | null> {
  const p = Math.max(1, Math.floor(period));
  const alpha = 2 / (p + 1);
  const out: Array<number | null> = [];
  let previous: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    if (i < p - 1) { out.push(null); continue; }
    if (previous == null) {
      let sum = 0;
      for (let j = i - p + 1; j <= i; j += 1) sum += values[j];
      previous = sum / p;
    } else {
      previous = alpha * values[i] + (1 - alpha) * previous;
    }
    out.push(previous);
  }
  return out;
}

/** Wilder/RMA smoothing with an SMA seed. */
export function rma(values: number[], period: number): Array<number | null> {
  const p = Math.max(1, Math.floor(period));
  const out: Array<number | null> = [];
  let previous: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    if (i < p - 1) { out.push(null); continue; }
    if (previous == null) {
      let sum = 0;
      for (let j = i - p + 1; j <= i; j += 1) sum += values[j];
      previous = sum / p;
    } else previous = ((p - 1) * previous + values[i]) / p;
    out.push(previous);
  }
  return out;
}

export function trueRanges(candles: HistoricalCandle[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const previousClose = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - previousClose), Math.abs(c.low - previousClose));
  });
}

export function atr(candles: HistoricalCandle[], period: number): Array<number | null> {
  return rma(trueRanges(candles), period);
}

export function rsi(values: number[], period: number): Array<number | null> {
  const p = Math.max(1, Math.floor(period));
  const out: Array<number | null> = values.map(() => null);
  if (values.length <= p) return out;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    gains.push(Math.max(delta, 0));
    losses.push(Math.max(-delta, 0));
  }
  let avgGain = gains.slice(0, p).reduce((a, b) => a + b, 0) / p;
  let avgLoss = losses.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < values.length; i += 1) {
    if (i > p) {
      const gi = i - 1;
      avgGain = ((p - 1) * avgGain + gains[gi]) / p;
      avgLoss = ((p - 1) * avgLoss + losses[gi]) / p;
    }
    out[i] = avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - (100 / (1 + avgGain / avgLoss));
  }
  return out;
}

export function sessionVwap(candles: HistoricalCandle[], source: (c: HistoricalCandle) => number, timezone = 'Asia/Kolkata') {
  const out: Array<number | null> = [];
  const state = new Map<string, { pv: number; volume: number }>();
  for (const candle of candles) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(candle.timestamp));
    const bucket = state.get(day) || { pv: 0, volume: 0 };
    const volume = Math.max(0, Number(candle.volume) || 0);
    bucket.pv += source(candle) * volume;
    bucket.volume += volume;
    state.set(day, bucket);
    out.push(bucket.volume > 0 ? bucket.pv / bucket.volume : null);
  }
  return out;
}
