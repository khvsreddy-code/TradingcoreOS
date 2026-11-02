/**
 * Cold chart startup begins with a viewport-sized real candle page. Enabled
 * studies raise the minimum; older data is demand-loaded through the canonical
 * history plane rather than making every symbol pay for a 5k cold fetch.
 */
export const HISTORICAL_DATASET_MAX_BARS = 5_000;
export const HISTORICAL_RECENT_FYERS_SESSIONS = 3;
export const DEFAULT_INITIAL_HISTORY_CANDLES = 300;
export const MAX_INITIAL_HISTORY_CANDLES = 2_000;
export const HISTORY_LOOKBACK_SAFETY_BARS = 32;

export const INITIAL_HISTORY_CANDLES: Record<string, number> = {
  '1m': 300, '3m': 300, '5m': 300, '10m': 300,
  '15m': 300, '30m': 300, '45m': 300, '60m': 300, '1H': 300,
  '1D': 300, '1day': 300, day: 300,
};

export const HISTORY_PAGE_CANDLES: Record<string, number> = {
  '1m': 1000, '3m': 1000, '5m': 1000, '10m': 1000, '15m': 1000, '30m': 1000, '45m': 1000, '60m': 1000, '1H': 1000, '1D': 1000, '1day': 1000, day: 1000,
};

export const HISTORY_WARM_TARGET_CANDLES: Record<string, number> = {
  '1m': 500, '3m': 500, '5m': 500, '10m': 500, '15m': 500, '30m': 500, '45m': 500, '60m': 500, '1H': 500, '1D': 500, '1day': 500, day: 500,
};

export const HISTORY_MAX_CANDLES = 50_000;

export function initialHistoryCandles(timeframe: string): number {
  return Math.max(100, Math.min(MAX_INITIAL_HISTORY_CANDLES,
    INITIAL_HISTORY_CANDLES[timeframe] ?? DEFAULT_INITIAL_HISTORY_CANDLES));
}

/** Minimum resident history required by enabled native chart indicators. */
export function requiredIndicatorHistoryBars(
  indicators: readonly unknown[] = [],
  safetyBars = HISTORY_LOOKBACK_SAFETY_BARS,
): number {
  let largestWindow = DEFAULT_INITIAL_HISTORY_CANDLES;
  let hasEnabledLookback = false;
  const numeric = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0;
  };
  for (const candidate of indicators) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as Record<string, unknown>;
    if (item.enabled === false) continue;
    const period = numeric(item.period);
    const lookback = numeric(item.lookback);
    const fast = numeric(item.fast);
    const slow = numeric(item.slow);
    const signal = numeric(item.signal);
    const displacement = numeric(item.displacement);
    const mtf = Math.max(1, numeric(item.mtf) || 1);
    const declaredWindow = Math.max(
      period, lookback, slow, fast + signal, period + displacement, slow + displacement,
    );
    if (declaredWindow > 0) hasEnabledLookback = true;
    largestWindow = Math.max(largestWindow, Math.ceil(declaredWindow * mtf));
  }
  return Math.min(HISTORY_MAX_CANDLES,
    Math.max(DEFAULT_INITIAL_HISTORY_CANDLES, largestWindow + (hasEnabledLookback ? Math.max(0, Math.ceil(Number(safetyBars) || 0)) : 0)));
}

export function historyPageCandles(timeframe: string): number {
  return HISTORY_PAGE_CANDLES[timeframe] ?? 1000;
}

export function historyDemandPageCandles(timeframe: string, visibleBars: number): number {
  const base = initialHistoryCandles(timeframe);
  const bars = Math.max(1, Math.ceil(Number(visibleBars) || 1));
  return Math.max(250, Math.min(1500, Math.max(base, bars * 4)));
}

export function historyDemandLeadBars(timeframe: string, visibleBars: number): number {
  const page = historyDemandPageCandles(timeframe, visibleBars);
  const bars = Math.max(1, Math.ceil(Number(visibleBars) || 1));
  return Math.max(24, Math.min(Math.ceil(page * 0.35), Math.ceil(bars * 0.6)));
}

export function historyWarmTarget(timeframe: string): number {
  return HISTORY_WARM_TARGET_CANDLES[timeframe] ?? 500;
}

export function shouldLoadOlderHistory(range: { from: number; to: number }, candleCount: number, timeframe: string): boolean {
  const from = Number(range.from);
  const to = Number(range.to);
  const count = Math.max(0, Number(candleCount) || 0);
  if (!Number.isFinite(from) || !Number.isFinite(to) || count < 2) return false;
  return from <= historyDemandLeadBars(timeframe, Math.max(1, Math.abs(to - from)));
}
