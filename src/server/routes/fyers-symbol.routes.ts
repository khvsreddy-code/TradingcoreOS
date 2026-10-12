import { Router, Response } from 'express';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersSymbolMasterService } from '../fyers/symbols/FyersSymbolMasterService.js';

export const fyersSymbolRoutes = Router();
fyersSymbolRoutes.use(requireUser);

fyersSymbolRoutes.get('/:brokerId/symbol-master', async (req: AuthenticatedRequest, res: Response, next) => {
  if (String(req.params.brokerId).toLowerCase() !== 'fyers') return next();

  const query = String(req.query.q ?? '').trim();
  // A short/empty search must not trigger a download of the large upstream symbol masters.
  if (query.length < 2) return res.json({ success: true, data: [] });

  const requested = String(req.query.master || 'NSE_CM').trim().toUpperCase();
  const allowed = FyersSymbolMasterService.masterNames();
  const masters = requested === 'ALL' ? allowed : requested.split(',').map((item) => item.trim()).filter(Boolean);
  if (masters.length === 0 || masters.some((master) => !allowed.includes(master as never))) {
    return res.status(400).json({ success: false, error: 'Unsupported FYERS symbol master' });
  }

  const parsedLimit = Number(req.query.limit ?? 50);
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.trunc(parsedLimit))) : 50;

  try {
    const results = await Promise.allSettled(
      masters.map(async (master) => ({
        master,
        rows: await FyersSymbolMasterService.search(master as never, query, limit),
      })),
    );

    const data: Array<Record<string, unknown>> = [];
    let failedMasters = 0;
    for (const result of results) {
      if (result.status !== 'fulfilled') {
        failedMasters += 1;
        continue;
      }
      for (const row of result.value.rows) {
        data.push({ ...row, catalogMaster: result.value.master });
      }
    }

    if (failedMasters === masters.length) {
      return res.status(502).json({ success: false, error: 'Unable to search any requested FYERS symbol master' });
    }

    const needle = query.toUpperCase();
    const tickerOf = (row: Record<string, unknown>): string =>
      String(row.symbol ?? row.symbol_ticker ?? row.symTicker ?? '').toUpperCase().split(':').pop() ?? '';
    const descriptionOf = (row: Record<string, unknown>): string =>
      String(row.exSymName ?? row.symDetails ?? row.description ?? '').toUpperCase();
    const rank = (row: Record<string, unknown>): number => {
      const ticker = tickerOf(row);
      if (ticker === needle) return 0;
      if (ticker.startsWith(needle)) return 1;
      if (ticker.includes(needle)) return 2;
      const description = descriptionOf(row);
      if (description.startsWith(needle)) return 3;
      if (description.includes(needle)) return 4;
      return 5;
    };
    data.sort((a, b) => rank(a) - rank(b));
    return res.json({
      success: true,
      data: data.slice(0, limit),
      partial: failedMasters > 0,
      failedMasters,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to load FYERS symbol master';
    return res.status(502).json({ success: false, error: message });
  }
});
