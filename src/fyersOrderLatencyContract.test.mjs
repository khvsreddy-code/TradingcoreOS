import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const route = read('src/server/routes/trading.routes.ts');

assert(route.includes("cache: 'no-store'"));
assert(route.includes("void AuditLogRepository.append({ userId, actorType: 'user', eventType: 'order.completed'"));
assert(route.includes("await OrderIdempotencyRepository.complete("));
assert(route.includes("FYERS_EXECUTION_GATEWAY_URL"));
assert(route.includes("Idempotency-Key"));

console.log('TRADINGCORE_V132_FYERS_ORDER_LATENCY_CONTRACT_OK');
