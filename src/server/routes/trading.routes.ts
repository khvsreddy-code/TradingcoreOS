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
import { createHash } from 'node:crypto';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { AuditLogRepository } from '../storage/AuditLogRepository.js';
import { API_LATENCY_BUDGET_MS } from '../latency/budgets.js';
import { resolveFyersCapabilities } from '../fyers/core/FyersCapabilities.js';
import { FyersOrderStateEngine } from '../fyers/trading/FyersOrderStateEngine.js';
import { parseBrokerOrderPayload, placeFyersOrderViaFixedIpGateway, validateFyersManualOrderPreflight } from '../trading/fyersOrderExecution.js';
import { TradingKillSwitchRepository } from '../trading/TradingKillSwitchRepository.js';
import { evaluateManualPreTradeRisk } from '../trading/AutomationPreTradeRiskEngine.js';

export const tradingRoutes = Router();

type BrokerSessionRequest = AuthenticatedRequest & { brokerAdapter: BaseBroker; accessToken: string };

async function injectBrokerSession(req: BrokerSessionRequest, res: Response, next: NextFunction) {
  const brokerId = req.params.brokerId;
  const userId = req.tradingCoreUserId!;
  let session = await BrokerRepository.getSession(brokerId, userId);
  if (!session || session.status !== 'Connected') return res.status(401).json({ success: false, error: 'Broker not connected or session expired' });
  if (new Date(session.expiresAt).getTime() <= Date.now() + 60_000 && session.refreshTokenEncrypted) {
    const refreshed = await OAuthService.refreshSession(brokerId, userId);
    if (refreshed.success) session = await BrokerRepository.getSession(brokerId, userId) || session;
  }
  const expiresAt = new Date(session.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await BrokerRepository.updateStatus(brokerId, userId, 'Expired');
    return res.status(401).json({ success: false, error: 'Broker session expired. Reconnect the broker to continue.' });
  }
  const adapter = BrokerRegistry.getAdapter(brokerId);
  if (!adapter) return res.status(400).json({ success: false, error: 'Unknown broker ID' });
  try {
    const accessToken = await BrokerRepository.getAccessTokenForExecution(brokerId, userId);
    if (!accessToken) return res.status(401).json({ success: false, error: 'Broker session token is unavailable or expired' });
    req.brokerAdapter = adapter;
    req.accessToken = accessToken;
    next();
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to prepare broker session token' });
  }
}

tradingRoutes.use(requireUser);
const orderRateLimiter = createRateLimiter({ windowMs: 60_000, max: 20, name: 'orders', key: (req) => (req as AuthenticatedRequest).tradingCoreUserId || req.ip || 'unknown' });

function isDefiniteOrderRejection(status: number): boolean {
  // Do not infer rejection from arbitrary 4xx responses: 409/429 and gateway
  // edge cases may describe a prior accepted order or an ambiguous outcome.
  return [400, 401, 403, 404, 422].includes(status);
}

tradingRoutes.get('/:brokerId/profile', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.getProfile(req.accessToken, req.tradingCoreUserId!); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(500).json({ success: false, error: getErrorMessage(err, 'Broker request failed') }); }
});

tradingRoutes.get('/:brokerId/funds', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.getFunds(req.accessToken, req.tradingCoreUserId!); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(500).json({ success: false, error: getErrorMessage(err, 'Broker request failed') }); }
});

tradingRoutes.get('/:brokerId/holdings', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.getHoldings(req.accessToken, req.tradingCoreUserId!); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(500).json({ success: false, error: getErrorMessage(err, 'Broker request failed') }); }
});

tradingRoutes.get('/:brokerId/positions', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.getPositions(req.accessToken, req.tradingCoreUserId!); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(500).json({ success: false, error: getErrorMessage(err, 'Broker request failed') }); }
});

tradingRoutes.get('/:brokerId/orders', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { const data = await req.brokerAdapter.getOrders(req.accessToken, req.tradingCoreUserId!); res.json({ success: true, data }); }
  catch (err: unknown) { res.status(500).json({ success: false, error: getErrorMessage(err, 'Broker request failed') }); }
});

tradingRoutes.get('/:brokerId/trades', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  try { res.json({ success: true, data: await req.brokerAdapter.getTrades(req.accessToken, req.tradingCoreUserId!) }); }
  catch (err: unknown) { res.status(502).json({ success: false, error: getErrorMessage(err, 'Unable to load trades') }); }
});

