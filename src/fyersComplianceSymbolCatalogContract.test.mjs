import assert from 'node:assert/strict';
import fs from 'node:fs';

const provider = fs.readFileSync('src/TcoVelaDataProvider.ts', 'utf8');
const symbolRoute = fs.readFileSync('src/server/routes/fyers-symbol.routes.ts', 'utf8');
const masterService = fs.readFileSync('src/server/fyers/symbols/FyersSymbolMasterService.ts', 'utf8');
const velaProviderPort = fs.readFileSync('vendor/vela/src/core/ports/DataProvider.ts', 'utf8');
const velaRegistry = fs.readFileSync('vendor/vela/src/data/ProviderRegistry.ts', 'utf8');
const velaFeed = fs.readFileSync('vendor/vela/src/data/MultiProviderFeed.ts', 'utf8');
const velaPicker = fs.readFileSync('vendor/vela/src/widget/symbol-picker.ts', 'utf8');
const velaWorkspace = fs.readFileSync('vendor/vela/src/workspace/VelaWorkspace.ts', 'utf8');
const gateway = fs.readFileSync('fyers-execution-gateway/server.mjs', 'utf8');
const routes = fs.readFileSync('src/server/routes/trading.routes.ts', 'utf8');
const fyersOrderExecution = fs.readFileSync('src/server/trading/fyersOrderExecution.ts', 'utf8');

