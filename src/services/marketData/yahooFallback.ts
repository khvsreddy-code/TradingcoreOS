import type { HistoricalCandle } from '../brokers/BrokerAdapter';
import type { NormalizedMarketTick } from '../../types/market';
import { tradingApi, readTradingApiJson } from '../http/tradingApi';
import type { OHLCV, ColumnarBars, BarRange } from '../core/chart/velaNativeChartKernel';

export const YAHOO_FALLBACK_POLL_MS = 4_000;

type FyersLikeConnection = Readonly<{
  brokerId?: string;
  status?: string;
  tokenExpiry?: string;
}>;

/** A FYERS token without a future expiry is not treated as an authenticated live session. */
export function hasValidFyersSession(connections: readonly FyersLikeConnection[], now = Date.now()): boolean {
  return connections.some(connection => {
    if (String(connection.brokerId || '').toLowerCase() !== 'fyers') return false;
    if (connection.status !== 'Connected' && connection.status !== 'Read Only') return false;
    const expiresAt = Date.parse(String(connection.tokenExpiry || ''));
    return Number.isFinite(expiresAt) && expiresAt > now + 5_000;
  });
}

type YahooBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source?: 'unknown';
  phase?: 'historical' | 'developing';
  confirmed?: boolean;
  availableAt?: string;
};
type YahooPayload = {
  success?: boolean;
  provider?: string;
  delayed?: boolean;
  stale?: boolean;
  fetchedAt?: string;
  sourceUpdatedAt?: string | null;
  bars?: YahooBar[];
  quote?: {
    ltp?: number;
    change?: number | null;
    changePercent?: number | null;
    previousClose?: number | null;
    dayHigh?: number | null;
    dayLow?: number | null;
    volume?: number | null;
    timestamp?: string | null;
  } | null;
  lastBar?: YahooBar | null;
  items?: Array<{
    symbol: string;
    success?: boolean;
    quote?: YahooPayload['quote'];
    fetchedAt?: string;
    sourceUpdatedAt?: string | null;
    error?: string;
  }>;
  error?: string;
};

function normalizeTimeframe(value: string): string {
  const raw = String(value || '5').trim();
  const upper = raw.toUpperCase();
  if (['D', '1D', 'DAY', 'DAILY'].includes(upper)) return 'D';
  if (['W', '1W', 'WEEK', 'WEEKLY'].includes(upper)) return 'W';
  // Preserve case: Vela's lowercase m denotes minutes, uppercase M denotes months.
  if (/^\d+m$/.test(raw)) return raw.slice(0, -1);
  if (/^\d+min$/i.test(raw)) return upper.replace(/MIN$/, '');
  if (/^\d+$/.test(raw)) return raw;
  if (['M', '1M', '1MTH', 'MONTH', 'MONTHLY'].includes(upper) && raw === upper) return 'M';
  if (/^\d+M$/.test(raw) && raw === upper) return raw;
  return upper.replace(/MIN$/, '').replace(/M$/, '');
}
function rangeQuery(range?: BarRange): string {
  if (!range) return '';
  const params = new URLSearchParams();
  const from = Number(range.from), to = Number(range.to);
  if (Number.isFinite(from) && from > 0) params.set('from', String(from));
  if (Number.isFinite(to) && to > 0) params.set('to', String(to));
  return params.toString() ? `&${params.toString()}` : '';
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await tradingApi(path, { signal, cache: 'no-store' });
  const payload = await readTradingApiJson<YahooPayload>(response);
  if (!response.ok || payload.success !== true) {
    throw new Error(payload.error || `Yahoo Finance fallback request failed (HTTP ${response.status}).`);
  }
  return payload as T;
}

function toOhlcv(bar: YahooBar): OHLCV | null {
  const parsed = Date.parse(bar.timestamp);
  const values = [bar.open, bar.high, bar.low, bar.close, bar.volume];
  if (!Number.isFinite(parsed) || !values.every(value => Number.isFinite(Number(value)))) return null;
  return {
    time: parsed,
    open: Number(bar.open),
    high: Number(bar.high),
    low: Number(bar.low),
    close: Number(bar.close),
    volume: Math.max(0, Number(bar.volume) || 0),
  };
}

