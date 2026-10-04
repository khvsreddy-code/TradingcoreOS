import { Router, Response, NextFunction } from 'express';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { EncryptionService } from '../encryption/EncryptionService.js';
import { AuthenticatedRequest, requireUser } from '../auth/requireUser.js';
import { FyersMarketDataTransport } from '../marketData/FyersMarketDataTransport.js';
import { OAuthService } from '../auth/OAuthService.js';
import { OrderIdempotencyRepository } from '../storage/OrderIdempotencyRepository.js';
import type { BaseBroker } from '../brokers/adapters/BaseBroker.js';
import type { BrokerOrderPayload } from '../brokers/contracts.js';
import { getErrorMessage, getErrorStatus, isRecord } from '../../services/boundary/brokerApiValidation.js';
import { createHmac, createHash, randomUUID } from 'node:crypto';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { AuditLogRepository } from '../storage/AuditLogRepository.js';

export const tradingRoutes = Router();

type BrokerSessionRequest = AuthenticatedRequest & { brokerAdapter: BaseBroker; accessToken: string };

function parseBrokerOrderPayload(value: unknown): BrokerOrderPayload {
  if (!isRecord(value)) throw new Error('Order payload must be a JSON object');
  const symbol = typeof value.symbol === 'string' ? value.symbol.trim() : '';
  const quantity = Number(value.quantity);
  const orderType = typeof value.orderType === 'string' ? value.orderType : undefined;
  const side = typeof value.side === 'string' ? value.side : undefined;
  const product = typeof value.product === 'string' ? value.product : undefined;
  if (!symbol || !Number.isInteger(quantity) || quantity <= 0 || !side || !orderType || !product) throw new Error('Order payload is missing required typed fields');
  return value as BrokerOrderPayload;
}

async function injectBrokerSession(req: BrokerSessionRequest, res: Response, next: NextFunction) {
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
    req.brokerAdapter = adapter;
    req.accessToken = accessToken;
    next();
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to decrypt session token' });
  }
}

tradingRoutes.use(requireUser);
const orderRateLimiter = createRateLimiter({ windowMs: 60_000, max: 20, name: 'orders', key: (req) => (req as AuthenticatedRequest).tradingCoreUserId || req.ip || 'unknown' });

tradingRoutes.get('/:brokerId/profile', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.getProfile(req.accessToken); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(500).json({ success: false, error: getErrorMessage(err, 'Broker request failed') }); }
});

tradingRoutes.get('/:brokerId/funds', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.getFunds(req.accessToken); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(500).json({ success: false, error: getErrorMessage(err, 'Broker request failed') }); }
});

tradingRoutes.get('/:brokerId/holdings', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.getHoldings(req.accessToken); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(500).json({ success: false, error: getErrorMessage(err, 'Broker request failed') }); }
});

tradingRoutes.get('/:brokerId/positions', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.getPositions(req.accessToken); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(500).json({ success: false, error: getErrorMessage(err, 'Broker request failed') }); }
});

tradingRoutes.get('/:brokerId/orders', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.getOrders(req.accessToken); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(500).json({ success: false, error: getErrorMessage(err, 'Broker request failed') }); }
});

tradingRoutes.get('/:brokerId/trades', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { res.json({ success: true, data: await req.brokerAdapter.getTrades(req.accessToken) }); }
  catch (err: unknown) { res.status(502).json({ success: false, error: getErrorMessage(err, 'Unable to load trades') }); }
});

tradingRoutes.get('/:brokerId/portfolio-snapshot', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  const adapter = req.brokerAdapter;
  const token = req.accessToken;
  const tasks = { funds: () => adapter.getFunds(token), holdings: () => adapter.getHoldings(token), positions: () => adapter.getPositions(token), orders: () => adapter.getOrders(token), trades: () => adapter.getTrades(token) };
  const entries = Object.entries(tasks);
  const results = await Promise.allSettled(entries.map(([, task]) => task()));
  const data: Record<string, unknown> = {};
  results.forEach((result, index) => { const key = entries[index][0]; data[key] = result.status === 'fulfilled' ? result.value : (key === 'funds' ? null : []); });
  res.json({ success: true, data });
});

tradingRoutes.get('/:brokerId/market-data', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  const instrumentKeys = String(req.query.instrument_keys || '').split(',').filter(Boolean);
  if (!instrumentKeys.length) return res.status(400).json({ success: false, error: 'instrument_keys is required' });
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, no-transform');
  try {
    res.json({ success: true, data: await req.brokerAdapter.getMarketQuotes(req.accessToken, instrumentKeys) });
  } catch (err: unknown) {
    const status = getErrorStatus(err) === 504 ? 504 : 502;
    res.status(status).json({ success: false, error: getErrorMessage(err, 'Unable to load market quotes') });
  }
});

