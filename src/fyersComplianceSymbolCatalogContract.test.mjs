import assert from 'node:assert/strict';
import fs from 'node:fs';

const provider = fs.readFileSync('src/TcoVelaDataProvider.ts', 'utf8');
const gateway = fs.readFileSync('fyers-execution-gateway/server.mjs', 'utf8');
const routes = fs.readFileSync('src/server/routes/trading.routes.ts', 'utf8');

for (const master of ['NSE_CM','NSE_FO','NSE_CD','NSE_COM','BSE_CM','BSE_FO','MCX_COM']) {
  assert(provider.includes(master), `Vela symbol catalog must include ${master}`);
}
assert(provider.includes('Promise.allSettled'), 'A failed exchange master must not suppress healthy catalogs');
assert(provider.includes('SYMBOL_CATALOG_TTL_MS'), 'Catalog must be cached');
assert(provider.includes('AbortSignal.timeout(12_000)'), 'Symbol-master fetches must be bounded');
assert(provider.includes('symbolCatalogLoad'), 'Concurrent list calls must share one catalog load');
assert(provider.includes('descriptorFromMaster'), 'Catalog rows must be normalized into Vela descriptors');
assert(provider.includes("'symTicker'"), 'FYERS symbol master symTicker fields must be recognized');
assert(provider.includes("'exSymName', 'symDetails'"), 'FYERS symbol descriptions must use the actual master fields');
assert(provider.includes('Object.entries(root)'), 'JSON master keys must be preserved as ticker fallbacks');
assert(provider.includes('discovered?.prefix'), 'Bare symbol resolution must preserve the discovered venue');

assert(gateway.includes('validateExecutionContext(body.order, body.executionContext)'), 'Gateway must validate context before upstream order placement');
assert(gateway.includes('context.riskApproved !== true'), 'Gateway must reject unapproved risk context');
assert(gateway.includes('context.expiresAt'), 'Gateway must reject expired contexts');
assert(gateway.includes('quantity > maxQuantity'), 'Gateway must enforce context quantity cap');
assert(gateway.includes('does not match the submitted order'), 'Gateway must bind risk context to exact order');
assert(gateway.includes('MAX_ORDERS_PER_SECOND = 10'), 'Gateway must enforce FYERS order-rate ceiling');
assert(gateway.includes('enforceAccountOrderRate'), 'Order-rate ceiling must be account-scoped');
assert(gateway.includes('offlineOrder: false'), 'Gateway must disallow after-market order payloads');
assert(gateway.includes('accountKey'), 'Execution context must be bound to an account identity');
assert(gateway.includes('nextOrderRateCleanupAt'), 'Inactive account rate windows must be cleaned up');
assert(routes.includes('riskApproved: true'), 'Trusted server must attach an explicit risk decision');
assert(routes.includes('orderHash: createHash'), 'Trusted server must bind context to exact order');
assert(routes.includes('FYERS_GATEWAY_MAX_ORDER_QUANTITY'), 'Trusted server must apply the configured order cap');
assert(routes.includes('FYERS live orders are disabled until the fixed-IP execution gateway'), 'FYERS must fail closed when its fixed-IP gateway is missing');
assert(routes.includes('FYERS_GATEWAY_CONTEXT_TTL_MS'), 'Trusted server context expiry must match gateway configuration');
assert(!routes.includes("brokerId === 'fyers' && process.env.FYERS_EXECUTION_GATEWAY_URL\n        ?"), 'FYERS order routing must not allow a direct-broker fallback');

console.log('FYERS_COMPLIANCE_GATEWAY_AND_VELA_SYMBOL_CATALOG_CONTRACT_OK');
