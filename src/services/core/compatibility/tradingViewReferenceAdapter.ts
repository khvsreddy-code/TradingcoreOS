import { HistoricalCandle } from '../../brokers/BrokerAdapter';

export type SeriesPoint = { time: number; value: number | null };
export type CompatibilityResult = {
  indicatorId: string;
  maxAbsError: number;
  comparedPoints: number;
  mismatches: number;
  pass: boolean;
};

/**
 * Contract only: an external/reference implementation can be plugged in for
 * research. The adapter is deliberately not part of broker execution or live
 * trading. This keeps the browser OS independent from any unofficial client.
 */
export interface IndicatorReferenceAdapter {
  evaluate(indicatorId: string, bars: HistoricalCandle[], parameters: Record<string, unknown>): Promise<SeriesPoint[]>;
}

export function compareSeries(local: SeriesPoint[], reference: SeriesPoint[], tolerance = 1e-6): CompatibilityResult {
  const count = Math.min(local.length, reference.length);
  let maxAbsError = 0;
  let mismatches = 0;
  for (let i = 0; i < count; i++) {
    const a = local[i]?.value;
    const b = reference[i]?.value;
    if (a == null || b == null) continue;
    const error = Math.abs(a - b);
    maxAbsError = Math.max(maxAbsError, error);
    if (error > tolerance) mismatches++;
  }
  return { indicatorId: 'unknown', maxAbsError, comparedPoints: count, mismatches, pass: mismatches === 0 };
}
