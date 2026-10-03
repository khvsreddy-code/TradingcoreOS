import { Router, Response } from 'express';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { withBrokerRequestGate } from '../brokers/BrokerRequestGate.js';

export const portfolioSnapshotRoutes = Router();
portfolioSnapshotRoutes.use(requireUser);

const cache = new Map<string, { expiresAt: number; data: any }>();
const inflight = new Map<string, Promise<any>>();

/**
 * Portfolio sync used to fire funds + holdings + positions + orders + trades
 * concurrently. That is five broker REST requests at the exact same instant.
 * Serialize each broker call through the request gate and cache the resulting
 * snapshot briefly. This keeps FYERS comfortably below its documented limits
 * and prevents duplicate React polling loops from multiplying requests.
 */
portfolioSnapshotRoutes.get('/:brokerId/portfolio-snapshot', async (req: AuthenticatedRequest, res: Response, next) => {
  const brokerId = String(req.params.brokerId || '').toLowerCase();
  if (brokerId !== 'fyers') return next();

  const userId = req.tradingCoreUserId!;
  const session = await BrokerRepository.getSession(brokerId, userId);
  if (!session || session.status !== 'Connected') {
    res.status(401).json({ success: false, error: 'Broker not connected or session expired' });
    return;
  }

  const key = `${userId}:${brokerId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 'private, max-age=5');
    res.json({ success: true, data: cached.data, cached: true });
    return;
  }

  const existing = inflight.get(key);
  if (existing) {
    try { res.json({ success: true, data: await existing, cached: true }); }
    catch (error: any) { res.status(502).json({ success: false, error: error?.message || 'Portfolio snapshot failed' }); }
    return;
  }

  try {
    const token = EncryptionService.decrypt(session.accessTokenEncrypted);
    const adapter = BrokerRegistry.getAdapter('fyers');
    if (!adapter) { res.status(400).json({ success: false, error: 'Unknown broker ID' }); return; }

    const task = (async () => {
      const data: Record<string, unknown> = {};
      // Each individual broker REST call enters the gate separately. Holding
      // one gate slot for the entire snapshot would still allow the five
      // upstream calls to burst together.
      try { data.funds = await withBrokerRequestGate('fyers', token, () => adapter.getFunds(token)); } catch { data.funds = null; }
      try { data.holdings = await withBrokerRequestGate('fyers', token, () => adapter.getHoldings(token)); } catch { data.holdings = []; }
      try { data.positions = await withBrokerRequestGate('fyers', token, () => adapter.getPositions(token)); } catch { data.positions = []; }
      try { data.orders = await withBrokerRequestGate('fyers', token, () => adapter.getOrders(token)); } catch { data.orders = []; }
      try { data.trades = await withBrokerRequestGate('fyers', token, () => adapter.getTrades(token)); } catch { data.trades = []; }
      cache.set(key, { data, expiresAt: Date.now() + 10_000 });
      return data;
    })();

    inflight.set(key, task);
    const data = await task;
    res.setHeader('Cache-Control', 'private, max-age=5');
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(502).json({ success: false, error: error?.message || 'Portfolio snapshot failed' });
  } finally {
    inflight.delete(key);
  }
});
