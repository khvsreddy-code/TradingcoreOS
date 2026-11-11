import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const route = read('src/server/routes/trading.routes.ts');
const server = read('server.ts');

const apiNoStorePolicy = "if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')";
const tradingRoutesMount = "app.use('/api/trading', tradingRoutes)";
assert(server.includes(apiNoStorePolicy), 'all API responses, including order placement outcomes, must be non-cacheable');
assert(server.indexOf(apiNoStorePolicy) < server.indexOf(tradingRoutesMount),
  'the API no-store policy must be registered before the trading router');
assert(route.includes("void AuditLogRepository.append({ userId, actorType: 'user', eventType: 'order.completed'"));
assert(route.includes("await OrderIdempotencyRepository.complete("));
assert(route.includes("FYERS_EXECUTION_GATEWAY_URL"));
assert(route.includes("Idempotency-Key"));

console.log('TRADINGCORE_V132_FYERS_ORDER_LATENCY_CONTRACT_OK');
