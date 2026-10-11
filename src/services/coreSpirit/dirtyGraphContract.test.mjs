import assert from 'node:assert/strict';
import { CoreSpiritDirtyGraph, dirtySourcesForBar } from './dirtyGraph.ts';

const node=(id,instruction,inputs,dependencies,dependents,extra={})=>({
  id,instruction,inputs,output:'t'+instruction,lookback:0,stateful:false,incremental:true,viewportDependent:false,realtimeSafe:true,
  dependencies,dependents,alwaysRecompute:false,...extra,
});
const nodes=[
  node('i:close',0,['close'],[],['i:ema','i:rsi','i:vwap']),
  node('i:ema',1,['close'],['i:close'],['i:signal'],{stateful:true,lookback:-1}),
  node('i:rsi',2,['close'],['i:close'],['i:signal'],{stateful:true,lookback:Number.POSITIVE_INFINITY}),
  node('i:signal',3,[],['i:ema','i:rsi'],['i:plot']),
  node('i:plot',4,[],['i:signal'],[],{alwaysRecompute:true}),
  node('i:vwap',5,['close','high','low','volume','time'],[],[],{stateful:true,lookback:Number.POSITIVE_INFINITY}),
];
const reactive={version:1,nodeByInstruction:{},sourceInputs:{},sourceDependents:{close:['i:close'],open:[],volume:['i:vwap']},dependencies:Object.fromEntries(nodes.map(n=>[n.id,n.dependencies])),dependents:Object.fromEntries(nodes.map(n=>[n.id,n.dependents])),alwaysRecompute:['i:plot'],effectNodes:['i:plot']};
const graph=new CoreSpiritDirtyGraph(nodes,reactive);

const closePlan=graph.planTail(['close'],500);
assert.ok(closePlan.nodes.has('i:ema'));
assert.ok(closePlan.nodes.has('i:rsi'));
assert.ok(closePlan.nodes.has('i:signal'));
assert.ok(closePlan.nodes.has('i:plot'));
assert.ok(closePlan.nodes.has('i:vwap'));
assert.equal(closePlan.earliest,500);
assert.equal(closePlan.latest,500);

const volumePlan=graph.planTail(['volume'],500);
assert.ok(volumePlan.nodes.has('i:vwap'));
assert.equal(volumePlan.nodes.has('i:ema'),false);
assert.equal(volumePlan.nodes.has('i:rsi'),false);

const openPlan=graph.planTail(['open'],500);
assert.equal(openPlan.nodes.has('i:vwap'),false);
assert.equal(openPlan.nodes.has('i:plot'),true);
assert.equal(openPlan.instructions.size,1);

const boundedNodes = [
  node('source:close', 10, ['close'], [], ['window:sma']),
  node('window:sma', 11, ['t10'], ['source:close'], ['window:signal'], { stateful: true, lookback: 4 }),
  node('window:signal', 12, ['t11'], ['window:sma'], [], { lookback: 0 }),
];
const boundedReactive = {
  ...reactive,
  sourceDependents: { close: ['source:close'], open: [], volume: [] },
  dependencies: Object.fromEntries(boundedNodes.map(n => [n.id, n.dependencies])),
  dependents: Object.fromEntries(boundedNodes.map(n => [n.id, n.dependents])),
  alwaysRecompute: [],
};
const boundedPlan = new CoreSpiritDirtyGraph(boundedNodes, boundedReactive).planTail(['close'], 500, 520);
assert.deepEqual(boundedPlan.ranges.get('window:sma'), { from: 500, to: 504 });
assert.deepEqual(boundedPlan.ranges.get('window:signal'), { from: 500, to: 504 });
assert.equal(boundedPlan.latest, 504);

const recursivePlan = graph.planTail(['close'], 500, 520);
assert.deepEqual(recursivePlan.ranges.get('i:ema'), { from: 500, to: 520 });
assert.deepEqual(recursivePlan.ranges.get('i:rsi'), { from: 500, to: 520 });
assert.equal(recursivePlan.latest, 520);

const sameBar = { time: 1000, open: 100, high: 110, low: 90, close: 105, volume: 20 };
assert.deepEqual(dirtySourcesForBar(sameBar, { ...sameBar }), []);
assert.deepEqual(dirtySourcesForBar(sameBar, { ...sameBar, time: 1001 }), ['time']);
assert.deepEqual(dirtySourcesForBar(undefined, sameBar), ['time', 'open', 'high', 'low', 'close', 'volume', 'bar_index']);

console.log('CORESPIRIT_DIRTY_GRAPH_CONTRACT_OK');