import { Router, Response } from 'express';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersApiClient } from '../fyers/core/FyersApiClient.js';
import { API_LATENCY_BUDGET_MS, timeoutSignal } from '../latency/budgets.js';
import { resolveFyersCapabilities } from '../fyers/core/FyersCapabilities.js';
import { canonicalFyersSymbol } from '../fyers/symbols/canonicalFyersSymbol.js';
import { historicalDataService, type HistoricalInstrumentMapping } from '../marketData/HistoricalDataService.js';
import type { HistoricalCandle, HistoricalQuoteSnapshot } from '../../services/brokers/BrokerAdapter.js';

export const fyersHistoryRoutes = Router();
fyersHistoryRoutes.use(requireUser);

const resolutionMap: Record<string, string> = {
  '1minute': '1', '1m': '1',
  '3minute': '3', '3m': '3',
  '5minute': '5', '5m': '5',
  '10minute': '10', '10m': '10',
  '15minute': '15', '15m': '15',
  '30minute': '30', '30m': '30',
  '60minute': '60', '60m': '60', '1h': '60', '1H': '60',
  '120minute': '120', '2h': '120',
  '240minute': '240', '4h': '240',
  day: 'D', '1day': 'D', '1d': 'D', '1D': 'D',
  week: '1W', month: '1M',
};

function columnsFromBars(rows: HistoricalCandle[]) {
  return {
    time: rows.map((row) => Date.parse(row.timestamp)),
    open: rows.map((row) => row.open),
    high: rows.map((row) => row.high),
    low: rows.map((row) => row.low),
    close: rows.map((row) => row.close),
    volume: rows.map((row) => row.volume),
    timeUnit: 'milliseconds' as const,
  };
}

function historyErrorStatus(error: unknown): number {
  const value = error as { name?: string; status?: number } | null;
  if (value?.name === 'AbortError') return 504;
  const status = Number(value?.status);
  return [401, 403, 429, 504].includes(status) ? status : 502;
}

function safeError(error: unknown): string {
  const value = error as { message?: string } | null;
  return String(value?.message || 'Unable to load validated historical candles').replace(/[\r\n\t]+/g, ' ').slice(0, 240);
}

function epochMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const text = String(value ?? '').trim();
  const numeric = Number(text);
  if (text && Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/** Market quotes remain snapshots and are never converted into historical bars. */
async function fallbackQuoteSnapshot(
  client: FyersApiClient,
  symbol: string,
  signal: AbortSignal,
): Promise<HistoricalQuoteSnapshot | null> {
  try {
    const payload = await client.dataGet<any>('/quotes', { symbols: symbol }, signal, API_LATENCY_BUDGET_MS.quote);
    const quote = Array.isArray(payload?.d)
      ? payload.d.find((item: any) => String(item?.s || '').toUpperCase() === symbol.toUpperCase()) || payload.d[0]
      : undefined;
    const values = quote?.v || {};
    const ltp = Number(values.lp ?? values.ltp ?? values.last_price);
    if (!Number.isFinite(ltp) || ltp <= 0) return null;
    const timestamp = new Date(epochMs(values.tt ?? values.t ?? values.timestamp ?? Date.now())).toISOString();
    const rawVolume = Number(values.volume ?? values.vol ?? 0);
    return {
      instrumentId: symbol,
      ltp,
      timestamp,
      ...(Number.isFinite(rawVolume) && rawVolume >= 0 ? { volume: rawVolume } : {}),
      source: 'fyers',
    };
  } catch {
    // Quotes are supplementary UI context. An unavailable quote must not hide
    // historical data from tvdatafeed or manufacture a candle.
    return null;
  }
}

fyersHistoryRoutes.get('/:brokerId/historical', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();

  const userId = req.tradingCoreUserId!;
  const rawSymbol = String(req.query.instrument_key || '').trim();
  const interval = String(req.query.interval || '').trim();
  const secondsMatch = /^(\d+)\s*(?:s|sec|second|seconds)$/i.exec(interval);
  let instrumentKey = '';
  try {
    instrumentKey = canonicalFyersSymbol(rawSymbol);
  } catch {
    return res.status(400).json({ success: false, error: 'instrument_key is not a valid canonical FYERS symbol.' });
  }
  const resolution = resolutionMap[interval] || (secondsMatch ? String(Number(secondsMatch[1])) + 'S' : interval);
  const secondsInterval = Boolean(secondsMatch || /^\d+S$/i.test(interval));
  const capabilities = resolveFyersCapabilities(userId);
  if (secondsInterval && !capabilities.secondData) {
    return res.status(403).json({
      success: false,
      error: 'Seconds-level historical data requires a verified FYERS Prime entitlement.',
      code: 'FYERS_SECONDS_DATA_REQUIRES_PRIME',
      plan: capabilities.plan,
    });
  }

  const beforeRaw = String(req.query.before || '').trim();
  const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
  if (beforeRaw && (!beforeDate || !Number.isFinite(beforeDate.getTime()))) {
    return res.status(400).json({ success: false, error: 'before must be a valid ISO timestamp' });
  }
  const requested = Number(req.query.limit || 5000);
  const limit = Number.isFinite(requested) ? Math.max(2, Math.min(5000, Math.floor(requested))) : 5000;
  const columnar = String(req.query.format || '').toLowerCase() === 'columns';
  if (!instrumentKey || !resolution) {
    return res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
  }

  try {
    // FYERS is optional for source resolution: if the account is not connected,
    // the authenticated historical coordinator may still use an exact TV map.
    let fyersClient: FyersApiClient | null = null;
    let fyersUnavailableReason: string | undefined;
    try {
      const session = await BrokerRepository.getSession('fyers', userId);
      if (session?.status === 'Connected') {
        const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
        fyersClient = new FyersApiClient(accessToken, undefined, capabilities, userId);
      } else {
        fyersUnavailableReason = 'Fyers session is not connected';
      }
    } catch (error) {
      fyersUnavailableReason = safeError(error);
    }

    const fetchFyersRecent = fyersClient
      ? async (mapping: HistoricalInstrumentMapping, range: { fromMs: number; toMs: number; fromDate: string; calendarPolicy: string }) => {
          const requestSignal = timeoutSignal(API_LATENCY_BUDGET_MS.history);
          const payload = await fyersClient!.dataGet<any>('/history', {
            symbol: mapping.fyersSymbol,
            resolution,
            date_format: '0',
            range_from: String(Math.floor(range.fromMs / 1000)),
            range_to: String(Math.floor(range.toMs / 1000)),
            cont_flag: '1',
          }, requestSignal, API_LATENCY_BUDGET_MS.history);
          const bars = Array.isArray(payload?.candles) ? payload.candles : [];
          const quote = bars.length ? null : await fallbackQuoteSnapshot(fyersClient!, mapping.fyersSymbol, requestSignal);
          return {
            bars,
            quote,
            status: {
              recentSessionRangeFrom: range.fromDate,
              rangeTo: new Date(range.toMs).toISOString(),
              calendarPolicy: range.calendarPolicy,
            },
          };
        }
      : undefined;

    const result = await historicalDataService.load({
      instrumentId: instrumentKey,
      timeframe: interval,
      maxBars: limit,
      ...(beforeDate ? { beforeTimestamp: beforeDate.getTime() } : {}),
      fetchFyersRecent,
    });

    if (!result.bars.length && !beforeDate) {
      const error = 'No validated historical candles are available from FYERS or tvdatafeed.';
      return res.status(502).json({
        success: false,
        error,
        ...(result.quote ? { quote: result.quote } : {}),
        metadata: {
          ...result.metadata,
          sourceStatus: {
            ...result.metadata.sourceStatus,
            fyersUnavailableReason: fyersUnavailableReason || undefined,
          },
        },
        data: columnar ? columnsFromBars([]) : [],
      });
    }

    res.setHeader('Cache-Control', 'private, max-age=10');
    res.json({
      success: true,
      data: columnar ? columnsFromBars(result.bars) : result.bars,
      requested: limit,
      returned: result.bars.length,
      before: beforeDate?.toISOString() || null,
      oldestTimestamp: result.bars[0]?.timestamp || null,
      newestTimestamp: result.bars[result.bars.length - 1]?.timestamp || null,
      metadata: {
        ...result.metadata,
        sourceStatus: {
          ...result.metadata.sourceStatus,
          fyersUnavailableReason: fyersUnavailableReason || undefined,
        },
      },
      quote: result.quote,
    });
  } catch (error) {
    const status = historyErrorStatus(error);
    if (status === 429) res.setHeader('Retry-After', '1');
    res.status(status).json({
      success: false,
      error: safeError(error),
      brokerCode: (error as any)?.brokerCode,
      requestId: res.getHeader('X-Request-Id') || null,
    });
  }
});
