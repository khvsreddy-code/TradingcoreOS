import assert from 'node:assert/strict';
import { optimizeCoreSpiritIr } from './optimizer.ts';

const sourceId = 'optimizer-constant-register-version';
const program = {
  version: 1,
  sourceId,
  entry: {
    instructions: [
      { op: 'const', dest: 'input', value: 2 },
      { op: 'const', dest: 'value', value: 3 },
      { op: 'call', dest: 'value', name: 'runtimeOnly', args: ['input'], componentPure: false, componentStateful: true, componentDeterministic: false },
      { op: 'const', dest: 'other', value: 4 },
      { op: 'binary', dest: 'result', operator: '+', left: 'value', right: 'other' },
      { op: 'emit', kind: 'plot', args: ['result'], outputId: 'result' },
    ],
  },
  locals: [],
  maxLookback: 0,
  diagnostics: [],
  sourceMap: { version: 1, sourceId, entries: [] },
};

const optimized = optimizeCoreSpiritIr(program);
assert.ok(optimized.entry.instructions.some(instruction => instruction.op === 'call' && instruction.dest === 'value'), 'runtime call must remain live');
assert.ok(optimized.entry.instructions.some(instruction => instruction.op === 'binary' && instruction.dest === 'result'), 'binary using the runtime result must not fold using an obsolete constant');
assert.equal(optimized.entry.instructions.some(instruction => instruction.op === 'const' && instruction.dest === 'result' && instruction.value === 7), false);

console.log('CORESPIRIT_OPTIMIZER_CONSTANT_REGISTER_VERSION_CONTRACT_OK');
