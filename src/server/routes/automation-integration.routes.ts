import { Router, type Request, type Response, type NextFunction } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { requireUser, type AuthenticatedRequest } from '../auth/requireUser.js';
import { BrokerRepository } from '../storage/BrokerRepository.js';
import { BrokerRegistry } from '../brokers/BrokerRegistry.js';
import type { BaseBroker } from '../brokers/adapters/BaseBroker.js';
import type { BrokerOrderPayload } from '../brokers/contracts.js';
import { OrderIdempotencyRepository } from '../storage/OrderIdempotencyRepository.js';
import { FyersOrderStateEngine } from '../fyers/trading/FyersOrderStateEngine.js';
import { AuditLogRepository } from '../storage/AuditLogRepository.js';
import { getErrorMessage, getErrorStatus, isRecord } from '../../services/boundary/brokerApiValidation.js';
import { canonicalSha256 } from '../utils/canonicalJson.js';
import {
  AutomationIntegrationRepository,
  type AutomationIntegration,
  type AutomationRecord,
  type AutomationRequestState,
  type AutomationIntegrationScope,
  type AutomationOrderRequestRecord,
} from '../automation/AutomationIntegrationRepository.js';
import { evaluateAutomationPreTradeRisk } from '../trading/AutomationPreTradeRiskEngine.js';
import { parseBrokerOrderPayload, placeFyersOrderViaFixedIpGateway } from '../trading/fyersOrderExecution.js';

export const automationIntegrationRoutes = Router();
export const automationGatewayRoutes = Router();

type IntegrationManagementRequest = AuthenticatedRequest;
type AutomationGatewayRequest = Request & {
  automationIntegration?: AutomationIntegration;
  automationRecord?: AutomationRecord;
};

const ALLOWED_EVENT_TYPES = new Set([
  'BUY','SELL','LONG','SHORT','EXIT','ALERT','CUSTOM',
  'BUY_CE','BUY_PE','SELL_CE','SELL_PE',
]);
const SYMBOL_PATTERN = /^[A-Z0-9_-]{2,16}:[A-Z0-9&_.-]{1,80}$/;

function jsonError(res: Response, status: number, error: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ success: false, error, ...extra });
}

function liveLifecycle(automation: AutomationRecord): boolean {
  return automation.lifecycleStatus === 'live' || automation.lifecycleState === 'LIVE';
}

function liveExecutionEnabled(automation: AutomationRecord): boolean {
  return liveLifecycle(automation) &&
    automation.allowOrderExecution &&
    !automation.requireConfirmation &&
    automation.status.toLowerCase() !== 'paused' &&
    automation.status.toLowerCase() !== 'retired';
}

function normalizeSymbols(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  if (source.length < 1 || source.length > 100 || source.some(item => typeof item !== 'string')) {
    throw new Error('allowedSymbols must contain 1–100 fully-qualified broker symbols.');
  }
  const symbols = [...new Set(source.map(item => String(item).trim().toUpperCase()))];
  if (symbols.some(symbol => !SYMBOL_PATTERN.test(symbol))) {
    throw new Error('Every allowed symbol must be fully-qualified, for example NSE:NIFTY50-INDEX.');
  }
  return symbols;
}

function parseBoundedInteger(value: unknown, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  return number;
}

function parseBoundedMoney(value: unknown, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return Math.round(number * 100) / 100;
}

function publicIntegration(integration: AutomationIntegration) {
  return {
    id: integration.id,
    automationId: integration.automationId,
    name: integration.name,
    brokerId: integration.brokerId,
    tokenPrefix: integration.tokenPrefix,
    scopes: integration.scopes,
    allowedSymbols: integration.allowedSymbols,
    riskLimits: {
      maxOrderQuantity: integration.maxOrderQuantity,
      maxOrderNotional: integration.maxOrderNotional,
      maxPositionNotional: integration.maxPositionNotional,
      maxAccountExposureNotional: integration.maxAccountExposureNotional,
      maxDailyOrders: integration.maxDailyOrders,
      marginBufferPercent: integration.marginBufferPercent,
    },
    allowLiveOrders: integration.allowLiveOrders,
    expiresAt: integration.expiresAt,
    revokedAt: integration.revokedAt,
    createdAt: integration.createdAt,
    lastUsedAt: integration.lastUsedAt,
  };
}

automationIntegrationRoutes.use(requireUser);

automationIntegrationRoutes.get('/automations', async (req: IntegrationManagementRequest, res: Response) => {
  try {
    const data = await AutomationIntegrationRepository.listAutomations(req.tradingCoreUserId!);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, data });
  } catch (error) {
    jsonError(res, 503, getErrorMessage(error, 'Unable to list owned automations.'));
  }
});

automationIntegrationRoutes.get('/', async (req: IntegrationManagementRequest, res: Response) => {
  try {
    const integrations = await AutomationIntegrationRepository.listForUser(req.tradingCoreUserId!);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, data: integrations.map(publicIntegration) });
  } catch (error) {
    jsonError(res, 503, getErrorMessage(error, 'Unable to list automation integrations.'));
  }
});

