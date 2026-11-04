import assert from 'node:assert/strict';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { normalizeCoreSpiritSource } from './services/coreSpirit/syntax.ts';
import { getCoreSpiritAuthoringProfile, detectCoreSpiritAuthoringLevel, buildCoreSpiritAuthoringExperience, getCoreSpiritDebugProfile } from './services/coreSpirit/coreSpiritAuthoring.ts';
import { CORE_SCRIPT_LANGUAGE, CORE_SCRIPT_LANGUAGE_VERSION } from './services/coreSpirit/coreScriptLanguagePolicy.ts';
import { canUseCapability } from './services/coreSpirit/layeredPlatformContract.ts';
import { createCoreSpiritSandbox } from './services/coreSpirit/capabilitySandbox.ts';
import { buildCoreSpiritResearchPlan } from './services/coreSpirit/researchSurface.ts';
import { parseCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { readCoreScriptEdition } from './services/coreSpirit/languageEdition.ts';
import { validateCoreSpiritIr } from './services/coreSpirit/irContract.ts';
import { buildCoreSpiritArtifactLookupIdentity } from './services/coreSpirit/artifactLookupIdentity.ts';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';

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

const normalizedSystem = normalizeCoreSpiritSource(system);
assert.match(normalizedSystem, /on market\.tick \{/);
assert.match(normalizedSystem, /on order\.fill \{/);
assert.match(normalizedSystem, /on position\.update \{/);
assert.match(normalizedSystem, /automation\.route\("broker\.fyers"\)/);
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


// CoreScript v1.2 edition and concise-surface compatibility.
const compactV12 = `edition@1.2
plot vwap() color=white width=1 style=line`;
const expandedV12 = `edition@1.2
plot(vwap(), "white", 1, 0, null);`;
assert.equal(readCoreScriptEdition(compactV12).edition, '1.2');
const compactV12Default = `edition@1.2
plot vwap()`;
const expandedV12Default = `edition@1.2
plot(vwap(), null, 2, 0, null);`;
assert.equal(normalizeCoreSpiritSource(compactV12Default), normalizeCoreSpiritSource(expandedV12Default));
assert.deepEqual(parseCoreSpirit(compactV12Default), parseCoreSpirit(expandedV12Default));
const compactV12DefaultResult = compileCoreSpirit(compactV12Default, 'corescript-v12-default');
assert.deepEqual(compactV12DefaultResult.diagnostics.filter(d => d.severity === 'error'), []);
assert.ok(compactV12DefaultResult.ir);
const v10CacheIdentity = buildCoreSpiritArtifactLookupIdentity('edition@1.0\nplot(vwap());', 'corescript-edition-cache');
const v12CacheIdentity = buildCoreSpiritArtifactLookupIdentity('edition@1.2\nplot(vwap());', 'corescript-edition-cache');
assert.notEqual(v10CacheIdentity.key, v12CacheIdentity.key,
  'source editions must not collide in the normalized-source artifact lookup cache');
assert.equal(readCoreScriptEdition('plot(vwap());').edition, '1.0');
assert.equal(normalizeCoreSpiritSource(compactV12), normalizeCoreSpiritSource(expandedV12));
assert.deepEqual(parseCoreSpirit(compactV12), parseCoreSpirit(expandedV12));
const compactV12Result = compileCoreSpirit(compactV12, 'corescript-v12-compact');
const expandedV12Result = compileCoreSpirit(expandedV12, 'corescript-v12-expanded');
assert.deepEqual(compactV12Result.diagnostics.filter(d => d.severity === 'error'), []);
assert.deepEqual(expandedV12Result.diagnostics.filter(d => d.severity === 'error'), []);
assert.ok(compactV12Result.ir && expandedV12Result.ir);
assert.equal(compactV12Result.ir.languageVersion, 1);
assert.equal(compactV12Result.ir.languageEdition, '1.2');
assert.equal(expandedV12Result.ir.languageEdition, '1.2');
assert.deepEqual(compactV12Result.ir.entry.instructions, expandedV12Result.ir.entry.instructions);
assert.ok(validateCoreSpiritIr(compactV12Result.ir));

const legacyV10Result = compileCoreSpirit('plot(vwap());', 'corescript-v10-legacy');
const explicitV10Result = compileCoreSpirit('edition@1.0\nplot(vwap());', 'corescript-v10-explicit');
assert.ok(legacyV10Result.ir && explicitV10Result.ir);
assert.equal(legacyV10Result.ir.languageEdition, '1.0');
assert.equal(explicitV10Result.ir.languageEdition, '1.0');
for (const [invalidSource, expectedCode] of [
  ['edition@1.3\nplot(vwap());', 'EDITION_UNSUPPORTED'],
  ['plot(vwap());\nedition@1.2', 'EDITION_HEADER_POSITION'],
  ['edition@1.2\nedition@1.0\nplot(vwap());', 'EDITION_DUPLICATE'],
  ['edition@one.two\nplot(vwap());', 'EDITION_HEADER_SYNTAX'],
]) {
  const invalid = compileCoreSpirit(invalidSource, 'corescript-invalid-' + expectedCode);
  assert.ok(invalid.diagnostics.some(d => d.code === expectedCode));
  assert.equal(invalid.artifact, undefined);
}
const noV12SugarInV10 = compileCoreSpirit(
  'edition@1.0\nplot vwap() color=white width=1 style=line',
  'corescript-v10-no-v12-sugar',
);
assert.ok(!noV12SugarInV10.artifact);
console.log('CORESCRIPT_EDITION_V12_FOUNDATION_OK');


// CoreScript v1.2 first-class programming constructs: compile AND execute.
function executeV12(source, sourceId) {
  const compiled = compileCoreSpirit('edition@1.2\\n' + source, sourceId);
  assert.deepEqual(compiled.diagnostics.filter(d => d.severity === 'error'), [], compiled.diagnostics.map(d => d.message).join('\\n'));
  assert.ok(compiled.ir, 'expected executable IR for ' + sourceId);
  const runtime = new CoreSpiritRuntime({ symbol:'NSE:NIFTY50-INDEX', timeframe:'5m', sourceId });
  const execution = runtime.executeIr(compiled.ir, [{
    timestamp:'2026-10-08T09:15:00Z', open:100, high:102, low:99, close:101, volume:1000,
  }]);
  assert.deepEqual(execution.diagnostics, [], 'runtime diagnostics for ' + sourceId);
  return execution.outputs.filter(item => item.kind === 'series').map(item => item.value);
}

const collectionOutputs = executeV12(`
let values = [10, 20, 30]
values.push(40)
let seen = []
for (let value in values) {
  seen.push(value)
}
let config = {"period": 20}
config.set("extra", 5)
plot(values[1] + seen.length + len(seen))
plot(config.get("period") + config["extra"])
`, 'corescript-v12-collections');
assert.deepEqual(collectionOutputs, [28, 25], 'array/map literals, indexing, methods and for-in should execute');

const loopOutputs = executeV12(`
state<int> counter = 0
while (counter < 3) {
  counter := counter + 1
}
let values = [1, 2, 3, 4, 5]
let kept = []
for (let value in values) {
  if (value == 2) {
    continue
  }
  if (value == 5) {
    break
  }
  kept.push(value)
}
plot(counter)
plot(kept.length)
`, 'corescript-v12-loops');
assert.deepEqual(loopOutputs, [3, 3], 'while, for-in, break and continue should execute within the VM');

const functionOutputs = executeV12(`
fn doubled(value: number) -> number {
  let result = value * 2
  return result
}
plot(doubled(6))
`, 'corescript-v12-functions');
assert.deepEqual(functionOutputs, [12], 'typed pure function lowering should execute');

const enumOutputs = executeV12(`
enum Direction { Long, Short }
let side = Direction.Long
if (side == "Long") {
  plot(1)
} else {
  plot(0)
}
`, 'corescript-v12-enums');
assert.deepEqual(enumOutputs, [1], 'enum declarations and member references should lower to constants');

const importOutputs = executeV12(`
import { abs as magnitude, sqrt } from "math"
import * as statistics from "stats"
plot(magnitude(-5) + sqrt(16))
plot(statistics.mean(10, 20))
`, 'corescript-v12-module-imports');
assert.deepEqual(importOutputs, [7, 15], 'built-in named and namespace imports should resolve');

const matrixOutputs = executeV12(`
let values = matrix(2, 2, 1, 2, 3, 4)
plot(values.get(1, 0))
let transposed = values.transpose()
plot(transposed.get(0, 1))
`, 'corescript-v12-matrix-methods');
assert.deepEqual(matrixOutputs, [3, 3], 'matrix access and transformation methods should execute through quant kernels');

console.log('CORESCRIPT_V12_PROGRAMMING_CONSTRUCTS_OK');
