import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { API_LATENCY_BUDGET_MS, timeoutSignal } from '../latency/budgets.js';
import { resolveFyersCapabilities } from '../fyers/core/FyersCapabilities.js';
import { canonicalFyersSymbol } from '../fyers/symbols/canonicalFyersSymbol.js';
import { historicalDataService, type HistoricalInstrumentMapping, type PreferredHistorySourceFetcher } from './HistoricalDataService.js';
import type { HistoricalCandle, HistoricalCandleColumns, HistoricalQuoteSnapshot } from '../../services/brokers/BrokerAdapter.js';

export class CanonicalHistoryError extends Error {
  constructor(message: string, readonly statusCode: number = 400, readonly code?: string) {
    super(message);
    this.name = 'CanonicalHistoryError';
  }
}

export type CanonicalHistoryRequest = Readonly<{
  userId: string;
  symbol: string;
  timeframe: string;
  limit?: number;
  beforeTimestamp?: number;
}>;

type TimeframeSpec = { interval: string; resolution: string };
const TIMEFRAMES: Record<string, TimeframeSpec> = {
  '1': { interval: '1minute', resolution: '1' }, '1m': { interval: '1minute', resolution: '1' }, '1minute': { interval: '1minute', resolution: '1' },
  '3': { interval: '3minute', resolution: '3' }, '3m': { interval: '3minute', resolution: '3' }, '3minute': { interval: '3minute', resolution: '3' },
  '5': { interval: '5minute', resolution: '5' }, '5m': { interval: '5minute', resolution: '5' }, '5minute': { interval: '5minute', resolution: '5' },
  '10': { interval: '10minute', resolution: '10' }, '10m': { interval: '10minute', resolution: '10' }, '10minute': { interval: '10minute', resolution: '10' },
  '15': { interval: '15minute', resolution: '15' }, '15m': { interval: '15minute', resolution: '15' }, '15minute': { interval: '15minute', resolution: '15' },
  '30': { interval: '30minute', resolution: '30' }, '30m': { interval: '30minute', resolution: '30' }, '30minute': { interval: '30minute', resolution: '30' },
  '45': { interval: '45minute', resolution: '45' }, '45m': { interval: '45minute', resolution: '45' }, '45minute': { interval: '45minute', resolution: '45' },
  '60': { interval: '60minute', resolution: '60' }, '60m': { interval: '60minute', resolution: '60' }, '1h': { interval: '60minute', resolution: '60' }, '60minute': { interval: '60minute', resolution: '60' },
  '120': { interval: '120minute', resolution: '120' }, '120m': { interval: '120minute', resolution: '120' }, '2h': { interval: '120minute', resolution: '120' }, '120minute': { interval: '120minute', resolution: '120' },
  '240': { interval: '240minute', resolution: '240' }, '240m': { interval: '240minute', resolution: '240' }, '4h': { interval: '240minute', resolution: '240' }, '240minute': { interval: '240minute', resolution: '240' },
  'd': { interval: 'day', resolution: 'D' }, '1d': { interval: 'day', resolution: 'D' }, 'day': { interval: 'day', resolution: 'D' }, '1day': { interval: 'day', resolution: 'D' },
  'w': { interval: 'week', resolution: '1W' }, '1w': { interval: 'week', resolution: '1W' }, 'week': { interval: 'week', resolution: '1W' },
};

export function normalizeCanonicalHistoryTimeframe(raw: string): TimeframeSpec {
  const value = String(raw || '').trim();
  // TradingView/chart notation uses 1M/M for monthly and 1m for one-minute.
  if (value === 'M' || value === '1M' || value.toLowerCase() === 'month' || value.toLowerCase() === 'monthly') {
    return { interval: 'month', resolution: '1M' };
  }
  const mapped = TIMEFRAMES[value.toLowerCase()];
  if (mapped) return mapped;
  const seconds = /^(\d+)\s*(?:s|sec|second|seconds)$/i.exec(value);
  if (seconds) {
    const n = Number(seconds[1]);
    if (Number.isSafeInteger(n) && n >= 1 && n <= 60) return { interval: String(n) + 'S', resolution: String(n) + 'S' };
  }
  throw new CanonicalHistoryError('Unsupported historical timeframe: ' + value, 400, 'UNSUPPORTED_TIMEFRAME');
}

