export const INITIAL_HISTORY_CANDLES: Record<string, number> = {
  '1m': 1_500,
  '3m': 1_200,
  '5m': 900,
  '15m': 600,
  '30m': 450,
  '1H': 360,
  '1D': 300,
};

export const HISTORY_PAGE_CANDLES: Record<string, number> = {
  '1m': 1_200,
  '3m': 1_000,
  '5m': 900,
  '15m': 750,
  '30m': 600,
  '1H': 450,
  '1D': 300,
};

export const HISTORY_WARM_TARGET_CANDLES: Record<string, number> = {
  '1m': 2_500,
  '3m': 2_200,
  '5m': 1_800,
  '15m': 1_300,
  '30m': 1_000,
  '1H': 720,
  '1D': 500,
};

export const HISTORY_MAX_CANDLES = 50_000;

export function initialHistoryCandles(timeframe: string): number {
  return INITIAL_HISTORY_CANDLES[timeframe] ?? 900;
}

export function historyPageCandles(timeframe: string): number {
  return HISTORY_PAGE_CANDLES[timeframe] ?? 750;
}



/**
 * Select a bounded older-history page from the user's current viewport.
 * Small viewports should not pull a full page when only a few hundred bars are
 * needed; larger viewports are capped by the normal timeframe page budget.
 */
export function historyDemandPageCandles(timeframe: string, visibleBars: number): number {
  const base = historyPageCandles(timeframe);
  const bars = Math.max(1, Math.ceil(Number(visibleBars) || 1));
  const demand = Math.max(300, Math.ceil(bars * 1.8));
  return Math.max(300, Math.min(base, demand));
}

export function historyDemandLeadBars(timeframe: string, visibleBars: number): number {
  const page = historyDemandPageCandles(timeframe, visibleBars);
  const bars = Math.max(1, Math.ceil(Number(visibleBars) || 1));
  return Math.max(24, Math.min(Math.ceil(page * 0.35), Math.ceil(bars * 0.6)));
}

export function historyWarmTarget(timeframe: string): number {
  return HISTORY_WARM_TARGET_CANDLES[timeframe] ?? 1_800;
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
