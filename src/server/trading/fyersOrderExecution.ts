import { createHmac, createHash, randomUUID } from 'node:crypto';
import type { BrokerOrderPayload } from '../brokers/contracts.js';
import { getErrorMessage, isRecord } from '../../services/boundary/brokerApiValidation.js';
import { API_LATENCY_BUDGET_MS } from '../latency/budgets.js';
import { resolveFyersCapabilities } from '../fyers/core/FyersCapabilities.js';

export function parseBrokerOrderPayload(value: unknown): BrokerOrderPayload {
  if (!isRecord(value)) throw new Error('Order payload must be a JSON object');
  const symbol = typeof value.symbol === 'string' ? value.symbol.trim() : '';
  const quantity = Number(value.quantity);
  const orderType = typeof value.orderType === 'string' ? value.orderType : undefined;
  const side = typeof value.side === 'string' ? value.side : undefined;
  const product = typeof value.product === 'string' ? value.product : undefined;
  if (!symbol || !Number.isInteger(quantity) || quantity <= 0 || !side || !orderType || !product) throw new Error('Order payload is missing required typed fields');
  return value as BrokerOrderPayload;
}

export type FyersPreflightDecision = {
  approved: true;
  version: 'manual-order-preflight-v1';
  maxQuantity: number;
  checks: readonly string[];
};

function configuredFyersOrderQuantityLimit(): number {
  const value = Number(process.env.FYERS_GATEWAY_MAX_ORDER_QUANTITY ?? 1000);
  return Number.isSafeInteger(value) && value > 0 ? Math.max(1, Math.min(1000, value)) : 1000;
}

/**
 * Baseline fail-closed order shape validation shared by manual and automation orders.
 *
 * This helper enforces typed fields, allowed enums, symbol shape, quantity ceilings,
 * price requirements and AMO denial. External automation then runs the separate
 * server-owned account/position, quote-freshness, notional, and live broker-margin
 * risk pipeline before the fixed-IP gateway can submit any order.
 */
export function validateFyersManualOrderPreflight(order: BrokerOrderPayload): FyersPreflightDecision {
  const quantity = Number(order.quantity ?? order.qty);
  const maxQuantity = configuredFyersOrderQuantityLimit();
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
    throw Object.assign(new Error(`Order quantity exceeds TradingCoreOS pre-trade limit (${maxQuantity}).`), { statusCode: 400 });
  }

  const symbol = String(order.symbol ?? '').trim();
  if (!/^[A-Z0-9_-]{2,16}:[A-Z0-9&_.-]{1,80}$/i.test(symbol)) {
    throw Object.assign(new Error('Order symbol must be a fully-qualified broker symbol (for example NSE:SBIN-EQ).'), { statusCode: 400 });
  }

  const side = String(order.side ?? '').trim().toUpperCase();
  if (side !== 'BUY' && side !== 'SELL') {
    throw Object.assign(new Error('FYERS order side must be Buy or Sell.'), { statusCode: 400 });
  }

  const orderType = String(order.orderType ?? '').trim().toUpperCase();
  if (!['MARKET', 'LIMIT', 'SL', 'SL-M'].includes(orderType)) {
    throw Object.assign(new Error('Unsupported FYERS order type.'), { statusCode: 400 });
  }

  const product = String(order.product ?? '').trim().toUpperCase();
  if (!['CNC', 'MIS', 'NRML'].includes(product)) {
    throw Object.assign(new Error('Unsupported FYERS product type.'), { statusCode: 400 });
  }

  const price = Number(order.price);
  const triggerPrice = Number(order.triggerPrice);
  if (orderType !== 'MARKET' && (!Number.isFinite(price) || price <= 0)) {
    throw Object.assign(new Error('Limit and stop-limit orders require a positive limit price.'), { statusCode: 400 });
  }
  if ((orderType === 'SL' || orderType === 'SL-M') && (!Number.isFinite(triggerPrice) || triggerPrice <= 0)) {
    throw Object.assign(new Error('Stop orders require a positive trigger price.'), { statusCode: 400 });
  }
  if (order.offlineOrder === true) {
    throw Object.assign(new Error('After-market orders are disabled for FYERS API execution.'), { statusCode: 400 });
  }

  return {
    approved: true,
    version: 'manual-order-preflight-v1',
    maxQuantity,
    checks: ['required-fields', 'side-enum', 'order-type-enum', 'product-enum', 'fully-qualified-symbol', 'quantity-limit', 'price-fields', 'amo-disabled'],
  };
}

export async function placeFyersOrderViaFixedIpGateway(accessToken: string, order: BrokerOrderPayload, riskDecisionId: string, userId: string) {
  const gatewayUrl = process.env.FYERS_EXECUTION_GATEWAY_URL?.trim().replace(/\/$/, '');
  const gatewaySecret = process.env.FYERS_EXECUTION_GATEWAY_SECRET;
  if (!gatewayUrl || !gatewaySecret) throw new Error('FYERS execution gateway is not configured. Set FYERS_EXECUTION_GATEWAY_URL and FYERS_EXECUTION_GATEWAY_SECRET on the TradingCore server.');

  // Fail closed before any network side effect. A context is issued only after these
  // concrete pre-trade checks pass; the gateway then validates the signed, order-bound context.
  const decision = validateFyersManualOrderPreflight(order);
  const issuedAt = Date.now();
  const orderHash = createHash('sha256').update(JSON.stringify(order)).digest('hex');
  const decisionId = createHash('sha256').update(JSON.stringify({
    version: decision.version, userId, idempotencyKey: riskDecisionId, orderHash, checks: decision.checks,
  })).digest('hex');
  const executionContext = {
    version: 1,
    riskApproved: decision.approved,
    strategyId: 'tco-manual-order',
    accountKey: createHash('sha256').update(userId).digest('hex'),
    // The HMAC binds this identity and entitlement to the order request. The
    // gateway verifies them before charging the shared transaction quota.
    rateLimitIdentity: userId,
    quotaPlan: resolveFyersCapabilities(userId).plan,
    riskDecisionId: decisionId,
    issuedAt,
    expiresAt: issuedAt + (() => {
      const configured = Number(process.env.FYERS_GATEWAY_CONTEXT_TTL_MS ?? 30_000);
      return Number.isFinite(configured) ? Math.max(5_000, Math.min(60_000, configured)) : 30_000;
    })(),
    maxQuantity: decision.maxQuantity,
    orderHash,
  };
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const body = JSON.stringify({ accessToken, order, executionContext });
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const signingInput = ['POST', '/v1/fyers/order', timestamp, nonce, bodyHash].join('\n');
  const signature = createHmac('sha256', gatewaySecret).update(signingInput).digest('hex');
  const response = await fetch(`${gatewayUrl}/v1/fyers/order`, {
    method: 'POST',
    signal: AbortSignal.timeout(API_LATENCY_BUDGET_MS.order),
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
  if (!response.ok || (isRecord(payload) && payload.success === false)) throw Object.assign(new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : `FYERS execution gateway returned HTTP ${response.status}`), { status: response.status, statusCode: response.status });
  return isRecord(payload) && 'data' in payload ? payload.data : payload;
}