tradingRoutes.get('/:brokerId/portfolio-snapshot', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  const adapter = req.brokerAdapter;
  const token = req.accessToken;
  const userId = req.tradingCoreUserId!;
  const tasks = { funds: () => adapter.getFunds(token, userId), holdings: () => adapter.getHoldings(token, userId), positions: () => adapter.getPositions(token, userId), orders: () => adapter.getOrders(token, userId), trades: () => adapter.getTrades(token, userId) };
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
    const userId = req.tradingCoreUserId!;
    const capabilities = req.params.brokerId.toLowerCase() === 'fyers' ? resolveFyersCapabilities(userId) : undefined;
    res.json({ success: true, data: await req.brokerAdapter.getMarketQuotes(req.accessToken, instrumentKeys, capabilities, userId) });
  } catch (err: unknown) {
    const status = getErrorStatus(err) === 504 ? 504 : 502;
    res.status(status).json({ success: false, error: getErrorMessage(err, 'Unable to load market quotes') });
  }
});

tradingRoutes.get('/:brokerId/historical', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  const instrumentKey = String(req.query.instrument_key || '');
  const interval = String(req.query.interval || '');
  const requestedLimit = Number(req.query.limit ?? 2_000);
  const limit = Number.isFinite(requestedLimit) ? Math.max(100, Math.min(2_000, Math.floor(requestedLimit))) : 2_000;
  if (!instrumentKey || !interval) return res.status(400).json({ success: false, error: 'instrument_key and interval are required' });
  try {
    const userId = req.tradingCoreUserId!;
    const capabilities = req.params.brokerId.toLowerCase() === 'fyers' ? resolveFyersCapabilities(userId) : undefined;
    res.json({ success: true, data: await req.brokerAdapter.getHistoricalData(req.accessToken, instrumentKey, interval, limit, capabilities, userId) });
  }
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
  res.setHeader('X-TradingCore-Realtime-Plane', 'legacy-vercel-stream');
  if (process.env.REALTIME_GATEWAY_URL) res.setHeader('X-TradingCore-Realtime-Migration', '/api/realtime/ticket');
  res.flushHeaders();
  const write = (event: unknown) => {
    try { res.write(`${JSON.stringify(event)}\n`); } catch {}
  };
  res.setHeader('X-TradingCore-Stream-Lease-Ms', String(API_LATENCY_BUDGET_MS.streamLease));
  const unsubscribe = FyersMarketDataTransport.subscribe(req.tradingCoreUserId!, req.accessToken, instrumentKeys, write);
  const leaseTimer = setTimeout(() => {
    write({ type: 'status', status: 'disconnected', reason: 'stream_lease_expired' });
    unsubscribe();
    if (!res.writableEnded) res.end();
  }, API_LATENCY_BUDGET_MS.streamLease);

  req.on('close', () => {
    clearTimeout(leaseTimer);
    unsubscribe();
  });
});

tradingRoutes.get('/:brokerId/option-chain', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  const instrumentKey = String(req.query.instrument_key || ''); const expiryDate = String(req.query.expiry_date || '');
  if (!instrumentKey || !expiryDate) { res.status(400).json({ success: false, error: 'instrument_key and expiry_date are required' }); return; }
  try {
    const userId = req.tradingCoreUserId!;
    const capabilities = req.params.brokerId.toLowerCase() === 'fyers' ? resolveFyersCapabilities(userId) : undefined;
    res.json({ success: true, data: await req.brokerAdapter.getOptionChain(req.accessToken, instrumentKey, expiryDate, capabilities, userId) });
  }
  catch (err: unknown) { res.status(502).json({ success: false, error: getErrorMessage(err, 'Unable to load option chain') }); }
});

