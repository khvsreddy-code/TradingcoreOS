import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { FyersMarketDataService } from '../fyers/market/FyersMarketDataService.js';

/**
 * Safe FYERS historical-data route.
 *
 * History is loaded in broker-safe date windows. The chart starts with a known-good
 * initial history page and requests older pages lazily as the user pans left, up to a
 * 50,000-candle chart cache. Broker scheduling is owned exclusively by FyersApiClient.
 * The route is scoped to the authenticated TradingCore/Supabase user and never shares
 * broker-session data across users.
 */
export const fyersHistoryRoutes = Router();
fyersHistoryRoutes.use(requireUser);

const resolutionMap: Record<string, string> = {
  '1minute': '1',
  '3minute': '3',
  '5minute': '5',
  '15minute': '15',
  '30minute': '30',
  '60minute': '60',
  day: 'D',
};

function canonicalFyersSymbol(value: string): string {
  const raw = String(value || '').trim();
  const n = raw.toLowerCase().replace(/\s+/g, '');
  if (['nse_index|nifty50','nse_index|nifty50index','nifty','nifty50','nifty50index'].includes(n) || n.includes('nifty50-index')) return 'NSE:NIFTY50-INDEX';
  if (['nse_index|niftybank','nse_index|banknifty','banknifty','niftybank'].includes(n) || n.includes('niftybank-index')) return 'NSE:NIFTYBANK-INDEX';
  if (['nse_index|finnifty','nse_index|niftyfinancialservices'].includes(n) || n.includes('finnifty-index')) return 'NSE:FINNIFTY-INDEX';
  if (['nse_index|niftymidcapselect','nse_index|midcap'].includes(n) || n.includes('midcpnifty-index')) return 'NSE:MIDCPNIFTY-INDEX';
  if (['bse_index|sensex','sensex'].includes(n) || n.includes('sensex-index')) return 'BSE:SENSEX-INDEX';

  const pipe = raw.match(/^(NSE|BSE|MCX)_(CM|FO|CD|COM)\|(.+)$/i);
  if (pipe) {
    const exchange = pipe[1].toUpperCase();
    const segment = pipe[2].toUpperCase();
    const ticker = pipe[3];
    if (segment === 'CM' && !/-(EQ|BE|SM|ST)$/i.test(ticker)) return `${exchange}:${ticker}-EQ`;
    return `${exchange}:${ticker}`;
  }

  if (!raw.includes(':') && /^(?:NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY).*?(?:FUT|CE|PE)$/i.test(raw)) return `NSE:${raw}`;
  if (/^NSE:[A-Z0-9&._-]+$/i.test(raw) && !/-[A-Z]+$/i.test(raw)) return `${raw}-EQ`;
  if (/^BSE:[A-Z0-9&._-]+$/i.test(raw) && !/-[A-Z]+$/i.test(raw)) return `${raw}-EQ`;
  return raw;
}

function indiaDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

function latestTradingDate(date: Date): Date {
  const d = new Date(date);
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
  for (let i = 0; i < 7; i += 1) {
    const weekday = weekdayFormatter.format(d);
    if (weekday !== 'Sat' && weekday !== 'Sun') return d;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

function normalize(rows: any[], limit: number): any[] {
  const byTime = new Map<number, any>();
  for (const row of rows || []) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const raw = Number(row[0]);
    const time = raw > 1e12 ? raw : raw * 1000;
    const values = [Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4])];
    if (!Number.isFinite(time) || values.some(v => !Number.isFinite(v))) continue;
    byTime.set(time, {
      timestamp: new Date(time).toISOString(),
      open: values[0], high: values[1], low: values[2], close: values[3],
      volume: Number.isFinite(Number(row[5])) ? Number(row[5]) : 0,
    });
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, candle]) => candle).slice(-limit);
}

