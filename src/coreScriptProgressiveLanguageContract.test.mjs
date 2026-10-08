import assert from 'node:assert/strict';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { normalizeCoreSpiritSource } from './services/coreSpirit/syntax.ts';
import { getCoreSpiritAuthoringProfile, detectCoreSpiritAuthoringLevel } from './services/coreSpirit/coreSpiritAuthoring.ts';
import { CORE_SCRIPT_LANGUAGE, CORE_SCRIPT_LANGUAGE_VERSION } from './services/coreSpirit/coreScriptLanguagePolicy.ts';

const beginner = `
indicator "EMA Cross"

fast = ema(close, 20)
slow = ema(close, 50)

plot fast
plot slow

when fast crossesAbove slow:
    signal "LONG"
`;

const trader = `
indicator "Risk Cross"

input fast: int = 20 min = 2 max = 200
input slow: int = 50 min = 5 max = 400
input risk: float = 1.0 min = 0.1 max = 5.0

fast = ema(close, fast)
slow = ema(close, slow)
atr14 = atr(14)
trend = close > ema(close, 200)

when fast crossesAbove slow and trend:
    stop = close - 2 * atr14
    target = close + 3 * atr14
    order("long", risk / (2 * atr14), stop, target)
`;

const quant = `
indicator "Quant Regime"

returns = roc(close, 1)
z = zscore(returns, 50)
betaFactor = beta(returns, returns, 50)

features: matrix(returns, z, betaFactor)

model "regime"
    input returns: feature<number>
    input z: feature<number>
    input betaFactor: feature<number>

prediction: prediction<number> = regime.predict()
confidence: probability = regime.probability()

plot prediction
`;

const system = `
requires market.tick, order.fill, position.update, risk.evaluate, execution.route, webhooks, automation

on market.tick:
    signal "TICK"

on order.fill:
    automation.notify("Filled")

on position.update:
    automation.notify("Position changed")

when risk.allowed():
    route order through broker("fyers")
    webhook("ops")
`;

function compile(source, id, layer = 'script') {
  const result = compileCoreSpirit(source, id, { layer });
  assert.deepEqual(result.diagnostics.filter(d => d.severity === 'error'), [], result.diagnostics.map(d => d.message).join('\\n'));
  assert.ok(result.ir);
  return result.ir;
}

assert.equal(CORE_SCRIPT_LANGUAGE, 'CoreScript');
assert.equal(CORE_SCRIPT_LANGUAGE_VERSION, 1);

const beginnerIr = compile(beginner, 'corescript-beginner');
assert.equal(beginnerIr?.language, 'CoreScript');
assert.equal(beginnerIr?.languageVersion, 1);
assert.equal(beginnerIr?.authoringLevel, 'beginner');
assert.ok(beginnerIr?.languageFeatures?.includes('beginner'));
assert.ok(!normalizeCoreSpiritSource(beginner).includes(';;'));

const traderIr = compile(trader, 'corescript-trader', 'strategy');
assert.equal(traderIr?.authoringLevel, 'trader');
assert.ok(traderIr?.languageFeatures?.includes('order-intent'));

const quantIr = compile(quant, 'corescript-quant', 'model');
assert.equal(quantIr?.authoringLevel, 'quant');
assert.ok(quantIr?.languageFeatures?.includes('matrix'));
assert.ok(quantIr?.languageFeatures?.includes('models'));

const systemIr = compile(system, 'corescript-system', 'automation');
assert.equal(systemIr?.authoringLevel, 'system');
assert.ok(systemIr?.languageFeatures?.includes('system-events'));
assert.ok(systemIr?.languageFeatures?.includes('automation'));
assert.deepEqual(
  [...(systemIr?.requiredCapabilities ?? [])].sort(),
  ['automation', 'execution.route', 'market.tick', 'order.fill', 'position.update', 'risk.evaluate', 'webhooks'].sort(),
);

const systemWithoutCapability = compileCoreSpirit(`
on market.tick:
    signal "TICK"
`, 'corescript-system-missing-capability', { layer: 'automation' });
assert.ok(systemWithoutCapability.diagnostics.some(d => d.severity === 'error' && d.code === 'CAPABILITY_REQUIRED'));

assert.equal(detectCoreSpiritAuthoringLevel(beginner), 'beginner');
assert.equal(detectCoreSpiritAuthoringLevel(trader), 'trader');
assert.equal(detectCoreSpiritAuthoringLevel(quant), 'quant');
assert.equal(detectCoreSpiritAuthoringLevel(system), 'system');

const beginnerProfile = getCoreSpiritAuthoringProfile(beginner);
const quantProfile = getCoreSpiritAuthoringProfile(quant);
const systemProfile = getCoreSpiritAuthoringProfile(system);
assert.ok(!beginnerProfile.showIr);
assert.ok(quantProfile.showIr);
assert.ok(systemProfile.showCapabilities);

console.log('CORESCRIPT_PROGRESSIVE_UNIFIED_LANGUAGE_CONTRACT_OK');
