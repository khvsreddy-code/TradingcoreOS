import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const integrationRoutes = read('./server/routes/automation-integration.routes.ts');
const ingestRoutes = read('./server/routes/automation-signal-ingest.routes.ts');
const integrations = read('./server/automation/AutomationIntegrationRepository.ts');
const risk = read('./server/trading/AutomationPreTradeRiskEngine.ts');
const sharedExecution = read('./server/trading/fyersOrderExecution.ts');
const manualTrading = read('./server/routes/trading.routes.ts');
const stateEngine = read('./server/fyers/trading/FyersOrderStateEngine.ts');
const migration = read('../supabase/migrations/20261016130000_external_automation_gateway.sql');
const automationUi = read('./pages/AutomationsPage.tsx');
const app = read('../server.ts');
const envExample = read('../.env.example');
const docs = read('../docs/EXTERNAL_AUTOMATION_GATEWAY.md');

assert.match(integrationRoutes, /AutomationIntegrationRepository\.authenticateToken/);
assert.match(integrations, /createHash\('sha256'\)\.update\(token\)\.digest\('hex'\)/);
assert.match(integrations, /token_hash/);
assert.match(integrationRoutes, /tokenShownOnce: true/);
assert.match(integrationRoutes, /allowLiveOrders: req\.body\.allowLiveOrders === true/);
assert.match(integrationRoutes, /function publicIntegration\(/);
assert.match(integrationRoutes, /allowedScopes = new Set/);
assert.match(integrationRoutes, /requireAutomationScope\('market:read'\)/);
assert.match(integrationRoutes, /requireAutomationScope\('signals:read'\)/);
assert.match(integrationRoutes, /requireAutomationScope\('orders:request'\)/);
assert.match(integrationRoutes, /AutomationIntegrationRepository\.revoke/);
assert.match(integrationRoutes, /Active integration was not found/);
assert.match(integrationRoutes, /automation\.integration\.revoked/);

assert.match(migration, /unique \(integration_id, external_request_id\)/);
assert.match(migration, /unique \(integration_id, event_id\)/);
assert.match(migration, /for update;/i);
assert.match(migration, /claim_automation_order_request/);
assert.ok(migration.includes("p_request_hash !~ '^[a-f0-9]{64}$'"), 'the idempotency hash guard must be valid SQL and require a complete SHA-256 hex digest');
assert.match(migration, /add column if not exists lifecycle_status text not null default 'paused'/, 'credential authentication reads lifecycle_status');
assert.match(migration, /add column if not exists broker_order_id text/);
assert.match(migration, /add column if not exists attempts integer not null default 1/);
assert.match(migration, /add column if not exists expires_at timestamptz/);
assert.match(migration, /add column if not exists last_error text/);
assert.match(migration, /'unknown','expired','recovery_required'/, 'the shared idempotency ledger must accept uncertain/recovery states');
assert.equal((migration.match(/create or replace function public\.claim_automation_order_request/g) ?? []).length, 1, 'the migration must define the idempotency claim function exactly once');
assert.equal((migration.match(/grant execute on function public\.claim_automation_order_request/g) ?? []).length, 1, 'the migration must grant the claim RPC exactly once');
assert.match(migration, /payload->>'mode' = 'LIVE'/);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.automation_order_requests from anon, authenticated/i);
assert.match(migration, /grant execute on function public\.claim_automation_order_request[\s\S]*to service_role/i);