async function fetchFyersHistoryTarget(
  accessToken: string,
  symbol: string,
  resolution: string,
  target: number,
  beforeDate?: Date | null,
  signal?: AbortSignal,
): Promise<any[]> {
  const resolutionMinutes = resolution === 'D' ? 1440 : Math.max(1, Number(resolution) || 5);
  // Keep intraday windows below FYERS' hard 100-day boundary. For intraday
  // history we use epoch timestamps so range_to can be placed before the
  // current/resolution candle instead of truncating it to midnight.
  const maxWindowDays = resolution === 'D' ? 366 : 99;
  const candleMinutesPerTradingDay = resolution === 'D' ? 1440 : 375;
  const estimatedTradingDays = Math.max(1, Math.ceil((target * resolutionMinutes) / candleMinutesPerTradingDay));
  const windowDays = Math.min(maxWindowDays, Math.max(2, Math.ceil(estimatedTradingDays * 1.15)));
  const maxLookbackDays = resolution === 'D' ? 365 * 25 : 365 * 10;
  const isIntraday = resolution !== 'D';
  const completedBoundaryMs = Math.max(60_000, resolutionMinutes * 60_000);
  let end = beforeDate
    ? new Date(beforeDate.getTime() - 1000)
    : new Date(Date.now() - completedBoundaryMs - 1000);
  let all: any[] = [];
  let emptyWindows = 0;
  const maxPages = Math.max(2, Math.ceil(maxLookbackDays / Math.max(1, windowDays)) + 1);

  for (let page = 0; page < maxPages && all.length < target && emptyWindows < 2; page += 1) {
    if (signal?.aborted) throw Object.assign(new Error('Historical request aborted'), { name: 'AbortError' });
    if (!isIntraday) end = latestTradingDate(end);
    const from = new Date(end.getTime() - windowDays * 86_400_000);
    let pageRows: any[] = [];
    let pageError: any = null;
    try {
      const client = new FyersApiClient(accessToken);
      const service = new FyersMarketDataService(client);
      // FYERS documents yyyy-mm-dd ranges as the canonical History API form.
      // Backfill ends on the last completed trading day; the live tick path
      // builds today's in-progress candle separately.
      const dateFormat = '1';
      const rangeFrom = indiaDate(from);
      let rangeEnd = new Date(end);
      if (isIntraday) {
        rangeEnd = new Date(rangeEnd.getTime() - 86_400_000);
        rangeEnd = latestTradingDate(rangeEnd);
      }
      const rangeTo = indiaDate(rangeEnd);
      const payload = await service.history(symbol, resolution, rangeFrom, rangeTo, { dateFormat, signal });
      const rawCandles = Array.isArray(payload?.candles) ? payload.candles : [];
      pageRows = normalize(rawCandles, target);

      console.info('[TradingCore][FYERS history] broker response', {
        rawFirst: rawCandles[0] ?? null,
        rawLast: rawCandles.length ? rawCandles[rawCandles.length - 1] : null,
        normalizedCount: pageRows.length,
        symbol, resolution, dateFormat, rangeFrom, rangeTo,
        status: payload?.s ?? null,
        code: payload?.code ?? null,
        message: payload?.message ?? null,
        candleCount: Array.isArray(payload?.candles) ? payload.candles.length : 0,
        nextTime: payload?.nextTime ?? null,
      });

      // FYERS can return a successful response with s=no_data once the
      // requested range reaches the beginning of available history. That is
      // not a transport/auth failure and MUST NOT discard candles already
      // collected from newer windows. Stop the backfill and return the partial
      // history; the caller only needs a non-empty completed range to paint.
      if (!pageRows.length && String(payload?.s || '').toLowerCase() === 'no_data') {
        console.warn('[TradingCore][FYERS history] broker returned no_data', {
          symbol,
          resolution,
          dateFormat,
          rangeFrom,
          rangeTo,
          nextTime: payload?.nextTime ?? null,
          accumulatedCandles: all.length,
        });
        if (all.length > 0) break;
      }
    } catch (error: any) {
      pageError = error;
      if (Number(error?.status) === 429 || Number(error?.status) === 401 || Number(error?.brokerCode) < 0) throw error;
    }

    if (pageRows.length) {
      all = normalize([...pageRows, ...all], target);
      emptyWindows = 0;
    } else {
      if (pageError && all.length === 0) throw pageError;
      emptyWindows += 1;
    }
    end = new Date(from.getTime() - 1000);
  }

  return normalize(all, target);
}

const cache = new Map<string, { expiresAt: number; data: any[] }>();
const inflight = new Map<string, Promise<any[]>>();