for (const master of ['NSE_CM','NSE_FO','NSE_CD','NSE_COM','BSE_CM','BSE_FO','MCX_COM']) {
  assert(provider.includes(master), `Vela symbol catalog must include ${master}`);
}
assert(provider.includes('async listSymbols(): Promise<SymbolDescriptor[]> {\n    return FALLBACK_SYMBOLS'), 'Vela startup must return lightweight fallback symbols without downloading masters');
assert(!provider.includes('public.fyers.in/sym_details'), 'The browser must not download full FYERS masters during chart initialization');
assert(provider.includes('tradingApi('), 'Lazy symbol search must use the authenticated TradingCore API');
assert(provider.includes('readTradingApiJson'), 'Lazy symbol search must reject non-JSON API fallback pages safely');
assert(provider.includes('async searchSymbols('), 'FYERS provider must implement on-demand symbol search');
assert(provider.includes("'symTicker'"), 'FYERS symbol master symTicker fields must be recognized');
assert(provider.includes("'exSymName', 'symDetails'"), 'FYERS symbol descriptions must use the actual master fields');
assert(provider.includes('rememberDiscoveredSymbols'), 'Runtime symbol resolution must remember lazy-discovered venues');
assert(symbolRoute.includes('query.length < 2'), 'Short queries must not trigger a master download');
assert(symbolRoute.includes('Promise.allSettled'), 'Partial master failures must not suppress healthy search results');
assert(symbolRoute.includes('catalogMaster: result.value.master'), 'Search results must preserve their source market for Vela typing');
assert(symbolRoute.includes('requested === \'ALL\''), 'All-category search must span all supported FYERS masters');
assert(masterService.includes("private static inFlight = new Map<FyersMasterName, Promise<Map<string,FyersSymbolRecord>>>()"), 'Concurrent catalog queries must share a single in-flight master download');
assert(masterService.includes('if(inFlight) return inFlight'), 'Repeated queries must reuse the pending symbol-master request');
assert(masterService.includes('signal:AbortSignal.timeout(12_000)'), 'Master downloads must have an explicit timeout');
assert(masterService.includes('ranked.sort((a,b)=>a.rank-b.rank'), 'Ticker-prefix/exact matches must be ranked before limiting result count');
assert(masterService.includes("ranked.slice(0,maximum)"), 'Ranked symbol search must enforce a bounded result count');
assert(masterService.includes('Object.entries(payloadRecord)'), 'Keyed FYERS JSON symbols must retain their ticker key');
assert(masterService.includes("keyedTicker.includes(':') ? keyedTicker"), 'Canonical ticker keys must win over numeric FYERS tokens');
assert(masterService.includes('row.exSymName'), 'Search index must query FYERS display-name fields');
assert(velaProviderPort.includes('searchSymbols?(query: string'), 'Vela DataProvider must support lazy search without eager enumeration');
assert(velaRegistry.includes('async searchSymbols(query: string'), 'Vela registry must expose lazy symbol search');
assert(velaRegistry.includes('entry.prefixIndex.set'), 'Lazily discovered symbols must become resolvable by venue prefix');
assert(velaFeed.includes('this.registry.searchSymbols'), 'Shared Vela feed must expose provider lazy-search results');
assert(velaPicker.includes('this.beginRemoteSearch()'), 'Symbol picker must request remote results as the query/category changes');
assert(velaPicker.includes('}, 220)'), 'Symbol search must debounce typing');
assert(velaPicker.includes('sequence !== this.remoteSequence'), 'Late responses must not overwrite newer query results');
assert(velaWorkspace.includes('this.feed.searchSymbols(query, limit, market)'), 'Vela workspace must wire its picker to the provider search API');
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
// The route owns ordering and invocation; the shared execution module owns
// deterministic validation and the signed gateway context ABI.
assert(routes.includes("import { parseBrokerOrderPayload, placeFyersOrderViaFixedIpGateway, validateFyersManualOrderPreflight }"), 'Order route must import the canonical preflight and fixed-IP gateway adapter');
assert(routes.includes("if (brokerId === 'fyers') validateFyersManualOrderPreflight(orderPayload)"), 'A deterministic pre-trade decision must run before any gateway context is issued');
assert(routes.includes('evaluateManualPreTradeRisk({'), 'The server-owned account/position risk decision must run before live order submission');
assert(routes.includes('placeFyersOrderViaFixedIpGateway(req.accessToken, orderPayload'), 'Approved orders must be routed through the fixed-IP gateway adapter');
assert(routes.indexOf('validateFyersManualOrderPreflight(orderPayload)') < routes.indexOf('placeFyersOrderViaFixedIpGateway(req.accessToken'), 'Preflight must precede gateway submission');
assert(fyersOrderExecution.includes('export function validateFyersManualOrderPreflight(order:'), 'Canonical execution module must implement deterministic preflight');
assert(fyersOrderExecution.includes("'manual-order-preflight-v1'"), 'The risk decision must identify its validated preflight version');
assert(fyersOrderExecution.includes("side !== 'BUY' && side !== 'SELL'"), 'Preflight must reject invalid order side values');
assert(fyersOrderExecution.includes("!['MARKET', 'LIMIT', 'SL', 'SL-M'].includes(orderType)"), 'Preflight must constrain order type to supported values');
assert(fyersOrderExecution.includes("!['CNC', 'MIS', 'NRML'].includes(product)"), 'Preflight must constrain product type');
assert(fyersOrderExecution.includes('Order quantity exceeds TradingCoreOS pre-trade limit'), 'Preflight must apply a finite configured quantity limit');
assert(fyersOrderExecution.includes('Stop orders require a positive trigger price'), 'Preflight must validate stop-order trigger prices');
assert(fyersOrderExecution.includes('const decision = validateFyersManualOrderPreflight(order)'), 'Gateway context issuance must repeat preflight and fail closed');
assert(fyersOrderExecution.includes('riskApproved: decision.approved'), 'The approval must derive from the preflight result, not an unconditional boolean');
assert(fyersOrderExecution.includes('checks: decision.checks'), 'The context decision must name the checks that passed');
assert(fyersOrderExecution.includes("const orderHash = createHash('sha256').update(JSON.stringify(order)).digest('hex')"), 'Trusted server must bind context to exact order');
assert(fyersOrderExecution.includes('FYERS_GATEWAY_MAX_ORDER_QUANTITY'), 'Trusted server must apply the configured order cap');
assert(fyersOrderExecution.includes('FYERS_GATEWAY_CONTEXT_TTL_MS'), 'Trusted server context expiry must match gateway configuration');
assert(routes.includes('FYERS live orders are disabled until the fixed-IP execution gateway'), 'FYERS must fail closed when its fixed-IP gateway is missing');
assert(!routes.includes("brokerId === 'fyers' && process.env.FYERS_EXECUTION_GATEWAY_URL\\n        ?"), 'FYERS order routing must not allow a direct-broker fallback');

console.log('FYERS_COMPLIANCE_GATEWAY_AND_VELA_SYMBOL_CATALOG_CONTRACT_OK');