tradingRoutes.get('/:brokerId/historical', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  const instrumentKey = String(req.query.instrument_key || '');
  const interval = String(req.query.interval || '');
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.max(100, Math.min(5000, Math.floor(requestedLimit))) : 1000;
  if (!instrumentKey || !interval) return res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
  try { res.json({ success: true, data: await req.brokerAdapter.getHistoricalData(req.accessToken, instrumentKey, interval, limit) }); }
  catch (err: unknown) { res.status(502).json({ success: false, error: getErrorMessage(err, 'Unable to load historical data') }); }
});

tradingRoutes.get('/:brokerId/market-stream', injectBrokerSession, (req: BrokerSessionRequest, res: Response) => {
  const instrumentKeys = String(req.query.instrument_keys || '').split(',').map((key) => key.trim()).filter(Boolean);
  const depthMode = String(req.query.depth_mode || 'full') === 'full_d30' ? 'full_d30' : 'full';
  if (!instrumentKeys.length) { res.status(400).json({ success: false, error: 'instrument_keys is required' }); return; }
  if (instrumentKeys.length > 100 || instrumentKeys.some((key) => key.length > 160)) { res.status(400).json({ success: false, error: 'Too many or invalid instrument keys' }); return; }
  const brokerId = req.params.brokerId.toLowerCase();
  if (brokerId !== 'fyers') { res.status(400).json({ success: false, error: 'Live streaming is only available through Fyers' }); return; }
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const write = (event: unknown) => {
    try { res.write(`${JSON.stringify(event)}\n`); } catch {}
  };
  const unsubscribe = FyersMarketDataTransport.subscribe(req.tradingCoreUserId!, req.accessToken, instrumentKeys, write);
  req.on('close', unsubscribe);
});

tradingRoutes.get('/:brokerId/option-chain', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  const instrumentKey = String(req.query.instrument_key || ''); const expiryDate = String(req.query.expiry_date || '');
  if (!instrumentKey || !expiryDate) { res.status(400).json({ success: false, error: 'instrument_key and expiry_date are required' }); return; }
  try { res.json({ success: true, data: await req.brokerAdapter.getOptionChain(req.accessToken, instrumentKey, expiryDate) }); }
  catch (err: unknown) { res.status(502).json({ success: false, error: getErrorMessage(err, 'Unable to load option chain') }); }
});

async function placeFyersOrderViaFixedIpGateway(accessToken: string, order: BrokerOrderPayload) {
  const gatewayUrl = process.env.FYERS_EXECUTION_GATEWAY_URL?.replace(/\/$/, '');
  const gatewaySecret = process.env.FYERS_EXECUTION_GATEWAY_SECRET;
  if (!gatewayUrl || !gatewaySecret) throw new Error('FYERS execution gateway is not configured. Set FYERS_EXECUTION_GATEWAY_URL and FYERS_EXECUTION_GATEWAY_SECRET on the TradingCore server.');
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const body = JSON.stringify({ accessToken, order });
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const signingInput = ['POST', '/v1/fyers/order', timestamp, nonce, bodyHash].join('\n');
  const signature = createHmac('sha256', gatewaySecret).update(signingInput).digest('hex');
  const response = await fetch(`${gatewayUrl}/v1/fyers/order`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'content-type': 'application/json',
      'x-tradingcore-timestamp': timestamp,
      'x-tradingcore-nonce': nonce,
      'x-tradingcore-signature': signature,
    },
    body,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok || (isRecord(payload) && payload.success === false)) throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : `FYERS execution gateway returned HTTP ${response.status}`);
  return isRecord(payload) && 'data' in payload ? payload.data : payload;
}

