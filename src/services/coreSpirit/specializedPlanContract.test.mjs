import assert from 'node:assert/strict';
import { buildCoreSpiritSpecializedPlan } from './specializedPlan.ts';

const instructions = [
  { op:'loadSeries', dest:'t0', name:'close', offset:0 },
  { op:'const', dest:'t1', value:20 },
  { op:'call', dest:'t2', name:'ema', args:['t0','t1'], seriesArgs:['close'], callId:'ema:1' },
  { op:'const', dest:'t3', value:14 },
  { op:'call', dest:'t4', name:'rsi', args:['t0','t3'], seriesArgs:['close'], callId:'rsi:2' },
  { op:'const', dest:'t5', value:0 },
  { op:'binary', dest:'t6', operator:'>', left:'t2', right:'t0' },
  { op:'binary', dest:'t7', operator:'<', left:'t4', right:'t5' },
  { op:'binary', dest:'t8', operator:'and', left:'t6', right:'t7' },
];

const plan = buildCoreSpiritSpecializedPlan(instructions);
assert.equal(plan.strategy, 'specialized-straight-line');
assert.equal(plan.slotCount, 9);
assert.equal(plan.seriesFanouts.length, 1);
assert.equal(plan.seriesFanouts[0].stages.length, 2);
assert.deepEqual(
  plan.seriesFanouts[0].stages.map((stage) => stage.name),
  ['ema', 'rsi'],
);
assert.ok(plan.wasmEligible.includes(2));
assert.ok(plan.wasmEligible.includes(4));
assert.ok(plan.wasmEligible.includes(6));
assert.ok(plan.wasmEligible.includes(7));
assert.ok(plan.wasmEligible.includes(8));

console.log('CoreSpirit specialized plan contract: OK');
