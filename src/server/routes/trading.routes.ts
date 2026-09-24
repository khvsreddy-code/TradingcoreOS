import { Router, Request, Response } from 'express';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { UpstoxMarketDataTransport } from '../marketData/UpstoxMarketDataTransport.js';
import { FyersMarketDataTransport } from '../marketData/FyersMarketDataTransport.js';
import { OAuthService } from '../auth/OAuthService.js';
import { OrderIdempotencyRepository } from '../storage/OrderIdempotencyRepository.js';

export const tradingRoutes = Router();

async function injectBrokerSession(req: AuthenticatedRequest, res: Response, next: Function) {
  const brokerId = req.params.brokerId;
  const userId = req.tradingCoreUserId!;
  let session = await BrokerRepository.getSession(brokerId, userId);
  if (!session || session.status !== 'Connected') return res.status(401).json({ success: false, error: 'Broker not connected or session expired' });
  if (new Date(session.expiresAt).getTime() <= Date.now() + 60_000 && session.refreshTokenEncrypted) {
    const refreshed = await OAuthService.refreshSession(brokerId, userId);
    if (refreshed.success) session = await BrokerRepository.getSession(brokerId, userId) || session;
  }
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await BrokerRepository.updateStatus(brokerId, userId, 'Expired');
    return res.status(401).json({ success: false, error: 'Broker session expired. Reconnect the broker to continue.' });
  }
  const adapter = BrokerRegistry.getAdapter(brokerId);
  if (!adapter) return res.status(400).json({ success: false, error: 'Unknown broker ID' });
  try {
    const accessToken = EncryptionService.decrypt(session.accessTokenEncrypted);
    (req as any).brokerAdapter = adapter;
    (req as any).accessToken = accessToken;
    next();
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to decrypt session token' });
  }
}

tradingRoutes.use(requireUser);

