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

const structures = compiler.compileSource(`
let ob = market("NSE:NIFTY50").orderbook;
let fp = market("NSE:NIFTY50").footprint;
let vp = market("NSE:NIFTY50").volumeProfile;
`, 'trading-native-structures');
assert.equal(structures.diagnostics.filter((d) => d.severity === 'error').length, 0);
assert.deepEqual(
  structures.ir?.tradingNativePlan.dataDependencies.map((dep) => ({ id: dep.id, batchable: dep.batchable })),
  [
    { id:'market:NSE:NIFTY50:chart', batchable:false },
  ],
);
assert.ok(structures.ir?.tradingNativePlan.dataDependencies[0].fields.includes('orderbook'));
assert.ok(structures.ir?.tradingNativePlan.dataDependencies[0].fields.includes('footprint'));
assert.ok(structures.ir?.tradingNativePlan.dataDependencies[0].fields.includes('volumeProfile'));

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
const eventAst = new CoreSpiritParser('if (event("fill")) { let x = close; }').parse();
const eventPlan = buildCoreSpiritTradingNativePlan(eventAst);
assert.equal(eventPlan.eventTriggers.length, 1);
assert.equal(eventPlan.eventTriggers[0].kind, 'fill');
assert.equal(eventPlan.eventTriggers[0].busEvent, 'execution.fill');

assert.equal(plan.eventTriggers.length, 3);
assert.deepEqual(plan.eventTriggers.map((x) => x.kind), ['bar','tick','session.open']);
assert.ok(plan.eventNative);

console.log('CoreSpirit trading-native contract: OK');
