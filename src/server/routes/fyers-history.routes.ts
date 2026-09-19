import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { withBrokerRequestGate } from '../brokers/BrokerRequestGate.js';

/**
 * Safe FYERS historical-data route.
 *
 * History is loaded in broker-safe date windows. The chart starts with 10,000
 * candles and requests older pages lazily as the user pans left, up to a 30,000
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
  if (['bse_index|sensex','sensex'].includes(n) || n.includes('sensex-index')) return 'BSE:SENSEX-INDEX';
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
  const params = new URLSearchParams({ symbols: symbol });
  const response = await fetch(`https://api-t1.fyers.in/data/quotes?${params.toString()}`, {
    headers: { Accept: 'application/json', Authorization: `${process.env.FYERS_CLIENT_ID}:${accessToken}` },
  });
  const text = await response.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { return []; }
  if (!response.ok || payload?.s === 'error') return [];
  const quote = Array.isArray(payload?.d) ? payload.d.find((x: any) => String(x?.s || '').toUpperCase() === symbol.toUpperCase()) || payload.d[0] : undefined;
  const value = quote?.v || {};
  const ltp = Number(value.lp ?? value.ltp ?? value.last_price);
  if (!Number.isFinite(ltp) || ltp <= 0) return [];
  const now = new Date();
  const volume = Number(value.volume ?? value.vol ?? 0);
  return [{
    timestamp: now.toISOString(),
    open: ltp,
    high: ltp,
    low: ltp,
    close: ltp,
    volume: Number.isFinite(volume) ? volume : 0,
    liveSeed: true,
  }];
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
  const requested = Number(req.query.limit || (beforeDate ? 5_000 : 10_000));
  const limit = Number.isFinite(requested) ? Math.max(2, Math.min(beforeDate ? 5_000 : 10_000, Math.floor(requested))) : (beforeDate ? 5_000 : 10_000);
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
      // Use a conservative intraday window for the first paint. FYERS history
      // supports large intraday lookbacks overall, but the per-request window
      // is the part most likely to be rejected/emptied by broker-side changes.
      // Thirty calendar days is comfortably inside the safe range and still
      // gives thousands of 1m/5m candles for an immediate chart. Older data is
      // fetched with the `before` cursor only when the user pans left.
      const pageDays = resolution === 'D' ? 366 : 30;
      const requestedEnd = beforeDate ? new Date(beforeDate.getTime() - 1000) : new Date();
      let data: any[] = [];
      let historyError: any = null;

      // FYERS accepts both epoch and yyyy-mm-dd history ranges. Prefer epoch
      // ranges because they are unambiguous around weekends/holidays and then
      // fall back to the documented date-string form if the broker rejects the
      // first form. When the market is closed, also probe the previous few
      // calendar days instead of asking the broker for a range ending on a
      // Saturday/Sunday/holiday and treating the empty response as "no data".
      const candidateEnds: Date[] = [];
      const seenEnds = new Set<string>();
      for (let offset = 0; offset <= 5; offset += 1) {
        const end = new Date(requestedEnd.getTime() - offset * 86_400_000);
        const day = end.getUTCDay();
        if (!beforeDate && (day === 0 || day === 6)) continue;
        const key = end.toISOString().slice(0, 10);
        if (!seenEnds.has(key)) { seenEnds.add(key); candidateEnds.push(end); }
        if (beforeDate) break;
      }
      if (!candidateEnds.length) candidateEnds.push(requestedEnd);

      const requestHistory = async (end: Date, dateFormat: '0' | '1'): Promise<any[]> => {
        const from = new Date(end.getTime() - pageDays * 86_400_000);
        const params = new URLSearchParams({
          symbol: instrumentKey, resolution, date_format: dateFormat,
          // cont_flag is for continuous contracts. FYERS community examples show
          // index history working with cont_flag=0; using 1 can produce no_data/
          // invalid-symbol responses for NIFTY even though quotes still work.
          cont_flag: /-(?:FUT|CE|PE)$/i.test(instrumentKey) ? '1' : '0',
          range_from: dateFormat === '0' ? String(Math.floor(from.getTime() / 1000)) : indiaDate(from),
          range_to: dateFormat === '0' ? String(Math.floor(end.getTime() / 1000)) : indiaDate(end),
        });
        const response = await fetch(`https://api-t1.fyers.in/data/history?${params.toString()}`, {
          headers: { Accept: 'application/json', Authorization: `${process.env.FYERS_CLIENT_ID}:${accessToken}` },
        });
        const text = await response.text();
        let payload: any;
        try { payload = JSON.parse(text); }
        catch { throw Object.assign(new Error(`Fyers history returned a non-JSON response (${response.status})`), { status: response.status }); }
        const brokerCode = Number(payload?.code);
        if (!response.ok || payload?.s === 'error' || brokerCode === 429) {
          const err: any = new Error(payload?.message || `Fyers history failed (${response.status})`);
          err.status = brokerCode === 429 ? 429 : response.status;
          err.brokerCode = brokerCode;
          throw err;
        }
        return normalize(payload?.candles || [], limit);
      };

      for (const end of candidateEnds) {
        for (const dateFormat of ['0', '1'] as const) {
          try {
            data = await requestHistory(end, dateFormat);
            if (data.length >= 2) break;
          } catch (error: any) {
            historyError = error;
            if (Number(error?.status) === 429 || Number(error?.brokerCode) === 429) throw error;
          }
        }
        if (data.length >= 2) break;
      }

      // A transient History API failure must not turn the price chart into an
      // empty canvas. For the initial page only, recover from the live quote;
      // websocket ticks then build the developing candle. No historical candle
      // is fabricated and backward pagination never uses this fallback.
      if (data.length < 2 && !beforeDate) {
        const seed = await fallbackQuoteCandle(accessToken, instrumentKey);
        if (seed.length) data = seed;
      }
      if (!data.length) {
        if (beforeDate) return [];
        throw historyError || new Error(`Fyers returned no historical candles for ${instrumentKey}.`);
      }
      cache.set(key, { data, expiresAt: Date.now() + 120_000 });
      return data;
    });
    inflight.set(key, task);
    const data = await task;
    res.setHeader('Cache-Control', 'private, max-age=20');
    res.json({ success: true, data, requested: limit, returned: data.length, maxChartHistory, before: beforeDate?.toISOString() || null, oldestTimestamp: data[0]?.timestamp || null, hasMore: Boolean(data.length && !data[0]?.liveSeed) });
  } catch (error: any) {
    res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load Fyers historical candles', brokerRateLimited: Number(error?.status) === 429 });
  } finally {
    inflight.delete(key);
  }
});
