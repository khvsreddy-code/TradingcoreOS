import { tradingApi, readTradingApiJson } from '../http/tradingApi';
import type { HistoricalCandle, HistoricalCandleColumns, HistoricalDataMetadata } from '../brokers/BrokerAdapter';

export type CoreSpiritResearchHistoryQuery = {
  symbol: string;
  timeframe: string;
  limit?: number;
  before?: string | number;
  format?: 'bars' | 'columns';
};

export type CoreSpiritResearchHistoryResult = {
  success: true;
  symbol: string;
  timeframe: string;
  data: HistoricalCandle[] | HistoricalCandleColumns;
  requested: number;
  returned: number;
  oldestTimestamp: string | null;
  newestTimestamp: string | null;
  metadata: HistoricalDataMetadata;
};

/**
 * Read the same authenticated, source-validated history used by charts and production inference.
 * Columns mode includes per-bar source, phase, confirmation, availability and revision sidecars.
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
  const payload = await readTradingApiJson<any>(response);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'Canonical research history is unavailable.');
  }
  return payload as CoreSpiritResearchHistoryResult;
}
