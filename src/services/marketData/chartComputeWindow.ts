import type { HistoricalCandle } from '../brokers/BrokerAdapter';

export type IndicatorLogicalRange = { from: number; to: number };
export type IndicatorComputeWindow = {
  data: HistoricalCandle[];
  startIndex: number;
  endIndex: number;
  visibleFrom: number;
  visibleTo: number;
  warmupBefore: number;
  warmupAfter: number;
  key: string;
};

/** Hard safety ceiling for worker inputs. The data plane may retain more history. */
export const MAX_INDICATOR_COMPUTE_CANDLES = 10_000;

export function selectIndicatorComputeWindow(
  candles: HistoricalCandle[],
  range?: IndicatorLogicalRange | null,
  maxCandles = MAX_INDICATOR_COMPUTE_CANDLES,
): IndicatorComputeWindow {
  const max = Math.max(512, Math.floor(Number(maxCandles) || MAX_INDICATOR_COMPUTE_CANDLES));
  const length = candles.length;
  if (!length) return { data: [], startIndex: 0, endIndex: 0, visibleFrom: 0, visibleTo: 0, warmupBefore: 0, warmupAfter: 0, key: 'empty' };

  if (!range || !Number.isFinite(Number(range.from)) || !Number.isFinite(Number(range.to))) {
    const start = Math.max(0, length - Math.min(length, max));
    const end = length;
    return windowResult(candles, start, end, start, end - 1, 0, 0);
  }

  const visibleFrom = Math.max(0, Math.min(length - 1, Math.floor(Math.min(range.from, range.to))));
  const visibleTo = Math.max(visibleFrom, Math.min(length - 1, Math.ceil(Math.max(range.from, range.to))));
  const visibleCount = visibleTo - visibleFrom + 1;

  if (visibleCount >= max) {
    const start = Math.max(0, Math.min(visibleFrom, visibleTo - max + 1));
    const end = Math.min(length, start + max);
    return windowResult(candles, start, end, visibleFrom, visibleTo, visibleFrom - start, end - 1 - visibleTo);
  }

  const budget = max - visibleCount;
  const before = Math.min(visibleFrom, Math.max(64, Math.floor(budget * 0.65)));
  const after = Math.min(length - visibleTo - 1, Math.max(32, budget - before));
  let start = visibleFrom - before;
  let end = visibleTo + after + 1;

  // At the left/right edge one side may be unavailable. Reallocate unused budget.
  const used = end - start;
  if (used < max) {
    const remaining = max - used;
    const extraBefore = Math.min(start, remaining);
    start -= extraBefore;
    const extraAfter = Math.min(length - end, remaining - extraBefore);
    end += extraAfter;
  }

  return windowResult(candles, start, end, visibleFrom, visibleTo, visibleFrom - start, end - 1 - visibleTo);
}

function windowResult(candles: HistoricalCandle[], start: number, end: number, visibleFrom: number, visibleTo: number, warmupBefore: number, warmupAfter: number): IndicatorComputeWindow {
  const data = candles.slice(start, end);
  const first = data[0]?.timestamp || '';
  const last = data[data.length - 1]?.timestamp || '';
  return { data, startIndex: start, endIndex: end, visibleFrom, visibleTo, warmupBefore, warmupAfter, key: `${start}:${end}:${first}:${last}` };
}
