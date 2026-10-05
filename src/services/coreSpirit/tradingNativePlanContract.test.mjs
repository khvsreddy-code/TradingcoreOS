import assert from 'node:assert/strict';
import { CoreSpiritCompiler } from './compiler.ts';
import { CoreSpiritParser } from './parser.ts';
import { buildCoreSpiritTradingNativePlan } from './tradingNativePlan.ts';
import { makeCoreSpiritSurfaceMetadata } from './languageConcepts.ts';

const compiler = new CoreSpiritCompiler();
const result = compiler.compileSource(`
let nifty = market("NSE:NIFTY50");
let bank = market("NSE:NIFTYBANK");
let htf = market("NSE:NIFTY50").timeframe("15m");
let spread = nifty.close - bank.close;
let htfClose = htf.close;
`, 'trading-native-contract');

assert.equal(result.diagnostics.filter((d) => d.severity === 'error').length, 0);
assert.ok(result.ir?.tradingNativePlan.multiSymbol);
assert.ok(result.ir?.tradingNativePlan.multiTimeframe);
assert.equal(result.ir?.tradingNativePlan.dataDependencies.length, 4);
assert.deepEqual(
  result.ir?.tradingNativePlan.dataDependencies.map((dep) => dep.id),
  ['market:NSE:NIFTY50:chart','market:NSE:NIFTYBANK:chart','market:current:chart','market:NSE:NIFTY50:15m'],
);
assert.ok(result.ir?.specializedPlan);

const surface = makeCoreSpiritSurfaceMetadata(
  ['AUTOMATE', 'WHEN'],
  [{
    kind:'automation',
    name:'open',
    triggers:['on bar', 'on tick', 'session.open'],
    start:0,
    end:1,
  }],
);
const ast = new CoreSpiritParser('let x = close;').parse();
const plan = buildCoreSpiritTradingNativePlan(ast, surface);
assert.equal(plan.eventTriggers.length, 3);
assert.deepEqual(plan.eventTriggers.map((x) => x.kind), ['bar','tick','session.open']);
assert.ok(plan.eventNative);

console.log('CoreSpirit trading-native contract: OK');
