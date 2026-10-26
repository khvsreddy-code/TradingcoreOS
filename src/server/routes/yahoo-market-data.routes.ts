import { Router, type Response } from 'express';
import { requireUser, type AuthenticatedRequest } from '../auth/requireUser.js';

type SourceInterval = {
  yahooInterval: string;
  requestedMinutes: number | null;
  aggregateMinutes: number | null;
  kind: 'intraday' | 'day' | 'week' | 'month';
};
type YahooBar = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  source: 'unknown';
  phase: 'historical' | 'developing';
  confirmed: boolean;
  availableAt?: string;
};
type YahooQuote = {
  ltp: number;
  change: number | null;
  changePercent: number | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  timestamp: string | null;
};
type YahooBundle = {
  canonicalSymbol: string;
  yahooSymbol: string;
  requestedTimeframe: string;
  sourceInterval: string;
  bars: YahooBar[];
  quote: YahooQuote | null;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
};

type YahooChartResponse = {
  chart?: {
    error?: { code?: string; description?: string } | null;
    result?: Array<{
      timestamp?: number[];
      meta?: Record<string, unknown>;
      indicators?: { quote?: Array<{
        open?: Array<number | null>;
        high?: Array<number | null>;
        low?: Array<number | null>;
        close?: Array<number | null>;
        volume?: Array<number | null>;
      }> };
    }> | null;
  };
};

const router = Router();
router.use(requireUser);

const CACHE_TTL_MS = 4_000;
const FETCH_TIMEOUT_MS = 7_000;
const MAX_CHART_BARS = 2_000;
const MAX_CACHE_ENTRIES = 300;
const cache = new Map<string, { expiresAt: number; value: YahooBundle }>();
const inflight = new Map<string, Promise<YahooBundle>>();

const INDEX_SYMBOLS: Record<string, string> = {
  'NSE:NIFTY50-INDEX': '^NSEI',
  'NSE:NIFTYBANK-INDEX': '^NSEBANK',
  'BSE:SENSEX-INDEX': '^BSESN',
  'NSE:FINNIFTY-INDEX': 'NIFTY_FIN_SERVICE.NS',
  'NSE:MIDCPNIFTY-INDEX': 'NIFTY_MID_SELECT.NS',
};

function canonicalYahooSymbol(raw: unknown): { canonical: string; yahoo: string } | null {
  const value = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!value || value.length > 100) return null;
  const fixed = INDEX_SYMBOLS[value];
  if (fixed) return { canonical: value, yahoo: fixed };
  // Yahoo Finance does not provide a reliable per-contract NSE/BSE F&O tape.
  // Never silently substitute the underlying for an option/future chart.
  if (/(?:CE|PE|FUT|FUTURES?)(?:[-.]?\d{2,})?$/i.test(value) || /(?:^|[-_:])(?:CE|PE)\b/i.test(value)) return null;
  const match = /^(NSE|BSE):([A-Z0-9&_.-]+?)(?:-(EQ|BE|BZ|SM|ST|INDEX))?$/.exec(value);
  if (!match) return null;
  const exchange = match[1]!;
  let ticker = match[2]!;
  const suffix = match[3] || '';
  if (suffix === 'INDEX') return null;
  if (!/^[A-Z0-9][A-Z0-9&_.-]{0,24}$/.test(ticker)) return null;
  // Normalize canonical equity symbols without allowing arbitrary URLs or hostnames.
  ticker = ticker.replace(/\.(NS|BO)$/i, '');
  return { canonical: value, yahoo: exchange === 'NSE' ? `${ticker}.NS` : `${ticker}.BO` };
}

