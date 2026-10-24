import assert from 'node:assert/strict';
import { buildCoreSpiritDirtyGraph, CoreSpiritDirtyGraph, dirtySourcesForBar } from './dirtyGraph.ts';

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
assert.equal(closePlan.latest,501, 'a one-bar mutation is [500, 501), not an empty point');

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
assert.deepEqual(boundedPlan.ranges.get('window:sma'), { from: 500, to: 505 }, 'a changed bar affects the full 5-bar output window');
assert.deepEqual(boundedPlan.ranges.get('window:signal'), { from: 500, to: 505 });
assert.equal(boundedPlan.latest, 505);

const recursivePlan = graph.planTail(['close'], 500, 520);
assert.deepEqual(recursivePlan.ranges.get('i:ema'), { from: 500, to: 520 });
assert.deepEqual(recursivePlan.ranges.get('i:rsi'), { from: 500, to: 520 });
assert.equal(recursivePlan.latest, 520);

const correction = graph.planCorrection(['close'], { from: 500, to: 501 }, 520);
assert.deepEqual(correction.ranges.get('i:ema'), { from: 500, to: 520 }, 'historical EMA correction invalidates the recursive tail');
assert.deepEqual(correction.ranges.get('i:signal'), { from: 500, to: 520 }, 'downstream outputs receive propagated tail ranges');
assert.equal(correction.correction?.requiresStateRestore, true);
assert.equal(correction.correction?.replayFrom, 0, 'without a safe checkpoint, stateful correction replays from zero');
assert.equal(correction.correction?.reason, 'full-replay-no-safe-checkpoint');
const compatibleCheckpoint = {
  nextBarIndex:450,
  modelVersion:'core-v1',
  kernelType:'ema',
  kernelVersion:1,
  parametersSignature:'ema:period=14',
  dataRevision:'dataset-revision-before-correction',
  inputDependencies:['close'],
  compatibleWithCurrentExecution:true,
};
const checkpointCorrection = graph.planCorrection(['close'], { from: 500, to: 502 }, 520, compatibleCheckpoint);
assert.equal(checkpointCorrection.correction?.replayFrom, 450);
assert.equal(checkpointCorrection.correction?.checkpointNextBarIndex, 450);
assert.equal(checkpointCorrection.correction?.reason, 'checkpoint-replay');
const indexOnlyCheckpoint = graph.planCorrection(['close'], { from: 500, to: 502 }, 520, 450);
assert.equal(indexOnlyCheckpoint.correction?.replayFrom, 0,
  'a bar index alone cannot establish that recursive state matches the active kernel and corrected dataset');
assert.equal(indexOnlyCheckpoint.correction?.reason, 'full-replay-no-safe-checkpoint');
const unsafeCheckpoint = graph.planCorrection(['close'], { from: 500, to: 502 }, 520, {
  ...compatibleCheckpoint, nextBarIndex:510,
});
assert.equal(unsafeCheckpoint.correction?.replayFrom, 0, 'a checkpoint after changed data is never safe');
const statelessOnly = [node('input:open', 20, ['open'], [], ['simple:condition']), node('simple:condition', 21, ['t20'], ['input:open'], [], { stateful:false, lookback:0 })];
const statelessReactive = { ...reactive, sourceDependents:{close:[],open:['input:open'],volume:[]}, dependencies:{'input:open':[],'simple:condition':['input:open']}, dependents:{'input:open':['simple:condition'],'simple:condition':[]}, alwaysRecompute:[] };
const statelessCorrection = new CoreSpiritDirtyGraph(statelessOnly, statelessReactive).planCorrection(['open'], { from:150, to:151 }, 300);
assert.equal(statelessCorrection.correction?.requiresStateRestore, false);
assert.equal(statelessCorrection.correction?.replayFrom, 150);
assert.equal(statelessCorrection.correction?.reason, 'stateless-range');

