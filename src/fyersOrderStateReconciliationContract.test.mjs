import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canTransitionFyersOrderStatus, fyersOrderEventKey } from './server/fyers/trading/FyersOrderStateEngine.ts';

assert.equal(canTransitionFyersOrderStatus('OPEN', 'PARTIAL'), true);
assert.equal(canTransitionFyersOrderStatus('PARTIAL', 'FILLED'), true);
assert.equal(canTransitionFyersOrderStatus('OPEN', 'FILLED'), true);
assert.equal(canTransitionFyersOrderStatus('FILLED', 'OPEN'), false);
assert.equal(canTransitionFyersOrderStatus('CANCELLED', 'PARTIAL'), false);
assert.equal(canTransitionFyersOrderStatus('CANCEL_PENDING', 'FILLED'), true);
assert.equal(canTransitionFyersOrderStatus('FILLED', 'CANCELLED', 'reconciliation'), false,
  'a stale REST cancellation must never downgrade a confirmed full fill');
assert.equal(canTransitionFyersOrderStatus('CANCELLED', 'FILLED', 'websocket'), false,
  'a websocket terminal correction is not authoritative enough to resolve a cancel race');
assert.equal(canTransitionFyersOrderStatus('CANCELLED', 'FILLED', 'reconciliation'), false,
  'a terminal correction without fill evidence must be rejected');
assert.equal(canTransitionFyersOrderStatus('CANCELLED', 'FILLED', 'reconciliation', { quantity: 10, filledQuantity: 10 }), true,
  'a reconciliation can correct a cancel race only when the complete quantity is proven filled');

const event = {
  type: 'OrderUpdate', orderId: 'FY-1', brokerOrderId: 'FY-1', clientOrderId: 'TCO-1',
  status: 'PARTIAL', quantity: 10, filledQuantity: 3, averagePrice: 100,
  sequence: 10, timestamp: 1000, receivedAt: 1100, symbol: 'NSE:SBIN-EQ', source: 'fyers', revision: 10,
};
assert.equal(fyersOrderEventKey(event), fyersOrderEventKey({ ...event, sequence: 99, revision: 99, receivedAt: 9999, clientOrderId: null, message: 'duplicate delivery' }),
  'replayed order updates with the same broker state must have stable idempotency keys even if volatile metadata differs');
assert.notEqual(fyersOrderEventKey(event), fyersOrderEventKey({ ...event, filledQuantity: 4 }),
  'a genuine cumulative fill change must be treated as a new state event');
const preAck = { ...event, orderId: '', brokerOrderId: null, clientOrderId: 'TCO-INTENT-1', status: 'INTENT' };
assert.notEqual(fyersOrderEventKey(preAck), fyersOrderEventKey({ ...preAck, clientOrderId: 'TCO-INTENT-2' }),
  'pre-ack intents must remain unique before the broker assigns an order id');

const read = path => fs.readFileSync(path, 'utf8');
const engine = read('src/server/fyers/trading/FyersOrderStateEngine.ts');
const transport = read('src/server/fyers/trading/FyersOrderStreamTransport.ts');
const normalizer = read('src/server/fyers/trading/fyersOrderEventNormalizer.ts');
const route = read('src/server/routes/trading.routes.ts');
const streamRoute = read('src/server/routes/fyers-order-stream.routes.ts');
const migration = read('supabase/migrations/20261011100000_fyers_order_state_reconciliation.sql');