automationIntegrationRoutes.post('/', async (req: IntegrationManagementRequest, res: Response) => {
  const userId = req.tradingCoreUserId!;
  if (!isRecord(req.body)) return jsonError(res, 400, 'Integration configuration must be a JSON object.');
  const automationId = String(req.body.automationId ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(automationId)) {
    return jsonError(res, 400, 'Save this automation to the cloud first, then select its cloud ID.');
  }
  if (String(req.body.brokerId ?? 'fyers').toLowerCase() !== 'fyers') {
    return jsonError(res, 400, 'This server currently supports external order requests through the FYERS execution adapter only.');
  }

  try {
    const automation = await AutomationIntegrationRepository.getAutomationForOwner(userId, automationId);
    if (!automation) return jsonError(res, 404, 'Owned cloud automation was not found.');
    const allowedSymbols = normalizeSymbols(req.body.allowedSymbols);
    const name = String(req.body.name ?? 'External AI workflow').trim();
    if (!name || name.length > 120) return jsonError(res, 400, 'Integration name must contain 1–120 characters.');
    const expiresInDays = parseBoundedInteger(req.body.expiresInDays, 30, 1, 90, 'expiresInDays');
    const id = randomUUID();
    const rawToken = `tco_auto_${id}_${randomBytes(32).toString('base64url')}`;
    const allowedScopes = new Set<AutomationIntegrationScope>(['market:read', 'signals:read', 'orders:request']);
    const rawScopes = req.body.scopes === undefined ? ['market:read', 'signals:read', 'orders:request'] : req.body.scopes;
    if (!Array.isArray(rawScopes) || rawScopes.length < 1 || rawScopes.length > 3 || rawScopes.some(scope => typeof scope !== 'string' || !allowedScopes.has(scope as AutomationIntegrationScope))) {
      return jsonError(res, 400, 'scopes must contain one or more supported integration capabilities.');
    }
    const scopes = [...new Set(rawScopes as AutomationIntegrationScope[])];
    const integration = await AutomationIntegrationRepository.create({
      id,
      userId,
      automationId,
      name,
      brokerId: 'fyers',
      tokenHash: createHash('sha256').update(rawToken).digest('hex'),
      tokenPrefix: rawToken.slice(0, 24),
      scopes,
      allowedSymbols,
      maxOrderQuantity: parseBoundedInteger(req.body.maxOrderQuantity, 20, 1, 1000, 'maxOrderQuantity'),
      maxOrderNotional: parseBoundedMoney(req.body.maxOrderNotional, 50_000, 1, 100_000_000, 'maxOrderNotional'),
      maxPositionNotional: parseBoundedMoney(req.body.maxPositionNotional, 100_000, 1, 500_000_000, 'maxPositionNotional'),
      maxAccountExposureNotional: parseBoundedMoney(req.body.maxAccountExposureNotional, 200_000, 1, 500_000_000, 'maxAccountExposureNotional'),
      maxDailyOrders: parseBoundedInteger(req.body.maxDailyOrders, 10, 1, 1000, 'maxDailyOrders'),
      marginBufferPercent: parseBoundedMoney(req.body.marginBufferPercent, 15, 0, 50, 'marginBufferPercent'),
      // Explicitly unchecked by default. Lifecycle and user-selected execution flags
      // are re-checked on every live request; this flag alone never authorizes an order.
      allowLiveOrders: req.body.allowLiveOrders === true,
      expiresAt: new Date(Date.now() + expiresInDays * 86_400_000).toISOString(),
    });
    await AuditLogRepository.append({
      userId, actorType: 'user', eventType: 'automation.integration.created',
      requestId: req.get('x-request-id'), correlationId: id,
      payload: { integrationId: id, automationId, brokerId: 'fyers', scopes, allowLiveOrders: integration.allowLiveOrders, allowedSymbols },
    }).catch(() => undefined);
    res.status(201).json({
      success: true,
      data: {
        integration: publicIntegration(integration),
        token: rawToken,
        tokenShownOnce: true,
        warning: 'Copy this token now. TradingCoreOS stores only its hash and cannot reveal it again. Never paste it into browser code or a public workflow export.',
      },
    });
  } catch (error) {
    jsonError(res, 400, getErrorMessage(error, 'Invalid automation integration configuration.'));
  }
});

automationIntegrationRoutes.delete('/:integrationId', async (req: IntegrationManagementRequest, res: Response) => {
  const integrationId = String(req.params.integrationId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(integrationId)) return jsonError(res, 400, 'Invalid integration ID.');
  try {
    const revoked = await AutomationIntegrationRepository.revoke(req.tradingCoreUserId!, integrationId);
    if (!revoked) return jsonError(res, 404, 'Active integration was not found.');
    await AuditLogRepository.append({
      userId: req.tradingCoreUserId!, actorType: 'user', eventType: 'automation.integration.revoked',
      requestId: req.get('x-request-id'), correlationId: integrationId,
      payload: { integrationId },
    });
    res.json({ success: true, data: { integrationId, revoked: true } });
  } catch (error) {
    jsonError(res, 503, getErrorMessage(error, 'Unable to revoke integration.'));
  }
});

