/**
 * The default server dataset is the merged 5,000-bar window. Chart pages remain
 * viewport-driven; the server's tvdatafeed source cannot page to arbitrary ends.
 */
export const HISTORICAL_DATASET_MAX_BARS = 2_000;
export const HISTORICAL_RECENT_FYERS_SESSIONS = 3;

export const INITIAL_HISTORY_CANDLES: Record<string, number> = {
  '1m': 2000, '3m': 2000, '5m': 2000, '10m': 2000,
  '15m': 2000, '30m': 2000, '45m': 2000, '60m': 2000, '1H': 2000,
  '1D': 2000, '1day': 2000, day: 2000,
};

export const HISTORY_PAGE_CANDLES: Record<string, number> = {
  '1m': 1000, '3m': 1000, '5m': 1000, '10m': 1000, '15m': 1000, '30m': 1000, '45m': 1000, '60m': 1000, '1H': 1000, '1D': 1000, '1day': 1000, day: 1000,
};

export const HISTORY_WARM_TARGET_CANDLES: Record<string, number> = {
  // No eager 5k background history burst: older data is demand-loaded as needed.
  '1m': 500, '3m': 500, '5m': 500, '10m': 500, '15m': 500, '30m': 500, '45m': 500, '60m': 500, '1H': 500, '1D': 500, '1day': 500, day: 500,
};

export const HISTORY_MAX_CANDLES = 50_000;

export function initialHistoryCandles(timeframe: string): number {
  return Math.min(HISTORICAL_DATASET_MAX_BARS, INITIAL_HISTORY_CANDLES[timeframe] ?? HISTORICAL_DATASET_MAX_BARS);
}

export function historyPageCandles(timeframe: string): number {
  return HISTORY_PAGE_CANDLES[timeframe] ?? 1000;
}



/**
 * Select a bounded older-history page from the user's current viewport.
 * Small viewports should not pull a full page when only a few hundred bars are
 * needed; larger viewports are capped by the normal timeframe page budget.
 */
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

/** Trigger a visible-range request only when the user is approaching the
 * currently loaded left edge. The threshold scales with viewport density, not
 * with total history target size, so a deep 50k cache never causes a crawl. */
export function shouldLoadOlderHistory(range: { from: number; to: number }, candleCount: number, timeframe: string): boolean {
  const from = Number(range.from);
  const to = Number(range.to);
  const count = Math.max(0, Number(candleCount) || 0);
  if (!Number.isFinite(from) || !Number.isFinite(to) || count < 2) return false;
  const visibleBars = Math.max(1, Math.abs(to - from));
  const lead = historyDemandLeadBars(timeframe, visibleBars);
  return from <= lead;
}
