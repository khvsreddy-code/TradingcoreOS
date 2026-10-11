import assert from 'node:assert/strict';
import { optimizeCoreSpiritIr } from './optimizer.ts';

const sourceId = 'optimizer-control-flow-reassignment';
const program = {
  version: 1,
  sourceId,
  entry: {
    instructions: [
      { op: 'const', dest: 'condition', value: false },
      { op: 'const', dest: 'value', value: 1 },
      { op: 'const', dest: 'three', value: 3 },
      { op: 'jumpIfFalse', condition: 'condition', target: 6 },
      { op: 'const', dest: 'value', value: 2 },
      { op: 'jump', target: 7 },
      { op: 'binary', dest: 'result', operator: '+', left: 'value', right: 'three' },
      { op: 'emit', kind: 'plot', args: ['result'], outputId: 'branch-result' },
    ],
  },
  locals: [],
  maxLookback: 0,
  diagnostics: [],
  sourceMap: { version: 1, sourceId, entries: [] },
};

const optimized = optimizeCoreSpiritIr(program);
const instructions = optimized.entry.instructions;
assert.ok(instructions.some(instruction => instruction.op === 'const' && instruction.dest === 'value' && instruction.value === 1), 'branch target must retain the value defined before the branch');
assert.ok(instructions.some(instruction => instruction.op === 'const' && instruction.dest === 'value' && instruction.value === 2), 'fallthrough branch value must remain distinct');
assert.ok(instructions.some(instruction => instruction.op === 'binary' && instruction.dest === 'result'), 'constant folding must not use lexical values across a branch edge');
assert.equal(instructions.find(instruction => instruction.op === 'jumpIfFalse').target, 6);
assert.equal(instructions.find(instruction => instruction.op === 'jump').target, 7);
assert.ok(optimized.optimizationPlan.explanation.some(line => line.includes('reused destinations across control-flow paths')));
assert.equal(optimized.optimizationPlan.cost.deadPureInstructionsRemoved, 0);

console.log('CORESPIRIT_OPTIMIZER_CONTROL_FLOW_REASSIGNMENT_CONTRACT_OK');