automationIntegrationRoutes.post('/:integrationId/signals', async (req: IntegrationManagementRequest, res: Response) => {
  const integrationId = String(req.params.integrationId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(integrationId)) return jsonError(res, 400, 'Invalid integration ID.');
  if (!isRecord(req.body)) return jsonError(res, 400, 'Signal event must be a JSON object.');

  const eventId = String(req.body.eventId ?? '').trim();
  const eventType = String(req.body.eventType ?? req.body.type ?? '').trim().toUpperCase();
  const symbol = String(req.body.symbol ?? '').trim().toUpperCase();
  const timestamp = Number(req.body.timestamp);
  const mode = String(req.body.mode ?? '').trim().toLowerCase();
  const barIndex = Number(req.body.barIndex ?? -1);
  const sourceId = String(req.body.sourceId ?? '').trim();
  const runId = String(req.body.runId ?? '').trim();
  const timeframe = String(req.body.timeframe ?? '').trim();
  if (!eventId || eventId.length > 200) return jsonError(res, 400, 'eventId must contain 1–200 characters.');
  if (!ALLOWED_EVENT_TYPES.has(eventType)) return jsonError(res, 400, 'Unsupported CoreSpirit signal event type.');
  if (!SYMBOL_PATTERN.test(symbol)) return jsonError(res, 400, 'Signal symbol must be fully-qualified.');
  if (!Number.isFinite(timestamp) || timestamp < Date.now() - 300_000 || timestamp > Date.now() + 2_000) {
    return jsonError(res, 422, 'Signal timestamp must be an epoch-millisecond value no older than five minutes.');
  }
  if (!['realtime', 'paper', 'historical', 'backtest'].includes(mode)) return jsonError(res, 400, 'Signal mode must be realtime, paper, historical, or backtest.');
  if (mode === 'realtime') return jsonError(res, 403, 'Live-trading signals must come from the server-authenticated CoreSpirit signal producer; browser-supplied realtime events cannot authorize orders.');
  if (!Number.isInteger(barIndex) || barIndex < -1 || sourceId.length > 200 || runId.length > 200 || timeframe.length > 32) {
    return jsonError(res, 400, 'Invalid signal source, run, bar index, or timeframe.');
  }
  const suppliedPayload = req.body.payload === undefined ? {} : req.body.payload;
  if (!isRecord(suppliedPayload) || Buffer.byteLength(JSON.stringify(suppliedPayload), 'utf8') > 8_192) {
    return jsonError(res, 413, 'Signal payload must be an object no larger than 8 KiB.');
  }

  try {
    const result = await AutomationIntegrationRepository.publishSignal({
      userId: req.tradingCoreUserId!,
      integrationId,
      eventId,
      eventType,
      symbol,
      timeframe,
      sourceId,
      runId,
      mode,
      barIndex,
      timestamp,
      payload: suppliedPayload,
    });
    if (result.conflict) return jsonError(res, 409, 'This eventId was already published with a different payload.');
    if (result.inserted) {
      await AuditLogRepository.append({
        userId: req.tradingCoreUserId!, actorType: 'automation', eventType: 'automation.signal.published',
        requestId: req.get('x-request-id'), correlationId: eventId,
        payload: { integrationId, automationId: result.signal.integrationId, eventId, eventType, symbol, mode },
      });
    }
    res.status(result.inserted ? 201 : 200).json({
      success: true,
      data: { eventId, duplicate: !result.inserted, stored: true, createdAt: result.signal.createdAt },
    });
  } catch (error) {
    const message = getErrorMessage(error, 'Unable to publish validated signal event.');
    const status = /not found|outside the integration allowlist|active integration/i.test(message) ? 403 : 503;
    jsonError(res, status, message);
  }
});

function requireAutomationScope(scope: AutomationIntegrationScope) {
  return (req: AutomationGatewayRequest, res: Response, next: NextFunction) => {
    const integration = req.automationIntegration;
    if (!integration || !integration.scopes.includes(scope)) {
      jsonError(res, 403, `This automation credential does not have the ${scope} capability.`);
      return;
    }
    next();
  };
}

function authenticateAutomationCredential(req: AutomationGatewayRequest, res: Response, next: NextFunction) {
  const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) {
    jsonError(res, 401, 'Automation bearer token is required.');
    return;
  }
  void AutomationIntegrationRepository.authenticateToken(token).then(identity => {
    if (!identity) {
      jsonError(res, 401, 'Automation credential is invalid, expired, revoked, or no longer linked to an owned automation.');
      return;
    }
    req.automationIntegration = identity.integration;
    req.automationRecord = identity.automation;
    next();
  }).catch(error => jsonError(res, 503, getErrorMessage(error, 'Automation credential store is unavailable.')));
}

const automationOrderRateLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  name: 'external-automation-orders',
  key: req => (req as AutomationGatewayRequest).automationIntegration?.id || req.ip || 'unknown',
});

function assertSignalMatchesOrder(
  signal: { eventType: string; symbol: string; mode: string; signalTimestamp: string },
  order: BrokerOrderPayload,
): string | undefined {
  const symbol = String(order.symbol ?? '').toUpperCase();
  if (signal.symbol.toUpperCase() !== symbol) return 'Linked signal symbol does not match the requested order symbol.';
  if (signal.mode !== 'realtime') return 'Live orders require a realtime CoreSpirit signal; historical/backtest signals cannot authorize live execution.';
  const age = Date.now() - Date.parse(signal.signalTimestamp);
  if (!Number.isFinite(age) || age < -2_000 || age > 120_000) return 'Live orders require a recent realtime signal (at most two minutes old).';
  const type = signal.eventType.toUpperCase();
  const side = String(order.side).toUpperCase();
  const buySignals = new Set(['BUY','LONG','BUY_CE','BUY_PE']);
  const sellSignals = new Set(['SELL','SHORT','SELL_CE','SELL_PE']);
  if (buySignals.has(type) && side !== 'BUY') return 'Requested order side conflicts with the linked bullish signal.';
  if (sellSignals.has(type) && side !== 'SELL') return 'Requested order side conflicts with the linked bearish signal.';
  if (!buySignals.has(type) && !sellSignals.has(type) && type !== 'EXIT') return 'Signal type is not permitted to authorize a live order.';
  return undefined;
}

