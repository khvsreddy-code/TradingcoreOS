import { tradingApi, readTradingApiJson } from '../http/tradingApi';
import type { CoreSpiritMarketBar } from '../coreSpirit/marketData';

export type CoreSpiritResearchHistoryQuery = {
  symbol: string;
  timeframe: string;
  limit?: number;
  before?: string | number;
  format?: 'bars' | 'columns';
};

export type CoreSpiritResearchHistoryMetadata = Readonly<{
  instrumentId: string;
  timeframe: string;
  revision: number;
  sourcePolicy: string;
  maxBars: number;
  barCount: number;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
  cacheHit: boolean;
  stale: boolean;
  degraded: boolean;
  historyExhausted?: boolean;
  paginationSupported?: boolean;
  historyCompleteness?: Record<string, unknown>;
  calendarPolicy?: string;
  sourceStatus: Record<string, unknown>;
}>;

export type CoreSpiritResearchHistoryColumns = Readonly<{
  time: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  timeUnit: 'milliseconds' | 'seconds';
  source?: string[];
  exchangeTime?: number[];
  ingestedAt?: number[];
  timeframe?: string;
  phase?: string[];
  confirmed?: boolean[];
  availableAt?: number[];
  revision?: number[];
  metadata?: CoreSpiritResearchHistoryMetadata;
}>;

export type CoreSpiritResearchHistoryResult = Readonly<{
  success: true;
  symbol: string;
  timeframe: string;
  data: CoreSpiritMarketBar[] | CoreSpiritResearchHistoryColumns;
  requested: number;
  returned: number;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
  metadata: CoreSpiritResearchHistoryMetadata;
}>;

/**
 * Host-owned authenticated history transport for CoreSpirit research.
 * Provider adapters and broker-specific HTTP clients stay outside CoreSpirit's
 * compiler/runtime package; this is the host boundary that supplies neutral bars.
 */
export async function fetchCoreSpiritResearchHistory(
  query: CoreSpiritResearchHistoryQuery,
): Promise<CoreSpiritResearchHistoryResult> {
  const params = new URLSearchParams({
    symbol: String(query.symbol || ''),
    timeframe: String(query.timeframe || ''),
    limit: String(Math.max(1, Math.min(5000, Math.floor(Number(query.limit) || 5000)))),
  });
  if (query.before !== undefined) params.set('before', String(query.before));
  if (query.format === 'columns') params.set('format', 'columns');

  const response = await tradingApi('/api/corespirit/research/history?' + params.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const payload = await readTradingApiJson<CoreSpiritResearchHistoryResult>(response);
  if (!response.ok || !payload?.success) {
    throw new Error((payload as any)?.error || 'Canonical research history is unavailable.');
  }
  return payload;
}
