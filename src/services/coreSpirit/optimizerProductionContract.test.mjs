import assert from 'node:assert/strict';
import { optimizeCoreSpiritIr } from './optimizer.ts';

const program = {
  version: 1,
  sourceId: 'optimizer-production-contract',
  entry: {
    instructions: [
      { op: 'const', dest: 'unusedBefore', value: 99 },
      { op: 'const', dest: 'condition', value: true },
      { op: 'const', dest: 'stateValue', value: 7 },
      { op: 'setState', name: 'checkpoint', source: 'stateValue' },
      { op: 'jumpIfFalse', condition: 'condition', target: 7 },
      { op: 'const', dest: 'unusedBranch', value: 123 },
      { op: 'emit', kind: 'plot', args: ['condition'], outputId: 'plot:one' },
      { op: 'jump', target: 9 },
      { op: 'const', dest: 'unusedTarget', value: 456 },
      { op: 'emit', kind: 'plot', args: ['condition'], outputId: 'plot:two' },
    ],
  },
  locals: [],
  maxLookback: 0,
  diagnostics: [],
  sourceMap: { version: 1, sourceId: 'optimizer-production-contract', entries: [] },
};

const optimized = optimizeCoreSpiritIr(program);
const instructions = optimized.entry.instructions;
const opNames = instructions.map(instruction => instruction.op);

assert.equal(instructions.some(instruction => instruction.op === 'const' && ['unusedBefore', 'unusedBranch', 'unusedTarget'].includes(instruction.dest)), false, 'unused pure values should be removed');
assert.equal(instructions.some(instruction => instruction.op === 'setState' && instruction.name === 'checkpoint'), true, 'state writes must remain');
assert.equal(instructions.some(instruction => instruction.op === 'emit' && instruction.outputId === 'plot:one'), true, 'first output must remain');
assert.equal(instructions.some(instruction => instruction.op === 'emit' && instruction.outputId === 'plot:two'), true, 'second output must remain');
assert.equal(instructions.find(instruction => instruction.op === 'setState').source, 'stateValue');
assert.equal(instructions.some(instruction => instruction.op === 'const' && instruction.dest === 'stateValue'), true, 'state-write dependencies must stay live');

const conditional = instructions.find(instruction => instruction.op === 'jumpIfFalse');
const jump = instructions.find(instruction => instruction.op === 'jump');
assert.equal(conditional.target, instructions.findIndex(instruction => instruction.op === 'jump'), 'conditional target must be remapped after dead-code removal');
assert.equal(jump.target, instructions.length - 1, 'jump target must still point at the intended final emit');
assert.equal(optimized.optimizationPlan.passes.at(-1).name, 'dead-pure-value-elimination');
assert.equal(optimized.optimizationPlan.cost.deadPureInstructionsRemoved, 3);
assert.equal(optimized.optimizationPlan.passes.at(-1).instructionsAfter, instructions.length);

const loopProgram = {
  ...program,
  sourceId: 'optimizer-loop-safety',
  entry: {
    instructions: [
      { op: 'const', dest: 'loopUnused', value: 100 },
      { op: 'jump', target: 0 },
    ],
  },
  sourceMap: { version: 1, sourceId: 'optimizer-loop-safety', entries: [] },
};
const loopOptimized = optimizeCoreSpiritIr(loopProgram);
assert.deepEqual(loopOptimized.entry.instructions, loopProgram.entry.instructions, 'linear DCE must skip programs with back-edges');
assert.equal(loopOptimized.optimizationPlan.cost.deadPureInstructionsRemoved, 0);
assert.ok(loopOptimized.optimizationPlan.explanation.some(line => line.includes('backward control-flow edge')));

console.log('CORESPIRIT_OPTIMIZER_PRODUCTION_CONTRACT_OK');