function replayResponse(record: AutomationOrderRequestRecord, res: Response) {
  const response = record.response ?? {
    success: record.state === 'PROCESSING',
    state: record.state,
    message: 'This idempotent request is already recorded; the broker will not be called again.',
    requestId: record.externalRequestId,
  };
  if (record.state === 'PROCESSING') {
    const age = Date.now() - Date.parse(record.updatedAt);
    if (!Number.isFinite(age) || age > 90_000) {
      const recovery = {
        success: false,
        error: 'The previous request remained in processing beyond its safe lease. Reconciliation is required; it will not be resubmitted.',
        recoveryRequired: true,
        orderSubmitted: 'unknown',
        requestId: record.externalRequestId,
        clientOrderId: record.clientOrderId,
        brokerOrderId: record.brokerOrderId,
      };
      void AutomationIntegrationRepository.updateOrderRequest(record.integrationId, record.externalRequestId, {
        state: 'RECOVERY_REQUIRED', response: recovery,
        clientOrderId: record.clientOrderId, brokerOrderId: record.brokerOrderId,
      }).catch(() => undefined);
      return res.status(409).json(recovery);
    }
    return res.status(202).json({ success: true, accepted: false, state: 'PROCESSING', requestId: record.externalRequestId, message: 'The original request is still being evaluated; do not create a new key.' });
  }
  if (record.state === 'UNKNOWN' || record.state === 'RECOVERY_REQUIRED' || record.state === 'INTENT' || record.state === 'SUBMITTED' || record.state === 'CANCEL_PENDING') {
    return res.status(409).json({ ...response, success: false, recoveryRequired: true, message: 'Request state must be reconciled; no duplicate submission will be attempted.' });
  }
  if (record.state === 'REJECTED') return res.status(422).json(response);
  return res.status(200).json(response);
}

automationGatewayRoutes.use(authenticateAutomationCredential);

automationGatewayRoutes.get('/v1/context', requireAutomationScope('market:read'), async (req: AutomationGatewayRequest, res: Response) => {
  const integration = req.automationIntegration!;
  const offset = Number(req.query.offset ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset >= integration.allowedSymbols.length) return jsonError(res, 400, 'offset must point inside the integration allowlist.');
  const requested = typeof req.query.symbols === 'string'
    ? req.query.symbols.split(',').map(symbol => symbol.trim().toUpperCase()).filter(Boolean)
    : integration.allowedSymbols.slice(offset, offset + 50);
  if (!requested.length || requested.length > 50) return jsonError(res, 400, 'Request 1–50 allowlisted symbols per context call.');
  if (requested.some(symbol => !integration.allowedSymbols.includes(symbol))) return jsonError(res, 403, 'Requested market context includes a symbol outside the credential allowlist.');
  const accessToken = await BrokerRepository.getAccessTokenForExecution(integration.brokerId, integration.userId).catch(() => undefined);
  if (!accessToken) return jsonError(res, 409, 'The linked FYERS session is not connected. Reconnect the broker in TradingCoreOS.');
  try {
    const adapter = BrokerRegistry.getAdapter(integration.brokerId);
    const quotes = await adapter.getMarketQuotes(accessToken, requested);
    const automation = await AutomationIntegrationRepository.getAutomationForIntegration(integration);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      success: true,
      data: {
        automation: {
          id: integration.automationId,
          state: automation?.lifecycleStatus || automation?.lifecycleState || 'UNKNOWN',
          allowOrderExecution: automation?.allowOrderExecution === true,
          requireConfirmation: automation?.requireConfirmation !== false,
        },
        observedAt: new Date().toISOString(),
        broker: integration.brokerId,
        symbols: requested,
        quotes,
        limits: {
          maxOrderQuantity: integration.maxOrderQuantity,
          maxOrderNotional: integration.maxOrderNotional,
          maxPositionNotional: integration.maxPositionNotional,
          maxAccountExposureNotional: integration.maxAccountExposureNotional,
          maxDailyOrders: integration.maxDailyOrders,
          allowLiveOrders: integration.allowLiveOrders,
        },
        pagination: { offset, nextOffset: offset + requested.length < integration.allowedSymbols.length ? offset + requested.length : null },
      },
    });
  } catch (error) {
    jsonError(res, 502, getErrorMessage(error, 'Unable to load allowlisted broker market context.'));
  }
});

automationGatewayRoutes.get('/v1/signals', requireAutomationScope('signals:read'), async (req: AutomationGatewayRequest, res: Response) => {
  const after = typeof req.query.after === 'string' ? req.query.after : undefined;
  if (after && !Number.isFinite(Date.parse(after))) return jsonError(res, 400, 'after must be an ISO timestamp cursor returned by the previous response.');
  const limitValue = Number(req.query.limit ?? 50);
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100) return jsonError(res, 400, 'limit must be an integer between 1 and 100.');
  try {
    const signals = await AutomationIntegrationRepository.listSignals(req.automationIntegration!.id, after, limitValue);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      success: true,
      data: signals.map(signal => ({
        eventId: signal.eventId, eventType: signal.eventType, symbol: signal.symbol,
        timeframe: signal.timeframe, sourceId: signal.sourceId, runId: signal.runId,
        mode: signal.mode, barIndex: signal.barIndex, timestamp: Date.parse(signal.signalTimestamp),
        createdAt: signal.createdAt, payload: signal.payload,
      })),
      nextCursor: signals.at(-1)?.createdAt ?? after ?? null,
    });
  } catch (error) {
    jsonError(res, 503, getErrorMessage(error, 'Unable to read the signal feed.'));
  }
});

