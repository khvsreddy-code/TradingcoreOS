import assert from 'node:assert/strict';

const { CoreSpiritParser } = await import('./parser.ts');
const { CoreSpiritCompiler } = await import('./compiler.ts');
const {
  isSeriesType,
  isStateType,
  isWindowType,
  normalizeDeclaredType,
  compatible,
} = await import('./typeSystem.ts');
const { parseCoreSpiritTemporalType } = await import('./temporalTypes.ts');

assert.equal(normalizeDeclaredType('series<float>'), 'series<float>');
assert.equal(normalizeDeclaredType('state<float>'), 'state<float>');
assert.equal(normalizeDeclaredType('window<float>'), 'window<float>');
assert.equal(normalizeDeclaredType('confirmed<boolean>'), 'confirmed<boolean>');
assert(isSeriesType('series<price>'));
assert(isStateType('state<float>'));
assert(isWindowType('window<float>'));
assert.deepEqual(parseCoreSpiritTemporalType('developing<number>'), { container: 'developing', element: 'number', phase: 'developing' });
assert(compatible('state<float>', 'state<number>'));
assert(!compatible('state<float>', 'series<float>'));

const source = [
  'let trailingStop: state<float> = null;',
  'on bar {',
  '  trailingStop := max(trailingStop, close - atr(14) * 2);',
  '}',
  'if bar.confirmed {',
  '  signal("confirmed");',
  '}',
].join('\n');

const ast = new CoreSpiritParser(source).parse();
const compiled = new CoreSpiritCompiler().compile(ast, 'temporal-contract');
assert.equal(compiled.diagnostics.filter(d => d.severity === 'error').length, 0, compiled.diagnostics.map(d => d.message).join('\n'));
assert(compiled.ir, 'temporal program did not compile');

const ops = compiled.ir.entry.instructions.map(instruction => instruction.op);
assert(ops.includes('loadState'), 'state<T> reads must lower to loadState');
assert(ops.includes('setState'), 'state<T> writes must lower to setState');
assert(ops.includes('eventGate'), 'on bar must lower to eventGate');

const stateInstruction = compiled.ir.entry.instructions.find(instruction => instruction.op === 'setState');
assert.equal(stateInstruction?.name, 'trailingStop');

const barPhaseCall = compiled.ir.entry.instructions.find(
  instruction => instruction.op === 'call' && instruction.name === '__bar_phase',
);
assert(barPhaseCall, 'bar.confirmed did not lower to temporal phase runtime call');

console.log('TCO_CORESPIRIT_BRANCH12_TEMPORAL_TYPE_CONTRACT_OK');
