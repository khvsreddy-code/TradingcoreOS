import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { withBrokerRequestGate } from '../brokers/BrokerRequestGate.js';

/**
 * Upstox V3 historical candles have broker-enforced date windows:
 * - 1–15 minute candles: max one month per request
 * - >15 minute/hour candles: max one quarter per request
 * - daily candles: max one decade per request
 */
export const upstoxHistoryRoutes = Router();
upstoxHistoryRoutes.use(requireUser);

const intervalConfig: Record<string, { unit: string; value: string; lookbackDays: number }> = {
  '1minute': { unit: 'minutes', value: '1', lookbackDays: 30 },
  '3minute': { unit: 'minutes', value: '3', lookbackDays: 30 },
  '5minute': { unit: 'minutes', value: '5', lookbackDays: 30 },
  '15minute': { unit: 'minutes', value: '15', lookbackDays: 30 },
  '30minute': { unit: 'minutes', value: '30', lookbackDays: 90 },
  '60minute': { unit: 'hours', value: '1', lookbackDays: 90 },
  day: { unit: 'days', value: '1', lookbackDays: 3650 },
};

function isoDate(date: Date): string { return date.toISOString().slice(0, 10); }

function normalizeCandles(rows: any[], limit: number): any[] {
  const byTime = new Map<number, any>();
  for (const row of rows || []) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const time = Date.parse(String(row[0]));
    const values = [Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4])];
    if (!Number.isFinite(time) || values.some((v) => !Number.isFinite(v))) continue;
    byTime.set(time, { timestamp: new Date(time).toISOString(), open: values[0], high: values[1], low: values[2], close: values[3], volume: Number.isFinite(Number(row[5])) ? Number(row[5]) : 0 });
  }
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([, candle]) => candle).slice(-limit);
}

const cache = new Map<string, { expiresAt: number; data: any[] }>();
const inflight = new Map<string, Promise<any[]>>();

upstoxHistoryRoutes.get('/:brokerId/historical', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'upstox') return next();
  const userId = req.tradingCoreUserId!;
  const session = await BrokerRepository.getSession('upstox', userId);
  if (!session || session.status !== 'Connected') { res.status(401).json({ success: false, error: 'Upstox is not connected for this account.' }); return; }

  const interval = String(req.query.interval || '').trim();
  const config = intervalConfig[interval];
  const instrumentKey = String(req.query.instrument_key || '').trim();
  const beforeRaw = String(req.query.before || '').trim();
  const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
  if (beforeRaw && (!beforeDate || !Number.isFinite(beforeDate.getTime()))) { res.status(400).json({ success: false, error: 'before must be a valid ISO timestamp' }); return; }
  const requestedLimit = Number(req.query.limit || (beforeDate ? 5_000 : 10_000));
  const limit = Number.isFinite(requestedLimit) ? Math.max(2, Math.min(beforeDate ? 5_000 : 10_000, Math.floor(requestedLimit))) : (beforeDate ? 5_000 : 10_000);
  const maxChartHistory = 30_000;
  if (!config || !instrumentKey) { res.status(400).json({ success: false, error: 'instrument_key and a supported interval are required' }); return; }

  const key = `${userId}:upstox:${instrumentKey}:${interval}:${limit}:${beforeDate?.toISOString() || 'latest'}`;
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
      res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load Upstox historical candles', brokerRateLimited: Number(error?.status) === 429 });
    }
    return;
  }

  try {
    const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
    const task = withBrokerRequestGate('upstox', accessToken, async () => {
      // V3 allows one month for 1–15m and one quarter for >15m/hour. Keep one
      // broker-safe window per request; older windows are left-edge pages.
      const end = beforeDate ? new Date(beforeDate.getTime() - 1000) : new Date();
      const from = new Date(end.getTime() - config.lookbackDays * 86_400_000);
      const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${config.unit}/${config.value}/${isoDate(end)}/${isoDate(from)}`;
      const response = await fetch(url, { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } });
      const payload = await response.json();
      if (!response.ok || payload?.status === 'error') { const brokerCode = Number(payload?.errors?.[0]?.code || payload?.code || 0); const err: any = new Error(payload?.errors?.[0]?.message || payload?.message || `Upstox historical data failed (${response.status})`); err.status = response.status === 429 || brokerCode === 429 ? 429 : response.status; err.brokerRateLimited = err.status === 429; throw err; }
      const candles = normalizeCandles(payload?.data?.candles || [], limit);
      if (candles.length < 2) { if (beforeDate) return []; throw new Error(`Upstox returned only ${candles.length} valid candle(s).`); }
      cache.set(key, { data: candles, expiresAt: Date.now() + 120_000 });
      return candles;
    });
    inflight.set(key, task);
    const candles = await task;
    res.setHeader('Cache-Control', 'private, max-age=20');
    return res.json({ success: true, data: candles, requested: limit, returned: candles.length, maxChartHistory, before: beforeDate?.toISOString() || null, oldestTimestamp: candles[0]?.timestamp || null, hasMore: Boolean(candles.length) });
  } catch (error: any) {
    return res.status(Number(error?.status) === 429 ? 429 : 502).json({ success: false, error: error?.message || 'Unable to load Upstox historical candles', brokerRateLimited: Number(error?.status) === 429 });
  } finally {
    inflight.delete(key);
  }
});