automationGatewayRoutes.get('/v1/orders/:externalRequestId', requireAutomationScope('orders:request'), async (req: AutomationGatewayRequest, res: Response) => {
  const integration = req.automationIntegration!;
  const requestId = String(req.params.externalRequestId ?? '');
  try {
    const record = await AutomationIntegrationRepository.getOrderRequest(integration.id, requestId);
    if (!record) return jsonError(res, 404, 'Order request was not found for this integration.');
    let actualState: string = record.state;
    let filledQuantity: number | null = null;
    let averagePrice: number | null = null;
    if (record.brokerOrderId) {
      const state = await AutomationIntegrationRepository.getBrokerOrderState(record.userId, record.brokerOrderId).catch(() => undefined);
      if (state) {
        actualState = state.status;
        filledQuantity = state.filledQuantity;
        averagePrice = state.averagePrice;
        if (state.status !== record.state) {
          await AutomationIntegrationRepository.updateOrderRequest(integration.id, requestId, {
            state: state.status as AutomationRequestState,
            response: {
              ...(record.response ?? {}),
              state: state.status,
              filled: state.status === 'FILLED',
              filledQuantity: state.filledQuantity,
              averagePrice: state.averagePrice,
              brokerStateUpdatedAt: state.updatedAt,
            },
            clientOrderId: record.clientOrderId,
            brokerOrderId: record.brokerOrderId,
            signalId: record.signalId,
            estimatedNotional: record.estimatedNotional,
            riskChecks: record.riskChecks,
          }).catch(() => undefined);
        }
      }
    }
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      success: true,
      data: {
        requestId: record.externalRequestId,
        state: actualState,
        accepted: ['ACKNOWLEDGED','OPEN','PARTIAL','FILLED'].includes(actualState),
        filled: actualState === 'FILLED',
        filledQuantity,
        averagePrice,
        clientOrderId: record.clientOrderId,
        brokerOrderId: record.brokerOrderId,
        response: record.response,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    });
  } catch (error) {
    jsonError(res, 503, getErrorMessage(error, 'Unable to read order state.'));
  }
});

