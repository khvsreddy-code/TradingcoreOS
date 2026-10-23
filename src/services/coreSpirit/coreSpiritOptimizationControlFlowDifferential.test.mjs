import assert from 'node:assert/strict';
import { CoreSpiritExecutionVM } from './executionVM.ts';
import { CoreSpiritOptimizedExecutionVM } from './optimizedExecutionVM.ts';
import { CoreSpiritOutputCollector } from './outputCollector.ts';
import { optimizeCoreSpiritIr } from './optimizer.ts';

/**
 * Deterministic property-style differential contract for control flow and effects.
 * Keep this dependency-free so it runs in the repository's existing Node test setup.
 */
function snapshot(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'number' && Number.isNaN(item)) return '__NaN__';
    if (item === Infinity) return '__Infinity__';
    if (item === -Infinity) return '__-Infinity__';
    return item;
  });
}

function run(vm, instructions, seed, maxStepsPerBar = 128) {
  const output = new CoreSpiritOutputCollector(256);
  const state = { locals: Object.create(null), persistent: Object.create(null), effects: [] };
  const host = {
    maxStepsPerBar,
    throwIfAborted() {},
    loadSeries(name, offset) {
      const values = [null, 0, 1, -1, Number.NaN, Infinity, 42];
      return values[((seed + offset + (name === 'high' ? 2 : 0)) % values.length + values.length) % values.length];
    },
    moveLocal(name) { return state.locals[name]; },
    loadState(name) { return state.persistent[name] ?? null; },
    setState(name, value) { state.persistent[name] = value; state.effects.push(['state', name, value]); },
    setLocal(name, value) { state.locals[name] = value; },
    unary(operator, value) {
      if (operator === '!') return !value;
      if (operator === '-') return -Number(value);
      return Number(value);
    },
    binary(operator, left, right) {
      switch (operator) {
        case '+': return Number(left) + Number(right);
        case '-': return Number(left) - Number(right);
        case '*': return Number(left) * Number(right);
        case '/': return Number(right) === 0 ? Number.NaN : Number(left) / Number(right);
        case '==': return Object.is(left, right) || left === right;
        case '!=': return !(Object.is(left, right) || left === right);
        default: throw new Error('unsupported operator ' + operator);
      }
    },
    tryFused() { return false; },
    call(instruction, args) {
      if (instruction.name === 'effect') {
        state.effects.push(['call', ...args]);
        return args[0] ?? null;
      }
      if (instruction.name === 'explode') throw new Error('generated component failure');
      return args[0] ?? null;
    },
    loadIndexed(_instruction, index) {
      if (index > 3) throw new Error('historical data unavailable');
      return [null, Number.NaN, Infinity, 7][index];
    },
    truthy(value) { return !!value; },
    eventActive(name) { return name === 'bar' || seed % 2 === 0; },
    emit(instruction, values, collector) {
      const value = values.get(instruction.args[0]);
      state.effects.push(['emit', instruction.outputId, value]);
      collector.push({ kind: 'series', time: seed, value, seriesId: instruction.outputId ?? 'generated' });
    },
  };
  try {
    vm.run(instructions, seed, host, output);
    return { output: output.values(), locals: state.locals, persistent: state.persistent, effects: state.effects, error: null };
  } catch (error) {
    return { output: output.values(), locals: state.locals, persistent: state.persistent, effects: state.effects, error: String(error?.message ?? error) };
  }
}

let random = 0x6d2b79f5;
function rand(max) {
  random = (Math.imul(random ^ (random >>> 15), 1 | random) + 0x9e3779b9) | 0;
  return (random >>> 0) % max;
}

const reference = new CoreSpiritExecutionVM();
const optimized = new CoreSpiritOptimizedExecutionVM();
for (let sample = 0; sample < 240; sample += 1) {
  const seed = sample % 7;
  const condition = 'condition';
  const first = 'value' + (sample % 3);
  const second = 'other' + (sample % 4);
  const instructions = [
    { op: 'const', dest: condition, value: rand(2) === 0 },
    { op: 'loadSeries', dest: first, name: sample % 2 ? 'close' : 'high', offset: 0 },
    { op: 'const', dest: second, value: [null, 0, -2, 3, Number.NaN, Infinity][rand(6)] },
    { op: 'binary', dest: 'reassigned', operator: ['+', '-', '*', '/', '==', '!='][rand(6)], left: first, right: second },
    { op: 'setLocal', name: 'reassignedLocal', source: 'reassigned', series: false },
    { op: 'jumpIfFalse', condition, target: 8 },
    { op: 'call', dest: 'effectResult', name: 'effect', args: ['reassigned'], componentPure: false, componentStateful: true, componentDeterministic: true },
    { op: 'emit', kind: 'plot', args: ['effectResult'], outputId: 'branch:then:' + sample },
    { op: 'jump', target: 10 },
    { op: 'call', dest: 'effectResult', name: 'effect', args: [second], componentPure: false, componentStateful: true, componentDeterministic: true },
    { op: 'emit', kind: 'plot', args: ['effectResult'], outputId: 'branch:else:' + sample },
    { op: 'setState', name: 'last', source: 'reassigned' },
  ];
  // Include event gating, indexed history and boundary errors in a portion of samples.
  if (sample % 3 === 0) {
    instructions.splice(2, 0, { op: 'eventGate', eventName: 'trade', target: 3 });
    // Keep the gate target valid and intentionally allow the branch to skip the load.
    instructions[instructions.length - 1] = { op: 'setState', name: 'last', source: 'reassigned' };
  }
  if (sample % 5 === 0) {
    instructions.splice(instructions.length - 1, 0,
      { op: 'const', dest: 'historyIndex', value: sample % 10 === 0 ? 4 : sample % 4 },
      { op: 'index', dest: 'historyValue', target: first, index: 'historyIndex' },
      { op: 'emit', kind: 'plot', args: ['historyValue'], outputId: 'history:' + sample });
  }
  const expected = run(reference, instructions, seed);
  const actual = run(optimized, instructions, seed);
  assert.equal(snapshot(actual), snapshot(expected), 'VM differential mismatch in control-flow sample ' + sample);

  // The optimizer must not move, duplicate, or erase effectful operations.
  const program = {
    version: 1,
    sourceId: 'generated-control-flow-' + sample,
    entry: { instructions },
    locals: [],
    maxLookback: 4,
    diagnostics: [],
    sourceMap: { version: 1, sourceId: 'generated-control-flow-' + sample, entries: [] },
  };
  const transformed = optimizeCoreSpiritIr(program).entry.instructions;
  const effects = list => list.filter(instruction =>
    instruction.op === 'emit' || instruction.op === 'setState' ||
    (instruction.op === 'call' && (instruction.componentPure !== true || instruction.componentStateful === true)));
  assert.deepEqual(effects(transformed), effects(instructions), 'optimizer changed observable effect order in sample ' + sample);
}

const stepLimitProgram = [
  { op: 'jump', target: 0 },
];
assert.equal(run(reference, stepLimitProgram, 0, 8).error, 'execution step limit exceeded');
assert.equal(run(optimized, stepLimitProgram, 0, 8).error, 'execution step limit exceeded');

console.log('CORESPIRIT_OPTIMIZATION_CONTROL_FLOW_DIFFERENTIAL_OK');
