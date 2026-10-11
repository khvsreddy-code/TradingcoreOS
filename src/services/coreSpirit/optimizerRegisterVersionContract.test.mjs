import assert from 'node:assert/strict';
import { optimizeCoreSpiritIr } from './optimizer.ts';

const sourceId = 'optimizer-register-version-contract';
const program = {
  version: 1,
  sourceId,
  entry: {
    instructions: [
      { op: 'const', dest: 'input', value: 2 },
      { op: 'call', dest: 'first', name: 'contractPure', args: ['input'], componentPure: true, componentStateful: false, componentDeterministic: true },
      { op: 'const', dest: 'input', value: 9 },
      { op: 'call', dest: 'second', name: 'contractPure', args: ['input'], componentPure: true, componentStateful: false, componentDeterministic: true },
      { op: 'emit', kind: 'plot', args: ['first'], outputId: 'first' },
      { op: 'emit', kind: 'plot', args: ['second'], outputId: 'second' },
    ],
  },
  locals: [],
  maxLookback: 0,
  diagnostics: [],
  sourceMap: { version: 1, sourceId, entries: [] },
};

const optimized = optimizeCoreSpiritIr(program);
const calls = optimized.entry.instructions.filter(instruction => instruction.op === 'call' && instruction.name === 'contractPure');
assert.equal(calls.length, 2, 'an expression cached before an operand register is reassigned must not be reused');
assert.ok(optimized.entry.instructions.some(instruction => instruction.op === 'emit' && instruction.outputId === 'first'));
assert.ok(optimized.entry.instructions.some(instruction => instruction.op === 'emit' && instruction.outputId === 'second'));

console.log('CORESPIRIT_OPTIMIZER_REGISTER_VERSION_CONTRACT_OK');