automationGatewayRoutes.post('/v1/orders', requireAutomationScope('orders:request'), automationOrderRateLimiter, async (req: AutomationGatewayRequest, res: Response) => {
  const integration = req.automationIntegration!;
  let orderPayload: BrokerOrderPayload;
  let requestedMode: 'PAPER' | 'LIVE';
  let signalId: string | null = null;
  const externalRequestId = String(req.get('Idempotency-Key') ?? '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(externalRequestId)) {
    return jsonError(res, 400, 'Idempotency-Key header must be 8–128 safe characters and is required for every order request.');
  }
  if (!isRecord(req.body) || !isRecord(req.body.order)) return jsonError(res, 400, 'Order request body must contain a typed order object.');
  try {
    const parsed = parseBrokerOrderPayload(req.body.order);
    const symbol = String(parsed.symbol).trim().toUpperCase();
    const side = String(parsed.side).trim().toUpperCase();
    const type = String(parsed.orderType).trim().toUpperCase();
    const product = String(parsed.product).trim().toUpperCase();
    const normalizedType = type === 'MARKET' ? 'Market' : type === 'LIMIT' ? 'Limit' : type;
    orderPayload = {
      ...parsed,
      symbol,
      side: side === 'BUY' ? 'Buy' : 'Sell',
      orderType: normalizedType as BrokerOrderPayload['orderType'],
      product: product as BrokerOrderPayload['product'],
      quantity: Number(parsed.quantity),
    };
    if (!integration.allowedSymbols.includes(symbol)) {
      return jsonError(res, 403, 'Order symbol is outside the integration allowlist.', { orderSubmitted: false });
    }
    signalId = typeof req.body.signalId === 'string' && req.body.signalId.trim() ? req.body.signalId.trim() : null;
    if (signalId && signalId.length > 200) return jsonError(res, 400, 'signalId cannot exceed 200 characters.');
    const rawMode = String(req.body.mode ?? 'PAPER').trim().toUpperCase();
    if (rawMode !== 'LIVE' && rawMode !== 'PAPER') return jsonError(res, 400, 'mode must be PAPER or LIVE.');
    requestedMode = rawMode;
  } catch (error) {
    return jsonError(res, 400, getErrorMessage(error, 'Invalid typed order request.'), { orderSubmitted: false });
  }

  const requestHash = canonicalSha256({ order: orderPayload, signalId, mode: requestedMode });
  const safePayload = { order: orderPayload, signalId, mode: requestedMode };
  let claim: Awaited<ReturnType<typeof AutomationIntegrationRepository.claimOrderRequest>>;
  try {
    claim = await AutomationIntegrationRepository.claimOrderRequest({
      integrationId: integration.id,
      externalRequestId,
      requestHash,
      payload: safePayload,
    });
  } catch (error) {
    return jsonError(res, 503, getErrorMessage(error, 'Durable idempotency storage is unavailable; no broker order was submitted.'), { orderSubmitted: false });
  }
  if (!claim.claimed) {
    if (claim.conflict === 'request_mismatch') return jsonError(res, 409, 'Idempotency-Key was already used with a different order/signal/mode payload.');
    if (claim.conflict === 'daily_limit') return jsonError(res, 429, 'Daily live-order request limit reached for this integration.');
    if (!claim.record) return jsonError(res, 503, 'Existing idempotency record could not be loaded; no new order was submitted.');
    return replayResponse(claim.record, res);
  }

  const rejectAndStore = async (status: number, message: string, extra: Record<string, unknown> = {}) => {
    const response = { success: false, error: message, orderSubmitted: false, requestId: externalRequestId, ...extra };
    await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, {
      state: 'REJECTED', response, signalId,
    });
    await AuditLogRepository.append({
      userId: integration.userId, actorType: 'automation', eventType: 'automation.order.rejected',
      requestId: req.get('x-request-id'), correlationId: externalRequestId,
      payload: { integrationId: integration.id, automationId: integration.automationId, requestId: externalRequestId, reason: message, mode: requestedMode },
    }).catch(() => undefined);
    return res.status(status).json(response);
  };

  try {
    if (requestedMode === 'LIVE') {
      if (!integration.allowLiveOrders) return await rejectAndStore(403, 'This integration is paper-only. Create or rotate a credential with explicit live permission to request live orders.');
      const automation = await AutomationIntegrationRepository.getAutomationForIntegration(integration);
      if (!automation || !liveExecutionEnabled(automation)) {
        return await rejectAndStore(409, 'Live submission requires the owned automation lifecycle to be LIVE, Allow automated orders enabled, and Require confirmation disabled.');
      }
      if (!process.env.FYERS_EXECUTION_GATEWAY_URL?.trim() || !process.env.FYERS_EXECUTION_GATEWAY_SECRET) {
        return await rejectAndStore(503, 'FYERS live execution is disabled until the fixed-IP execution gateway URL and secret are configured.');
      }
      // Signal-linked workflows get tighter event/symbol/side validation. Direct AI
      // decisions are also allowed when explicitly authorized, but never skip any
      // server-owned lifecycle, quantity/notional, account exposure, margin or audit checks.
      if (signalId) {
        const signal = await AutomationIntegrationRepository.getSignal(integration.id, signalId);
        if (!signal) return await rejectAndStore(422, 'Linked CoreSpirit signal was not found for this integration.');
        const signalConflict = assertSignalMatchesOrder({
          eventType: signal.eventType, symbol: signal.symbol, mode: signal.mode, signalTimestamp: signal.signalTimestamp,
        }, orderPayload);
        if (signalConflict) return await rejectAndStore(422, signalConflict);
      }
    }

    const accessToken = await BrokerRepository.getAccessTokenForExecution(integration.brokerId, integration.userId);
    if (!accessToken) return await rejectAndStore(409, 'The linked broker session is not connected or has expired.');
    const broker = BrokerRegistry.getAdapter(integration.brokerId);
    const risk = await evaluateAutomationPreTradeRisk({
      userId: integration.userId,
      accessToken,
      broker,
      integration,
      order: orderPayload,
      live: requestedMode === 'LIVE',
    });
    if (!risk.approved) {
      await AuditLogRepository.append({
        userId: integration.userId, actorType: 'automation', eventType: 'automation.order.risk_rejected',
        requestId: req.get('x-request-id'), correlationId: externalRequestId,
        payload: { integrationId: integration.id, automationId: integration.automationId, symbol: orderPayload.symbol, side: orderPayload.side, quantity: orderPayload.quantity, reason: risk.reason, checks: risk.checks },
      }).catch(() => undefined);
      return await rejectAndStore(422, risk.reason, { riskChecks: risk.checks });
    }

    if (requestedMode === 'PAPER') {
      const response = {
        success: true, accepted: true, state: 'PAPER', executionStatus: 'PAPER_SIMULATED',
        orderSubmitted: false, filled: false, requestId: externalRequestId, signalId,
        risk: { approved: true, reason: risk.reason, checks: risk.checks, estimatedNotional: risk.estimatedNotional, projectedAccountExposure: risk.projectedAccountExposure },
        message: 'Paper request recorded. No broker order was submitted.',
      };
      await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, {
        state: 'PAPER', response, signalId, estimatedNotional: risk.estimatedNotional, riskChecks: risk.checks,
      });
      await AuditLogRepository.append({
        userId: integration.userId, actorType: 'automation', eventType: 'automation.order.paper',
        requestId: req.get('x-request-id'), correlationId: externalRequestId,
        payload: { integrationId: integration.id, automationId: integration.automationId, symbol: orderPayload.symbol, quantity: orderPayload.quantity, estimatedNotional: risk.estimatedNotional },
      }).catch(() => undefined);
      return res.status(200).json(response);
    }

    // Required audit writes must succeed before the broker side effect begins.
    try {
      await AuditLogRepository.append({
        userId: integration.userId, actorType: 'automation', eventType: 'automation.order.risk_approved',
        requestId: req.get('x-request-id'), correlationId: externalRequestId,
        payload: { integrationId: integration.id, automationId: integration.automationId, requestId: externalRequestId, symbol: orderPayload.symbol, side: orderPayload.side, quantity: orderPayload.quantity, riskChecks: risk.checks, estimatedNotional: risk.estimatedNotional },
      });
    } catch (error) {
      return await rejectAndStore(503, getErrorMessage(error, 'Durable risk audit is unavailable; no broker order was submitted.'));
    }

    const internalIdempotencyKey = `auto:${integration.id}:${createHash('sha256').update(externalRequestId).digest('hex').slice(0, 40)}`;
    const idemClaim = await OrderIdempotencyRepository.claim(integration.userId, integration.brokerId, internalIdempotencyKey, orderPayload);
    if (!idemClaim.claimed) {
      if (idemClaim.conflict === 'request_mismatch') return await rejectAndStore(409, 'Internal order idempotency record conflicts with the automation request.');
      if (idemClaim.conflict === 'in_flight') {
        const response = { success: true, accepted: false, state: 'PROCESSING', requestId: externalRequestId, message: 'An order with this key is already being submitted; do not retry with another key.' };
        await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, { state: 'PROCESSING', response, signalId, estimatedNotional: risk.estimatedNotional, riskChecks: risk.checks });
        return res.status(202).json(response);
      }
      if (idemClaim.conflict === 'recovery_required' || idemClaim.record?.state === 'unknown' || idemClaim.record?.state === 'recovery_required') {
        const response = { success: false, error: 'Previous broker outcome is uncertain. Reconciliation is required; this key will not resubmit.', recoveryRequired: true, orderSubmitted: 'unknown', requestId: externalRequestId, brokerOrderId: idemClaim.record?.brokerOrderId ?? null };
        await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, { state: 'RECOVERY_REQUIRED', response, signalId, estimatedNotional: risk.estimatedNotional, riskChecks: risk.checks });
        return res.status(409).json(response);
      }
      const previous = idemClaim.record?.response;
      const response = isRecord(previous) ? previous : { success: false, error: 'Existing order result is unavailable.' };
      return res.status(idemClaim.record?.state === 'completed' ? 200 : 409).json(response);
    }

    const clientOrderId = createHash('sha256').update(`tco:auto:${integration.id}:${externalRequestId}`).digest('hex').slice(0, 30);
    const submitPayload = { ...orderPayload, orderTag: clientOrderId } as BrokerOrderPayload;
    const requestId = req.get('x-request-id');
    try {
      await FyersOrderStateEngine.recordLifecycle(integration.userId, clientOrderId, 'INTENT', {
        symbol: submitPayload.symbol, quantity: Number(submitPayload.quantity),
        side: String(submitPayload.side).toUpperCase() === 'SELL' ? 'sell' : 'buy',
      });
      await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, {
        state: 'INTENT',
        response: { success: false, state: 'INTENT', orderSubmitted: false, requestId: externalRequestId },
        clientOrderId, signalId, estimatedNotional: risk.estimatedNotional, riskChecks: risk.checks,
      });
      await FyersOrderStateEngine.recordLifecycle(integration.userId, clientOrderId, 'SUBMITTED', {
        symbol: submitPayload.symbol, quantity: Number(submitPayload.quantity),
        side: String(submitPayload.side).toUpperCase() === 'SELL' ? 'sell' : 'buy',
      });
      await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, {
        state: 'SUBMITTED',
        response: { success: false, state: 'SUBMITTED', orderSubmitted: 'pending', requestId: externalRequestId },
        clientOrderId, signalId, estimatedNotional: risk.estimatedNotional, riskChecks: risk.checks,
      });
      await AuditLogRepository.append({
        userId: integration.userId, actorType: 'automation', eventType: 'automation.order.submitting',
        requestId, correlationId: externalRequestId,
        payload: { integrationId: integration.id, automationId: integration.automationId, clientOrderId, internalIdempotencyKey },
      });
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to persist order intent and audit before broker submission.');
      await OrderIdempotencyRepository.fail(integration.userId, integration.brokerId, internalIdempotencyKey, { success: false, error: message }).catch(() => undefined);
      return await rejectAndStore(503, message);
    }

    let brokerData: unknown;
    try {
      brokerData = await placeFyersOrderViaFixedIpGateway(accessToken, submitPayload, internalIdempotencyKey, integration.userId);
    } catch (error) {
      const message = getErrorMessage(error, 'FYERS order request failed.');
      const status = getErrorStatus(error);
      const definiteReject = status >= 400 && status < 500 && status !== 408 && status !== 429;
      await FyersOrderStateEngine.recordLifecycle(integration.userId, clientOrderId, definiteReject ? 'REJECTED' : 'UNKNOWN', {
        symbol: submitPayload.symbol, quantity: Number(submitPayload.quantity),
        side: String(submitPayload.side).toUpperCase() === 'SELL' ? 'sell' : 'buy', message,
      }).catch(() => undefined);
      const failedResponse = {
        success: false, error: message, requestId: externalRequestId,
        orderSubmitted: definiteReject ? false : 'unknown',
        recoveryRequired: !definiteReject,
        clientOrderId,
      };
      if (definiteReject) {
        await OrderIdempotencyRepository.fail(integration.userId, integration.brokerId, internalIdempotencyKey, failedResponse).catch(() => undefined);
        await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, {
          state: 'REJECTED', response: failedResponse, clientOrderId, signalId,
          estimatedNotional: risk.estimatedNotional, riskChecks: risk.checks,
        });
        await AuditLogRepository.append({
          userId: integration.userId, actorType: 'broker', eventType: 'automation.order.broker_rejected',
          requestId, correlationId: externalRequestId,
          payload: { integrationId: integration.id, clientOrderId, status, error: message },
        }).catch(() => undefined);
        return res.status(502).json(failedResponse);
      }
      await OrderIdempotencyRepository.markUnknown(integration.userId, integration.brokerId, internalIdempotencyKey, failedResponse, message).catch(() => undefined);
      await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, {
        state: 'UNKNOWN', response: failedResponse, clientOrderId, signalId,
        estimatedNotional: risk.estimatedNotional, riskChecks: risk.checks,
      });
      await AuditLogRepository.append({
        userId: integration.userId, actorType: 'system', eventType: 'automation.order.outcome_unknown',
        requestId, correlationId: externalRequestId,
        payload: { integrationId: integration.id, clientOrderId, status, error: message },
      }).catch(() => undefined);
      return res.status(502).json(failedResponse);
    }

    const brokerOrderId = isRecord(brokerData)
      ? (brokerData.orderId ?? brokerData.order_id ?? brokerData.id ?? null)
      : null;
    if (brokerOrderId == null || !String(brokerOrderId).trim()) {
      const response = {
        success: false,
        error: 'FYERS accepted the request but returned no broker order ID. Reconciliation is required; do not retry.',
        recoveryRequired: true,
        orderSubmitted: 'unknown',
        requestId: externalRequestId,
        clientOrderId,
      };
      await FyersOrderStateEngine.recordLifecycle(integration.userId, clientOrderId, 'UNKNOWN', {
        symbol: submitPayload.symbol, quantity: Number(submitPayload.quantity), message: response.error,
      }).catch(() => undefined);
      await OrderIdempotencyRepository.markRecoveryRequired(integration.userId, integration.brokerId, internalIdempotencyKey, response, response.error).catch(() => undefined);
      await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, {
        state: 'RECOVERY_REQUIRED', response, clientOrderId, signalId,
        estimatedNotional: risk.estimatedNotional, riskChecks: risk.checks,
      }).catch(() => undefined);
      await AuditLogRepository.append({
        userId: integration.userId, actorType: 'system', eventType: 'automation.order.recovery_required',
        requestId, correlationId: externalRequestId, payload: { integrationId: integration.id, clientOrderId, reason: response.error },
      }).catch(() => undefined);
      return res.status(503).json(response);
    }

    try {
      await FyersOrderStateEngine.recordLifecycle(integration.userId, clientOrderId, 'ACKNOWLEDGED', {
        brokerOrderId: String(brokerOrderId), symbol: submitPayload.symbol, quantity: Number(submitPayload.quantity),
        side: String(submitPayload.side).toUpperCase() === 'SELL' ? 'sell' : 'buy',
        message: isRecord(brokerData) && typeof brokerData.message === 'string' ? brokerData.message : undefined,
      });
      const response = {
        success: true, accepted: true, state: 'ACKNOWLEDGED',
        executionStatus: 'BROKER_ACCEPTED', orderSubmitted: true, filled: false,
        requestId: externalRequestId, signalId, clientOrderId, brokerOrderId: String(brokerOrderId),
        risk: { approved: true, reason: risk.reason, checks: risk.checks, estimatedNotional: risk.estimatedNotional, projectedAccountExposure: risk.projectedAccountExposure, requiredMargin: risk.requiredMargin },
        data: brokerData,
        message: 'Broker acknowledged the order request. This is not a fill confirmation; poll order state or wait for broker reconciliation.',
      };
      await OrderIdempotencyRepository.complete(integration.userId, integration.brokerId, internalIdempotencyKey, response);
      await AuditLogRepository.append({
        userId: integration.userId, actorType: 'automation', eventType: 'automation.order.acknowledged',
        requestId, correlationId: externalRequestId,
        payload: { integrationId: integration.id, automationId: integration.automationId, clientOrderId, brokerOrderId: String(brokerOrderId), state: 'ACKNOWLEDGED', filled: false },
      });
      await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, {
        state: 'ACKNOWLEDGED', response, clientOrderId, brokerOrderId: String(brokerOrderId), signalId,
        estimatedNotional: risk.estimatedNotional, riskChecks: risk.checks,
      });
      return res.status(202).json(response);
    } catch (error) {
      const message = getErrorMessage(error, 'Broker accepted order but canonical state/audit persistence needs reconciliation.');
      const response = {
        success: false,
        error: 'FYERS may have accepted the order but TradingCoreOS could not durably finalize its state. Do not retry; reconciliation is required.',
        recoveryRequired: true,
        orderSubmitted: 'unknown',
        requestId: externalRequestId,
        clientOrderId,
        brokerOrderId: String(brokerOrderId),
      };
      await OrderIdempotencyRepository.markRecoveryRequired(integration.userId, integration.brokerId, internalIdempotencyKey, response, message).catch(() => undefined);
      await FyersOrderStateEngine.recordLifecycle(integration.userId, clientOrderId, 'UNKNOWN', {
        brokerOrderId: String(brokerOrderId), symbol: submitPayload.symbol, quantity: Number(submitPayload.quantity), message,
      }).catch(() => undefined);
      await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, {
        state: 'RECOVERY_REQUIRED', response, clientOrderId, brokerOrderId: String(brokerOrderId), signalId,
        estimatedNotional: risk.estimatedNotional, riskChecks: risk.checks,
      }).catch(() => undefined);
      await AuditLogRepository.append({
        userId: integration.userId, actorType: 'system', eventType: 'automation.order.recovery_required',
        requestId, correlationId: externalRequestId,
        payload: { integrationId: integration.id, clientOrderId, brokerOrderId: String(brokerOrderId), error: message },
      }).catch(() => undefined);
      return res.status(503).json(response);
    }
  } catch (error) {
    const message = getErrorMessage(error, 'Automation order pipeline failed before confirmed submission.');
    await AutomationIntegrationRepository.updateOrderRequest(integration.id, externalRequestId, {
      state: 'RECOVERY_REQUIRED',
      response: { success: false, error: message, recoveryRequired: true, orderSubmitted: 'unknown', requestId: externalRequestId },
      signalId,
    }).catch(() => undefined);
    await AuditLogRepository.append({
      userId: integration.userId, actorType: 'system', eventType: 'automation.order.pipeline_error',
      requestId: req.get('x-request-id'), correlationId: externalRequestId,
      payload: { integrationId: integration.id, automationId: integration.automationId, error: message },
    }).catch(() => undefined);
    return jsonError(res, 503, 'Automation order pipeline could not be completed. Check the recorded request state before retrying.', {
      recoveryRequired: true, requestId: externalRequestId,
    });
  }
});
