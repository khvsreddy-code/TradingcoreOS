import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.FYERS_GATEWAY_SECRET;
const FYERS_ORDER_URL = 'https://api-t1.fyers.in/api/v3/orders/sync';
const MAX_SKEW_MS = Number(process.env.FYERS_GATEWAY_MAX_SKEW_MS || 60_000);
const UPSTREAM_TIMEOUT_MS = Number(process.env.FYERS_GATEWAY_UPSTREAM_TIMEOUT_MS || 8_000);
const allowLegacySecret = process.env.FYERS_GATEWAY_ALLOW_LEGACY_SECRET === 'true';
const nonces = new Map();
const MAX_ORDER_QUANTITY = Math.max(1, Number(process.env.FYERS_GATEWAY_MAX_ORDER_QUANTITY || 1000));
const MAX_CONTEXT_TTL_MS = Math.max(5_000, Math.min(60_000, Number(process.env.FYERS_GATEWAY_CONTEXT_TTL_MS || 30_000)));

if (!SECRET) throw new Error('FYERS_GATEWAY_SECRET is required');

function cleanupNonces(now = Date.now()) {
  for (const [nonce, expiresAt] of nonces) {
    if (expiresAt <= now) nonces.delete(nonce);
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function timingSafeEqualHex(left, right) {
  try {
    const a = Buffer.from(left, 'hex');
    const b = Buffer.from(right, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function authorize(req, rawBody) {
  const timestamp = String(req.headers['x-tradingcore-timestamp'] || '');
  const nonce = String(req.headers['x-tradingcore-nonce'] || '');
  const signature = String(req.headers['x-tradingcore-signature'] || '');
  if (timestamp && nonce && signature) {
    const issuedAt = Number(timestamp);
    if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > MAX_SKEW_MS) return false;
    if (!/^[0-9a-f-]{16,80}$/i.test(nonce) || nonces.has(nonce)) return false;
    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const signingInput = ['POST', '/v1/fyers/order', timestamp, nonce, bodyHash].join('\n');
    const expected = crypto.createHmac('sha256', SECRET).update(signingInput).digest('hex');
    if (!timingSafeEqualHex(signature, expected)) return false;
    nonces.set(nonce, issuedAt + MAX_SKEW_MS * 2);
    return true;
  }
  return allowLegacySecret && req.headers['x-tradingcore-gateway-secret'] === SECRET;
}

function productType(value) {
  const v = String(value || '').toUpperCase();
  if (v === 'CNC' || v === 'DELIVERY' || v === 'OVERNIGHT') return 'CNC';
  if (v === 'NRML' || v === 'MARGIN') return 'MARGIN';
  return 'INTRADAY';
}

function orderType(value) {
  const v = String(value || 'MARKET').toUpperCase().replace(/[^A-Z-]/g, '');
  if (v === 'LIMIT') return 1;
  if (v === 'SL' || v === 'STOP') return 3;
  if (v === 'SL-M' || v === 'SLM' || v === 'STOP-MARKET') return 4;
  return 2;
}

function side(value) {
  return String(value || 'BUY').toUpperCase() === 'SELL' ? -1 : 1;
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function validateExecutionContext(order, context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('Validated TradingCoreOS execution context is required');
  }
  const now = Date.now();
  const issuedAt = Number(context.issuedAt);
  const expiresAt = Number(context.expiresAt);
  const maxQuantity = Number(context.maxQuantity);
  const quantity = Math.trunc(numberOrZero(order?.quantity ?? order?.qty));
  const strategyId = String(context.strategyId || '').trim();
  const decisionId = String(context.riskDecisionId || '').trim();
  const orderHash = String(context.orderHash || '').trim().toLowerCase();
  if (context.version !== 1 || context.riskApproved !== true) throw new Error('Execution context has no approved risk decision');
  if (!strategyId || strategyId.length > 128 || !decisionId || decisionId.length > 128) throw new Error('Execution context strategy or risk decision identity is invalid');
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 2_000 || issuedAt < now - MAX_CONTEXT_TTL_MS || expiresAt <= now || expiresAt - issuedAt > MAX_CONTEXT_TTL_MS) {
    throw new Error('Execution context is expired or outside its permitted time window');
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_QUANTITY || !Number.isSafeInteger(maxQuantity) || maxQuantity < 1 || quantity > maxQuantity || maxQuantity > MAX_ORDER_QUANTITY) {
    throw new Error('Order quantity exceeds the validated risk limits');
  }
  const expectedHash = crypto.createHash('sha256').update(JSON.stringify(order)).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(orderHash) || !timingSafeEqualHex(orderHash, expectedHash)) {
    throw new Error('Execution context does not match the submitted order');
  }
}

function buildFyersPayload(order = {}) {
  const type = orderType(order.orderType || order.type);
  const payload = {
    symbol: String(order.symbol || '').trim(),
    qty: Math.max(1, Math.trunc(numberOrZero(order.quantity ?? order.qty))),
    type,
    side: side(order.side),
    productType: productType(order.productType || order.product),
    limitPrice: type === 1 || type === 4 ? numberOrZero(order.price ?? order.limitPrice) : 0,
    stopPrice: type === 3 || type === 4 ? numberOrZero(order.triggerPrice ?? order.stopPrice) : 0,
    disclosedQty: Math.max(0, Math.trunc(numberOrZero(order.disclosedQty))),
    validity: String(order.validity || 'DAY').toUpperCase() === 'IOC' ? 'IOC' : 'DAY',
    offlineOrder: Boolean(order.offlineOrder),
    stopLoss: numberOrZero(order.stopLoss),
    takeProfit: numberOrZero(order.takeProfit ?? order.target),
    orderTag: String(order.orderTag || 'TradingCoreOS').slice(0, 50),
    isSliceOrder: Boolean(order.isSliceOrder),
  };
  if (!payload.symbol) throw new Error('FYERS order symbol is required');
  if (payload.qty < 1) throw new Error('FYERS order quantity must be at least 1');
  if ((type === 3 || type === 4) && payload.stopPrice <= 0) throw new Error('FYERS stop order requires a valid trigger price');
  if ((type === 1 || type === 4) && payload.limitPrice <= 0) throw new Error('FYERS limit order requires a valid price');
  return payload;
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw, 'utf8') > 64 * 1024) throw new Error('Request body too large');
  }
  return raw;
}

const server = http.createServer(async (req, res) => {
  cleanupNonces();
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, service: 'fyers-execution-gateway' });
  if (req.method !== 'POST' || req.url !== '/v1/fyers/order') return json(res, 404, { success: false, error: 'Not found' });

  try {
    const rawBody = await readBody(req);
    if (!authorize(req, rawBody)) return json(res, 401, { success: false, error: 'Unauthorized' });
    const body = JSON.parse(rawBody || '{}');
    const accessToken = String(body.accessToken || '');
    if (!accessToken) return json(res, 400, { success: false, error: 'FYERS access token is required' });
    validateExecutionContext(body.order, body.executionContext);
    const fyersPayload = buildFyersPayload(body.order);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(FYERS_ORDER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(fyersPayload),
      });
      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) return json(res, upstream.status, { success: false, error: data?.message || data?.error || 'FYERS rejected the order', data });
      return json(res, 200, { success: true, data });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const status = error?.name === 'AbortError' ? 504 : 400;
    return json(res, status, { success: false, error: error?.name === 'AbortError' ? 'FYERS upstream request timed out' : error?.message || 'Invalid request' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`FYERS execution gateway listening on ${PORT}`));