assert.match(transport, /FyersOrderStateEngine\.reconcile\(/,
  'every fresh/reconnected socket must reconcile before publishing deltas');
assert.match(transport, /session\.reconciliationBlocked = true/);
assert.match(transport, /session\.pendingFrames/);
assert.match(transport, /session\.reconciliationOverflowed/,
  'overflow must force a new snapshot rather than silently lose order events');
assert.match(transport, /static getStatus\(userId: string\)/,
  'late subscribers need the actual reconciliation state');
assert.match(transport, /session\.reconciling \|\| \(session\.reconciliationBlocked && session\.socket\?\.readyState === WebSocket\.OPEN\)/);
assert.match(streamRoute, /FyersOrderStreamTransport\.getStatus\(userId\)/,
  'HTTP heartbeats must not claim connected while the REST snapshot is incomplete');
assert.doesNotMatch(streamRoute, /setInterval\(\(\)=>write\(\{type:'status',status:'connected'\}\)/);
assert.match(engine, /Promise\.all\(\[/,
  'orders, trades and positions must all fetch successfully before snapshot apply');
assert.match(engine, /MAX_RECONCILIATION_SNAPSHOT_ROWS/);
assert.match(engine, /apply_broker_order_event/);
assert.match(migration, /unique \(user_id, broker_id, event_key\)/);
assert.match(migration, /for update/i, 'state transition must lock the current order row');
assert.match(migration, /greatest\(coalesce\(v_filled, 0\), coalesce\(v_state\.filled_quantity, 0\)\)/,
  'a stale REST snapshot must never reduce cumulative filled quantity');
assert.match(migration, /v_state\.status in \('FILLED','CANCELLED','REJECTED','EXPIRED'\) then v_state\.status/,
  'late fills must not reopen terminal orders unless the order is fully filled');
assert.match(engine, /Math\.max\(currentFilled, incomingFilled\)/);
assert.match(engine, /TERMINAL\.has\(current\.status as FyersOrderStateStatus\)/);
assert.match(engine, /if \(current === 'FILLED'\) return false/,
  'FILLED is immutable against stale cancellation/rejection events');
assert.match(engine, /current === 'CANCELLED' && next === 'FILLED'/,
  'only reconciliation may correct a cancellation race to a confirmed fill');
const terminalMigration = read('supabase/migrations/20261023100000_fyers_order_terminal_monotonicity.sql');
assert.match(terminalMigration, /old\.status = 'FILLED' and new\.status <> 'FILLED'/,
  'database trigger must prevent a stale write from downgrading a filled order');
assert.match(terminalMigration, /coalesce\(new\.filled_quantity, 0\) < new\.quantity/,
  'cancel-to-filled correction requires evidence of a complete fill');
const killSwitch = read('src/server/trading/TradingKillSwitchRepository.ts');
assert.match(route, /TradingKillSwitchRepository\.assertOrderSubmissionAllowed\(userId, strategyId\)/,
  'kill switches must be enforced at the server order boundary');
assert.match(killSwitch, /TRADINGCORE_ORDER_KILL_SWITCH/);
assert.match(killSwitch, /scope: 'account'/);
assert.match(killSwitch, /scope: 'strategy'/);
const riskEngine = read('src/server/trading/AutomationPreTradeRiskEngine.ts');
assert.match(route, /evaluateManualPreTradeRisk\(/,
  'manual orders must pass the same server-owned snapshot/exposure risk boundary as automation');
assert.match(riskEngine, /fresh-broker-quote/);
assert.match(riskEngine, /account-funds-snapshot/);
assert.match(riskEngine, /projected-account-exposure-cap/);
assert.match(riskEngine, /conservative-full-notional-reserve/,
  'adapters without broker-specific margin endpoints must reserve full notional plus buffer');
const idempotency = read('src/server/storage/OrderIdempotencyRepository.ts');
assert.match(idempotency, /\.in\('state', \[\.\.\.allowedCurrentStates\]\)/,
  'stale completion/rejection writes must not overwrite an already advanced idempotency state');
assert.match(route, /\{ order: orderPayload, strategyId \}/,
  'strategy identity participates in the idempotency request hash');
assert.match(normalizer, /brokerOrderId: orderId/);
assert.match(normalizer, /clientOrderId: clientOrderId \|\| null/);
assert.match(route, /digest\('hex'\)\.slice\(0, 30\)/,
  'client order IDs must be stable and fit FYERS orderTag constraints');
assert.match(route, /orderPayload = \{ \.\.\.orderPayload, orderTag: clientOrderId \}/);
assert.match(route, /recordLifecycle\(userId, clientOrderId, 'INTENT'/);
assert.match(route, /recordLifecycle\(userId, clientOrderId, 'SUBMITTED'/);
assert.match(route, /recordLifecycle\(userId, clientOrderId, 'ACKNOWLEDGED'/);
assert.match(route, /markRecoveryRequired\(userId, brokerId, idempotencyKey, recoveryResponse/);
assert.match(route, /function isDefiniteOrderRejection\(status: number\)/,
  'only a narrow set of broker/gateway validation responses may be classified as definite rejection');
assert.match(route, /return \[400, 401, 403, 404, 422\]\.includes\(status\)/);
assert.match(route, /const isClientReject = isDefiniteOrderRejection\(status\)/,
  'timeouts, rate limits, conflicts and other ambiguous responses remain unknown');
assert.match(route, /FYERS accepted the request but returned no broker order id/);
assert.match(route, /recordLifecycle\(userId, '', 'CANCEL_PENDING', \{ brokerOrderId: orderId \}\)/,
  'cancel intent must be durable before issuing the broker cancellation request');

console.log('FYERS_ORDER_RECONCILIATION_STATE_MACHINE_CONTRACT_OK');