function resolveInterval(raw: unknown): SourceInterval | null {
  const value = String(raw ?? '5').trim().toUpperCase().replace(/MIN$/, '');
  if (['D', '1D', 'DAY', 'DAILY'].includes(value)) return { yahooInterval: '1d', requestedMinutes: null, aggregateMinutes: null, kind: 'day' };
  if (['W', '1W', 'WEEK', 'WEEKLY'].includes(value)) return { yahooInterval: '1wk', requestedMinutes: null, aggregateMinutes: null, kind: 'week' };
  if (['M', '1MTH', 'MONTH', 'MONTHLY'].includes(value)) return { yahooInterval: '1mo', requestedMinutes: null, aggregateMinutes: null, kind: 'month' };
  const minutes = Number(value.replace(/M$/, ''));
  if (!Number.isFinite(minutes) || !Number.isInteger(minutes) || ![1, 2, 3, 5, 10, 15, 30, 45, 60, 90, 120, 240].includes(minutes)) return null;
  const source = minutes === 3 ? 1 : minutes === 10 ? 5 : minutes === 45 ? 15 : minutes === 120 || minutes === 240 ? 60 : minutes;
  const yahooInterval = source === 1 ? '1m'
    : source === 2 ? '2m'
      : source === 5 ? '5m'
        : source === 15 ? '15m'
          : source === 30 ? '30m'
            : source === 45 ? '45m'
              : source === 60 ? '60m'
                : source === 90 ? '90m' : '60m';
  return {
    yahooInterval,
    requestedMinutes: minutes,
    aggregateMinutes: source === minutes ? null : minutes,
    kind: 'intraday',
  };
}

function toFinite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function istSessionBucket(timestampMs: number, timeframeMinutes: number): number {
  const istOffset = 330 * 60_000;
  const ist = new Date(timestampMs + istOffset);
  const day = ist.toISOString().slice(0, 10);
  const utcMidnightForIstDay = Date.parse(`${day}T00:00:00.000Z`) - istOffset;
  const sessionOpen = utcMidnightForIstDay + (9 * 60 + 15) * 60_000;
  return sessionOpen + Math.floor((timestampMs - sessionOpen) / (timeframeMinutes * 60_000)) * timeframeMinutes * 60_000;
}

