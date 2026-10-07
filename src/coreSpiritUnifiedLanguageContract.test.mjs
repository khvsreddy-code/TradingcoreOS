import assert from 'node:assert/strict';
import { CoreSpiritParser } from './services/coreSpirit/parser.ts';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { CoreSpiritPlatformRuntime } from './services/coreSpirit/platformRuntime.ts';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';
import { semanticTypeForDeclaredName } from './services/coreSpirit/semanticTypeSystem.ts';

const beginner=`
data market = market("NSE:NIFTY50", "5m")

let fast = ta.ema(close, 20)
let slow = ta.ema(close, 50)

when fast > slow
    show signal("BUY")
`;

const trader=`
data nifty = market("NSE:NIFTY50", "5m")
data bank = market("NSE:BANKNIFTY", "5m")
let trend = ta.ema(nifty.close, 50)
let strength = ta.rsi(nifty.close, 14)
let relative = nifty.close / bank.close
when trend > trend[1]
and strength > 55
and relative > relative[20]
    signal("LONG")
`;

const quant=`
let returns = log(close / close[1])
let z = stats.zscore(returns, 100)
let beta = stats.beta(returns, market("NSE:NIFTY50").returns, 252)
model alpha {
    inputs: returns, z, beta
    predict: forward_return(20)
}
let prediction: prediction<float> = alpha.predict()
let confidence: probability = alpha.probability()
show line(prediction)
when confidence > 0.70
    signal("LONG")
`;

const automation=`
on signal("LONG") {
    if (risk.allowed()) {
        automation.notify("High-confidence bullish regime", "ops")
        automation.route("execution.long")
    }
}
`;

function compile(source, sourceId, layer='script') {
  const result=compileCoreSpirit(source,sourceId,{layer});
  assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],result.diagnostics.map(d=>d.message).join('\n'));
  assert.ok(result.ir);
  return result.ir;
}

const beginnerIr=compile(beginner,'language-beginner','script');
const traderIr=compile(trader,'language-trader','strategy');
const quantIr=compile(quant,'language-quant','strategy');
const automationIr=compile(automation,'language-automation','automation');

assert.equal(beginnerIr?.semanticDependencyGraph?.version,1);
assert.ok(traderIr?.tradingNativePlan?.dataDependencies.some(dep=>String(dep.symbol).toUpperCase().includes('BANKNIFTY')));
assert.ok(quantIr?.semanticDependencyGraph?.nodes.some(node=>node.kind==='model' && node.name==='alpha'));
assert.ok(quantIr?.semanticDependencyGraph?.nodes.some(node=>node.kind==='model-output' && node.name==='alpha.predict'));
assert.ok(quantIr?.researchPlan?.modelSpecs.some(model=>model.name==='alpha' && model.target==='forward_return(20)'));
assert.ok(automationIr?.semanticDependencyGraph?.nodes.some(node=>node.kind==='event' && node.name==='signal("LONG")'));
assert.equal(semanticTypeForDeclaredName('prediction<float>')?.valueKind,'prediction');
assert.equal(semanticTypeForDeclaredName('featureSet<float>')?.valueKind,'featureSet');

const parser = new CoreSpiritParser('on signal("LONG") { automation.notify("ok") }').parseDetailed();
assert.deepEqual(parser.diagnostics,[]);
assert.equal(parser.ast.body[0]?.type,'onEvent');

const runtime = new CoreSpiritRuntime({
  sourceId:'language-runtime',
  symbol:'NSE:NIFTY50',
  timeframe:'5m',
  executionMode:'historical',
  executionTarget:'automation',
  layer:'automation',
  riskResolver:()=>true,
  modelPredictionResolver:({field})=>field==='probability'?0.81:123.45,
});
runtime.loadIr(quantIr);
const bars=[
  {timestamp:'2026-01-01T09:15:00Z',open:100,high:101,low:99,close:100,volume:1000},
  {timestamp:'2026-01-01T09:20:00Z',open:100,high:103,low:99,close:102,volume:1200},
];
const result=runtime.executeIr(quantIr,bars);
assert.ok(result.outputs.some(output=>output.kind==='signal' && output.type==='LONG'));

const platform=new CoreSpiritPlatformRuntime();
const platformCompile=platform.compile(quant,'platform-quant','strategy');
assert.ok(platformCompile.artifact);
assert.ok(platformCompile.artifact?.ir.researchPlan?.modelSpecs.some(model=>model.name==='alpha'));

console.log('CORESPIRIT_UNIFIED_LANGUAGE_CONTRACT_OK');