tradingRoutes.post('/:brokerId/order', orderRateLimiter, injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 128) { res.status(400).json({ success: false, error: 'Idempotency-Key header is required for live order placement (1-128 characters).' }); return; }
  const userId = req.tradingCoreUserId!;
  const brokerId = req.params.brokerId.toLowerCase();
  // Never silently fall back to a serverless egress IP for FYERS orders.
  // Require the allowlisted fixed-IP gateway before claiming the idempotency key.
  if (brokerId === 'fyers' && (!process.env.FYERS_EXECUTION_GATEWAY_URL?.trim() || !process.env.FYERS_EXECUTION_GATEWAY_SECRET)) {
    res.status(503).json({
      success: false,
      orderSubmitted: false,
      error: 'FYERS live orders are disabled until the fixed-IP execution gateway URL and shared secret are configured.',
    });
    return;
  }
  let orderPayload: BrokerOrderPayload;
  try {
    const brokerRequestBody = isRecord(req.body)
      ? Object.fromEntries(Object.entries(req.body).filter(([key]) => key !== 'strategyId'))
      : req.body;
    orderPayload = parseBrokerOrderPayload(brokerRequestBody);
    if (brokerId === 'fyers') validateFyersManualOrderPreflight(orderPayload);
  } catch (error: unknown) {
    res.status(getErrorStatus(error) >= 400 && getErrorStatus(error) < 500 ? getErrorStatus(error) : 400).json({
      success: false, orderSubmitted: false, error: getErrorMessage(error, 'Invalid order payload'),
    });
    return;
  }
  const rawStrategyId = isRecord(req.body) ? req.body.strategyId : undefined;
  const strategyId = typeof rawStrategyId === 'string' && rawStrategyId.trim() && rawStrategyId.length <= 256
    ? rawStrategyId.trim()
    : undefined;
  try {
    await TradingKillSwitchRepository.assertOrderSubmissionAllowed(userId, strategyId);
  } catch (error: unknown) {
    res.status(503).json({
      success: false,
      orderSubmitted: false,
      error: getErrorMessage(error, 'Trading kill-switch state could not be verified; order submission is blocked.'),
    });
    return;
  }
  try {
    const claim = await OrderIdempotencyRepository.claim(userId, brokerId, idempotencyKey, { order: orderPayload, strategyId });
    if (!claim.claimed) {
      if (claim.conflict === 'request_mismatch') { res.status(409).json({ success: false, error: 'Idempotency-Key was already used for a different order payload.' }); return; }
      if (claim.conflict === 'in_flight') { res.status(409).json({ success: false, error: 'An order with this Idempotency-Key is already being processed.' }); return; }
      if (claim.conflict === 'recovery_required') { res.status(409).json({ success: false, error: 'Previous order attempt has an unknown broker outcome and must be reconciled before retrying.', recoveryRequired: true, idempotencyKey, brokerOrderId: claim.record?.brokerOrderId ?? null }); return; }
      res.status(claim.record?.state === 'completed' ? 200 : 502).json(claim.record?.response ?? { success: false, error: 'Previous order result is unavailable.' }); return;
    }
    const requestId = req.get('x-request-id');
    // Bind risk evidence, broker submission and reconciliation to the exact same
    // deterministic logical order intent, including the broker-visible client tag.
    const clientOrderId = brokerId === 'fyers'
      ? createHash('sha256').update(`tco:fyers:${userId}:${idempotencyKey}`).digest('hex').slice(0, 30)
      : undefined;
    if (clientOrderId) orderPayload = { ...orderPayload, orderTag: clientOrderId };
    {
      const risk = await evaluateManualPreTradeRisk({
        userId,
        accessToken: req.accessToken,
        broker: req.brokerAdapter,
        order: orderPayload,
        brokerMarginCheck: brokerId === 'fyers',
      });
      if (!risk.approved) {
        const response = {
          success: false,
          orderSubmitted: false,
          error: risk.reason,
          riskVerdict: risk,
          requestId: requestId || null,
        };
        await OrderIdempotencyRepository.fail(userId, brokerId, idempotencyKey, response);
        await AuditLogRepository.appendRequired({
          userId,
          actorType: 'system',
          eventType: 'order.risk_rejected',
          requestId,
          correlationId: idempotencyKey,
          payload: { brokerId, riskVerdict: risk, orderHash: createHash('sha256').update(JSON.stringify(orderPayload)).digest('hex') },
        });
        res.status(422).json(response);
        return;
      }
      try {
        await AuditLogRepository.appendRequired({
          userId,
          actorType: 'system',
          eventType: 'order.risk_approved',
          requestId,
          correlationId: idempotencyKey,
          payload: {
            brokerId,
            riskVerdict: risk,
            orderHash: createHash('sha256').update(JSON.stringify(orderPayload)).digest('hex'),
          },
        });
      } catch {
        const response = { success: false, orderSubmitted: false, error: 'The execution audit ledger is unavailable; order submission was blocked.', requestId: requestId || null };
        await OrderIdempotencyRepository.fail(userId, brokerId, idempotencyKey, response).catch(() => undefined);
        res.status(503).json(response);
        return;
      }
    }
    // The client tag was bound to the payload before risk evaluation so the
    // approved hash and actual broker submission describe the same order.
    if (clientOrderId) {
      // Persist before the broker side effect. In production this deliberately
      // fails closed if the reconciliation migration/service credentials are absent.
      try {
        await FyersOrderStateEngine.recordLifecycle(userId, clientOrderId, 'INTENT', {
          symbol: orderPayload.symbol, quantity: Number(orderPayload.quantity || orderPayload.qty || 0),
          side: String(orderPayload.side || '').toUpperCase() === 'SELL' ? 'sell' : 'buy',
        });
        await FyersOrderStateEngine.recordLifecycle(userId, clientOrderId, 'SUBMITTED', {
          symbol: orderPayload.symbol, quantity: Number(orderPayload.quantity || orderPayload.qty || 0),
          side: String(orderPayload.side || '').toUpperCase() === 'SELL' ? 'sell' : 'buy',
        });
      } catch (lifecycleError: unknown) {
        // No broker request has been made yet, so this attempt is safe to close
        // as failed rather than leaving an unresolvable in-flight idempotency key.
        const message = getErrorMessage(lifecycleError, 'Unable to persist FYERS order intent');
        const failure = { success: false, error: message, requestId: requestId || null };
        await OrderIdempotencyRepository.fail(userId, brokerId, idempotencyKey, failure).catch(() => undefined);
        res.status(503).json({ ...failure, orderSubmitted: false });
        return;
      }
    }
    try {
      await AuditLogRepository.appendRequired({
        userId,
        actorType: 'system',
        eventType: 'order.submission_intent_persisted',
        requestId,
        correlationId: idempotencyKey,
        payload: {
          brokerId,
          idempotencyKey,
          clientOrderId: clientOrderId ?? null,
          requestHash: claim.record?.requestHash ?? null,
          orderHash: createHash('sha256').update(JSON.stringify(orderPayload)).digest('hex'),
        },
      });
    } catch {
      if (clientOrderId) {
        await FyersOrderStateEngine.recordLifecycle(userId, clientOrderId, 'REJECTED', {
          symbol: orderPayload.symbol,
          quantity: Number(orderPayload.quantity || orderPayload.qty || 0),
          side: String(orderPayload.side || '').toUpperCase() === 'SELL' ? 'sell' : 'buy',
          message: 'Execution audit ledger unavailable; broker request was not made.',
        }).catch(() => undefined);
      }
      const response = { success: false, orderSubmitted: false, error: 'The execution audit ledger is unavailable; broker submission was blocked.', requestId: requestId || null };
      await OrderIdempotencyRepository.fail(userId, brokerId, idempotencyKey, response).catch(() => undefined);
      res.status(503).json(response);
      return;
    }

    let data: unknown;
    try {
      data = brokerId === 'fyers'
        ? await placeFyersOrderViaFixedIpGateway(req.accessToken, orderPayload, idempotencyKey, userId)
        : await req.brokerAdapter.placeOrder(req.accessToken, orderPayload);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Broker order request failed');
      const status = getErrorStatus(err);
      const response = { success: false, error: message, requestId: requestId || null };
      if (clientOrderId) {
        const isDefiniteReject = isDefiniteOrderRejection(status);
        await FyersOrderStateEngine.recordLifecycle(userId, clientOrderId, isDefiniteReject ? 'REJECTED' : 'UNKNOWN', {
          symbol: orderPayload.symbol, quantity: Number(orderPayload.quantity || orderPayload.qty || 0),
          side: String(orderPayload.side || '').toUpperCase() === 'SELL' ? 'sell' : 'buy', message,
        }).catch(() => undefined);
      }
      // Transport failures leave broker acceptance ambiguous. Keep the ledger in UNKNOWN
      // rather than marking the request as safely failed and risking a duplicate retry.
      const isClientReject = isDefiniteOrderRejection(status);
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
    if (clientOrderId) {
      try {
        if (orderId == null || !String(orderId).trim()) {
          throw new Error('FYERS accepted the request but returned no broker order id.');
        }
        await FyersOrderStateEngine.recordLifecycle(userId, clientOrderId, 'ACKNOWLEDGED', {
          brokerOrderId: orderId == null ? null : String(orderId),
          symbol: orderPayload.symbol,
          quantity: Number(orderPayload.quantity || orderPayload.qty || 0),
          side: String(orderPayload.side || '').toUpperCase() === 'SELL' ? 'sell' : 'buy',
          message: isRecord(data) && typeof data.message === 'string' ? data.message : undefined,
        });
      } catch (lifecycleError: unknown) {
        const message = getErrorMessage(lifecycleError, 'Order accepted but reconciliation state could not be persisted');
        const recoveryResponse = { success: false, error: 'FYERS accepted the order but its canonical lifecycle could not be persisted. Reconciliation is required; do not retry this order.', recoveryRequired: true, brokerOrderId: orderId, requestId: requestId || null };
        await OrderIdempotencyRepository.markRecoveryRequired(userId, brokerId, idempotencyKey, recoveryResponse, message).catch(() => undefined);
        await AuditLogRepository.append({ userId, actorType: 'system', eventType: 'order.recovery_required', requestId, correlationId: idempotencyKey, payload: { brokerId, idempotencyKey, orderId, clientOrderId, error: message } }).catch(() => undefined);
        res.status(503).json(recoveryResponse);
        return;
      }
    }
    const response = { success: true, data };
    try {
      await AuditLogRepository.appendRequired({
        userId,
        actorType: 'broker',
        eventType: 'order.broker_acknowledged',
        requestId,
        correlationId: idempotencyKey,
        payload: {
          brokerId,
          idempotencyKey,
          clientOrderId: clientOrderId ?? null,
          brokerOrderId: orderId == null ? null : String(orderId),
          requestHash: claim.record?.requestHash ?? null,
          orderHash: createHash('sha256').update(JSON.stringify(orderPayload)).digest('hex'),
        },
      });
      await OrderIdempotencyRepository.complete(userId, brokerId, idempotencyKey, response);
      await AuditLogRepository.appendRequired({
        userId,
        actorType: 'user',
        eventType: 'order.completed',
        requestId,
        correlationId: idempotencyKey,
        payload: {
          brokerId,
          idempotencyKey,
          orderId,
          clientOrderId: clientOrderId ?? null,
          requestHash: claim.record?.requestHash ?? null,
        },
      });
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
    const data = await req.brokerAdapter.modifyOrder(req.accessToken, req.params.orderId, req.body as BrokerOrderPayload, req.tradingCoreUserId!); res.json({ success: true, data });
  }
  catch (err: unknown) { res.status(502).json({ success: false, error: getErrorMessage(err, 'Broker rejected order update') }); }
});