fyersHistoryRoutes.get('/:brokerId/historical', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();

  const userId = req.tradingCoreUserId!;
  const session = await BrokerRepository.getSession('fyers', userId);
  if (!session || session.status !== 'Connected') {
    res.status(401).json({ success: false, error: 'Fyers is not connected for this account.' });
    return;
  }

  const requestAbort = new AbortController();
  const abortIfClientLeaves = () => { if (!res.writableEnded) requestAbort.abort(); };
  req.once('aborted', abortIfClientLeaves);
  res.once('close', abortIfClientLeaves);

  const instrumentKey = canonicalFyersSymbol(String(req.query.instrument_key || ''));
  const interval = String(req.query.interval || '').trim();
  const resolution = resolutionMap[interval] || interval;
  const beforeRaw = String(req.query.before || '').trim();
  const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
  if (beforeRaw && (!beforeDate || !Number.isFinite(beforeDate.getTime()))) {
    res.status(400).json({ success: false, error: 'before must be a valid ISO timestamp' });
    return;
  }

  const requested = Number(req.query.limit || 500);
  const limit = Number.isFinite(requested)
    ? Math.max(2, Math.min(beforeDate ? 30000 : 25000, Math.floor(requested)))
    : 500;
  const maxChartHistory = 50_000;
  // FYERS caps minute-history requests at 100 calendar days. Keep the first
  // paint inside one broker history window; older pages are loaded only after
  // the chart is visible. This prevents a 5m chart from requiring 4+ serial
  // FYERS calls before first paint.
  const initialHistoryTarget = resolution === '1' ? 25_000
    : resolution === '2' ? 12_000
    : resolution === '3' ? 12_000
    : resolution === '5' ? 7_000
    : resolution === '10' ? 3_500
    : resolution === '15' ? 2_400
    : resolution === '20' ? 1_800
    : resolution === '30' ? 1_200
    : resolution === '60' ? 600
    : resolution === '120' ? 300
    : resolution === '240' ? 180
    : resolution === 'D' ? 300
    : 2;

  if (!instrumentKey || !resolution) {
    res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
    return;
  }

  // This key is explicitly user-scoped. Broker sessions/tokens are never shared
  // between TradingCore users, even when multiple users request the same symbol.
  const key = `${userId}:fyers:${instrumentKey}:${resolution}:${limit}:${beforeDate?.toISOString() || 'latest'}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'private, max-age=20');
    res.json({ success: true, data: cached.data, requested: limit, returned: cached.data.length, cached: true });
    return;
  }

  const existing = inflight.get(key);
  if (existing) {
    try {
      const data = await existing;
      res.setHeader('Cache-Control', 'private, max-age=20');
      res.json({ success: true, data, requested: limit, returned: data.length, cached: true });
    } catch (error: any) {
      res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load Fyers historical candles', brokerRateLimited: Number(error?.status) === 429 });
    }
    return;
  }

  try {
    const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
    // IMPORTANT: FyersApiClient owns BrokerRequestGate. The history route MUST NOT
    // acquire the same gate before calling the client. Doing so deadlocks:
    // route gate -> client gate -> waits for route gate -> no FYERS request.
    const task = (async (signal: AbortSignal) => {
      const requestedTarget = Math.max(2, Math.min(beforeDate ? limit : initialHistoryTarget, 50_000));
      const data = await fetchFyersHistoryTarget(accessToken, instrumentKey, resolution, requestedTarget, beforeDate, signal);
      if (data.length < 2) {
        if (beforeDate) return [];
        throw new Error(`Fyers returned only ${data.length} candle(s) for ${instrumentKey}.`);
      }
      console.info('[TradingCore][FYERS history] loaded', {
        userId,
        symbol: instrumentKey,
        resolution,
        before: beforeDate?.toISOString() || null,
        requested: limit,
        target: beforeDate ? null : initialHistoryTarget,
        returned: data.length,
        oldest: data[0]?.timestamp || null,
        newest: data[data.length - 1]?.timestamp || null,
      });
      cache.set(key, { data, expiresAt: Date.now() + 120_000 });
      return data;
    })(requestAbort.signal);

    inflight.set(key, task);
    const data = await task;
    res.setHeader('Cache-Control', 'private, max-age=20');
    res.json({
      success: true,
      data,
      requested: limit,
      target: beforeDate ? null : initialHistoryTarget,
      returned: data.length,
      maxChartHistory,
      before: beforeDate?.toISOString() || null,
      oldestTimestamp: data[0]?.timestamp || null,
      hasMore: Boolean(data.length),
    });
  } catch (error: any) {
    console.error('[TradingCore][FYERS history] request failed', {
      userId,
      symbol: instrumentKey,
      resolution,
      before: beforeDate?.toISOString() || null,
      requested: limit,
      initialHistoryTarget,
      name: error?.name,
      status: error?.status,
      brokerCode: error?.brokerCode,
      message: error?.message,
      payload: error?.payload,
    });
    res.status(Number(error?.status) === 429 ? 429 : 502).json({
      success: false,
      error: error?.message || 'Unable to load Fyers historical candles',
      brokerRateLimited: Number(error?.status) === 429,
    });
  } finally {
    inflight.delete(key);
    req.removeListener('aborted', abortIfClientLeaves);
    res.removeListener('close', abortIfClientLeaves);
  }
});
