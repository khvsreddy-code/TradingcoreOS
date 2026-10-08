import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { API_LATENCY_BUDGET_MS, timeoutSignal } from '../latency/budgets.js';

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
  '120minute': '120',
  '240minute': '240',
  day: 'D',
  '1day': 'D',
  week: '1W',
  month: '1M',
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

function normalizeColumns(rows: any[], limit: number) {
  const sorted: Array<[number, number, number, number, number, number]> = [];
  for (const row of rows || []) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const raw = Number(row[0]);
    const time = raw > 1e12 ? raw : raw * 1000;
    const open = Number(row[1]), high = Number(row[2]), low = Number(row[3]), close = Number(row[4]);
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) continue;
    sorted.push([time, open, high, low, close, Number.isFinite(Number(row[5])) ? Number(row[5]) : 0]);
  }
  sorted.sort((a, b) => a[0] - b[0]);
  const time: number[] = [], open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = [];
  let previous = Number.NaN;
  const start = Math.max(0, sorted.length - limit);
  for (let i = start; i < sorted.length; i += 1) {
    const row = sorted[i]!;
    if (row[0] === previous) continue;
    previous = row[0];
    time.push(row[0]); open.push(row[1]); high.push(row[2]); low.push(row[3]); close.push(row[4]); volume.push(row[5]);
  }
  return { time, open, high, low, close, volume, timeUnit: 'milliseconds' as const };
}

type FyersColumnarData = ReturnType<typeof normalizeColumns>;
type FyersHistoryData = any[] | FyersColumnarData;

function isColumnarData(value: FyersHistoryData): value is FyersColumnarData {
  return !Array.isArray(value);
}

function columnsFromCandleRows(rows: any[]) {
  const time: number[] = [], open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = [];
  for (const row of rows || []) {
    const parsed = Date.parse(String(row?.timestamp || ''));
    if (!Number.isFinite(parsed)) continue;
    time.push(parsed); open.push(Number(row.open)); high.push(Number(row.high)); low.push(Number(row.low)); close.push(Number(row.close)); volume.push(Number.isFinite(Number(row.volume)) ? Number(row.volume) : 0);
  }
  return { time, open, high, low, close, volume, timeUnit: 'milliseconds' as const };
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

const cache = new Map<string, { expiresAt: number; data: any }>();
const inflight = new Map<string, Promise<any>>();

function historyErrorStatus(error: any): number {
  if (error?.name === 'AbortError') return 504;
  const status = Number(error?.status);
  if (status === 401 || status === 403 || status === 429 || status === 504) return status;
  return 502;
}

function sendHistoryError(res: Response, error: any): void {
  const status = historyErrorStatus(error);
  if (status === 429) res.setHeader('Retry-After', '1');
  res.status(status).json({
    success: false,
    error: error?.message || 'Unable to load Fyers historical candles',
    brokerCode: error?.brokerCode,
    requestId: res.getHeader('X-Request-Id') || null,
  });
}

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
  const columnar = String(req.query.format || '').toLowerCase() === 'columns';
  const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
  if (beforeRaw && (!beforeDate || !Number.isFinite(beforeDate.getTime()))) {
    res.status(400).json({ success: false, error: 'before must be a valid ISO timestamp' });
    return;
  }

  const requested = Number(req.query.limit || 10_000);
  const limit = Number.isFinite(requested)
    ? Math.max(2, Math.min(5_000, Math.floor(requested)))
    : 5_000;
  if (!instrumentKey || !resolution) {
    res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
    return;
  }

  const beforeKey = beforeDate ? beforeDate.toISOString() : 'latest';
  const key = `${userId}:fyers:${instrumentKey}:${resolution}:${limit}:${beforeKey}:${columnar ? 'columns' : 'rows'}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'private, max-age=20');
    res.json({ success: true, data: cached.data, requested: limit, returned: columnar ? cached.data.time.length : cached.data.length, cached: true, before: beforeDate?.toISOString() || null });
    return;
  }

  const existing = inflight.get(key);
  if (existing) {
    try {
      const data = await existing;
      res.setHeader('Cache-Control', 'private, max-age=20');
      res.json({ success: true, data, requested: limit, returned: columnar ? data.time.length : data.length, cached: true, before: beforeDate?.toISOString() || null });
    } catch (error: any) {
      sendHistoryError(res, error);
    }
    return;
  }

  try {
    const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
    const requestSignal = timeoutSignal(API_LATENCY_BUDGET_MS.history);
    const client = new FyersApiClient(accessToken);

    const task = (async () => {
      const end = beforeDate ? new Date(beforeDate.getTime() - 1_000) : new Date();
      const minuteResolution = Number(resolution);
      const barsPerDay = Number.isFinite(minuteResolution) && minuteResolution > 0 ? (6.25 * 60) / minuteResolution : 1;
      const estimatedCalendarDays = Number.isFinite(minuteResolution)
        ? Math.ceil((limit / Math.max(1, barsPerDay)) * 1.65)
        : 3650;
      const lookbackDays = resolution === 'D'
        ? Math.max(3650, limit)
        : Math.min(3650, Math.max(7, estimatedCalendarDays));
      const from = new Date(end.getTime() - lookbackDays * 86_400_000);
      // The History API is the sole source for this route. Quote/LTP data is
      // realtime and must never be converted into a historical candle.
      const payload = await client.dataGet<{ candles?: unknown[] }>(
        '/history',
        {
          symbol: instrumentKey,
          resolution,
          date_format: '0',
          range_from: String(Math.floor(from.getTime() / 1000)),
          range_to: String(Math.floor(end.getTime() / 1000)),
          cont_flag: '1',
        },
        requestSignal,
        API_LATENCY_BUDGET_MS.history,
      );
      const candles = Array.isArray(payload?.candles) ? payload.candles : [];
      const data: FyersHistoryData = columnar ? normalizeColumns(candles as any[], limit) : normalize(candles as any[], limit);
      const finalLength = isColumnarData(data) ? data.time.length : data.length;
      if (!finalLength) throw new Error(`Fyers returned no historical candles for ${instrumentKey}.`);
      cache.set(key, { data, expiresAt: Date.now() + 120_000 });
      return data;
    })();
    inflight.set(key, task);
    const data = await task;
    res.setHeader('Cache-Control', 'private, max-age=20');
    const returned = isColumnarData(data) ? data.time.length : data.length;
    const oldestTimestamp = isColumnarData(data) ? (returned ? new Date(data.time[0]).toISOString() : null) : data[0]?.timestamp || null;
    const newestTimestamp = isColumnarData(data) ? (returned ? new Date(data.time[returned - 1]).toISOString() : null) : data[data.length - 1]?.timestamp || null;
    res.json({ success: true, data, requested: limit, returned, before: beforeDate?.toISOString() || null, oldestTimestamp, newestTimestamp });
  } catch (error: any) {
    sendHistoryError(res, error);
  } finally {
    inflight.delete(key);
  }
});
