/** Central policy for standard FYERS OHLCV history requests. */
export const FYERS_HISTORY_WINDOW_DAYS = 7;
export const FYERS_HISTORY_WINDOW_MS = FYERS_HISTORY_WINDOW_DAYS * 86_400_000;

export type FyersHistoryRange = Readonly<{ fromMs: number; toMs: number; clipped: boolean }>;

export class FyersHistoryWindowError extends Error {
  readonly status = 400;
  readonly code = 'FYERS_HISTORY_WINDOW_EXCEEDED';
  constructor(message: string) { super(message); this.name = 'FyersHistoryWindowError'; }
}

function parseTimestamp(value: unknown, endOfDay = false): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const text = String(value ?? '').trim();
  if (!text) return Number.NaN;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const year = Number(dateOnly[1]), month = Number(dateOnly[2]) - 1, day = Number(dateOnly[3]);
    // FYERS date_format=1 date strings represent India exchange-local dates.
    // Convert local midnight/end-of-day to the corresponding UTC instant before
    // sending epoch seconds with date_format=0.
    const indiaOffsetMs = (5 * 60 + 30) * 60_000;
    const startMs = Date.UTC(year, month, day) - indiaOffsetMs;
    return endOfDay
      ? Date.UTC(year, month, day + 1) - indiaOffsetMs - 1
      : startMs;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Intersect a requested range with the trailing seven calendar days. */
export function clampFyersHistoryRange(fromValue: unknown, toValue: unknown, nowMs = Date.now()): FyersHistoryRange | null {
  const requestedFrom = parseTimestamp(fromValue);
  const requestedTo = parseTimestamp(toValue, true);
  const now = Number(nowMs);
  if (!Number.isFinite(requestedFrom) || !Number.isFinite(requestedTo) || !Number.isFinite(now) || now <= 0 || requestedTo <= requestedFrom) {
    throw new FyersHistoryWindowError('FYERS history requires a valid increasing range_from/range_to pair.');
  }
  const floor = now - FYERS_HISTORY_WINDOW_MS;
  const fromMs = Math.max(requestedFrom, floor);
  const toMs = Math.min(requestedTo, now);
  if (toMs <= fromMs) return null;
  return Object.freeze({ fromMs, toMs, clipped: fromMs !== requestedFrom || toMs !== requestedTo });
}

export function fyersHistoryWindowFloorMs(nowMs = Date.now()): number {
  return Number(nowMs) - FYERS_HISTORY_WINDOW_MS;
}

/**
 * Expired F&O history is a separate FYERS product endpoint. It is deliberately
 * not subject to the ordinary seven-day /history window. Daily expiry lookup
 * and daily expired candles use the broker's configured lookback entitlement;
 * intraday expired candles are bounded by their dedicated request/day budget.
 */
export function normalizeFyersExpiredFnoRange(
  fromValue: unknown,
  toValue: unknown,
  maxLookbackYears: number | null = null,
  nowMs = Date.now(),
): FyersHistoryRange | null {
  const requestedFrom = parseTimestamp(fromValue);
  const requestedTo = parseTimestamp(toValue, true);
  const now = Number(nowMs);
  if (!Number.isFinite(requestedFrom) || !Number.isFinite(requestedTo)
    || !Number.isFinite(now) || now <= 0 || requestedTo <= requestedFrom) {
    throw new FyersHistoryWindowError('Expired FYERS F&O history requires a valid increasing range_from/range_to pair.');
  }
  const toMs = Math.min(requestedTo, now);
  const lookbackMs = maxLookbackYears == null
    ? Number.POSITIVE_INFINITY
    : Math.max(1, Number(maxLookbackYears) || 1) * 365.25 * 86_400_000;
  const floor = now - lookbackMs;
  const fromMs = Math.max(requestedFrom, floor);
  if (toMs <= fromMs) return null;
  return Object.freeze({ fromMs, toMs, clipped: fromMs !== requestedFrom || toMs !== requestedTo });
}
