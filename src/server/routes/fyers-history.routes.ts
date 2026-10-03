import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';

/**
 * Safe FYERS historical-data route.
 *
 * The previous implementation walked backwards through many 90-day windows
 * while requesting up to 25,000 intraday candles. Every History API call counts
 * against FYERS' request limits, so one chart load could consume a large part
 * of the minute budget. TradingCore only needs recent intraday structure for
 * its chart/level engine, so use one broker-safe window instead.
 */
export const fyersHistoryRoutes = Router();
fyersHistoryRoutes.use(requireUser);

const resolutionMap: Record<string, string> = {
  '1minute': '1',
  '3minute': '3',
  '5minute': '5',
  '10minute': '10',
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

  const eq = raw.match(/^(NSE|BSE)_(EQ|CM)\|(.+)$/i);
  if (eq) {
    const exchange = eq[1].toUpperCase();
    const ticker = eq[3];
    return /-(EQ|BE|SM|ST)$/i.test(ticker) ? `${exchange}:${ticker}` : `${exchange}:${ticker}-EQ`;
  }

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

/**
 * Some newly listed/far-dated option contracts legitimately have no historical
 * trades yet. In that case the chart should not fail completely: use the
 * broker's last known quote as a single live seed candle. This is explicitly
 * not presented as historical data; subsequent websocket ticks build the live
 * candle normally in the browser.
 */
async function fallbackQuoteCandle(accessToken: string, symbol: string): Promise<any[]> {
  try {
    const payload: any = await new FyersApiClient(accessToken).dataGet('/quotes', { symbols: symbol });
    const quote = Array.isArray(payload?.d)
      ? payload.d.find((x: any) => String(x?.s || '').toUpperCase() === symbol.toUpperCase()) || payload.d[0]
      : undefined;
    const value = quote?.v || {};
    const ltp = Number(value.lp ?? value.ltp ?? value.last_price);
    if (!Number.isFinite(ltp) || ltp <= 0) return [];
    const volume = Number(value.volume ?? value.vol ?? 0);
    return [{
      timestamp: new Date().toISOString(),
      open: ltp, high: ltp, low: ltp, close: ltp,
      volume: Number.isFinite(volume) ? volume : 0,
      liveSeed: true,
    }];
  } catch {
    return [];
  }
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

  const instrumentKey = canonicalFyersSymbol(String(req.query.instrument_key || '').trim());
  const interval = String(req.query.interval || '').trim();
  const resolution = resolutionMap[interval] || interval;
  const beforeRaw = String(req.query.before || '').trim();
  const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
  if (beforeRaw && (!beforeDate || !Number.isFinite(beforeDate.getTime()))) {
    res.status(400).json({ success: false, error: 'before must be a valid ISO timestamp' });
    return;
  }

  const requested = Number(req.query.limit || 10_000);
  const limit = Number.isFinite(requested)
    ? Math.max(2, Math.min(10_000, Math.floor(requested)))
    : 10_000;
  if (!instrumentKey || !resolution) {
    res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
    return;
  }

  const beforeKey = beforeDate ? beforeDate.toISOString() : 'latest';
  const key = `${userId}:fyers:${instrumentKey}:${resolution}:${limit}:${beforeKey}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'private, max-age=20');
    res.json({ success: true, data: cached.data, requested: limit, returned: cached.data.length, cached: true, before: beforeDate?.toISOString() || null });
    return;
  }

  const existing = inflight.get(key);
  if (existing) {
    try {
      const data = await existing;
      res.setHeader('Cache-Control', 'private, max-age=20');
      res.json({ success: true, data, requested: limit, returned: data.length, cached: true, before: beforeDate?.toISOString() || null });
    } catch (error: any) {
      res.status(502).json({ success: false, error: error?.message || 'Unable to load Fyers historical candles' });
    }
    return;
  }

  try {
    const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
    const task = new FyersApiClient(accessToken).dataGet('/history', {
      symbol: instrumentKey,
      resolution,
      date_format: '0',
      range_from: Math.floor((beforeDate ? new Date(beforeDate.getTime() - 1_000) : new Date()).getTime() / 1000) -
        (resolution === 'D' ? 3650 : resolution === '30' || resolution === '60' ? 90 : 30) * 86_400,
      range_to: Math.floor((beforeDate ? new Date(beforeDate.getTime() - 1_000) : new Date()).getTime() / 1000),
      cont_flag: '1',
    }).then(async (payload: any) => {
      let data = normalize(payload?.candles || [], limit);
      if (!beforeDate && data.length < 2) {
        const seed = await fallbackQuoteCandle(accessToken, instrumentKey);
        if (seed.length) data = seed;
      }
      if (!data.length) throw new Error(`Fyers returned no historical candles or live quote for ${instrumentKey}.`);
      cache.set(key, { data, expiresAt: Date.now() + 120_000 });
      return data;
    }););
    inflight.set(key, task);
    const data = await task;
    res.setHeader('Cache-Control', 'private, max-age=20');
    res.json({ success: true, data, requested: limit, returned: data.length, before: beforeDate?.toISOString() || null, oldestTimestamp: data[0]?.timestamp || null, newestTimestamp: data[data.length - 1]?.timestamp || null, liveSeed: data.length === 1 && data[0]?.liveSeed === true });
  } catch (error: any) {
    res.status(502).json({ success: false, error: error?.message || 'Unable to load Fyers historical candles' });
  } finally {
    inflight.delete(key);
  }
});
