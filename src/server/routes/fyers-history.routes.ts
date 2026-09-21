import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { withBrokerRequestGate } from '../brokers/BrokerRequestGate.js';

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
  // Keep the proven legacy transport: one broker-safe history request for
  // first paint, and one more single window only when older data is requested.
  const lookbackDays = resolution === 'D' ? 360 : (resolution === '30' || resolution === '60' ? 90 : 30);
  const end = beforeDate ? new Date(beforeDate.getTime() - 1000) : new Date();
  const from = new Date(end.getTime() - lookbackDays * 86_400_000);
  const requestedLimit = Math.max(2, Math.min(10_000, Math.floor(Number(target) || 10_000)));

  return withBrokerRequestGate('fyers', accessToken, async (gateSignal) => {
    if (gateSignal?.aborted) throw Object.assign(new Error('Historical request aborted'), { name: 'AbortError' });

    const params = new URLSearchParams({
      symbol,
      resolution,
      date_format: '1',
      range_from: indiaDate(from),
      range_to: indiaDate(end),
    });

    const response = await fetch('https://api-t1.fyers.in/data/history?' + params.toString(), {
      signal: gateSignal,
      headers: {
        Accept: 'application/json',
        Authorization: process.env.FYERS_CLIENT_ID + ':' + accessToken,
      },
    });

    const text = await response.text();
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      const error: any = new Error('Fyers history returned a non-JSON response (' + response.status + ')');
      error.status = response.status;
      throw error;
    }

    const brokerCode = Number(payload?.code);
    if (!response.ok || payload?.s === 'error' || brokerCode === 429) {
      const error: any = new Error(payload?.message || ('Fyers history failed (' + response.status + ')'));
      error.status = brokerCode === 429 ? 429 : response.status;
      error.brokerCode = Number.isFinite(brokerCode) ? brokerCode : undefined;
      throw error;
    }

    // Filter a before= response before applying the requested page limit.
    let data = normalize(payload?.candles || [], 10_000);
    if (beforeDate) {
      data = data.filter((row) => Date.parse(String(row.timestamp)) < beforeDate.getTime()).slice(-requestedLimit);
    } else {
      data = data.slice(-requestedLimit);
    }

    if (data.length < 2 && !beforeDate) {
      const seed = await fallbackQuoteCandle(accessToken, symbol);
      if (seed.length) data = seed;
    }

    if (!data.length && !beforeDate) {
      throw new Error('Fyers returned no historical candles or live quote for ' + symbol + '.');
    }

    console.info('[TradingCore][FYERS history] loaded', {
      symbol,
      resolution,
      before: beforeDate?.toISOString() || null,
      rangeFrom: indiaDate(from),
      rangeTo: indiaDate(end),
      brokerStatus: payload?.s ?? null,
      brokerCode: Number.isFinite(brokerCode) ? brokerCode : null,
      brokerCandleCount: Array.isArray(payload?.candles) ? payload.candles.length : 0,
      returned: data.length,
      oldest: data[0]?.timestamp || null,
      newest: data[data.length - 1]?.timestamp || null,
    });

    return data;
  }, signal);
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
  // First paint is always one broker-safe history request. Older candles are
  // requested only when the user scrolls toward the left edge.
  const initialHistoryTarget = resolution === '1' ? 20_000
    : resolution === '2' ? 9_000
    : resolution === '3' ? 8_000
    : resolution === '5' ? 5_000
    : resolution === '10' ? 2_600
    : resolution === '15' ? 1_700
    : resolution === '20' ? 1_300
    : resolution === '30' ? 900
    : resolution === '60' ? 450
    : resolution === '120' ? 225
    : resolution === '240' ? 112
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
      if (res.writableEnded || req.aborted) return;
      res.setHeader('Cache-Control', 'private, max-age=20');
      res.json({ success: true, data, requested: limit, returned: data.length, cached: true });
    } catch (error: any) {
      res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load Fyers historical candles', brokerRateLimited: Number(error?.status) === 429 });
    }
    return;
  }

  try {
    const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
    // The history helper owns the single broker-gate acquisition for this request.
    const task = (async () => {
      const requestedTarget = Math.max(2, Math.min(beforeDate ? limit : initialHistoryTarget, 50_000));
      const data = await fetchFyersHistoryTarget(accessToken, instrumentKey, resolution, requestedTarget, beforeDate);
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
    })();

    inflight.set(key, task);
    const data = await task;
    if (res.writableEnded || req.aborted) return;
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
    if (res.writableEnded || req.aborted) return;
    res.status(Number(error?.status) === 429 ? 429 : 502).json({
      success: false,
      error: error?.message || 'Unable to load Fyers historical candles',
      brokerRateLimited: Number(error?.status) === 429,
    });
  } finally {
    inflight.delete(key);
  }
});