function aggregateIntraday(rows: YahooBar[], targetMinutes: number): YahooBar[] {
  const byBucket = new Map<number, YahooBar>();
  for (const row of rows) {
    const time = Date.parse(row.timestamp);
    if (!Number.isFinite(time)) continue;
    const bucket = istSessionBucket(time, targetMinutes);
    const old = byBucket.get(bucket);
    if (!old) {
      byBucket.set(bucket, { ...row, timestamp: new Date(bucket).toISOString() });
      continue;
    }
    byBucket.set(bucket, {
      ...old,
      high: Math.max(old.high, row.high),
      low: Math.min(old.low, row.low),
      close: row.close,
      volume: old.volume + row.volume,
      phase: row.phase === 'developing' ? 'developing' : old.phase,
      confirmed: old.confirmed && row.confirmed,
      ...(row.availableAt ? { availableAt: row.availableAt } : {}),
    });
  }
  return [...byBucket.values()].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

function resultRange(interval: SourceInterval, mode: 'chart' | 'quote', limit: number): string {
  if (mode === 'quote') return interval.kind === 'intraday' ? '1d' : '5d';
  if (interval.kind === 'intraday') {
    // Yahoo only exposes 1-minute bars for approximately the last 8 calendar days;
    // other intraday intervals have a rolling ~60-day history window.
    return interval.yahooInterval === '1m' ? '7d' : '3mo';
  }
  if (interval.kind === 'day') return limit > 2_000 ? 'max' : '10y';
  return 'max';
}

function parseBundle(
  raw: YahooChartResponse,
  canonical: string,
  yahoo: string,
  interval: SourceInterval,
  timeframe: string,
  limit: number,
): YahooBundle {
  const response = raw.chart;
  const result = response?.result?.[0];
  if (response?.error) throw new Error(response.error.description || 'Yahoo Finance could not return this symbol.');
  if (!result) throw new Error('Yahoo Finance returned no data for this symbol or interval.');
  const quoteSeries = result.indicators?.quote?.[0];
  if (!quoteSeries) throw new Error('Yahoo Finance returned an invalid OHLCV response.');
  const timestamps = result.timestamp || [];
  const bars: YahooBar[] = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const seconds = Number(timestamps[index]);
    const open = toFinite(quoteSeries.open?.[index]);
    const high = toFinite(quoteSeries.high?.[index]);
    const low = toFinite(quoteSeries.low?.[index]);
    const close = toFinite(quoteSeries.close?.[index]);
    const volume = toFinite(quoteSeries.volume?.[index]) ?? 0;
    if (!Number.isFinite(seconds) || seconds <= 0 || open == null || high == null || low == null || close == null) continue;
    if (high < Math.max(open, close) || low > Math.min(open, close) || high < low || volume < 0) continue;
    bars.push({
      timestamp: new Date(seconds * 1000).toISOString(),
      open, high, low, close, volume,
      source: 'unknown',
      phase: 'historical',
      confirmed: true,
    });
  }
  const now = Date.now();
  if (interval.kind === 'intraday' && bars.length) {
    const last = bars[bars.length - 1]!;
    const span = (interval.requestedMinutes ?? 1) * 60_000;
    if (now - Date.parse(last.timestamp) < Math.max(2 * span, 5 * 60_000)) {
      bars[bars.length - 1] = { ...last, phase: 'developing', confirmed: false };
    }
  }
  let normalized = interval.aggregateMinutes ? aggregateIntraday(bars, interval.aggregateMinutes) : bars;
  const fromRaw = null;
  void fromRaw;
  normalized = normalized.slice(-Math.max(1, Math.min(MAX_CHART_BARS, limit)));
  const meta = result.meta || {};
  const ltp = toFinite(meta.regularMarketPrice) ?? normalized[normalized.length - 1]?.close ?? null;
  const previousClose = toFinite(meta.chartPreviousClose) ?? toFinite(meta.previousClose);
  const change = ltp != null && previousClose != null ? ltp - previousClose : null;
  const regularMarketTime = toFinite(meta.regularMarketTime);
  const sourceUpdatedAt = regularMarketTime != null && regularMarketTime > 0
    ? new Date(regularMarketTime * 1000).toISOString()
    : normalized[normalized.length - 1]?.timestamp ?? null;
  const quote: YahooQuote | null = ltp == null ? null : {
    ltp,
    change,
    changePercent: change != null && previousClose != null && previousClose !== 0 ? change / previousClose * 100 : null,
    previousClose,
    dayHigh: toFinite(meta.regularMarketDayHigh),
    dayLow: toFinite(meta.regularMarketDayLow),
    volume: toFinite(meta.regularMarketVolume),
    timestamp: sourceUpdatedAt,
  };
  return {
    canonicalSymbol: canonical,
    yahooSymbol: yahoo,
    requestedTimeframe: timeframe,
    sourceInterval: interval.yahooInterval,
    bars: normalized,
    quote,
    fetchedAt: new Date().toISOString(),
    sourceUpdatedAt,
  };
}

