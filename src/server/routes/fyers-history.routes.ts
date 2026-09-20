import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { withBrokerRequestGate } from '../brokers/BrokerRequestGate.js';

/**
 * Safe FYERS historical-data route.
 *
 * History is loaded in broker-safe date windows. The chart starts with a known-good
 * initial history page and requests older pages lazily as the user pans left, up to a 30,000
 * candle chart cache. If the broker cannot provide that much, valid history is
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
  const requested = Number(req.query.limit || (beforeDate ? 500 : 500));
  const limit = Number.isFinite(requested) ? Math.max(2, Math.min(beforeDate ? 1000 : 500, Math.floor(requested))) : 500;
  const maxChartHistory = 30_000;
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
    const task = withBrokerRequestGate('fyers', accessToken, async () => {
      // TradingView-style history pagination. Initial paint asks FYERS for one
      // bounded recent window only; older pages are requested by the chart with
      // `before` as the user scrolls left. This prevents a single mount from
      // consuming the broker request quota.
      const windowDays = resolution === 'D' ? 5000 : 30;
      // Anchor history to a completed Indian trading date. This is especially
      // important on weekends/holidays: the current wall-clock date can be a
      // non-trading day and FYERS has returned no_data for some index series
      // when range_to is such a day.
      const rawEnd = beforeDate ? new Date(beforeDate.getTime() - 1000) : new Date();
      const end = latestTradingDate(rawEnd);
      if (beforeDate && indiaDate(end) >= indiaDate(new Date(beforeDate.getTime()))) {
        end.setTime(previousTradingDate(new Date(beforeDate.getTime())).getTime());
      }
      const from = new Date(end.getTime() - windowDays * 86_400_000);
      let data: any[] = [];
      let historyError: any = null;
      let lastAttempt: any = null;

      const requestHistory = async (dateFormat: '0' | '1'): Promise<any[]> => {
        const params = new URLSearchParams({
          symbol: instrumentKey,
          resolution,
          date_format: dateFormat,
          range_from: dateFormat === '0' ? String(Math.floor(from.getTime() / 1000)) : indiaDate(from),
          range_to: dateFormat === '0' ? String(Math.floor(end.getTime() / 1000)) : indiaDate(end),
        });
        lastAttempt = { symbol: instrumentKey, resolution, dateFormat, from: params.get('range_from'), to: params.get('range_to') };
        const response = await fetch(`https://api-t1.fyers.in/data/history?${params.toString()}`, {
          headers: { Accept: 'application/json', Authorization: `${process.env.FYERS_CLIENT_ID}:${accessToken}` },
        });
        const text = await response.text();
        let payload: any;
        try { payload = JSON.parse(text); }
        catch { throw Object.assign(new Error(`Fyers history returned a non-JSON response (${response.status})`), { status: response.status }); }
        const brokerCode = Number(payload?.code);
        const brokerStatus = String(payload?.s || '').toLowerCase();
        if (!response.ok || brokerStatus === 'error' || brokerCode === 429) {
          const err: any = new Error(payload?.message || `Fyers history failed (${response.status})`);
          err.status = brokerCode === 429 || response.status === 429 ? 429 : response.status;
          err.brokerCode = brokerCode;
          err.fyersStatus = payload?.s;
          throw err;
        }
        return normalize(payload?.candles || [], limit);
      };

      // FYERS has had symbol-specific inconsistencies for NIFTY50-INDEX:
      // date_format=1 has intermittently returned s=no_data while the same
      // bounded range works with epoch seconds. Use epoch first for NIFTY50,
      // and the normal yyyy-mm-dd form for other symbols. Do not rotate through
      // cont_flag variants here: that multiplies broker calls and was the cause
      // of the request-limit failures seen while switching charts.
      const isNifty50 = instrumentKey === 'NSE:NIFTY50-INDEX';
      const formats: Array<'0' | '1'> = isNifty50 ? ['0', '1'] : ['1', '0'];
      for (const dateFormat of formats) {
        try {
          data = await requestHistory(dateFormat);
          if (data.length) break;
        } catch (error: any) {
          historyError = error;
          if (Number(error?.status) === 429 || Number(error?.brokerCode) === 429) throw error;
        }
      }

      // Do not make a third broker request here. If both supported date
      // encodings return no candles, surface the broker result. This keeps a
      // ticker switch from turning into a history-request storm.
      // Never fabricate historical candles. A quote is useful for the watchlist
      // but it is not historical OHLC and must not be used to make a chart appear
      // healthy when History API failed.
      if (data.length < 2) {
        if (beforeDate) return [];
        console.error('[TradingCore][FYERS history] insufficient', { symbol: instrumentKey, resolution, before: beforeDate?.toISOString() || null, lastAttempt, error: historyError?.message || null, brokerCode: historyError?.brokerCode ?? null, fyersStatus: historyError?.fyersStatus ?? null });
        throw historyError || new Error(`Fyers returned no historical candles for ${instrumentKey}.`);
      }
      console.info('[TradingCore][FYERS history] loaded', { symbol: instrumentKey, resolution, before: beforeDate?.toISOString() || null, requested: limit, returned: data.length, oldest: data[0]?.timestamp || null, newest: data[data.length - 1]?.timestamp || null,  });
      cache.set(key, { data, expiresAt: Date.now() + 120_000 });
      return data;
    });
    inflight.set(key, task);
    const data = await task;
    res.setHeader('Cache-Control', 'private, max-age=20');
    res.json({ success: true, data, requested: limit, returned: data.length, maxChartHistory, before: beforeDate?.toISOString() || null, oldestTimestamp: data[0]?.timestamp || null, hasMore: Boolean(data.length) });
  } catch (error: any) {
    res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load Fyers historical candles', brokerRateLimited: Number(error?.status) === 429 });
  } finally {
    inflight.delete(key);
  }
});
