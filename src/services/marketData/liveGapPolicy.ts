const INDIA_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const DEFAULT_SESSION_OPEN_MINUTE = 9 * 60 + 15;
const DEFAULT_SESSION_CLOSE_MINUTE = 15 * 60 + 30;

export type LiveGapSpecialSession = Readonly<{
  date: string;
  openMinute: number;
  closeMinute: number;
}>;

/**
 * Detect an unexpected same-session gap in an Indian cash/derivatives feed.
 *
 * FYERS' sequence on this transport is a local websocket receive counter, not a
 * broker-guaranteed exchange sequence. Recovery is therefore driven by exchange
 * timestamps + timeframe. The normal NSE/BSE session defaults to 09:15–15:30 IST;
 * configured holidays and exchange-authorized special sessions override the
 * weekday rule. Overnight, pre-open, post-close, weekend and holiday boundaries
 * are not treated as missing intraday bars.
 */
export function hasUnexpectedIntradayGap(input: {
  instrumentKey: string;
  previousTradeTimeMs: number | undefined;
  currentTradeTimeMs: number | undefined;
  timeframeSeconds: number;
  sessionOpenMinute?: number;
  sessionCloseMinute?: number;
  calendarHolidays?: readonly string[];
  specialSessions?: readonly LiveGapSpecialSession[];
}): boolean {
  const {
    instrumentKey,
    previousTradeTimeMs,
    currentTradeTimeMs,
    timeframeSeconds,
    sessionOpenMinute = DEFAULT_SESSION_OPEN_MINUTE,
    sessionCloseMinute = DEFAULT_SESSION_CLOSE_MINUTE,
    calendarHolidays = [],
    specialSessions = [],
  } = input;
  if (!/^(NSE|BSE):/i.test(String(instrumentKey || '').trim())) return false;
  if (!Number.isFinite(previousTradeTimeMs) || !Number.isFinite(currentTradeTimeMs)) return false;
  if (!Number.isFinite(timeframeSeconds) || timeframeSeconds <= 0) return false;
  if (!Number.isInteger(sessionOpenMinute) || !Number.isInteger(sessionCloseMinute)
    || sessionOpenMinute < 0 || sessionCloseMinute > 1440 || sessionCloseMinute <= sessionOpenMinute) return false;

  const previous = Number(previousTradeTimeMs);
  const current = Number(currentTradeTimeMs);
  if (current <= previous) return false;
  const previousLocal = new Date(previous + INDIA_OFFSET_MS);
  const currentLocal = new Date(current + INDIA_OFFSET_MS);
  const previousIndiaDay = Math.floor((previous + INDIA_OFFSET_MS) / DAY_MS);
  const currentIndiaDay = Math.floor((current + INDIA_OFFSET_MS) / DAY_MS);
  if (previousIndiaDay !== currentIndiaDay) return false;

  const date = currentLocal.toISOString().slice(0, 10);
  const dayOfWeek = currentLocal.getUTCDay();
  const special = specialSessions.find((session) => session.date === date);
  if (!special && (dayOfWeek === 0 || dayOfWeek === 6 || calendarHolidays.includes(date))) return false;

  const openMinute = special?.openMinute ?? sessionOpenMinute;
  const closeMinute = special?.closeMinute ?? sessionCloseMinute;
  if (!Number.isInteger(openMinute) || !Number.isInteger(closeMinute)
    || openMinute < 0 || closeMinute > 1440 || closeMinute <= openMinute) return false;

  const minuteOfDay = (local: Date) => local.getUTCHours() * 60 + local.getUTCMinutes();
  const previousMinute = minuteOfDay(previousLocal);
  const currentMinute = minuteOfDay(currentLocal);
  if (previousMinute < openMinute || previousMinute >= closeMinute
    || currentMinute < openMinute || currentMinute >= closeMinute) return false;

  // Two timeframe durations means at least one whole bar interval has elapsed
  // between observations. We reconcile history; we never fabricate a candle
  // from an LTP-only tick.
  return current - previous >= timeframeSeconds * 2_000;
}
