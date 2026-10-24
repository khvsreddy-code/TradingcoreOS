import type { HistoricalCandle } from '../../brokers/BrokerAdapter';

export type ReplayValidationResult = { valid: boolean; errors: string[]; normalizedBars: HistoricalCandle[] };

/** Rejects bad ordering and malformed OHLC instead of silently sorting source data. */
export function validateReplayBars(bars: HistoricalCandle[]): ReplayValidationResult {
  const errors: string[] = [];
  const normalized = (Array.isArray(bars) ? bars : []).map(bar => ({ ...bar }));
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < normalized.length; index += 1) {
    const bar = normalized[index]!;
    const timestamp = Date.parse(String(bar.timestamp));
    const numbers = [Number(bar.open), Number(bar.high), Number(bar.low), Number(bar.close), Number(bar.volume)];
    const open = numbers[0]!;
    const high = numbers[1]!;
    const low = numbers[2]!;
    const close = numbers[3]!;
    const volume = numbers[4]!;
    if (!Number.isFinite(timestamp)) errors.push('bar ' + index + ': invalid timestamp');
    if (numbers.slice(0, 4).some(value => !Number.isFinite(value))) errors.push('bar ' + index + ': invalid OHLC');
    if (numbers.slice(0, 4).some(value => value <= 0)) errors.push('bar ' + index + ': OHLC prices must be positive');
    if (Number.isFinite(high) && Number.isFinite(low) && high < low) errors.push('bar ' + index + ': high is below low');
    if (numbers.slice(0, 4).every(value => Number.isFinite(value))) {
      if (high < Math.max(open, close, low)) errors.push('bar ' + index + ': high does not contain open/close/low');
      if (low > Math.min(open, close, high)) errors.push('bar ' + index + ': low does not contain open/close/high');
    }
    if (!Number.isFinite(volume) || volume < 0) errors.push('bar ' + index + ': volume must be finite and non-negative');
    if (Number.isFinite(timestamp)) {
      if (timestamp === previousTimestamp) errors.push('bar ' + index + ': duplicate timestamp');
      else if (timestamp < previousTimestamp) errors.push('bar ' + index + ': input must be strictly chronological; refusing to reorder source data');
      previousTimestamp = timestamp;
    }
  }
  return { valid: errors.length === 0, errors, normalizedBars: normalized };
}