const sameBar = { time: 1000, open: 100, high: 110, low: 90, close: 105, volume: 20 };
assert.deepEqual(dirtySourcesForBar(sameBar, { ...sameBar }), []);
assert.deepEqual(dirtySourcesForBar(sameBar, { ...sameBar, time: 1001 }), ['time']);
assert.deepEqual(dirtySourcesForBar(undefined, sameBar), ['time', 'open', 'high', 'low', 'close', 'volume', 'bar_index']);

const inferenceInstructions = [
  { op: 'const', dest: 'len20', value: 20 },
  { op: 'call', dest: 'smaOut', name: 'sma', args: ['close', 'len20'] },
  { op: 'const', dest: 'lenRise', value: 3 },
  { op: 'call', dest: 'risingOut', name: 'rising', args: ['close', 'lenRise'] },
  { op: 'const', dest: 'dynamicLen', value: 10 },
  { op: 'binary', dest: 'dynamicLen', operator: '+', left: 'runtimeValue', right: 'one' },
  { op: 'call', dest: 'dynamicOut', name: 'sma', args: ['close', 'dynamicLen'] },
];
const inferenceNodes = [
  { id: 'sma', instruction: 1, name: 'sma', dest: 'smaOut', sourceInputs: ['close'], stateful: true, deterministic: true, effectful: false, dependencies: [] },
  { id: 'rising', instruction: 3, name: 'rising', dest: 'risingOut', sourceInputs: ['close'], stateful: false, deterministic: true, effectful: false, dependencies: [] },
  { id: 'dynamic-sma', instruction: 6, name: 'sma', dest: 'dynamicOut', sourceInputs: ['close'], stateful: true, deterministic: true, effectful: false, dependencies: [] },
];
const inferenceReactive = {
  version: 1, nodeByInstruction: {}, sourceInputs: {}, sourceDependents: {},
  dependencies: Object.fromEntries(inferenceNodes.map(n => [n.id, n.dependencies])),
  dependents: Object.fromEntries(inferenceNodes.map(n => [n.id, []])),
  alwaysRecompute: [], effectNodes: [],
};
const inferred = buildCoreSpiritDirtyGraph({ version: 1, sourceId: 'lookback-inference', nodes: inferenceNodes, roots: [], outputs: [], checksum: '' }, inferenceReactive, inferenceInstructions);
assert.equal(inferred.find(n => n.id === 'sma').lookback, 19, '20-bar rolling window should invalidate 19 future bars');
assert.equal(inferred.find(n => n.id === 'rising').lookback, 3, 'rising(length) examines that many previous bars');
assert.equal(inferred.find(n => n.id === 'dynamic-sma').lookback, Number.POSITIVE_INFINITY, 'a non-constant window length must conservatively invalidate the tail');

assert.equal(correction.allHistory, true, 'recursive historical corrections without a checkpoint must be an explicit full replay');
assert.deepEqual(correction.ranges.get('i:ema'), { from: 0, to: 520 }, 'full replay ranges must agree with replayFrom=0');
assert.equal(correction.instructions.size, nodes.length, 'full replay includes every graph instruction to rebuild all hidden state');
assert.deepEqual(checkpointCorrection.ranges.get('i:ema'), { from: 450, to: 520 }, 'checkpoint replay must evaluate affected state from the checkpoint, not only the corrected bar');
assert.deepEqual(checkpointCorrection.ranges.get('i:signal'), { from: 450, to: 520 }, 'dependent outputs must be replayed from the checkpoint too');

const volumeCorrection = graph.planCorrection(['volume'], { from: 500, to: 501 }, 520, 450);
assert.equal(volumeCorrection.allHistory, false, 'a valid checkpoint keeps correction replay scoped to the affected subgraph');
assert.equal(volumeCorrection.nodes.has('i:vwap'), true);
assert.equal(volumeCorrection.nodes.has('i:ema'), false, 'unrelated recursive indicators must remain reusable');
assert.deepEqual(volumeCorrection.ranges.get('i:vwap'), { from: 450, to: 520 });

console.log('CORESPIRIT_DIRTY_GRAPH_CONTRACT_OK');