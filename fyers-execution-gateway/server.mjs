import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.FYERS_GATEWAY_SECRET;
const FYERS_ORDER_URL = 'https://api-t1.fyers.in/api/v3/orders/sync';

if (!SECRET) throw new Error('FYERS_GATEWAY_SECRET is required');

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
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
    if (raw.length > 64 * 1024) throw new Error('Request body too large');
  }
  return JSON.parse(raw || '{}');
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, service: 'fyers-execution-gateway' });
  if (req.method !== 'POST' || req.url !== '/v1/fyers/order') return json(res, 404, { success: false, error: 'Not found' });
  if (req.headers['x-tradingcore-gateway-secret'] !== SECRET) return json(res, 401, { success: false, error: 'Unauthorized' });

  try {
    const body = await readBody(req);
    const accessToken = String(body.accessToken || '');
    if (!accessToken) return json(res, 400, { success: false, error: 'FYERS access token is required' });
    const fyersPayload = buildFyersPayload(body.order);
    const upstream = await fetch(FYERS_ORDER_URL, {
      method: 'POST',
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
  } catch (error) {
    return json(res, 400, { success: false, error: error?.message || 'Invalid request' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`FYERS execution gateway listening on ${PORT}`));
