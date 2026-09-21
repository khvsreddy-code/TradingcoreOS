import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { withBrokerRequestGate } from '../brokers/BrokerRequestGate.js';

/**
 * FYERS historical-candle transport.
 *
 * Deliberately keeps the initial request simple: one documented FYERS History API
 * call for a broker-safe recent window, exactly like the legacy TradingCore path
 * that was reliable in production. Older candles are fetched only when the chart
 * asks for them via `before=`. This keeps first paint fast and, more importantly,
 * prevents a single chart click from turning into dozens of serial broker calls.
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
  if (['nse_index|nifty50', 'nse_index|nifty50index', 'nifty', 'nifty50', 'nifty50index'].includes(n) || n.includes('nifty50-index')) return 'NSE:NIFTY50-INDEX';
  if (['nse_index|niftybank', 'nse_index|banknifty', 'banknifty', 'niftybank'].includes(n) || n.includes('niftybank-index')) return 'NSE:NIFTYBANK-INDEX';
  if (['nse_index|finnifty', 'nse_index|niftyfinancialservices'].includes(n) || n.includes('finnifty-index')) return 'NSE:FINNIFTY-INDEX';
  if (['nse_index|niftymidcapselect', 'nse_index|midcap'].includes(n) || n.includes('midcpnifty-index')) return 'NSE:MIDCPNIFTY-INDEX';
  if (['bse_index|sensex', 'sensex'].includes(n) || n.includes('sensex-index')) return 'BSE:SENSEX-INDEX';

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
      open: values[0],
      high: values[1],
      low: values[2],
      close: values[3],
      volume: Number.isFinite(Number(row[5])) ? Number(row[5]) : 0,
    });
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, candle]) => candle)
    .slice(-limit);
}

/**
 * A quote seed is used only when FYERS legitimately has no historical candles
 * for a brand-new/far-dated contract. It is marked as a live seed so the client
 * does not confuse it with real historical history.
 */
async function fallbackQuoteCandle(accessToken: string, symbol: string): Promise<any[]> {
  const params = new URLSearchParams({ symbols: symbol });
  const response = await fetch(`https://api-t1.fyers.in/data/quotes?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `${process.env.FYERS_CLIENT_ID}:${accessToken}`,
    },
  });
  const text = await response.text();
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    return [];
  }
  if (!response.ok || payload?.s === 'error') return [];
  const quote = Array.isArray(payload?.d)
    ? payload.d.find((x: any) => String(x?.s || '').toUpperCase() === symbol.toUpperCase()) || payload.d[0]
    : undefined;
  const value = quote?.v || {};
  const ltp = Number(value.lp ?? value.ltp ?? value.last_price);
  if (!Number.isFinite(ltp) || ltp <= 0) return [];
  return [{
    timestamp: new Date().toISOString(),
    open: ltp,
    high: ltp,
    low: ltp,
    close: ltp,
    volume: Number.isFinite(Number(value.volume ?? value.vol ?? 0)) ? Number(value.volume ?? value.vol ?? 0) : 0,
    liveSeed: true,
  }];
}

function lookbackDays(resolution: string): number {
  // Keep the initial chart fetch intentionally small. Intraday history is capped
  // by FYERS at 100 calendar days/request; 30 days is the same proven range used
  // by the legacy TradingCore implementation and gives a dense enough first paint.
  if (resolution === 'D') return 360;
  if (resolution === '30' || resolution === '60') return 90;
  return 30;
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

  if (!instrumentKey || !resolution) {
    res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
    return;
  }

  const requested = Number(req.query.limit || 10_000);
  const limit = Number.isFinite(requested)
    ? Math.max(2, Math.min(beforeDate ? 10_000 : 10_000, Math.floor(requested)))
    : 10_000;
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
      const status = Number(error?.status) === 429 ? 429 : 502;
      res.status(status).json({ success: false, error: error?.message || 'Unable to load Fyers historical candles', brokerRateLimited: status === 429 });
    }
    return;
  }

  let accessToken = '';
  try {
    accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
  } catch (error: any) {
    res.status(401).json({ success: false, error: error?.message || 'Unable to decrypt Fyers session.' });
    return;
  }

  const task = withBrokerRequestGate('fyers', accessToken, async () => {
    const end = beforeDate ? new Date(beforeDate.getTime() - 1000) : new Date();
    const from = new Date(end.getTime() - lookbackDays(resolution) * 86_400_000);
    const params = new URLSearchParams({
      symbol: instrumentKey,
      resolution,
      date_format: '1',
      range_from: indiaDate(from),
      range_to: indiaDate(end),
    });

    const response = await fetch(`https://api-t1.fyers.in/data/history?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `${process.env.FYERS_CLIENT_ID}:${accessToken}`,
      },
    });
    const text = await response.text();
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      const error: any = new Error(`Fyers history returned a non-JSON response (${response.status})`);
      error.status = response.status;
      throw error;
    }

    const brokerCode = Number(payload?.code);
    if (!response.ok || payload?.s === 'error' || brokerCode === 429) {
      const error: any = new Error(payload?.message || `Fyers history failed (${response.status})`);
      error.status = brokerCode === 429 ? 429 : response.status;
      error.brokerCode = Number.isFinite(brokerCode) ? brokerCode : undefined;
      throw error;
    }

    let data = normalize(payload?.candles || [], beforeDate ? 10_000 : limit);
    if (beforeDate) {
      data = data.filter((row) => Date.parse(String(row.timestamp)) < beforeDate.getTime()).slice(-limit);
    }

    if (data.length < 2 && !beforeDate) {
      const seed = await fallbackQuoteCandle(accessToken, instrumentKey);
      if (seed.length) data = seed;
    }

    if (!data.length && !beforeDate) {
      throw new Error(`Fyers returned no historical candles or live quote for ${instrumentKey}.`);
    }

    console.info('[TradingCore][FYERS history] loaded', {
      userId,
      symbol: instrumentKey,
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

    cache.set(key, { data, expiresAt: Date.now() + 120_000 });
    return data;
  });

  inflight.set(key, task);
  try {
    const data = await task;
    if (res.writableEnded || req.aborted) return;
    res.setHeader('Cache-Control', 'private, max-age=20');
    res.json({
      success: true,
      data,
      requested: limit,
      returned: data.length,
      before: beforeDate?.toISOString() || null,
      liveSeed: data.length === 1 && data[0]?.liveSeed === true,
    });
  } catch (error: any) {
    if (res.writableEnded || req.aborted) return;
    const status = Number(error?.status) === 429 ? 429 : Number(error?.status) === 401 ? 401 : 502;
    console.error('[TradingCore][FYERS history] request failed', {
      userId,
      symbol: instrumentKey,
      resolution,
      before: beforeDate?.toISOString() || null,
      status,
      brokerCode: error?.brokerCode,
      message: error?.message,
    });
    res.status(status).json({
      success: false,
      error: error?.message || 'Unable to load Fyers historical candles',
      brokerRateLimited: status === 429,
    });
  } finally {
    inflight.delete(key);
  }
});
