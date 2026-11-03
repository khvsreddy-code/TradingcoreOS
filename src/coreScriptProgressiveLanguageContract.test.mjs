import assert from 'node:assert/strict';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { normalizeCoreSpiritSource } from './services/coreSpirit/syntax.ts';
import { getCoreSpiritAuthoringProfile, detectCoreSpiritAuthoringLevel, buildCoreSpiritAuthoringExperience, getCoreSpiritDebugProfile } from './services/coreSpirit/coreSpiritAuthoring.ts';
import { CORE_SCRIPT_LANGUAGE, CORE_SCRIPT_LANGUAGE_VERSION } from './services/coreSpirit/coreScriptLanguagePolicy.ts';
import { canUseCapability } from './services/coreSpirit/layeredPlatformContract.ts';
import { createCoreSpiritSandbox } from './services/coreSpirit/capabilitySandbox.ts';
import { buildCoreSpiritResearchPlan } from './services/coreSpirit/researchSurface.ts';

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

input fastLength: int = 20 min = 2 max = 200
input slowLength: int = 50 min = 5 max = 400
input risk: float = 1.0 min = 0.1 max = 5.0

fastLine = ema(close, fastLength)
slowLine = ema(close, slowLength)
atr14 = atr(14)
trend = close > ema(close, 200)
stopPrice = close - 2 * atr14
targetPrice = close + 3 * atr14

when fastLine crossesAbove slowLine and trend:
    order("long", risk / (2 * atr14), stopPrice, targetPrice)
`;

const quant = `
type QuantFeatureVector {
    values: matrix<float>
}

type QuantTensor {
    values: tensor<float>
}

returnSeries = roc(close, 1)
zScoreSeries = zscore(returnSeries, 50)
betaSeries = beta(returnSeries, returnSeries, 50)

model RegimeModel:
    features: returnSeries, zScoreSeries, betaSeries
    target: forward_return(10)
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
  assert.deepEqual(result.diagnostics.filter(d => d.severity === 'error'), [], result.diagnostics.map(d => d.message).join('\\n') + '\\nNormalized source:\\n' + normalizeCoreSpiritSource(source));
  assert.ok(result.ir);
  return result.ir;
}

assert.equal(CORE_SCRIPT_LANGUAGE, 'CoreScript');
assert.equal(CORE_SCRIPT_LANGUAGE_VERSION, 1);

const beginnerIr = compile(beginner, 'corescript-beginner');
assert.equal(beginnerIr?.language, 'CoreScript');
assert.equal(beginnerIr?.languageVersion, 1);
assert.equal(beginnerIr?.languagePolicy?.language, 'CoreScript');
assert.equal(beginnerIr?.languagePolicy?.version, 1);
assert.equal(beginnerIr?.authoringLevel, 'beginner');
assert.ok(beginnerIr?.languageFeatures?.includes('beginner'));
assert.ok(!normalizeCoreSpiritSource(beginner).includes(';;'));

const traderIr = compile(trader, 'corescript-trader', 'strategy');
assert.equal(traderIr?.authoringLevel, 'trader');
assert.ok(traderIr?.languageFeatures?.includes('order-intent'));
assert.ok(canUseCapability('strategy', 'order-intents'), 'strategy authoring must be able to emit broker-neutral order intents');
const strategyBacktestSandbox = createCoreSpiritSandbox({ layer: 'strategy', target: 'backtest' });
const strategyChartSandbox = createCoreSpiritSandbox({ layer: 'strategy', target: 'chart' });
assert.ok(strategyBacktestSandbox.can('order-intents'), 'strategy intents are available to the backtest target');
assert.ok(!strategyChartSandbox.can('order-intents'), 'chart execution must not gain an order-intent side-effect capability');

const quantIr = compile(quant, 'corescript-quant', 'model');
const quantPlan = buildCoreSpiritResearchPlan(quant);
assert.equal(quantPlan.modelSpecs[0]?.name, 'RegimeModel');
assert.deepEqual(quantPlan.modelSpecs[0]?.features, ['returnSeries', 'zScoreSeries', 'betaSeries']);
assert.equal(quantPlan.modelSpecs[0]?.target, 'forward_return(10)');
assert.equal(quantIr?.authoringLevel, 'quant');
assert.ok(quantIr?.languageFeatures?.includes('matrix'));
assert.ok(quantIr?.languageFeatures?.includes('models'));

