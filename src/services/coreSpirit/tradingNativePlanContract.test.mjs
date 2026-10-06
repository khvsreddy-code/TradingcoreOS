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
assert.equal(result.ir?.tradingNativePlan.dataDependencies.length, 3);
assert.deepEqual(
  result.ir?.tradingNativePlan.dataDependencies.map((dep) => dep.id),
  ['market:NSE:NIFTY50:chart','market:NSE:NIFTYBANK:chart','market:NSE:NIFTY50:15m'],
);
assert.ok(result.ir?.specializedPlan);

const graphSyntax = compiler.compileSource(`
let htfClose = series("15m").close;
let daily = series("1D").close;
`, 'trading-native-graph-syntax');
assert.equal(graphSyntax.diagnostics.filter((d) => d.severity === 'error').length, 0);
assert.ok(graphSyntax.ir?.tradingNativePlan.multiTimeframe);
assert.ok(graphSyntax.ir?.tradingNativePlan.dataGraph.minimumTimeframes.some((item) => item.timeframe === '15m'));
assert.ok(graphSyntax.ir?.tradingNativePlan.dataGraph.nodes.some((item) => item.timeframe === '1D'));

const structures = compiler.compileSource(`
let ob = market("NSE:NIFTY50").orderbook;
let fp = market("NSE:NIFTY50").footprint;
let vp = market("NSE:NIFTY50").volumeProfile;
`, 'trading-native-structures');
assert.equal(structures.diagnostics.filter((d) => d.severity === 'error').length, 0);
assert.deepEqual(
  structures.ir?.tradingNativePlan.dataDependencies.map((dep) => ({ id: dep.id, domain: dep.domain, batchable: dep.batchable })),
  [
    { id:'orderbook:NSE:NIFTY50:chart', domain:'orderbook', batchable:false },
    { id:'market:NSE:NIFTY50:chart', domain:'market', batchable:true },
    { id:'footprint:NSE:NIFTY50:chart', domain:'footprint', batchable:false },
    { id:'volume-profile:NSE:NIFTY50:chart', domain:'volume-profile', batchable:false },
  ],
);

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
