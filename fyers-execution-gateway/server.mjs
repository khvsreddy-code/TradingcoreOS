import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.FYERS_GATEWAY_SECRET;
const FYERS_ORDER_URL = 'https://api-t1.fyers.in/api/v3/orders/sync';
const MAX_SKEW_MS = Number(process.env.FYERS_GATEWAY_MAX_SKEW_MS || 60_000);
const UPSTREAM_TIMEOUT_MS = Number(process.env.FYERS_GATEWAY_UPSTREAM_TIMEOUT_MS || 8_000);
const REDIS_URL = String(process.env.UPSTASH_REDIS_REST_URL || process.env.TRADINGCORE_REDIS_REST_URL || '').trim().replace(/\/$/, '');
const REDIS_TOKEN = String(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.TRADINGCORE_REDIS_REST_TOKEN || '').trim();
const REDIS_CONFIGURED = Boolean(REDIS_URL && REDIS_TOKEN);
const TRANSACTION_LIMITS = Object.freeze({
  standard: { requestsPerSecond: 8, requestsPerMinute: 160, requestsPerDay: 80_000 },
  prime: { requestsPerSecond: 8, requestsPerMinute: 400, requestsPerDay: 400_000 },
});
const REDIS_INCREMENT_WINDOW_LUA = "local count = redis.call('incr', KEYS[1]); if count == 1 then redis.call('pexpire', KEYS[1], ARGV[1]) end; return count";
const nonces = new Map();
const orderTimestampsByAccount = new Map();
let nextOrderRateCleanupAt = 0;
const MAX_ORDERS_PER_SECOND = 10;
const configuredMaxQuantity = Number(process.env.FYERS_GATEWAY_MAX_ORDER_QUANTITY ?? 1000);
const MAX_ORDER_QUANTITY = Number.isSafeInteger(configuredMaxQuantity) && configuredMaxQuantity > 0
  ? Math.min(1_000_000, configuredMaxQuantity)
  : 1000;
const configuredContextTtl = Number(process.env.FYERS_GATEWAY_CONTEXT_TTL_MS ?? 30_000);
const MAX_CONTEXT_TTL_MS = Number.isFinite(configuredContextTtl)
  ? Math.max(5_000, Math.min(60_000, configuredContextTtl))
  : 30_000;

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
  return false;
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
  const accountKey = String(context.accountKey || '').trim();
  const rateLimitIdentity = String(context.rateLimitIdentity || '').trim();
  const quotaPlan = String(context.quotaPlan || '').trim();
  if (context.version !== 1 || context.riskApproved !== true) throw new Error('Execution context has no approved risk decision');
  if (!strategyId || strategyId.length > 128 || !decisionId || decisionId.length > 128
      || !/^[a-f0-9]{64}$/.test(accountKey)
      || !rateLimitIdentity || rateLimitIdentity.length > 256
      || !Object.hasOwn(TRANSACTION_LIMITS, quotaPlan)) {
    throw new Error('Execution context strategy, account, quota plan, or risk decision identity is invalid');
  }
  const expectedAccountKey = crypto.createHash('sha256').update(rateLimitIdentity).digest('hex');
  if (!timingSafeEqualHex(accountKey, expectedAccountKey)) throw new Error('Execution context user identity does not match its account key');
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now + 2_000 || issuedAt < now - MAX_CONTEXT_TTL_MS || expiresAt <= now || expiresAt - issuedAt > MAX_CONTEXT_TTL_MS) {
    throw new Error('Execution context is expired or outside its permitted time window');
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_QUANTITY || !Number.isSafeInteger(maxQuantity) || maxQuantity < 1 || quantity > maxQuantity || maxQuantity > MAX_ORDER_QUANTITY) {
    throw new Error('Order quantity exceeds the validated risk limits');
  }
  if (order?.offlineOrder === true) throw new Error('After-market orders are disabled for compliant FYERS API execution');
  const expectedHash = crypto.createHash('sha256').update(JSON.stringify(order)).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(orderHash) || !timingSafeEqualHex(orderHash, expectedHash)) {
    throw new Error('Execution context does not match the submitted order');
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
}

function indiaDayKey(timestamp = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(timestamp));
}

async function redisCommand(command, timeoutMs = 900) {
  if (!REDIS_CONFIGURED) throw Object.assign(new Error('Shared Redis quota coordination is not configured'), { statusCode: 503 });
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) throw Object.assign(new Error('Shared Redis quota coordination is unavailable'), { statusCode: 503 });
  return payload?.result;
}