tradingRoutes.get('/:brokerId/profile', injectBrokerSession, async (req: Request, res: Response) => {
  try { const data = await (req as any).brokerAdapter.getProfile((req as any).accessToken); res.json({ success: true, data }); }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

tradingRoutes.get('/:brokerId/funds', injectBrokerSession, async (req: Request, res: Response) => {
  try { const data = await (req as any).brokerAdapter.getFunds((req as any).accessToken); res.json({ success: true, data }); }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

tradingRoutes.get('/:brokerId/holdings', injectBrokerSession, async (req: Request, res: Response) => {
  try { const data = await (req as any).brokerAdapter.getHoldings((req as any).accessToken); res.json({ success: true, data }); }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

tradingRoutes.get('/:brokerId/positions', injectBrokerSession, async (req: Request, res: Response) => {
  try { const data = await (req as any).brokerAdapter.getPositions((req as any).accessToken); res.json({ success: true, data }); }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

tradingRoutes.get('/:brokerId/orders', injectBrokerSession, async (req: Request, res: Response) => {
  try { const data = await (req as any).brokerAdapter.getOrders((req as any).accessToken); res.json({ success: true, data }); }
  catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

tradingRoutes.get('/:brokerId/trades', injectBrokerSession, async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await (req as any).brokerAdapter.getTrades((req as any).accessToken) }); }
  catch (err: any) { res.status(502).json({ success: false, error: err.message || 'Unable to load trades' }); }
});

tradingRoutes.get('/:brokerId/portfolio-snapshot', injectBrokerSession, async (req: Request, res: Response) => {
  const adapter = (req as any).brokerAdapter;
  const token = (req as any).accessToken;
  const tasks = { funds: () => adapter.getFunds(token), holdings: () => adapter.getHoldings(token), positions: () => adapter.getPositions(token), orders: () => adapter.getOrders(token), trades: () => adapter.getTrades(token) };
  const entries = Object.entries(tasks);
  const results = await Promise.allSettled(entries.map(([, task]) => task()));
  const data: Record<string, unknown> = {};
  results.forEach((result, index) => { const key = entries[index][0]; data[key] = result.status === 'fulfilled' ? result.value : (key === 'funds' ? null : []); });
  res.json({ success: true, data });
});

tradingRoutes.get('/:brokerId/market-data', injectBrokerSession, async (req: Request, res: Response) => {
  const instrumentKeys = String(req.query.instrument_keys || '').split(',').filter(Boolean);
  if (!instrumentKeys.length) return res.status(400).json({ success: false, error: 'instrument_keys is required' });
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, no-transform');
  try {
    res.json({ success: true, data: await (req as any).brokerAdapter.getMarketQuotes((req as any).accessToken, instrumentKeys) });
  } catch (err: any) {
    const status = Number(err?.status || 0) === 504 || err?.name === 'AbortError' ? 504 : 502;
    res.status(status).json({ success: false, error: err.message || 'Unable to load market quotes' });
  }
});

tradingRoutes.get('/:brokerId/historical', injectBrokerSession, async (req: Request, res: Response) => {
  const instrumentKey = String(req.query.instrument_key || '');
  const interval = String(req.query.interval || '');
  if (!instrumentKey || !interval) return res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
  try { res.json({ success: true, data: await (req as any).brokerAdapter.getHistoricalData((req as any).accessToken, instrumentKey, interval) }); }
  catch (err: any) { res.status(502).json({ success: false, error: err.message || 'Unable to load historical data' }); }
});

tradingRoutes.get('/:brokerId/market-stream', injectBrokerSession, (req: AuthenticatedRequest, res: Response) => {
  const instrumentKeys = String(req.query.instrument_keys || '').split(',').map((key) => key.trim()).filter(Boolean);
  const depthMode = String(req.query.depth_mode || 'full') === 'full_d30' ? 'full_d30' : 'full';
  if (!instrumentKeys.length) { res.status(400).json({ success: false, error: 'instrument_keys is required' }); return; }
  if (instrumentKeys.length > 100 || instrumentKeys.some((key) => key.length > 160)) { res.status(400).json({ success: false, error: 'Too many or invalid instrument keys' }); return; }
  const brokerId = req.params.brokerId.toLowerCase();
  if (brokerId !== 'upstox' && brokerId !== 'fyers') { res.status(400).json({ success: false, error: 'Live streaming is not implemented for this broker' }); return; }
  res.status(200); res.setHeader('Content-Type', 'application/x-ndjson'); res.setHeader('Cache-Control', 'no-cache, no-transform'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders();
  const unsubscribe = brokerId === 'upstox'
    ? UpstoxMarketDataTransport.subscribe(req.tradingCoreUserId!, (req as any).accessToken, instrumentKeys, (event) => res.write(`${JSON.stringify(event)}\n`), depthMode as 'full' | 'full_d30')
    : FyersMarketDataTransport.subscribe(req.tradingCoreUserId!, (req as any).accessToken, instrumentKeys, (event) => res.write(`${JSON.stringify(event)}\n`));
  req.on('close', unsubscribe);
});

tradingRoutes.get('/:brokerId/option-chain', injectBrokerSession, async (req: Request, res: Response) => {
  const instrumentKey = String(req.query.instrument_key || ''); const expiryDate = String(req.query.expiry_date || '');
  if (!instrumentKey || !expiryDate) { res.status(400).json({ success: false, error: 'instrument_key and expiry_date are required' }); return; }
  try { res.json({ success: true, data: await (req as any).brokerAdapter.getOptionChain((req as any).accessToken, instrumentKey, expiryDate) }); }
  catch (err: any) { res.status(502).json({ success: false, error: err.message || 'Unable to load option chain' }); }
});

async function placeFyersOrderViaFixedIpGateway(accessToken: string, order: any) {
  const gatewayUrl = process.env.FYERS_EXECUTION_GATEWAY_URL?.replace(/\/$/, '');
  const gatewaySecret = process.env.FYERS_EXECUTION_GATEWAY_SECRET;
  if (!gatewayUrl || !gatewaySecret) throw new Error('FYERS execution gateway is not configured. Set FYERS_EXECUTION_GATEWAY_URL and FYERS_EXECUTION_GATEWAY_SECRET on the TradingCore server.');
  const response = await fetch(`${gatewayUrl}/v1/fyers/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tradingcore-gateway-secret': gatewaySecret },
    body: JSON.stringify({ accessToken, order }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) throw new Error(payload?.error || `FYERS execution gateway returned HTTP ${response.status}`);
  return payload.data ?? payload;
}

tradingRoutes.post('/:brokerId/order', injectBrokerSession, async (req: AuthenticatedRequest, res: Response) => {
  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 128) { res.status(400).json({ success: false, error: 'Idempotency-Key header is required for live order placement (1-128 characters).' }); return; }
  const userId = req.tradingCoreUserId!;
  const brokerId = req.params.brokerId.toLowerCase();
  try {
    const claim = await OrderIdempotencyRepository.claim(userId, brokerId, idempotencyKey, req.body);
    if (!claim.claimed) {
      if (claim.conflict === 'request_mismatch') { res.status(409).json({ success: false, error: 'Idempotency-Key was already used for a different order payload.' }); return; }
      if (claim.conflict === 'in_flight') { res.status(409).json({ success: false, error: 'An order with this Idempotency-Key is already being processed.' }); return; }
      res.status(claim.record?.state === 'completed' ? 200 : 502).json(claim.record?.response ?? { success: false, error: 'Previous order result is unavailable.' }); return;
    }
    try {
      const data = brokerId === 'fyers' && process.env.FYERS_EXECUTION_GATEWAY_URL
        ? await placeFyersOrderViaFixedIpGateway((req as any).accessToken, req.body)
        : await (req as any).brokerAdapter.placeOrder((req as any).accessToken, req.body);
      const response = { success: true, data };
      await OrderIdempotencyRepository.complete(userId, brokerId, idempotencyKey, response); res.json(response);
    } catch (err: any) {
      const response = { success: false, error: err.message || 'Broker rejected order' };
      await OrderIdempotencyRepository.fail(userId, brokerId, idempotencyKey, response); res.status(502).json(response);
    }
  } catch (err: any) { res.status(503).json({ success: false, error: err.message || 'Order safety ledger is unavailable; order was not submitted.' }); }
});

tradingRoutes.put('/:brokerId/order/:orderId', injectBrokerSession, async (req: Request, res: Response) => {
  try { const data = await (req as any).brokerAdapter.modifyOrder((req as any).accessToken, req.params.orderId, req.body); res.json({ success: true, data }); }
  catch (err: any) { res.status(502).json({ success: false, error: err.message || 'Broker rejected order update' }); }
});

tradingRoutes.delete('/:brokerId/order/:orderId', injectBrokerSession, async (req: Request, res: Response) => {
  try { const data = await (req as any).brokerAdapter.cancelOrder((req as any).accessToken, req.params.orderId); res.json({ success: true, data }); }
  catch (err: any) { res.status(502).json({ success: false, error: err.message || 'Broker rejected order cancellation' }); }
});