assert.match(integrations, /request_hash/);
assert.match(integrations, /result\.conflict === 'request_mismatch'/, 'the idempotency claim must distinguish a reused key with a different payload');
assert.match(integrations, /static async getBrokerOrderState/);
assert.match(integrations, /static async getBrokerOrderStateByClientOrderId/, 'uncertain submissions must be recoverable from the pre-submission client order ID');
assert.match(integrations, /eq\('client_order_id', clientOrderId\)/);
assert.match(integrationRoutes, /getBrokerOrderStateByClientOrderId\(record\.userId, record\.clientOrderId\)/, 'order status must look up by client ID when the broker order ID was not returned');
assert.match(integrationRoutes, /reconciliationPending/);
assert.match(integrationRoutes, /Idempotency-Key header must be 8–128 safe characters/);
assert.match(integrationRoutes, /EXTERNAL_ORDER_FIELDS = new Set/);
assert.match(integrationRoutes, /Object\.keys\(rawOrder\)\.some\(field => !EXTERNAL_ORDER_FIELDS\.has\(field\)\)/, 'external orders must reject broker-specific and user-supplied execution metadata');
assert.doesNotMatch(integrationRoutes, /orderPayload = \{\s*\.\.\.parsed/, 'external order normalization must not forward arbitrary request properties');
assert.match(integrationRoutes, /After-market orders are disabled for external automation/);
assert.match(integrationRoutes, /side !== 'BUY' && side !== 'SELL'/, 'invalid or AI-invented sides must not be coerced into SELL');
assert.match(integrationRoutes, /validity must be DAY or IOC/);
assert.match(integrationRoutes, /String\(req\.body\.mode \?\? 'PAPER'\)/, 'order requests must default to paper, even when the credential is live-capable');
assert.match(integrationRoutes, /Re-read authorization/);
assert.match(integrationRoutes, /The automation credential was revoked or expired before order submission/);
assert.match(integrationRoutes, /The integration risk policy changed during evaluation/);
assert.match(integrationRoutes, /The automation lifecycle or confirmation policy changed before order submission/);
assert.ok(integrationRoutes.indexOf('Re-read authorization') < integrationRoutes.indexOf('placeFyersOrderViaFixedIpGateway(accessToken, submitPayload'), 'revocation, risk-policy, and lifecycle checks must be repeated before live broker submission.');
assert.ok(integrationRoutes.indexOf('AutomationIntegrationRepository.claimOrderRequest') <
  integrationRoutes.indexOf('placeFyersOrderViaFixedIpGateway(accessToken, submitPayload'),
  'The durable external request claim must precede broker order placement.');
assert.ok(integrationRoutes.indexOf("state: 'INTENT'") <
  integrationRoutes.indexOf("placeFyersOrderViaFixedIpGateway(accessToken, submitPayload"),
  'INTENT must be persisted before the broker side effect.');
assert.ok(integrationRoutes.indexOf("state: 'SUBMITTED'") <
  integrationRoutes.indexOf("placeFyersOrderViaFixedIpGateway(accessToken, submitPayload"),
  'SUBMITTED must be persisted before the broker side effect.');
assert.match(integrationRoutes, /recoveryRequired: true/);
assert.match(integrationRoutes, /orderSubmitted: 'unknown'/);
assert.match(integrationRoutes, /filled: false/);
assert.match(integrationRoutes, /state: 'ACKNOWLEDGED'/);
assert.match(integrationRoutes, /Broker acknowledged the order request[\s\S]*not a fill confirmation/);
assert.match(integrationRoutes, /brokerStateUpdatedAt/);
assert.match(integrationRoutes, /internalIdempotencyKey/);

assert.match(risk, /input\.integration\.allowedSymbols\.includes/);
assert.match(risk, /maxOrderQuantity/);
assert.match(risk, /maxOrderNotional/);
assert.match(risk, /maxPositionNotional/);
assert.match(risk, /maxAccountExposureNotional/);
assert.match(risk, /projected-account-exposure-cap/);
assert.match(risk, /getMarketQuotes/);
assert.match(risk, /getFunds/);
assert.match(risk, /getPositions/);
assert.match(risk, /20_000/);
assert.match(risk, /multiorder\/margin/);
assert.match(risk, /marginBufferPercent/);
assert.match(risk, /No order was submitted/);
assert.match(sharedExecution, /validateFyersManualOrderPreflight/);
assert.match(sharedExecution, /FYERS_EXECUTION_GATEWAY_SECRET/);
assert.match(manualTrading, /from '\.\.\/trading\/fyersOrderExecution\.js'/);

assert.match(integrationRoutes, /automation\.lifecycleStatus === 'live' \|\| automation\.lifecycleState === 'LIVE'/);
assert.match(integrationRoutes, /automation\.allowOrderExecution/);
assert.match(integrationRoutes, /!automation\.requireConfirmation/);
assert.match(integrationRoutes, /signal\.mode !== 'realtime'/);
assert.match(integrationRoutes, /if \(signalId\) \{[\s\S]*getSignal\(integration\.id, signalId\)/, 'when present, a signal link must be validated within its integration');
assert.match(integrationRoutes, /This integration is paper-only/);
assert.match(integrationRoutes, /FYERS_EXECUTION_GATEWAY_URL/);

assert.match(integrationRoutes, /browser-supplied realtime events cannot authorize orders/);
assert.match(ingestRoutes, /createHmac\('sha256', secret\)/);
assert.match(ingestRoutes, /timingSafeEqual/);
assert.match(ingestRoutes, /TCO_CORESPIRIT_SIGNAL_SECRET/);
assert.match(ingestRoutes, /Math\.abs\(Date\.now\(\) - timestamp\) > 60_000/);
assert.match(ingestRoutes, /trustedProducer: true/);
assert.match(integrations, /input\.trustedProducer !== true/);
assert.match(integrations, /Canonical event identity always wins/);
assert.match(app, /app\.use\('\/api\/automation-integrations', automationIntegrationRoutes\)/);
assert.match(app, /app\.use\('\/api\/automation-gateway', automationSignalIngestRoutes\)/);
assert.match(app, /app\.use\('\/api\/automation-gateway', automationGatewayRoutes\)/);

assert.match(stateEngine, /'INTENT' \| 'SUBMITTED' \| 'ACKNOWLEDGED' \| 'OPEN' \| 'PARTIAL' \| 'FILLED'/);
assert.match(stateEngine, /'CANCEL_PENDING' \| 'CANCELLED' \| 'REJECTED' \| 'EXPIRED' \| 'UNKNOWN'/);
assert.match(stateEngine, /apply_broker_order_event/);
assert.match(automationUi, /External AI & automation gateway/);
assert.match(automationUi, /allowLiveIntegration,setAllowLiveIntegration\]=useState\(false\)/);
assert.match(automationUi, /Require order confirmation/);
assert.match(automationUi, /Create scoped credential/);
assert.match(automationUi, /Revoke credential/);
assert.match(automationUi, /tokenShownOnce/);
assert.match(automationUi, /lifecycle_status:cloudLifecycleStatus/);
assert.match(envExample, /TCO_CORESPIRIT_SIGNAL_SECRET/);
assert.match(docs, /A success response with `state: "ACKNOWLEDGED"` means the broker accepted the request, \*\*not\*\* that it filled/);
assert.match(docs, /Persistent order state machine/);
assert.match(docs, /UNKNOWN.*RECOVERY_REQUIRED/s);
assert.match(docs, /strict allowlist/);
assert.match(docs, /same key and same body/);

console.log('EXTERNAL_AUTOMATION_TRADING_BOUNDARY_OK');
