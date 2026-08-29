import { Router, Request, Response } from 'express';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { UpstoxMarketDataTransport } from '../marketData/UpstoxMarketDataTransport.js';

export const tradingRoutes = Router();

// Middleware to inject adapter and token
async function injectBrokerSession(req: AuthenticatedRequest, res: Response, next: Function) {
  const brokerId = req.params.brokerId;
  const userId = req.tradingCoreUserId!;

  const session = await BrokerRepository.getSession(brokerId, userId);
  if (!session || session.status !== 'Connected') {
    return res.status(401).json({ success: false, error: 'Broker not connected or session expired' });
  }

  const adapter = BrokerRegistry.getAdapter(brokerId);
  if (!adapter) {
    return res.status(400).json({ success: false, error: 'Unknown broker ID' });
  }

  try {
    const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
    (req as any).brokerAdapter = adapter;
    (req as any).accessToken = accessToken;
    next();
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to decrypt session token' });
  }
}

tradingRoutes.use(requireUser);

tradingRoutes.get('/:brokerId/profile', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.getProfile((req as any).accessToken);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.get('/:brokerId/funds', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.getFunds((req as any).accessToken);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.get('/:brokerId/holdings', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.getHoldings((req as any).accessToken);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.get('/:brokerId/positions', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.getPositions((req as any).accessToken);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.get('/:brokerId/orders', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.getOrders((req as any).accessToken);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.get('/:brokerId/trades', injectBrokerSession, async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await (req as any).brokerAdapter.getTrades((req as any).accessToken) }); }
  catch (err: any) { res.status(502).json({ success: false, error: err.message || 'Unable to load trades' }); }
});

tradingRoutes.get('/:brokerId/market-data', injectBrokerSession, async (req: Request, res: Response) => {
  const instrumentKeys = String(req.query.instrument_keys || '').split(',').filter(Boolean);
  if (!instrumentKeys.length) return res.status(400).json({ success: false, error: 'instrument_keys is required' });
  try { res.json({ success: true, data: await (req as any).brokerAdapter.getMarketQuotes((req as any).accessToken, instrumentKeys) }); }
  catch (err: any) { res.status(502).json({ success: false, error: err.message || 'Unable to load market quotes' }); }
});

tradingRoutes.get('/:brokerId/historical', injectBrokerSession, async (req: Request, res: Response) => {
  const instrumentKey = String(req.query.instrument_key || '');
  const interval = String(req.query.interval || '');
  if (!instrumentKey || !interval) return res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
  try { res.json({ success: true, data: await (req as any).brokerAdapter.getHistoricalData((req as any).accessToken, instrumentKey, interval) }); }
  catch (err: any) { res.status(502).json({ success: false, error: err.message || 'Unable to load historical data' }); }
});

/** Authenticated normalized market stream. Browser receives no Upstox credential or raw protobuf. */
tradingRoutes.get('/:brokerId/market-stream', injectBrokerSession, (req: AuthenticatedRequest, res: Response) => {
  const instrumentKeys = String(req.query.instrument_keys || '').split(',').filter(Boolean);
  if (!instrumentKeys.length) { res.status(400).json({ success: false, error: 'instrument_keys is required' }); return; }
  if (req.params.brokerId.toLowerCase() !== 'upstox') { res.status(400).json({ success: false, error: 'Live streaming is only implemented for Upstox' }); return; }
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const unsubscribe = UpstoxMarketDataTransport.subscribe(req.tradingCoreUserId!, (req as any).accessToken, instrumentKeys, (event) => res.write(`${JSON.stringify(event)}\n`));
  req.on('close', unsubscribe);
});

tradingRoutes.get('/:brokerId/option-chain', injectBrokerSession, async (req: Request, res: Response) => {
  const instrumentKey = String(req.query.instrument_key || ''); const expiryDate = String(req.query.expiry_date || '');
  if (!instrumentKey || !expiryDate) { res.status(400).json({ success: false, error: 'instrument_key and expiry_date are required' }); return; }
  try { res.json({ success: true, data: await (req as any).brokerAdapter.getOptionChain((req as any).accessToken, instrumentKey, expiryDate) }); }
  catch (err: any) { res.status(502).json({ success: false, error: err.message || 'Unable to load option chain' }); }
});

tradingRoutes.post('/:brokerId/order', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.placeOrder((req as any).accessToken, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.put('/:brokerId/order/:orderId', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.modifyOrder((req as any).accessToken, req.params.orderId, req.body);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

tradingRoutes.delete('/:brokerId/order/:orderId', injectBrokerSession, async (req: Request, res: Response) => {
  try {
    const data = await (req as any).brokerAdapter.cancelOrder((req as any).accessToken, req.params.orderId);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