tradingRoutes.delete('/:brokerId/order/:orderId', injectBrokerSession, async (req: BrokerSessionRequest, res: Response) => {
  const userId = req.tradingCoreUserId!;
  const brokerId = req.params.brokerId.toLowerCase();
  const orderId = req.params.orderId;
  if (brokerId === 'fyers') {
    try {
      // Record the cancellation intent before the broker side effect. A 2xx
      // cancel response means accepted for processing, not necessarily terminal.
      await FyersOrderStateEngine.recordLifecycle(userId, '', 'CANCEL_PENDING', { brokerOrderId: orderId });
    } catch (error: unknown) {
      res.status(503).json({ success: false, error: getErrorMessage(error, 'Unable to persist cancellation intent; cancellation was not submitted.') });
      return;
    }
  }
  try {
    const data = await req.brokerAdapter.cancelOrder(req.accessToken, orderId, userId);
    res.json({ success: true, data });
  } catch (err: unknown) {
    if (brokerId === 'fyers') {
      const status = getErrorStatus(err);
      const isDefiniteReject = status >= 400 && status < 500 && status !== 408 && status !== 429;
      await FyersOrderStateEngine.recordLifecycle(userId, '', isDefiniteReject ? 'OPEN' : 'UNKNOWN', {
        brokerOrderId: orderId, message: getErrorMessage(err, 'Broker rejected order cancellation'),
      }).catch(() => undefined);
    }
    res.status(502).json({ success: false, error: getErrorMessage(err, 'Broker rejected order cancellation') });
  }
});