tradingRoutes.post('/:brokerId/order', orderRateLimiter, injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 128) { res.status(400).json({ success: false, error: 'Idempotency-Key header is required for live order placement (1-128 characters).' }); return; }
  const userId = req.tradingCoreUserId!;
  const brokerId = req.params.brokerId.toLowerCase();
  let orderPayload: BrokerOrderPayload;
  try { orderPayload = parseBrokerOrderPayload(req.body); } catch (error: unknown) { res.status(400).json({ success: false, error: getErrorMessage(error, 'Invalid order payload') }); return; }
  try {
    const claim = await OrderIdempotencyRepository.claim(userId, brokerId, idempotencyKey, orderPayload);
    if (!claim.claimed) {
      if (claim.conflict === 'request_mismatch') { res.status(409).json({ success: false, error: 'Idempotency-Key was already used for a different order payload.' }); return; }
      if (claim.conflict === 'in_flight') { res.status(409).json({ success: false, error: 'An order with this Idempotency-Key is already being processed.' }); return; }
      if (claim.conflict === 'recovery_required') { res.status(409).json({ success: false, error: 'Previous order attempt has an unknown broker outcome and must be reconciled before retrying.', recoveryRequired: true, idempotencyKey, brokerOrderId: claim.record?.brokerOrderId ?? null }); return; }
      res.status(claim.record?.state === 'completed' ? 200 : 502).json(claim.record?.response ?? { success: false, error: 'Previous order result is unavailable.' }); return;
    }
    const requestId = req.get('x-request-id');
    let data: unknown;
    try {
      data = brokerId === 'fyers' && process.env.FYERS_EXECUTION_GATEWAY_URL
        ? await placeFyersOrderViaFixedIpGateway(req.accessToken, orderPayload)
        : await req.brokerAdapter.placeOrder(req.accessToken, orderPayload);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Broker order request failed');
      const status = getErrorStatus(err);
      const response = { success: false, error: message, requestId: requestId || null };
      // Transport failures leave broker acceptance ambiguous. Keep the ledger in UNKNOWN
      // rather than marking the request as safely failed and risking a duplicate retry.
      const isClientReject = status >= 400 && status < 500 && status !== 408 && status !== 429;
      if (isClientReject) {
        await OrderIdempotencyRepository.fail(userId, brokerId, idempotencyKey, response);
        void AuditLogRepository.append({ userId, actorType: 'broker', eventType: 'order.rejected', requestId, correlationId: idempotencyKey, payload: { brokerId, error: message, status } }).catch(() => undefined);
      } else {
        await OrderIdempotencyRepository.markUnknown(userId, brokerId, idempotencyKey, response, message);
        void AuditLogRepository.append({ userId, actorType: 'system', eventType: 'order.unknown', requestId, correlationId: idempotencyKey, payload: { brokerId, error: message, status } }).catch(() => undefined);
      }
      res.status(502).json(response);
      return;
    }

    const orderId = isRecord(data) ? (data.orderId ?? data.order_id ?? data.id ?? null) : null;
    const response = { success: true, data };
    try {
      await OrderIdempotencyRepository.complete(userId, brokerId, idempotencyKey, response);
      void AuditLogRepository.append({ userId, actorType: 'user', eventType: 'order.completed', requestId, correlationId: idempotencyKey, payload: { brokerId, idempotencyKey, orderId } }).catch(() => undefined);
      res.json(response);
    } catch (ledgerError: unknown) {
      const message = getErrorMessage(ledgerError, 'Order accepted but safety ledger completion failed');
      let recoveryError = ledgerError;
      try {
        await OrderIdempotencyRepository.markRecoveryRequired(userId, brokerId, idempotencyKey, { success: false, error: message, requestId: requestId || null }, message);
      } catch (markError: unknown) {
        recoveryError = markError;
      }
      await AuditLogRepository.append({ userId, actorType: 'system', eventType: 'order.recovery_required', requestId, correlationId: idempotencyKey, payload: { brokerId, idempotencyKey, orderId, error: message, recoveryWriteError: getErrorMessage(recoveryError, '') || null } }).catch(() => undefined);
      res.status(503).json({ success: false, error: 'Order was accepted by the broker, but the local safety ledger could not be finalized. Reconciliation is required before retrying.', recoveryRequired: true, brokerOrderId: orderId, requestId: requestId || null });
    }
  } catch (err: unknown) {
    await AuditLogRepository.append({ userId, actorType: 'system', eventType: 'order.ledger_unavailable', requestId: req.get('x-request-id'), correlationId: idempotencyKey, payload: { brokerId, error: getErrorMessage(err, 'Order safety ledger is unavailable') } }).catch(() => undefined);
    res.status(503).json({ success: false, error: getErrorMessage(err, 'Order safety ledger is unavailable; order was not submitted.'), requestId: req.get('x-request-id') || null });
  }
});

tradingRoutes.put('/:brokerId/order/:orderId', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try {
    if (!isRecord(req.body)) { res.status(400).json({ success: false, error: 'Order update payload must be a JSON object' }); return; }
    const data = await req.brokerAdapter.modifyOrder(req.accessToken, req.params.orderId, req.body as BrokerOrderPayload); res.json({ success: true, data });
  }
  catch (err: unknown) { res.status(502).json({ success: false, error: getErrorMessage(err, 'Broker rejected order update') }); }
});

tradingRoutes.delete('/:brokerId/order/:orderId', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.cancelOrder(req.accessToken, req.params.orderId); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(502).json({ success: false, error: getErrorMessage(err, 'Broker rejected order cancellation') }); }
});