async function loadYahooBundle(canonicalRaw: unknown, timeframeRaw: unknown, limitRaw: unknown, mode: 'chart' | 'quote'): Promise<YahooBundle> {
  const mapped = canonicalYahooSymbol(canonicalRaw);
  if (!mapped) throw new Error('Yahoo Finance fallback does not support this symbol. Connect FYERS for F&O and unsupported instruments.');
  const interval = resolveInterval(timeframeRaw);
  if (!interval) throw new Error('Yahoo Finance fallback does not support this timeframe.');
  const requested = Number(limitRaw);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(MAX_CHART_BARS, Math.floor(requested))) : MAX_CHART_BARS;
  const range = resultRange(interval, mode, limit);
  const cacheKey = `${mode}|${mapped.yahoo}|${interval.yahooInterval}|${interval.aggregateMinutes || 0}|${range}|${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = inflight.get(cacheKey);
  if (pending) return pending;
  const promise = (async () => {
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mapped.yahoo)}`);
    url.searchParams.set('range', range);
    url.searchParams.set('interval', interval.yahooInterval);
    url.searchParams.set('includePrePost', 'false');
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'TradingCoreOS/1.0 (delayed market-data fallback)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Yahoo Finance request failed (HTTP ${response.status}).`);
    const raw = await response.json() as YahooChartResponse;
    const value = parseBundle(raw, mapped.canonical, mapped.yahoo, interval, String(timeframeRaw || '5'), limit);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    cache.delete(cacheKey);
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    while (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest == null) break;
      cache.delete(oldest);
    }
    return value;
  })().finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, promise);
  return promise;
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : 'Yahoo Finance is temporarily unavailable.').replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}

router.get('/chart', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const value = await loadYahooBundle(req.query.symbol, req.query.interval, req.query.limit || 2_000, 'chart');
    const toEpochMs = (raw: unknown): number => {
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
      const parsed = Date.parse(String(raw ?? ''));
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    };
    const fromRaw = String(req.query.from ?? '').trim();
    const toRaw = String(req.query.to ?? '').trim();
    const fromMs = fromRaw ? toEpochMs(fromRaw) : Number.NEGATIVE_INFINITY;
    const toMs = toRaw ? toEpochMs(toRaw) : Number.POSITIVE_INFINITY;
    const bars = value.bars.filter(bar => {
      const time = Date.parse(bar.timestamp);
      return time >= fromMs && time <= toMs;
    });
    const stale = Date.now() - Date.parse(value.fetchedAt) > CACHE_TTL_MS;
    res.setHeader('Cache-Control', 'private, max-age=4');
    res.json({ success: true, provider: 'Yahoo Finance', delayed: true, stale, updateIntervalMs: CACHE_TTL_MS, ...value, bars, returned: bars.length });
  } catch (error: unknown) {
    res.status(422).json({ success: false, provider: 'Yahoo Finance', delayed: true, error: safeError(error), bars: [], quote: null });
  }
});

router.get('/quote', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const value = await loadYahooBundle(req.query.symbol, req.query.interval || '1', 500, 'quote');
    res.setHeader('Cache-Control', 'private, max-age=4');
    res.json({ success: true, provider: 'Yahoo Finance', delayed: true, updateIntervalMs: CACHE_TTL_MS,
      canonicalSymbol: value.canonicalSymbol, yahooSymbol: value.yahooSymbol, quote: value.quote,
      lastBar: value.bars[value.bars.length - 1] || null, fetchedAt: value.fetchedAt, sourceUpdatedAt: value.sourceUpdatedAt });
  } catch (error: unknown) {
    res.status(422).json({ success: false, provider: 'Yahoo Finance', delayed: true, error: safeError(error), quote: null, lastBar: null });
  }
});

router.get('/quotes', async (req: AuthenticatedRequest, res: Response) => {
  const symbols = String(req.query.symbols || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 10);
  if (!symbols.length) return res.status(400).json({ success: false, error: 'symbols is required.' });
  const rows = await Promise.all(symbols.map(async symbol => {
    try {
      const value = await loadYahooBundle(symbol, '1', 500, 'quote');
      return { symbol, success: true, quote: value.quote, fetchedAt: value.fetchedAt, sourceUpdatedAt: value.sourceUpdatedAt };
    } catch (error: unknown) {
      return { symbol, success: false, quote: null, error: safeError(error) };
    }
  }));
  res.setHeader('Cache-Control', 'private, max-age=4');
  res.json({ success: true, provider: 'Yahoo Finance', delayed: true, updateIntervalMs: CACHE_TTL_MS, fetchedAt: new Date().toISOString(), items: rows });
});

export const yahooMarketDataRoutes = router;
