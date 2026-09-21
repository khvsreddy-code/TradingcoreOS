import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { withBrokerRequestGate } from '../brokers/BrokerRequestGate.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { FyersMarketDataService } from '../fyers/market/FyersMarketDataService.js';

/**
 * Safe FYERS historical-data route.
 *
 * History is loaded in broker-safe date windows. The chart starts with a known-good
 * initial history page and requests older pages lazily as the user pans left, up to a 50,000-candle chart cache, with a 25,000-candle first-load target where the broker's date-window rules permit. If the broker cannot provide that much, valid history is
 * returned instead of fabricating data. The browser/runtime target is therefore
 * progressive rather than one large first-paint request. If the
 * broker or request quota cannot provide that much, the valid available
 * history is returned instead of fabricating data or blanking the chart.
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

  // Keep exact FYERS symbols intact, but repair the pipe-form keys that can
  // survive from the workspace/search layer (e.g. NSE_FO|NIFTY26SEPFUT).
  const pipe = raw.match(/^(NSE|BSE|MCX)_(CM|FO|CD|COM)\|(.+)$/i);
  if (pipe) {
    const exchange = pipe[1].toUpperCase();
    const segment = pipe[2].toUpperCase();
    const ticker = pipe[3];
    if (segment === 'CM' && !/-(EQ|BE|SM|ST)$/i.test(ticker)) return `${exchange}:${ticker}-EQ`;
    return `${exchange}:${ticker}`;
  }

  // Search results normally provide the exchange-qualified FYERS symbol. If a
  // persisted watchlist contains only an active NIFTY derivative ticker, add
  // the NSE prefix rather than sending an invalid bare symbol to History API.
  if (!raw.includes(':') && /^(?:NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY).*?(?:FUT|CE|PE)$/i.test(raw)) return `NSE:${raw}`;
  if (/^NSE:[A-Z0-9&._-]+$/i.test(raw) && !/-[A-Z]+$/i.test(raw)) return `${raw}-EQ`;
  if (/^BSE:[A-Z0-9&._-]+$/i.test(raw) && !/-[A-Z]+$/i.test(raw)) return `${raw}-EQ`;
  return raw;
}

function isDerivativeSymbol(symbol: string): boolean {
  // FYERS active derivative tickers are commonly NSE:NIFTY26SEPFUT or
  // NSE:NIFTY26000CE (without a hyphen before FUT/CE/PE). The old check only
  // recognized "-FUT/-CE/-PE", so those contracts were incorrectly sent with
  // the non-derivative history flag.
  return /(?:FUT|CE|PE)$/i.test(String(symbol || '').split(':').pop() || '');
}

function indiaDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

// FYERS History accepts calendar dates. Do not send a weekend/future calendar
// day as range_to for an intraday index request: some index series return
// no_data for a weekend endpoint even though the preceding session has data.
// Resolve the end date to the latest completed Indian market weekday.
function latestTradingDate(date: Date): Date {
  // Walk backwards until the date is actually a Monday-Friday trading weekday.
  // A single -1 day adjustment is wrong on Sunday (it lands on Saturday), which
  // was the remaining reason NIFTY50 could return no_data while another index
  // appeared healthy from cache/series behaviour. Keep this calendar-only;
  // exchange holidays are handled by the broker returning the available candles.
  const d = new Date(date);
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });
  for (let i = 0; i < 7; i += 1) {
    const weekday = weekdayFormatter.format(d);
    if (weekday !== 'Sat' && weekday !== 'Sun') return d;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

function previousTradingDate(date: Date): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return latestTradingDate(d);
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
 * Build a full history target using broker-safe windows, matching the old
 * TradingCore behavior that produced a dense first paint. The key difference
 * from v31 is that the window size is chosen from the requested candle count;
 * we do not cap every intraday timeframe to one 100-day page. This prevents
 * higher timeframes (15m/30m/1H) from silently receiving only a fraction of
 * the requested history.
 */
