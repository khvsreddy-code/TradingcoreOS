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
    return endOfDay
      ? Date.UTC(year, month, day, 23, 59, 59, 999)
      : Date.UTC(year, month, day);
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