/** Share exact FYERS transaction counter keys with the API service's BrokerRequestGate. */
async function admitFyersTransaction(context) {
  if (!REDIS_CONFIGURED) throw Object.assign(new Error('Shared Redis is required before FYERS orders can be submitted'), { statusCode: 503 });
  const identity = String(context.rateLimitIdentity || '').trim();
  const plan = String(context.quotaPlan || 'standard');
  const limits = TRANSACTION_LIMITS[plan];
  if (!identity || !limits) throw Object.assign(new Error('Authenticated quota identity and plan are required'), { statusCode: 503 });
  const identityHash = crypto.createHash('sha256').update(identity).digest('hex');
  const budgetName = 'fyers:transactions';
  const lockKey = `tco:broker:admit:${budgetName}:${identityHash}`;
  const lastKey = `tco:broker:last:${budgetName}:${identityHash}`;
  const lockOwner = crypto.randomUUID();
  const lockDeadline = Date.now() + 2_500;
  let locked = false;
  while (!locked && Date.now() < lockDeadline) {
    locked = (await redisCommand(['SET', lockKey, lockOwner, 'NX', 'PX', 2_000])) === 'OK';
    if (!locked) await wait(25);
  }
  if (!locked) throw Object.assign(new Error('Unable to acquire shared FYERS transaction quota lock'), { statusCode: 503 });

  try {
    const last = Number(await redisCommand(['GET', lastKey]) || 0);
    const spacingMs = Math.max(0, Math.ceil(1000 / limits.requestsPerSecond) - (Date.now() - last));
    if (spacingMs > 0) await wait(spacingMs);

    // Recompute fixed windows after spacing, then check and consume them under the lock.
    const now = Date.now();
    const minute = Math.floor(now / 60_000);
    const day = indiaDayKey(now);
    const minuteKey = `tco:broker:minute:${budgetName}:${identityHash}:${minute}`;
    const dayKey = `tco:broker:day:${budgetName}:${identityHash}:${day}`;
    const [minuteUsedRaw, dayUsedRaw] = await Promise.all([
      redisCommand(['GET', minuteKey]),
      redisCommand(['GET', dayKey]),
    ]);
    if (Number(minuteUsedRaw || 0) >= limits.requestsPerMinute || Number(dayUsedRaw || 0) >= limits.requestsPerDay) {
      throw Object.assign(new Error('FYERS transaction quota is exhausted for this account'), { statusCode: 429 });
    }
    await redisCommand(['EVAL', REDIS_INCREMENT_WINDOW_LUA, '1', minuteKey, '61000']);
    await redisCommand(['EVAL', REDIS_INCREMENT_WINDOW_LUA, '1', dayKey, String(48 * 60 * 60 * 1000)]);
    await redisCommand(['SET', lastKey, String(Date.now()), 'PX', '61000']);
  } finally {
    // Compare-and-delete so an expired/reacquired lock can never be released by its previous owner.
    await redisCommand(['EVAL', "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", '1', lockKey, lockOwner]).catch(() => undefined);
  }
}

function enforceAccountOrderRate(accountKey) {
  const now = Date.now();
  if (now >= nextOrderRateCleanupAt) {
    nextOrderRateCleanupAt = now + 1000;
    for (const [key, timestamps] of orderTimestampsByAccount) {
      const active = timestamps.filter((timestamp) => now - timestamp < 1000);
      if (active.length) orderTimestampsByAccount.set(key, active);
      else orderTimestampsByAccount.delete(key);
    }
  }
  const recent = (orderTimestampsByAccount.get(accountKey) || []).filter((timestamp) => now - timestamp < 1000);
  if (recent.length >= MAX_ORDERS_PER_SECOND) throw Object.assign(new Error('FYERS compliance rate limit exceeded: maximum 10 order requests per second per account'), { statusCode: 429 });
  recent.push(now);
  orderTimestampsByAccount.set(accountKey, recent);
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
    // Retail algo compliance does not permit AMO submissions through this gateway.
    offlineOrder: false,
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
  if (req.method === 'GET' && req.url === '/health') {
    let redisHealthy = false;
    try { redisHealthy = REDIS_CONFIGURED && await redisCommand(['PING']) === 'PONG'; } catch { redisHealthy = false; }
    return json(res, redisHealthy ? 200 : 503, { ok: redisHealthy, service: 'fyers-execution-gateway', sharedQuotaCoordination: redisHealthy });
  }
  if (req.method !== 'POST' || req.url !== '/v1/fyers/order') return json(res, 404, { success: false, error: 'Not found' });

  try {
    const rawBody = await readBody(req);
    if (!authorize(req, rawBody)) return json(res, 401, { success: false, error: 'Unauthorized' });
    const body = JSON.parse(rawBody || '{}');
    const accessToken = String(body.accessToken || '');
    if (!accessToken) return json(res, 400, { success: false, error: 'FYERS access token is required' });
    validateExecutionContext(body.order, body.executionContext);
    // Every real order attempt shares FYERS's account/category counters with the
    // REST API service. No per-instance fallback is allowed when Redis is absent.
    await admitFyersTransaction(body.executionContext);
    enforceAccountOrderRate(String(body.executionContext.accountKey));
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
    const status = error?.name === 'AbortError' ? 504 : Number(error?.statusCode) === 429 ? 429 : 400;
    return json(res, status, { success: false, error: error?.name === 'AbortError' ? 'FYERS upstream request timed out' : error?.message || 'Invalid request' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`FYERS execution gateway listening on ${PORT}`));