async function fetchFyersHistoryTarget(
  accessToken: string,
  symbol: string,
  resolution: string,
  target: number,
  beforeDate?: Date | null,
  signal?: AbortSignal,
): Promise<any[]> {
  const resolutionMinutes = resolution === 'D' ? 1440 : Math.max(1, Number(resolution) || 5);
  const maxWindowDays = resolution === 'D' ? 366 : 100;
  const candleMinutesPerTradingDay = resolution === 'D' ? 1440 : 375;
  const estimatedTradingDays = Math.max(1, Math.ceil((target * resolutionMinutes) / candleMinutesPerTradingDay));
  // Use the largest safe broker window whenever possible. This reproduces the
  // old target-building behavior while avoiding dozens of tiny requests.
  const windowDays = Math.min(maxWindowDays, Math.max(2, Math.ceil(estimatedTradingDays * 1.15)));
  const maxLookbackDays = resolution === 'D' ? 365 * 25 : 365 * 10;
  let end = beforeDate ? new Date(beforeDate.getTime() - 1000) : new Date();
  let all: any[] = [];
  let emptyWindows = 0;
  const maxPages = Math.max(2, Math.ceil(maxLookbackDays / Math.max(1, windowDays)) + 1);

  for (let page = 0; page < maxPages && all.length < target && emptyWindows < 2; page += 1) {
    if (signal?.aborted) throw Object.assign(new Error('Historical request aborted'), { name: 'AbortError' });
    end = latestTradingDate(end);
    const from = new Date(end.getTime() - windowDays * 86_400_000);
    let pageRows: any[] = [];
    let pageError: any = null;
    try {
      const client = new FyersApiClient(accessToken);
      const service = new FyersMarketDataService(client);
      const payload = await service.history(symbol, resolution, indiaDate(from), indiaDate(end), { signal });
      pageRows = normalize(payload?.candles || [], target);
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
  const requested = Number(req.query.limit || (beforeDate ? 500 : 500));
  const limit = Number.isFinite(requested) ? Math.max(2, Math.min(beforeDate ? 30000 : 25000, Math.floor(requested))) : 500;
  const maxChartHistory = 50_000;
  const initialHistoryTarget = 25_000;
  if (!instrumentKey || !resolution) {
    res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
    return;
  }

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
    const task = withBrokerRequestGate('fyers', accessToken, async (signal) => {
      const requestedTarget = Math.max(2, Math.min(beforeDate ? limit : initialHistoryTarget, 50_000));
      // v31's one-window strategy made higher timeframes look as if history had
      // disappeared: 100 calendar days only contains ~2.5k 15m candles and ~625
      // 1H candles. v31 restores target-based history construction. The browser
      // can still paint a cached dataset immediately; a cold request now returns
      // the dense target just like the older, proven implementation.
      const data = await fetchFyersHistoryTarget(accessToken, instrumentKey, resolution, requestedTarget, beforeDate, signal);
      if (data.length < 2) {
        if (beforeDate) return [];
        throw new Error(`Fyers returned only ${data.length} candle(s) for ${instrumentKey}.`);
      }
      console.info('[TradingCore][FYERS history] loaded', { symbol: instrumentKey, resolution, before: beforeDate?.toISOString() || null, requested: limit, target: beforeDate ? null : initialHistoryTarget, returned: data.length, oldest: data[0]?.timestamp || null, newest: data[data.length - 1]?.timestamp || null,  });
      cache.set(key, { data, expiresAt: Date.now() + 120_000 });
      return data;
    }, requestAbort.signal);
    inflight.set(key, task);
    const data = await task;
    res.setHeader('Cache-Control', 'private, max-age=20');
    res.json({ success: true, data, requested: limit, target: beforeDate ? null : initialHistoryTarget, returned: data.length, maxChartHistory, before: beforeDate?.toISOString() || null, oldestTimestamp: data[0]?.timestamp || null, hasMore: Boolean(data.length) });
  } catch (error: any) {
    res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load Fyers historical candles', brokerRateLimited: Number(error?.status) === 429 });
  } finally {
    inflight.delete(key);
    req.removeListener('aborted', abortIfClientLeaves);
    res.removeListener('close', abortIfClientLeaves);
  }
});
