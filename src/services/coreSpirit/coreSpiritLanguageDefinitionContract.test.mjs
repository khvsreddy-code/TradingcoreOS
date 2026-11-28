import assert from 'node:assert/strict';
import { CoreSpiritParser } from './services/coreSpirit/parser.ts';
import { compileCoreSpirit, parseCoreSpirit, parseCoreSpiritDetailed } from './services/coreSpirit/coreSpiritPipeline.ts';
import { validateCoreSpiritIr } from './services/coreSpirit/irContract.ts';
import {
  CORE_SPIRIT_LANGUAGE_DEFINITION,
  CORE_SPIRIT_PROGRAM_GRAMMAR,
  CORE_SPIRIT_AUTHORING_LEVELS,
  CORE_SPIRIT_LANGUAGE_FEATURES,
  CORE_SPIRIT_TYPE_MODEL,
  getCoreSpiritLanguageFeature,
  validateCoreSpiritLanguageDefinition,
} from './services/coreSpirit/coreSpiritLanguageDefinition.ts';

assert.deepEqual(validateCoreSpiritLanguageDefinition(), []);
assert.equal(CORE_SPIRIT_LANGUAGE_DEFINITION.name, 'CoreSpirit');
assert.equal(CORE_SPIRIT_LANGUAGE_DEFINITION.compilerAbi, 'CoreScript');
assert.deepEqual(CORE_SPIRIT_LANGUAGE_DEFINITION.programKinds, ['indicator','automation','prediction','strategy']);
assert.equal(CORE_SPIRIT_AUTHORING_LEVELS.map(level => level.id).join(','), 'beginner,trader,quant,system');
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR, /ProgramHeader/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR, /TypeName/);
assert.ok(CORE_SPIRIT_TYPE_MODEL.temporalContainers.includes('confirmed<T>'));
assert.ok(CORE_SPIRIT_TYPE_MODEL.temporalPhases.includes('realtime'));

const programCases = [
  ['indicator', 'Trend Geometry', 'indicator "Trend Geometry" {\n  let fast = ta.ema(close, 20);\n  let slow = ta.ema(close, 50);\n}'],
  ['automation', 'Breakout Monitor', 'automation "Breakout Monitor" {\n  let resistance = high[1];\n  when close crosses_above resistance {\n    let triggered = true;\n  }\n}'],
  ['prediction', 'NIFTY Direction', 'prediction "NIFTY Direction" {\n  let returns = close / close[1] - 1;\n  let forecast = returns;\n}'],
  ['strategy', 'Trend Strategy', 'strategy "Trend Strategy" {\n  let fast = ta.ema(close, 20);\n  let slow = ta.ema(close, 50);\n  if (fast > slow) {\n    let bullish = true;\n  }\n}'],
];

for (const [kind, title, source] of programCases) {
  const direct = new CoreSpiritParser(source).parseDetailed();
  assert.deepEqual(direct.diagnostics, [], kind + ' direct parser diagnostics');
  assert.equal(direct.ast.programKind, kind);
  assert.equal(direct.ast.programTitle, title);

  const parsed = parseCoreSpirit(source);
  assert.equal(parsed.programKind, kind);
  assert.equal(parsed.programTitle, title);

  const detailed = parseCoreSpiritDetailed(source);
  assert.deepEqual(detailed.diagnostics, []);
  assert.equal(detailed.ast.programKind, kind);
  assert.equal(detailed.ast.programTitle, title);

  const compiled = compileCoreSpirit(source, 'language-program-' + kind);
  assert.deepEqual(compiled.diagnostics.filter(item => item.severity === 'error'), [],
    kind + ' shared-pipeline errors: ' + compiled.diagnostics.map(item => item.message).join('\n'));
  assert.ok(compiled.ir, kind + ' must produce typed IR');
  assert.equal(compiled.ir.programKind, kind);
  assert.equal(compiled.ir.programTitle, title);
  assert.equal(compiled.ir.programLayer, kind === 'strategy' ? 'strategy' : kind === 'automation' ? 'automation' : kind === 'prediction' ? 'model' : 'script');
  assert.equal(compiled.ir.language, 'CoreScript');
  assert.equal(compiled.ir.languageVersion, 1);
  assert.ok(validateCoreSpiritIr(compiled.ir));
  assert.equal(validateCoreSpiritIr({ ...compiled.ir, programKind: 'not-a-program' }), false);
  assert.equal(validateCoreSpiritIr({ ...compiled.ir, programTitle: 42 }), false);
  assert.equal(validateCoreSpiritIr({ ...compiled.ir, programLayer:'automation' }), kind === 'automation');
}

const compactSource = 'indicator "Compact Program" { let value = close; if (value > 0) { let note = "brace } is text"; } // } comment must not close wrapper\n}';
const compactParsed = parseCoreSpiritDetailed(compactSource);
assert.deepEqual(compactParsed.diagnostics, [], 'compact block must parse with nested braces and quoted/comment braces');
assert.equal(compactParsed.ast.programKind, 'indicator');
assert.equal(compactParsed.ast.programTitle, 'Compact Program');
const compactCompiled = compileCoreSpirit(compactSource, 'language-program-compact');
assert.deepEqual(compactCompiled.diagnostics.filter(item => item.severity === 'error'), [], compactCompiled.diagnostics.map(item => item.message).join('\\n'));
assert.equal(compactCompiled.ir?.programKind, 'indicator');
assert.equal(compactCompiled.ir?.programTitle, 'Compact Program');
const mismatchedPolicy = compileCoreSpirit('strategy "Wrong Lane" { let x = close; }', 'language-program-mismatched-layer', { layer:'script' });
assert.ok(mismatchedPolicy.diagnostics.some(item => item.code === 'PROGRAM_LAYER_MISMATCH'));

const noHeader = new CoreSpiritParser('let answer = 42;').parseDetailed();
assert.deepEqual(noHeader.diagnostics, []);
assert.equal(noHeader.ast.programKind, undefined);
assert.equal(noHeader.ast.programTitle, undefined);

const missingClose = new CoreSpiritParser('indicator "Missing Close" { let x = 1;').parseDetailed();
assert.ok(missingClose.diagnostics.some(item => item.message.includes('Expected } to close the program declaration')));

const trailing = new CoreSpiritParser('strategy "Bad Tail" { let x = 1; } let y = 2;').parseDetailed();
assert.ok(trailing.diagnostics.some(item => item.message.includes('Unexpected tokens after the program declaration')));

for (const id of ['tuples','enums','closures','imports-exports','error-handling']) {
  assert.equal(getCoreSpiritLanguageFeature(id)?.status, 'planned', id + ' must not be advertised as implemented');
}
assert.equal(CORE_SPIRIT_LANGUAGE_FEATURES.find(feature => feature.id === 'operator-overloading')?.status, 'deferred');

console.log('CORESPIRIT_LANGUAGE_DEFINITION_CONTRACT_OK');