export async function loadYahooBars(
  symbol: string,
  timeframe: string,
  limit = 2_000,
  range?: BarRange,
  signal?: AbortSignal,
): Promise<OHLCV[]> {
  const interval = normalizeTimeframe(timeframe);
  const url = `/api/market-data/yahoo/chart?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${Math.max(1, Math.min(2_000, Math.floor(limit) || 2_000))}${rangeQuery(range)}`;
  const payload = await request<YahooPayload>(url, signal);
  return (payload.bars || []).map(toOhlcv).filter((bar): bar is OHLCV => bar !== null);
}

export async function loadYahooColumns(
  symbol: string,
  timeframe: string,
  limit = 2_000,
  range?: BarRange,
  signal?: AbortSignal,
): Promise<ColumnarBars> {
  const bars = await loadYahooBars(symbol, timeframe, limit, range, signal);
  return {
    time: Float64Array.from(bars, bar => bar.time),
    open: Float64Array.from(bars, bar => bar.open),
    high: Float64Array.from(bars, bar => bar.high),
    low: Float64Array.from(bars, bar => bar.low),
    close: Float64Array.from(bars, bar => bar.close),
    volume: Float64Array.from(bars, bar => Number(bar.volume) || 0),
    length: bars.length,
    timeUnit: 'milliseconds',
  };
}

export async function loadYahooLatestBar(
  symbol: string,
  timeframe: string,
  signal?: AbortSignal,
): Promise<{ bar: OHLCV | null; quote: YahooPayload['quote']; fetchedAt: string }> {
  const interval = normalizeTimeframe(timeframe);
  const payload = await request<YahooPayload>(`/api/market-data/yahoo/quote?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`, signal);
  return {
    bar: payload.lastBar ? toOhlcv(payload.lastBar) : null,
    quote: payload.quote || null,
    fetchedAt: payload.fetchedAt || new Date().toISOString(),
  };
}

export async function loadYahooQuoteTicks(symbols: readonly string[], signal?: AbortSignal): Promise<Map<string, NormalizedMarketTick>> {
  const uniqueSymbols = [...new Set(symbols.map(value => String(value).trim()).filter(Boolean))].slice(0, 50);
  const result = new Map<string, NormalizedMarketTick>();
  if (!uniqueSymbols.length) return result;
  // The authenticated server endpoint intentionally caps one batch at 10 symbols.
  // Chunk larger watchlists rather than silently leaving their tail without quotes.
  for (let start = 0; start < uniqueSymbols.length; start += 10) {
    const batch = uniqueSymbols.slice(start, start + 10);
    const payload = await request<YahooPayload>(
      `/api/market-data/yahoo/quotes?symbols=${encodeURIComponent(batch.join(','))}`,
      signal,
    );
    for (const item of payload.items || []) {
      if (!item.success || !item.quote || !Number.isFinite(Number(item.quote.ltp))) continue;
      const quote = item.quote;
      const fetchedAt = item.fetchedAt ? Date.parse(item.fetchedAt) : Date.now();
      const tick: NormalizedMarketTick = {
        instrumentKey: item.symbol,
        ltp: Number(quote.ltp),
        close: Number(quote.ltp),
        open: undefined,
        high: quote.dayHigh == null ? undefined : Number(quote.dayHigh),
        low: quote.dayLow == null ? undefined : Number(quote.dayLow),
        volume: quote.volume == null ? undefined : Math.max(0, Number(quote.volume)),
        change: quote.change == null ? undefined : Number(quote.change),
        changePercent: quote.changePercent == null ? undefined : Number(quote.changePercent),
        lastTradeTimestamp: quote.timestamp || item.sourceUpdatedAt || undefined,
        receivedAtEpoch: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
        timestamp: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
      };
      result.set(item.symbol, tick);
    }
  }
  return result;
}

export function yahooHistoricalCandles(bars: readonly OHLCV[]): HistoricalCandle[] {
  return bars.map(bar => ({
    timestamp: new Date(bar.time).toISOString(),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: Number(bar.volume) || 0,
    source: 'unknown',
    phase: 'historical',
    confirmed: true,
  }));
}
