const INDIA_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/**
 * Detect an unexpected same-session gap in an Indian cash/derivatives feed.
 *
 * FYERS' sequence on this transport is a local websocket receive counter, not a
 * broker-guaranteed exchange sequence. For that reason recovery is driven by
 * exchange timestamps + timeframe, and only where both timestamps belong to the
 * same India calendar date. Overnight/weekend boundaries remain normal session
 * transitions and are not flagged here.
 */
export function hasUnexpectedIntradayGap(input: {
  instrumentKey: string;
  previousTradeTimeMs: number | undefined;
  currentTradeTimeMs: number | undefined;
  timeframeSeconds: number;
}): boolean {
  const { instrumentKey, previousTradeTimeMs, currentTradeTimeMs, timeframeSeconds } = input;
  if (!/^(NSE|BSE):/i.test(String(instrumentKey || '').trim())) return false;
  if (!Number.isFinite(previousTradeTimeMs) || !Number.isFinite(currentTradeTimeMs)) return false;
  if (!Number.isFinite(timeframeSeconds) || timeframeSeconds <= 0) return false;
  const previous = Number(previousTradeTimeMs);
  const current = Number(currentTradeTimeMs);
  if (current <= previous) return false;
  const previousIndiaDay = Math.floor((previous + INDIA_OFFSET_MS) / DAY_MS);
  const currentIndiaDay = Math.floor((current + INDIA_OFFSET_MS) / DAY_MS);
  if (previousIndiaDay !== currentIndiaDay) return false;
  // Two timeframe durations means at least one whole bar interval has elapsed
  // between observations. This deliberately errs toward reconciliation, never
  // toward fabricating a candle from an LTP-only tick.
  return current - previous >= timeframeSeconds * 2_000;
}
