import { Router, type Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { CanonicalHistoryError, historicalBarsToColumns, loadCanonicalHistoryForUser } from '../marketData/canonicalHistoricalData.js';

export const coreSpiritResearchHistoryRoutes = Router();
coreSpiritResearchHistoryRoutes.use(requireUser);

coreSpiritResearchHistoryRoutes.get('/history', async (req: AuthenticatedRequest, res: Response) => {
  const symbol = String(req.query.symbol || req.query.instrument_key || '').trim();
  const timeframe = String(req.query.timeframe || req.query.interval || '').trim();
  if (!symbol || !timeframe) return res.status(400).json({ success: false, error: 'symbol and timeframe are required.' });

  const requested = Number(req.query.limit || 5000);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(5000, Math.floor(requested))) : 5000;
  const beforeRaw = String(req.query.before || '').trim();
  let beforeTimestamp: number | undefined;
  if (beforeRaw) {
    const numeric = Number(beforeRaw);
    beforeTimestamp = Number.isFinite(numeric) ? (numeric > 1e12 ? numeric : numeric * 1000) : Date.parse(beforeRaw);
    if (!Number.isFinite(beforeTimestamp) || beforeTimestamp <= 0) return res.status(400).json({ success: false, error: 'before must be a valid epoch or ISO timestamp.' });
  }

  try {
    const loaded = await loadCanonicalHistoryForUser({
      userId: req.tradingCoreUserId!,
      symbol,
      timeframe,
      limit,
      ...(beforeTimestamp !== undefined ? { beforeTimestamp } : {}),
    });
    const columns = String(req.query.format || '').toLowerCase() === 'columns';
    if (!loaded.bars.length && beforeTimestamp === undefined) {
      return res.status(502).json({
        success: false,
        error: 'No validated historical candles are available from FYERS or the configured TradingView datafeed.',
        data: columns ? historicalBarsToColumns([], loaded.metadata, loaded.quote) : [],
        metadata: loaded.metadata,
      });
    }
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({
      success: true,
      symbol: loaded.symbol,
      timeframe: loaded.timeframe,
      data: columns ? historicalBarsToColumns(loaded.bars, loaded.metadata, loaded.quote) : loaded.bars,
      requested: limit,
      returned: loaded.bars.length,
      oldestTimestamp: loaded.metadata.oldestTimestamp,
      newestTimestamp: loaded.metadata.newestTimestamp,
      metadata: loaded.metadata,
    });
  } catch (error: unknown) {
    const status = error instanceof CanonicalHistoryError ? error.statusCode : 502;
    return res.status(status).json({
      success: false,
      error: error instanceof Error ? error.message.replace(/[\r\n\t]+/g, ' ').slice(0, 240) : 'Unable to load research history.',
      code: error instanceof CanonicalHistoryError ? error.code : undefined,
    });
  }
});
