import { Router, type Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { CanonicalHistoryError, historicalBarsToColumns, loadCanonicalHistoryForUser } from '../marketData/canonicalHistoricalData.js';

export const fyersHistoryRoutes = Router();
fyersHistoryRoutes.use(requireUser);

fyersHistoryRoutes.get('/:brokerId/historical', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();

  const rawSymbol = String(req.query.instrument_key || '').trim();
  const timeframe = String(req.query.interval || '').trim();
  if (!rawSymbol || !timeframe) return res.status(400).json({ success: false, error: 'instrument_key and interval are required' });

  const beforeRaw = String(req.query.before || '').trim();
  let beforeTimestamp: number | undefined;
  if (beforeRaw) {
    const numeric = Number(beforeRaw);
    beforeTimestamp = Number.isFinite(numeric) ? (numeric > 1e12 ? numeric : numeric * 1000) : Date.parse(beforeRaw);
    if (!Number.isFinite(beforeTimestamp) || beforeTimestamp <= 0) return res.status(400).json({ success: false, error: 'before must be a valid epoch or ISO timestamp.' });
  }
  const requested = Number(req.query.limit || 5000);
  const limit = Number.isFinite(requested) ? Math.max(2, Math.min(5000, Math.floor(requested))) : 5000;
  const columnar = String(req.query.format || '').toLowerCase() === 'columns';

  try {
    const loaded = await loadCanonicalHistoryForUser({
      userId: req.tradingCoreUserId!,
      symbol: rawSymbol,
      timeframe,
      limit,
      ...(beforeTimestamp !== undefined ? { beforeTimestamp } : {}),
    });
    if (!loaded.bars.length && beforeTimestamp === undefined) {
      return res.status(502).json({
        success: false,
        error: 'No validated historical candles are available from FYERS or the configured TradingView datafeed.',
        data: columnar ? historicalBarsToColumns([], loaded.metadata, loaded.quote) : [],
        metadata: loaded.metadata,
        quote: loaded.quote,
      });
    }
    res.setHeader('Cache-Control', 'private, max-age=10');
    return res.json({
      success: true,
      data: columnar ? historicalBarsToColumns(loaded.bars, loaded.metadata, loaded.quote) : loaded.bars,
      requested: limit,
      returned: loaded.bars.length,
      before: beforeTimestamp ? new Date(beforeTimestamp).toISOString() : null,
      oldestTimestamp: loaded.metadata.oldestTimestamp,
      newestTimestamp: loaded.metadata.newestTimestamp,
      metadata: loaded.metadata,
      quote: loaded.quote,
    });
  } catch (error: unknown) {
    const status = error instanceof CanonicalHistoryError ? error.statusCode : 502;
    if (status === 429) res.setHeader('Retry-After', '1');
    return res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message.replace(/[\r\n\t]+/g, ' ').slice(0, 240) : 'Unable to load validated historical candles.',
      code: error instanceof CanonicalHistoryError ? error.code : undefined,
      requestId: res.getHeader('X-Request-Id') || null,
    });
  }
});
