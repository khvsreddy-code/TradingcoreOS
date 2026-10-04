import type { HistoricalCandle } from '../brokers/BrokerAdapter';

export type IndicatorLogicalRange = { from: number; to: number };
export type IndicatorComputeBounds = {
  startIndex: number;
  endIndex: number;
  visibleFrom: number;
  visibleTo: number;
  warmupBefore: number;
  warmupAfter: number;
  key: string;
};

export type IndicatorComputeWindow = IndicatorComputeBounds & {
  data: HistoricalCandle[];
};

/** Hard safety ceiling for worker inputs. The data plane may retain more history. */
export const MAX_INDICATOR_COMPUTE_CANDLES = 10_000;

/**
 * Select compute bounds without touching the candle representation. This is the
 * columnar-first companion to selectIndicatorComputeWindow and is used before a
 * worker packet is created.
 */
export function selectIndicatorComputeBounds(
  length: number,
  range?: IndicatorLogicalRange | null,
  maxCandles = MAX_INDICATOR_COMPUTE_CANDLES,
): IndicatorComputeBounds {
  const max = Math.max(512, Math.floor(Number(maxCandles) || MAX_INDICATOR_COMPUTE_CANDLES));
  const size = Math.max(0, Math.floor(Number(length) || 0));
  if (!size) return { startIndex: 0, endIndex: 0, visibleFrom: 0, visibleTo: 0, warmupBefore: 0, warmupAfter: 0, key: 'empty' };

  if (!range || !Number.isFinite(Number(range.from)) || !Number.isFinite(Number(range.to))) {
    const start = Math.max(0, size - Math.min(size, max));
    return boundsResult(start, size, start, size - 1, 0, 0);
  }

  const visibleFrom = Math.max(0, Math.min(size - 1, Math.floor(Math.min(range.from, range.to))));
  const visibleTo = Math.max(visibleFrom, Math.min(size - 1, Math.ceil(Math.max(range.from, range.to))));
  const visibleCount = visibleTo - visibleFrom + 1;

  if (visibleCount >= max) {
    const start = Math.max(0, Math.min(visibleFrom, visibleTo - max + 1));
    const end = Math.min(size, start + max);
    return boundsResult(start, end, visibleFrom, visibleTo, visibleFrom - start, end - 1 - visibleTo);
  }

  const budget = max - visibleCount;
  const before = Math.min(visibleFrom, Math.max(64, Math.floor(budget * 0.65)));
  const after = Math.min(size - visibleTo - 1, Math.max(32, budget - before));
  let start = visibleFrom - before;
  let end = visibleTo + after + 1;

  // At the left/right edge one side may be unavailable. Reallocate unused budget.
  const used = end - start;
  if (used < max) {
    const remaining = max - used;
    const extraBefore = Math.min(start, remaining);
    start -= extraBefore;
    const extraAfter = Math.min(size - end, remaining - extraBefore);
    end += extraAfter;
  }

  return boundsResult(start, end, visibleFrom, visibleTo, visibleFrom - start, end - 1 - visibleTo);
}

export function selectIndicatorComputeWindow(
  candles: HistoricalCandle[],
  range?: IndicatorLogicalRange | null,
  maxCandles = MAX_INDICATOR_COMPUTE_CANDLES,
): IndicatorComputeWindow {
  const bounds = selectIndicatorComputeBounds(candles.length, range, maxCandles);
  const data = candles.slice(bounds.startIndex, bounds.endIndex);
  const first = data[0]?.timestamp || '';
  const last = data[data.length - 1]?.timestamp || '';
  return { ...bounds, data, key: `${bounds.startIndex}:${bounds.endIndex}:${first}:${last}` };
}

function boundsResult(start: number, end: number, visibleFrom: number, visibleTo: number, warmupBefore: number, warmupAfter: number): IndicatorComputeBounds {
  return {
    startIndex: start,
    endIndex: end,
    visibleFrom,
    visibleTo,
    warmupBefore,
    warmupAfter,
    key: `${start}:${end}`
  };
}