function canonicalInstrument(rawSymbol: string): string {
  const raw = String(rawSymbol || '').trim();
  if (!raw || raw.length > 128 || /[\r\n\0]/.test(raw)) throw new CanonicalHistoryError('symbol is required and must be a valid instrument identifier.');
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const indexAliases: Record<string, string> = {
    NIFTY: 'NSE:NIFTY50-INDEX', NIFTY50: 'NSE:NIFTY50-INDEX', NIFTY50INDEX: 'NSE:NIFTY50-INDEX', NSENIFTY50INDEX: 'NSE:NIFTY50-INDEX',
    BANKNIFTY: 'NSE:NIFTYBANK-INDEX', NIFTYBANK: 'NSE:NIFTYBANK-INDEX', NIFTYBANKINDEX: 'NSE:NIFTYBANK-INDEX', NSENIFTYBANKINDEX: 'NSE:NIFTYBANK-INDEX',
    FINNIFTY: 'NSE:FINNIFTY-INDEX', FINNIFTYINDEX: 'NSE:FINNIFTY-INDEX', NSEFINNIFTYINDEX: 'NSE:FINNIFTY-INDEX',
    MIDCPNIFTY: 'NSE:MIDCPNIFTY-INDEX', MIDCPNIFTYINDEX: 'NSE:MIDCPNIFTY-INDEX', NSEMIDCPNIFTYINDEX: 'NSE:MIDCPNIFTY-INDEX',
    SENSEX: 'BSE:SENSEX-INDEX', BSESENSEX: 'BSE:SENSEX-INDEX', SENSEXINDEX: 'BSE:SENSEX-INDEX', BSESENSEXINDEX: 'BSE:SENSEX-INDEX',
  };
  let resolved = indexAliases[compact] ? canonicalFyersSymbol(indexAliases[compact]!) : canonicalFyersSymbol(raw);
  if (!resolved.includes(':') && /^[A-Z0-9&._-]{1,64}$/i.test(resolved)) {
    resolved = canonicalFyersSymbol((/^(SENSEX|BANKEX)/i.test(resolved) ? 'BSE:' : 'NSE:') + resolved);
  }
  if (!/^(NSE|BSE|MCX|NSE_CD|NSE_COM|NSE_FO|BSE_FO):[A-Z0-9&._-]{1,100}$/i.test(resolved)) {
    throw new CanonicalHistoryError('symbol could not be normalized to an exchange-qualified instrument.', 400, 'INVALID_INSTRUMENT');
  }
  return resolved;
}

function parseEpochMs(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw > 1e12 ? raw : raw * 1000;
  const text = String(raw ?? '').trim();
  if (!text) return NaN;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function parseServerMap(raw: unknown): Record<string, Record<string, unknown>> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Record<string, unknown>> : {};
  } catch { return {}; }
}
function parseRetryAfterMs(value: string | null): number | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
function safeError(error: unknown): string {
  const value = error as { message?: string } | null;
  return String(value?.message || 'Unable to load validated historical candles').replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}

async function fallbackQuoteSnapshot(client: FyersApiClient, symbol: string): Promise<HistoricalQuoteSnapshot | null> {
  try {
    const signal = timeoutSignal(API_LATENCY_BUDGET_MS.quote);
    const payload = await client.dataGet<any>('/quotes', { symbols: symbol }, signal, API_LATENCY_BUDGET_MS.quote);
    const quote = Array.isArray(payload?.d)
      ? payload.d.find((item: any) => String(item?.s || '').toUpperCase() === symbol.toUpperCase()) || payload.d[0]
      : undefined;
    const values = quote?.v || {};
    const ltp = Number(values.lp ?? values.ltp ?? values.last_price);
    if (!Number.isFinite(ltp) || ltp <= 0) return null;
    const timestampMs = parseEpochMs(values.tt ?? values.t ?? values.timestamp ?? Date.now());
    if (!Number.isFinite(timestampMs)) return null;
    const rawVolume = Number(values.volume ?? values.vol ?? 0);
    return {
      instrumentId: symbol,
      ltp,
      timestamp: new Date(timestampMs).toISOString(),
      ...(Number.isFinite(rawVolume) && rawVolume >= 0 ? { volume: rawVolume } : {}),
      source: 'fyers',
    };
  } catch {
    // A quote is optional UI context and never becomes an OHLCV bar.
    return null;
  }
}

/**
 * Authoritative per-user history boundary. FYERS is queried in plan-aware bounded
 * pages; the configured TV-datafeed adapter may fill validated older gaps. Both
 * sources share the existing validated cache, source policy and contract compatibility rules.
 */
