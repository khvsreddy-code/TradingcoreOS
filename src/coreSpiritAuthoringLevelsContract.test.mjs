import assert from 'node:assert/strict';
import { normalizeCoreSpiritSource } from './services/coreSpirit/syntax.ts';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { buildCoreSpiritResearchPlan } from './services/coreSpirit/researchSurface.ts';
import { RollingBetaState, RollingCorrelationState, detectQuantRegime } from './services/coreSpirit/quantKernels.ts';
import { CoreSpiritCapabilitySandbox } from './services/coreSpirit/capabilitySandbox.ts';
import { getCoreSpiritLibraryEntry } from './services/coreSpirit/standardLibraryNamespaces.ts';

const source=`
data market = market("NSE:NIFTY50", "5m")

let fast = ema(close, 20)
let slow = ema(close, 50)

when fast > slow
    show signal("BUY")

data nifty = market("NSE:NIFTY50", "5m")
data bank = market("NSE:BANKNIFTY", "5m")

let trend = ema(nifty.close, 50)
let strength = rsi(nifty.close, 14)
let relative = nifty.close / bank.close

when trend > trend[1]
and strength > 55
and relative > relative[20]
    signal("LONG")

let returns = log(close / close[1])
let z = zscore(returns, 100)
let beta = beta(returns, market("NSE:NIFTY50").returns, 252)
let regime = regime.detect(
    volatility = stdev(returns(close), 20),
    trend = trendStrength(close, 50)
)

model alpha {
    features:
        z,
        beta,
        regime,
        volume.zscore(100)
    target:
        forward_return(20)
}

backtest alpha
    from "2018-01-01"
    to "2026-01-01"

evaluate {
    sharpe
    sortino
    max_drawdown
    turnover
    hit_rate
    profit_factor
    exposure
}
`;

