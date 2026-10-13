export const INITIAL_HISTORY_CANDLES: Record<string, number> = {
  // Fast first paint and fast timeframe switches: fetch a bounded 500-bar window,
  // then request older pages only when the user scrolls toward the loaded edge.
  '1m': 500,
  '3m': 500,
  '5m': 500,
  '10m': 500,
  '15m': 500,
  '30m': 500,
  '1H': 500,
  '1D': 500,
};

export const HISTORY_PAGE_CANDLES: Record<string, number> = {
  '1m': 1000, '3m': 1000, '5m': 1000, '10m': 1000, '15m': 1000, '30m': 1000, '1H': 1000, '1D': 1000,
};

export const HISTORY_WARM_TARGET_CANDLES: Record<string, number> = {
  // No eager 5k background history burst: older data is demand-loaded as needed.
  '1m': 500, '3m': 500, '5m': 500, '10m': 500, '15m': 500, '30m': 500, '1H': 500, '1D': 500,
};

export const HISTORY_MAX_CANDLES = 50_000;

export function initialHistoryCandles(timeframe: string): number {
  return INITIAL_HISTORY_CANDLES[timeframe] ?? 500;
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