export async function loadCanonicalHistoryForUser(request: CanonicalHistoryRequest) {
  const userId = String(request.userId || '').trim();
  if (!userId) throw new CanonicalHistoryError('Authenticated user is required.', 401, 'AUTH_REQUIRED');
  const instrumentId = canonicalInstrument(request.symbol);
  const spec = normalizeCanonicalHistoryTimeframe(request.timeframe);
  const rawLimit = Number(request.limit ?? 2_000);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(2_000, Math.floor(rawLimit))) : 2_000;
  if (request.beforeTimestamp !== undefined && (!Number.isFinite(request.beforeTimestamp) || request.beforeTimestamp <= 0)) {
    throw new CanonicalHistoryError('beforeTimestamp must be a positive epoch-millisecond timestamp.');
  }

  const capabilities = resolveFyersCapabilities(userId);
  if (/^\d+S$/i.test(spec.resolution) && !capabilities.secondData) {
    throw new CanonicalHistoryError('Seconds-level history requires a verified FYERS Prime entitlement.', 403, 'FYERS_SECONDS_DATA_REQUIRES_PRIME');
  }

  let client: FyersApiClient | null = null;
  let fyersUnavailableReason: string | undefined;
  try {
    const session = await BrokerRepository.getSession('fyers', userId);
    if (session?.status === 'Connected') {
      const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
      client = new FyersApiClient(accessToken, undefined, capabilities, userId);
    } else {
      fyersUnavailableReason = 'Fyers session is not connected';
    }
  } catch (error) {
    fyersUnavailableReason = safeError(error);
  }

  const fetchFyersRecent = client
    ? async (mapping: HistoricalInstrumentMapping, range: { fromMs: number; toMs: number; fromDate: string; calendarPolicy: string }) => {
        const signal = timeoutSignal(API_LATENCY_BUDGET_MS.history);
        const payload = await client!.dataGet<any>('/history', {
          symbol: mapping.fyersSymbol,
          resolution: spec.resolution,
          date_format: '0',
          range_from: String(Math.floor(range.fromMs / 1000)),
          range_to: String(Math.floor(range.toMs / 1000)),
          cont_flag: '1',
        }, signal, API_LATENCY_BUDGET_MS.history, 'interactive');
        const bars = Array.isArray(payload?.candles) ? payload.candles : [];
        // A historical "before" page must not trigger a second quote request
        // merely because that older range contains no candles.
        const quote = bars.length || request.beforeTimestamp !== undefined
          ? null
          : await fallbackQuoteSnapshot(client!, mapping.fyersSymbol);
        return {
          bars,
          quote,
          status: { recentSessionRangeFrom: range.fromDate, rangeTo: new Date(range.toMs).toISOString(), calendarPolicy: range.calendarPolicy },
        };
      }
    : undefined;

  const nseBase = String(process.env.NSE_MARKET_DATA_SERVICE_URL || '').trim().replace(/\/+$/, '');
  const nseToken = String(process.env.NSE_MARKET_DATA_SERVICE_TOKEN || '').trim();
  const nseMap = parseServerMap(process.env.NSE_MARKET_DATA_SYMBOL_MAP);
  const investinyBase = String(process.env.INVESTINY_SERVICE_URL || process.env.TVDATAFEED_SERVICE_URL || '').trim().replace(/\/+$/, '');
  const investinyToken = String(process.env.INVESTINY_SERVICE_TOKEN || process.env.TVDATAFEED_SERVICE_TOKEN || '').trim();
  const investinyMap = parseServerMap(process.env.INVESTINY_SYMBOL_MAP);
  const fetchNseHistory: PreferredHistorySourceFetcher | undefined = nseBase && nseToken
    ? async (mapping, timeframe, range) => {
        const mapped = nseMap[mapping.instrumentId] || nseMap[mapping.fyersSymbol];
        const symbol = typeof mapped?.symbol === 'string' && mapped.symbol.trim() ? mapped.symbol.trim() : mapping.fyersSymbol;
        const response = await fetch(nseBase + '/v1/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + nseToken, Accept: 'application/json' },
          signal: timeoutSignal(API_LATENCY_BUDGET_MS.history),
          body: JSON.stringify({ instrument_id: mapping.instrumentId, symbol, timeframe, from_ms: range.fromMs, to_ms: range.toMs, max_bars: range.requestedBars, timezone: mapping.timezone, session_open: mapping.sessionOpen }),
        });
        if (!response.ok) throw Object.assign(new Error('NSE gateway returned HTTP ' + response.status), { status: response.status, retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')) });
        const payload: unknown = await response.json();
        const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
        const nested = record.data && typeof record.data === 'object' ? record.data as Record<string, unknown> : {};
        const rows = Array.isArray(record.bars) ? record.bars : Array.isArray(nested.bars) ? nested.bars : Array.isArray(record.data) ? record.data : null;
        if (!rows) throw Object.assign(new Error('NSE gateway returned an invalid history envelope'), { code: 'INVALID_HISTORY_ENVELOPE' });
        return rows;
      }
    : undefined;
  const fetchInvestinyHistory: PreferredHistorySourceFetcher | undefined =
    process.env.INVESTINY_ENABLED !== 'false' && investinyBase && investinyToken
      ? async (mapping, timeframe, range) => {
          const mapped = investinyMap[mapping.instrumentId] || investinyMap[mapping.fyersSymbol];
          const rawId = mapped?.investingId ?? mapped?.investing_id ?? mapped?.id;
          const investingId = Number(rawId);
          if (!Number.isSafeInteger(investingId) || investingId <= 0) {
            throw Object.assign(new Error('No exact Investing.com asset ID is configured for this instrument'), { code: 'INVESTINY_SYMBOL_UNMAPPED' });
          }
          const response = await fetch(investinyBase + '/v1/investiny/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + investinyToken, Accept: 'application/json' },
            signal: timeoutSignal(API_LATENCY_BUDGET_MS.history),
            body: JSON.stringify({ instrument_id: mapping.instrumentId, investing_id: investingId, timeframe, from_ms: range.fromMs, to_ms: range.toMs, max_bars: range.requestedBars, timezone: mapping.timezone, session_open: mapping.sessionOpen }),
          });
          if (!response.ok) throw Object.assign(new Error('Investiny service returned HTTP ' + response.status), { status: response.status, retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after')) });
          const payload: unknown = await response.json();
          const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
          if (!Array.isArray(record.bars)) throw Object.assign(new Error('Investiny service returned an invalid history envelope'), { code: 'INVALID_HISTORY_ENVELOPE' });
          return record.bars;
        }
      : undefined;

  const loaded = await historicalDataService.load({
    instrumentId,
    timeframe: spec.interval,
    maxBars: limit,
    historyMaxLookbackYears: ['D', '1W', '1M'].includes(spec.resolution.toUpperCase())
      ? capabilities.historyDepth.dailyYears
      : capabilities.historyDepth.intradayYears,
    ...(request.beforeTimestamp !== undefined ? { beforeTimestamp: request.beforeTimestamp } : {}),
    fetchFyersRecent,
    fetchNseHistory,
    fetchInvestinyHistory,
  });
  const metadata = {
    ...loaded.metadata,
    sourceStatus: {
      ...loaded.metadata.sourceStatus,
      fyersUnavailableReason: fyersUnavailableReason || undefined,
    },
  };
  return { symbol: instrumentId, timeframe: spec.interval, bars: loaded.bars, metadata, quote: loaded.quote };
}

export function historicalBarsToColumns(rows: readonly HistoricalCandle[], metadata?: any, quote?: HistoricalQuoteSnapshot | null): HistoricalCandleColumns {
  const availableAtMs = (value: string | number | undefined): number => {
    if (value === undefined) return Number.NaN;
    const parsed = parseEpochMs(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  };
  return {
    time: rows.map(row => parseEpochMs(row.timestamp)),
    open: rows.map(row => row.open),
    high: rows.map(row => row.high),
    low: rows.map(row => row.low),
    close: rows.map(row => row.close),
    volume: rows.map(row => row.volume),
    timeUnit: 'milliseconds',
    source: rows.map(row => row.source === 'nse' || row.source === 'investiny' || row.source === 'fyers' || row.source === 'tvdatafeed' ? row.source : 'unknown'),
    phase: rows.map(row => row.phase === 'historical' || row.phase === 'confirmed' || row.phase === 'developing' || row.phase === 'realtime' || row.phase === 'forecast' ? row.phase : 'historical'),
    confirmed: rows.map(row => row.confirmed === true),
    availableAt: rows.map(row => availableAtMs(row.availableAt)),
    revision: rows.map(row => typeof row.revision === 'number' && Number.isSafeInteger(row.revision) && row.revision >= 0 ? row.revision : Number.NaN),
    ...(metadata ? { metadata } : {}),
    ...(quote !== undefined ? { quote } : {}),
  };
}