const normalized=normalizeCoreSpiritSource(source);
assert.match(normalized,/let nifty = market\("NSE:NIFTY50"\)\.timeframe\("5m"\)/);
assert.match(normalized,/let returns = log\(close \/ close\[1\]\)/);
assert.match(normalized,/beta\(returns,\s*returns\(market\("NSE:NIFTY50"\)\),\s*252\)/);
assert.match(normalized,/regimeDetect\(/);
assert.doesNotMatch(normalized,/^\s*data\b/m);
assert.doesNotMatch(normalized,/^\s*backtest\b/m);

const plan=buildCoreSpiritResearchPlan(source);
assert.equal(plan.backtests.length,1);
assert.equal(plan.backtests[0].model,'alpha');
assert.equal(plan.backtests[0].from,'2018-01-01');
assert.equal(plan.backtests[0].to,'2026-01-01');
assert.deepEqual(plan.backtests[0].evaluations,['sharpe','sortino','max_drawdown','turnover','hit_rate','profit_factor','exposure']);
assert.deepEqual(plan.modelSpecs[0].features,['z','beta','regime','volume.zscore(100)']);
assert.equal(plan.modelSpecs[0].target,'forward_return(20)');

const result=compileCoreSpirit(source,'authoring-levels-contract');
assert.ok(!result.diagnostics.some(d=>d.severity==='error'), result.diagnostics.map(d=>d.message).join('; '));
assert.ok(result.ir?.surface?.declarations.some(d=>d.kind==='model' && d.name==='alpha'));

console.log('CORESPIRIT_AUTHORING_LEVELS_CONTRACT_OK');


const betaKernel=new RollingBetaState(4);
for(const [x,y] of [[1,2],[2,4],[3,6],[4,8]]) betaKernel.update(x,y);
assert.ok(Math.abs((betaKernel.update(5,10) ?? 0)-2)<1e-10);

const trendKernel=new RollingCorrelationState(4);
for(const value of [1,2,3,4,5,6]) trendKernel.update(value);
assert.ok((trendKernel.update(7) ?? 0)>0.99);

assert.equal(detectQuantRegime(0.01,0.8),'trend-up');
assert.equal(detectQuantRegime(0.01,-0.8),'trend-down');
assert.equal(detectQuantRegime(0.03,0.1),'volatile');


const unifiedSource = `
requires execution.route
requires risk.evaluate
requires automation
requires events
data nifty = market("NSE:NIFTY50", "5m")

let trend = ta.ema(nifty.close, 50)
let volatility = stats.stdev(returns(nifty), 50)
let momentum = ta.rsi(nifty.close, 14)

model trendModel {
    inputs:
        trend,
        volatility,
        momentum
    predict:
        forward_return(10)
}

let prediction: prediction<float> = trendModel.predict()
let confidence: probability = trendModel.probability()

show line(prediction)

when prediction > 0.70
    signal("LONG")

on signal("LONG") {
    if risk.allowed() {
        automation.notify("High-confidence bullish regime")
        automation.route("execution.long")
    }
}
`;

const unifiedResult = compileCoreSpirit(unifiedSource, 'unified-language-contract', { layer: 'automation' });
assert.ok(!unifiedResult.diagnostics.some(d => d.severity === 'error'), unifiedResult.diagnostics.map(d => d.message).join('; '));
assert.equal(unifiedResult.ir?.authoringLevel, 'system');
assert.ok(unifiedResult.ir?.languageCapabilities?.includes('models'));
assert.ok(unifiedResult.ir?.languageCapabilities?.includes('events'));
assert.ok(unifiedResult.ir?.languageCapabilities?.includes('automation'));

const graph = unifiedResult.ir?.semanticDependencyGraph;
assert.ok(graph?.nodes.some(node => node.kind === 'model' && node.name === 'trendModel'));
assert.ok(graph?.nodes.some(node => node.kind === 'model-input' && node.name === 'trend'));
assert.ok(graph?.nodes.some(node => node.kind === 'model-input' && node.name === 'volatility'));
assert.ok(graph?.nodes.some(node => node.kind === 'model-output' && node.name === 'trendModel.predict'));
assert.ok(graph?.nodes.some(node => node.kind === 'automation' && node.name === 'automation.notify'));
assert.ok(graph?.edges.some(edge => edge.to === 'model:trendModel' && edge.relation === 'depends-on'));
const predictInstruction = unifiedResult.ir?.entry.instructions.find(instruction => instruction.op === 'call' && instruction.name === '__model_predict');
assert.ok(predictInstruction);
assert.ok(predictInstruction?.args.length >= 7);

const triggers = unifiedResult.ir?.tradingNativePlan?.eventTriggers ?? [];
const signalTrigger = triggers.find(trigger => trigger.kind === 'signal' && trigger.source.toLowerCase().startsWith('signal('));
assert.ok(signalTrigger);
assert.equal(signalTrigger?.busEvent, 'script.signal');
assert.equal(signalTrigger?.filter?.kind, 'signal');
assert.equal(signalTrigger?.filter?.value, 'LONG');

console.log('CORESPIRIT_UNIFIED_LANGUAGE_CONTRACT_OK');


const metadataProbe = `
model factorModel {
    features:
        returns,
        stats.zscore(returns, 100),
        volume.zscore(50)
    target:
        forward_return(20)
}
`;
const metadataSurface = (await import('./services/coreSpirit/languageConcepts.ts')).extractCoreSpiritSurfaceMetadata(metadataProbe);
const factorModel = metadataSurface.declarations.find(item => item.kind === 'model' && item.name === 'factorModel');
assert.ok(factorModel);
assert.deepEqual(factorModel?.inputs, ['returns', 'stats.zscore(returns, 100)', 'volume.zscore(50)']);

const automationSandbox = new CoreSpiritCapabilitySandbox({ layer: 'automation', target: 'automation' });
assert.equal(automationSandbox.can('market-data'), true);
assert.equal(automationSandbox.can('models'), true);
assert.equal(automationSandbox.can('risk-queries'), true);
assert.equal(automationSandbox.can('order-intents'), true);
assert.equal(automationSandbox.can('webhooks'), true);
assert.equal(automationSandbox.can('broker-credentials'), false);

for (const [namespace, member] of [
  ['ta', 'ema'],
  ['stats', 'beta'],
  ['math', 'log'],
  ['market', 'market'],
  ['orderflow', 'depthImbalance'],
  ['strategy', 'signal'],
  ['portfolio', 'position'],
  ['model', 'predict'],
  ['ml', 'predict'],
  ['prediction', 'probability'],
  ['automation', 'notify'],
  ['events', 'signal'],
  ['visual', 'show'],
]) {
  assert.ok(getCoreSpiritLibraryEntry(namespace, member), 'missing CoreSpirit domain entry ' + namespace + '.' + member);
}