const systemIr = compile(system, 'corescript-system', 'automation');
assert.equal(systemIr?.authoringLevel, 'system');
assert.ok(systemIr?.languageFeatures?.includes('system-events'));
assert.ok(systemIr?.languageFeatures?.includes('automation'));
assert.ok(systemIr?.capabilityRequirements?.some(item => item.capability === 'market.tick'));
assert.equal(systemIr?.languagePolicy?.level, 'system');
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


const inferredCases = [
  ['beginner', beginner, beginnerIr],
  ['trader', trader, traderIr],
  ['quant', quant, quantIr],
  ['system', system, systemIr],
];
for (const [expectedLevel, source, compiledIr] of inferredCases) {
  const editorAnalysis = buildCoreSpiritAuthoringExperience(source, 'beginner');
  assert.equal(editorAnalysis.requiredLevel, expectedLevel,
    'editor/source inference should agree for the ' + expectedLevel + ' example');
  assert.equal(compiledIr?.authoringLevel, editorAnalysis.requiredLevel,
    'compiler metadata and editor inference must share one source-required level');
  assert.equal(compiledIr?.languagePolicy?.level, editorAnalysis.requiredLevel,
    'CoreScript language policy must expose the same source-required level');
}

console.log('CORESCRIPT_PROGRESSIVE_UNIFIED_LANGUAGE_CONTRACT_OK');


// The editor may change its affordances, but source inference and language identity
// remain stable across all four views. A low-level selection never grants authority.
const systemInBeginnerView = buildCoreSpiritAuthoringExperience(system, 'beginner');
assert.equal(systemInBeginnerView.language, 'CoreScript');
assert.equal(systemInBeginnerView.languageVersion, CORE_SCRIPT_LANGUAGE_VERSION);
assert.equal(systemInBeginnerView.selectedLevel, 'beginner');
assert.equal(systemInBeginnerView.requiredLevel, 'system');
assert.equal(systemInBeginnerView.selectedViewMeetsSourceRequirements, false);
assert.equal(systemInBeginnerView.recommendedDebugView, 'execution-trace');
assert.ok(systemInBeginnerView.notice.includes('requires the system authoring surface'));
assert.deepEqual(systemInBeginnerView.progression, ['trader', 'quant', 'system']);
assert.ok(systemInBeginnerView.requiredProfile.showCapabilities);
assert.ok(!systemInBeginnerView.selectedProfile.showCapabilities);

const sameSystemSourceInSystemView = buildCoreSpiritAuthoringExperience(system, 'system');
assert.equal(sameSystemSourceInSystemView.requiredLevel, systemInBeginnerView.requiredLevel);
assert.equal(sameSystemSourceInSystemView.language, systemInBeginnerView.language);
assert.equal(sameSystemSourceInSystemView.selectedViewMeetsSourceRequirements, true);
assert.deepEqual(sameSystemSourceInSystemView.diagnostics, systemInBeginnerView.diagnostics);

const traderInBeginnerView = buildCoreSpiritAuthoringExperience(trader, 'beginner');
assert.equal(traderInBeginnerView.requiredLevel, 'trader');
assert.equal(traderInBeginnerView.recommendedDebugView, 'signal-context');
assert.ok(getCoreSpiritDebugProfile('signal-context').panels.includes('bar-context'));

const quantInTraderView = buildCoreSpiritAuthoringExperience(quant, 'trader');
assert.equal(quantInTraderView.requiredLevel, 'quant');
assert.equal(quantInTraderView.recommendedDebugView, 'feature-inspection');
assert.ok(getCoreSpiritDebugProfile('feature-inspection').panels.includes('lookback'));
assert.ok(getCoreSpiritDebugProfile('feature-inspection').panels.includes('leakage'));
assert.ok(getCoreSpiritDebugProfile('execution-trace').panels.includes('capabilities'));

const invalidExperience = buildCoreSpiritAuthoringExperience('on market.tick: ???', 'beginner');
assert.equal(invalidExperience.sourceAnalysisValid, false);
assert.ok(invalidExperience.diagnostics.length > 0);
console.log('CORESCRIPT_PROGRESSIVE_AUTHORING_EXPERIENCE_OK');
