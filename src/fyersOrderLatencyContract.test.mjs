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
const idempotencyCompletion = route.indexOf("await OrderIdempotencyRepository.complete(");
const completedAudit = route.indexOf("eventType: 'order.completed'");
assert(idempotencyCompletion >= 0, 'a successful broker response must complete the idempotency ledger');
assert(route.includes("await AuditLogRepository.appendRequired({"), 'order lifecycle audit writes must be required, not fire-and-forget');
assert(route.includes("actorType: 'user',"), 'the canonical user completion audit must be attributed to the user');
assert(route.includes("eventType: 'order.completed'"), 'the canonical user completion audit must record order.completed');
assert(completedAudit > idempotencyCompletion, 'the completion audit must follow the idempotency ledger update before success is returned');
assert(route.includes("FYERS_EXECUTION_GATEWAY_URL"));
assert(route.includes("Idempotency-Key"));

console.log('TRADINGCORE_V132_FYERS_ORDER_LATENCY_CONTRACT_OK');
