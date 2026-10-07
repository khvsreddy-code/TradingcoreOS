import assert from 'node:assert/strict';
import { compileCoreSpirit, inspectCoreSpiritSemantics } from '../src/services/coreSpirit/coreSpiritPipeline.ts';
import { canAuthorizeCoreSpiritOrderExecution } from '../src/services/coreSpirit/executionEnvironment.ts';

const inspection = inspectCoreSpiritSemantics(`
let returns = log(close / close[1])
let fast = ema(close, 20)
`);

const returnsMeta = inspection.semanticEnvironment.returns;
assert.ok(returnsMeta, 'returns semantic metadata must be inspectable');
assert.equal(returnsMeta.phase, 'developing');
assert.equal(returnsMeta.causal, true);
assert.equal(returnsMeta.lookahead, false);
assert.equal(returnsMeta.lookback, 1);
assert.equal(returnsMeta.symbol, 'current');
assert.equal(returnsMeta.timeframe, 'chart');

const typedTradingObjects = compileCoreSpirit(`
let x: series<float> = close
let book: orderbook<float> = market("NSE:NIFTY50").orderbook
let signalIntent: signalIntent = signal("BUY")
`, 'safe-complexity-types');
assert.ok(!typedTradingObjects.diagnostics.some(d => d.severity === 'error'), typedTradingObjects.diagnostics.map(d => d.message).join('; '));
assert.equal(typedTradingObjects.ir?.semanticEnvironment?.signalIntent?.valueKind, 'signalIntent');

const invalidArithmetic = compileCoreSpirit(`
let x: series<float> = close
let book: orderbook<float> = market("NSE:NIFTY50").orderbook
let bad = x + book
`, 'safe-complexity-invalid');
assert.ok(invalidArithmetic.diagnostics.some(d => d.code === 'TYPE_ARITHMETIC' || d.code === 'TYPE_SEMANTIC_ARITHMETIC'));

const forbiddenLiveOrder = compileCoreSpirit(`
place_order("BUY", 1)
`, 'safe-complexity-live-order');
assert.ok(forbiddenLiveOrder.diagnostics.some(d => d.code === 'CAPABILITY_LIVE_ORDER_HOST_ONLY'));

assert.equal(canAuthorizeCoreSpiritOrderExecution({
  environment:'live',
  requestedCapability:'real-orders',
  hostApproved:true,
  riskApproved:true,
  policyApproved:true,
}), true);
assert.equal(canAuthorizeCoreSpiritOrderExecution({
  environment:'live',
  requestedCapability:'real-orders',
  hostApproved:true,
  riskApproved:false,
  policyApproved:true,
}), false);
assert.equal(canAuthorizeCoreSpiritOrderExecution({
  environment:'paper',
  requestedCapability:'real-orders',
  hostApproved:true,
  riskApproved:true,
  policyApproved:true,
}), false);

console.log('CORESPIRIT_SAFE_COMPLEXITY_AND_TYPES_CONTRACT_OK');
