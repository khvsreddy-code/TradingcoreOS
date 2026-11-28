import assert from 'node:assert/strict';
import { CoreSpiritParser } from './parser.ts';
import { compileCoreSpirit, executeCoreSpirit, parseCoreSpirit, parseCoreSpiritDetailed } from './coreSpiritPipeline.ts';
import { validateCoreSpiritIr } from './irContract.ts';
import { CoreSpiritRuntime } from './runtime.ts';
import { normalizeDeclaredType } from './typeSystem.ts';
import { parseCoreSpiritTemporalType, makeCoreSpiritTemporalType, temporalAssignmentCompatible } from './temporalTypes.ts';
import { semanticScalar, semanticTypeCompatible, semanticTypeForDeclaredName } from './semanticTypeSystem.ts';
import { CORE_SPIRIT_LAYER_PROFILES, canUseCapability } from './layeredPlatformContract.ts';
import {
  CORE_SPIRIT_LANGUAGE_DEFINITION,
  CORE_SPIRIT_PROGRAM_GRAMMAR,
  CORE_SPIRIT_LANGUAGE_SYNTAX_POLICIES,
  CORE_SPIRIT_AUTHORING_LEVELS,
  CORE_SPIRIT_LANGUAGE_FEATURES,
  CORE_SPIRIT_TYPE_MODEL,
  CORE_SPIRIT_PROGRAM_EXECUTION_LAYERS,
  getCoreSpiritLanguageFeature,
  validateCoreSpiritLanguageDefinition,
} from './coreSpiritLanguageDefinition.ts';

assert.deepEqual(validateCoreSpiritLanguageDefinition(), []);
assert.equal(CORE_SPIRIT_LANGUAGE_DEFINITION.name, 'CoreSpirit');
assert.equal(CORE_SPIRIT_LANGUAGE_DEFINITION.publicLanguage, 'CoreSpirit');
assert.equal(CORE_SPIRIT_LANGUAGE_DEFINITION.compilerAbi, 'CoreScript');
assert.deepEqual(CORE_SPIRIT_LANGUAGE_DEFINITION.supportedEditions, ['1.0','1.2']);
assert.deepEqual(CORE_SPIRIT_LANGUAGE_DEFINITION.programKinds, ['indicator','automation','prediction','strategy']);
assert.equal(CORE_SPIRIT_AUTHORING_LEVELS.map(level => level.id).join(','), 'beginner,trader,quant,system');
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR, /ProgramHeader/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR, /TypeName/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR, /EditionDirective/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR, /SurfaceLowering/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR, /QualifiedName/);
assert.ok(CORE_SPIRIT_LANGUAGE_FEATURES.some(feature => feature.id === 'prediction-feature-blocks' && feature.status === 'planned'));
assert.ok(CORE_SPIRIT_LANGUAGE_FEATURES.some(feature => feature.id === 'prediction-output-statements' && feature.status === 'planned'));
assert.ok(CORE_SPIRIT_TYPE_MODEL.temporalContainers.includes('confirmed<T>'));
assert.equal(CORE_SPIRIT_TYPE_MODEL.collectionContracts.find(item=>item.name==='Map<K,V>')?.sourceName,'map<K,V>');
assert.ok(CORE_SPIRIT_TYPE_MODEL.temporalTypeContracts.some(item=>item.name==='Forecast<T>'));
assert.deepEqual(CORE_SPIRIT_TYPE_MODEL.temporalQualifierContracts.map(item=>item.name),[
  'historical','current-bar','realtime','confirmed','developing','stateful','intrabar-stateful','external','forecast','optional',
]);
assert.ok(CORE_SPIRIT_TYPE_MODEL.temporalPhases.includes('realtime'));
assert.equal(CORE_SPIRIT_TYPE_MODEL.primitiveContracts.find(item => item.name === 'Bool')?.runtimeName, 'boolean');
assert.equal(CORE_SPIRIT_TYPE_MODEL.primitiveContracts.find(item => item.name === 'Void')?.status, 'planned');
assert.equal(CORE_SPIRIT_TYPE_MODEL.marketValueContracts.find(item => item.name === 'Timestamp')?.semanticAtom, 'time');
assert.deepEqual(CORE_SPIRIT_PROGRAM_EXECUTION_LAYERS, {
  indicator:'script', strategy:'strategy', automation:'automation', prediction:'model', library:'script', script:'script',
});
assert.ok(CORE_SPIRIT_LAYER_PROFILES.automation.capabilities.includes('series'));
assert.ok(CORE_SPIRIT_LAYER_PROFILES.automation.capabilities.includes('indicators'));
assert.equal(canUseCapability('automation', 'series'), true);
assert.equal(CORE_SPIRIT_LAYER_PROFILES.automation.forbidden.includes('direct-broker-api'), true);
assert.equal(normalizeDeclaredType('bool'), 'boolean');
assert.equal(normalizeDeclaredType('price'), 'price');
assert.equal(normalizeDeclaredType('volume'), 'volume');
assert.equal(normalizeDeclaredType('series<price>'), 'series<price>');
assert.equal(normalizeDeclaredType('void'), 'udt:void');
assert.ok(CORE_SPIRIT_TYPE_MODEL.collectionContracts.find(item => item.name === 'Map<K,V>')?.status === 'partial');
assert.ok(CORE_SPIRIT_TYPE_MODEL.temporalTypeContracts.find(item => item.name === 'Optional<T>')?.status === 'planned');

// Expression precedence and associativity are stable CoreSpirit parser contracts.
const precedenceAst = new CoreSpiritParser('let result = 2 + 3 * 4;').parseDetailed();
assert.deepEqual(precedenceAst.diagnostics,[]);
const precedenceExpression = precedenceAst.ast.body[0].expression;
assert.equal(precedenceExpression.type,'binary');
assert.equal(precedenceExpression.operator,'+');
assert.equal(precedenceExpression.right.operator,'*');
const ternaryAst = new CoreSpiritParser('let result = a ? b : c ? d : e;').parseDetailed();
assert.deepEqual(ternaryAst.diagnostics,[]);
assert.equal(ternaryAst.ast.body[0].expression.type,'conditional');
assert.equal(ternaryAst.ast.body[0].expression.whenFalse.type,'conditional');

// Temporal containers are semantically distinct; names alone are not enough.
assert.equal(parseCoreSpiritTemporalType('confirmed<float>')?.phase,'confirmed');
assert.equal(parseCoreSpiritTemporalType('developing<float>')?.phase,'developing');
assert.equal(parseCoreSpiritTemporalType('forecast<float>')?.phase,'forecast');
assert.equal(temporalAssignmentCompatible('confirmed<float>','developing<float>'),false);
assert.equal(temporalAssignmentCompatible('forecast<float>','confirmed<float>'),false);
assert.equal(temporalAssignmentCompatible('state<float>','intrabar<float>'),false);
assert.throws(()=>makeCoreSpiritTemporalType('confirmed','float','developing'),/conflicts with phase/);
assert.equal(makeCoreSpiritTemporalType('forecast','float'),'forecast<float> @forecast');
const confirmedSemantic = semanticTypeForDeclaredName('confirmed<float>');
const developingSemantic = semanticTypeForDeclaredName('developing<float>');
const realtimeSemantic = semanticTypeForDeclaredName('series<float>');
assert.ok(confirmedSemantic && developingSemantic && realtimeSemantic);
assert.equal(semanticTypeCompatible(confirmedSemantic,developingSemantic),false,
  'a developing value must not satisfy a confirmed declaration');
assert.equal(semanticTypeCompatible(developingSemantic,confirmedSemantic),true,
  'a confirmed value is safe to use where a developing value is accepted');
const safeProvenance = semanticScalar('number',{causal:true,lookahead:false});
const unknownProvenance = semanticScalar('number',{causal:undefined,lookahead:undefined});
const futureLeakingProvenance = semanticScalar('number',{causal:false,lookahead:true});
assert.equal(semanticTypeCompatible(safeProvenance,unknownProvenance),false,
  'unknown provenance must not satisfy an explicit causal/no-lookahead contract');
assert.equal(semanticTypeCompatible(safeProvenance,futureLeakingProvenance),false,
  'non-causal/lookahead values must not satisfy a causal declaration');



// const is a semantic invariant, not just a parser alias for let.
const constParsed = new CoreSpiritParser('const answer: int = 42;').parseDetailed();
assert.deepEqual(constParsed.diagnostics,[]);
assert.equal(constParsed.ast.body[0].constant,true);
const validConstant = compileCoreSpirit('indicator "Immutable" { const answer: int = 42; }','language-const-valid');
assert.deepEqual(validConstant.diagnostics.filter(item=>item.severity==='error'),[]);
assert.ok(validConstant.ir);
const reassignedConstant = compileCoreSpirit('indicator "Immutable Violation" { const answer: int = 42; answer := 43; }','language-const-reassignment');
assert.ok(reassignedConstant.diagnostics.some(item=>item.code==='CONST_ASSIGNMENT'));
assert.equal(reassignedConstant.ir,undefined);
const mutableConstant = compileCoreSpirit('indicator "Mutable Const" { const memory: state<float> = 1.0; }','language-const-mutable-state');
assert.ok(mutableConstant.diagnostics.some(item=>item.code==='CONST_MUTABLE_TYPE'));
assert.equal(mutableConstant.ir,undefined);

const programCases = [
  ['indicator', 'Trend Geometry', 'indicator "Trend Geometry" {\n  let fast = ta.ema(close, 20);\n  let slow = ta.ema(close, 50);\n}'],
  ['automation', 'Breakout Monitor', 'automation "Breakout Monitor" {\n  let resistance = high[1];\n  if (close > resistance) {\n    let triggered = true;\n  }\n}'],
  ['prediction', 'NIFTY Direction', 'prediction "NIFTY Direction" {\n  let returns = close / close[1] - 1;\n  let forecast = returns;\n}'],
  ['strategy', 'Trend Strategy', 'strategy "Trend Strategy" {\n  let fast = ta.ema(close, 20);\n  let slow = ta.ema(close, 50);\n  if (fast > slow) {\n    let bullish = true;\n  }\n}'],
];

let sharedPipelineSignature;
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
  const pipelineSignature = compiled.ir.compilerPipeline.stages.join('>');
  if (sharedPipelineSignature === undefined) sharedPipelineSignature = pipelineSignature;
  assert.equal(pipelineSignature, sharedPipelineSignature, 'all four program kinds must use the same compiler/optimizer pipeline');
  assert.equal(compiled.artifact?.abi.magic, 'CSPIRIT');
  assert.equal(compiled.artifact?.abi.version, 2);
  assert.ok(validateCoreSpiritIr(compiled.ir));
  assert.equal(validateCoreSpiritIr({ ...compiled.ir, programKind: 'not-a-program' }), false);
  assert.equal(validateCoreSpiritIr({ ...compiled.ir, programTitle: 42 }), false);
  assert.equal(validateCoreSpiritIr({ ...compiled.ir, programLayer:'automation' }), kind === 'automation');
}


// Every workload shares one parser and one core grammar.
for (const kind of ['indicator','strategy','automation','prediction']) {
  const parsed = new CoreSpiritParser(kind + ' "Grammar Contract" { let value = 1; }').parseDetailed();
  assert.deepEqual(parsed.diagnostics, [], kind + ' grammar must be accepted by the common parser');
  assert.equal(parsed.ast.programKind, kind);
}
const unsupportedNativeSwitch = compileCoreSpirit(
  'indicator "No Native Switch" { let value = switch close { 1 => 2 }; }',
  'language-native-switch-not-supported',
);
assert.ok(unsupportedNativeSwitch.diagnostics.some(item=>item.severity==='error'));
assert.equal(unsupportedNativeSwitch.ir, undefined);

const beginnerSurface = [
  'indicator "Trend Geometry" {',
  '  fast = ema(close, 20)',
  '  slow = ema(close, 50)',
  '  show fast',
  '  show slow',
  '}',
].join('\n');
const beginnerSurfaceResult = compileCoreSpirit(beginnerSurface, 'language-beginner-surface-example');
assert.deepEqual(beginnerSurfaceResult.diagnostics.filter(item => item.severity === 'error'), [],
  beginnerSurfaceResult.diagnostics.map(item => item.message).join('\n'));
assert.equal(beginnerSurfaceResult.ir?.programKind, 'indicator');
assert.equal(beginnerSurfaceResult.ir?.programTitle, 'Trend Geometry');

const compactSource = 'indicator "Compact Program" { let value = close; if (value > 0) { let note = "brace } is text"; } // } comment must not close wrapper\n}';
const compactParsed = parseCoreSpiritDetailed(compactSource);
assert.deepEqual(compactParsed.diagnostics, [], 'compact block must parse with nested braces and quoted/comment braces');
assert.equal(compactParsed.ast.programKind, 'indicator');
assert.equal(compactParsed.ast.programTitle, 'Compact Program');
const compactCompiled = compileCoreSpirit(compactSource, 'language-program-compact');
assert.deepEqual(compactCompiled.diagnostics.filter(item => item.severity === 'error'), [], compactCompiled.diagnostics.map(item => item.message).join('\n'));
assert.equal(compactCompiled.ir?.programKind, 'indicator');
assert.equal(compactCompiled.ir?.programTitle, 'Compact Program');
const indicatorIr = compileCoreSpirit('indicator "IR Validator" { let x = close; }', 'language-ir-validator').ir;
assert.ok(indicatorIr);
assert.equal(validateCoreSpiritIr({ ...indicatorIr, programKind:'script', programLayer:'automation' }), false);
assert.equal(validateCoreSpiritIr({ ...indicatorIr, programKind:'library', programLayer:'strategy' }), false);
const mismatchedPolicy = compileCoreSpirit('strategy "Wrong Lane" { let x = close; }', 'language-program-mismatched-layer', { layer:'script' });
assert.ok(mismatchedPolicy.diagnostics.some(item => item.code === 'PROGRAM_LAYER_MISMATCH'));

const whenSurface = [
  'automation "Crossing Event" {',
  '  let resistance = high[1];',
  '  when close crosses_above resistance {',
  '    alert("Resistance broken");',
  '  }',
  '}',
].join('\n');
const whenCompiled = compileCoreSpirit(whenSurface, 'language-when-brace-snake-case');
assert.deepEqual(whenCompiled.diagnostics.filter(item => item.severity === 'error'), [], whenCompiled.diagnostics.map(item => item.message).join('\n'));
assert.equal(whenCompiled.ir?.programKind, 'automation');
assert.equal(whenCompiled.ir?.programLayer, 'automation');

const automationSource = programCases.find(([kind]) => kind === 'automation')[2];
const automationIr = compileCoreSpirit(automationSource, 'language-program-automation-runtime').ir;
assert.ok(automationIr);
const chartRuntime = new CoreSpiritRuntime({ layer:'script', executionTarget:'chart' });
assert.throws(() => chartRuntime.loadIr(automationIr), /requires the automation execution layer/);
const marketBars = [
  { timestamp:'2026-01-02T09:15:00+05:30', open:100, high:102, low:99, close:101, volume:1000 },
  { timestamp:'2026-01-02T09:20:00+05:30', open:101, high:103, low:100, close:102, volume:1200 },
];
assert.doesNotThrow(() => executeCoreSpirit(
  'strategy "Strategy Runtime" { let current = close; }',
  marketBars,
  'language-strategy-runtime-default-lane',
));
assert.throws(() => executeCoreSpirit(
  'automation "Automation Runtime" { let current = close; }',
  marketBars,
  'language-automation-runtime-conflicting-lane',
  { layer:'script' },
), /requires the automation execution layer/);


const functionProgram = [
  'indicator "Typed Function" {',
  '  fn midpoint(a: float, b: float) -> float {',
  '    return (a + b) / 2;',
  '  }',
  '  let mid = midpoint(1.0, 2.0);',
  '}',
].join('\n');
const functionResult = compileCoreSpirit(functionProgram, 'language-typed-function');
assert.deepEqual(functionResult.diagnostics.filter(item => item.severity === 'error'), [],
  functionResult.diagnostics.map(item => item.message).join('\n'));
assert.equal(functionResult.ir?.programKind, 'indicator');
assert.ok(functionResult.ir);

const recordProgram = new CoreSpiritParser('type PriceRange { high: price; low: price; }').parseDetailed();
assert.deepEqual(recordProgram.diagnostics, []);
assert.equal(recordProgram.ast.body[0]?.type, 'typeDeclaration');

const noHeader = new CoreSpiritParser('let answer = 42;').parseDetailed();
assert.deepEqual(noHeader.diagnostics, []);
assert.equal(noHeader.ast.programKind, undefined);
assert.equal(noHeader.ast.programTitle, undefined);

const missingClose = new CoreSpiritParser('indicator "Missing Close" { let x = 1;').parseDetailed();
assert.ok(missingClose.diagnostics.some(item => item.message.includes('Expected } to close the program declaration')));

const trailing = new CoreSpiritParser('strategy "Bad Tail" { let x = 1; } let y = 2;').parseDetailed();
assert.ok(trailing.diagnostics.some(item => item.message.includes('Unexpected tokens after the program declaration')));

const expectedFeatureStatuses = {
  variables:'implemented',
  constants:'implemented',
  functions:'partial',
  parameters:'implemented',
  'return-values':'implemented',
  'multiple-return-values':'planned',
  tuples:'planned',
  enums:'partial',
  'user-defined-record-types':'partial',
  methods:'partial',
  generics:'partial',
  'interfaces-traits':'planned',
  'conditional-expressions':'implemented',
  'switch-expressions':'planned',
  loops:'implemented',
  iterators:'partial',
  closures:'planned',
  namespaces:'partial',
  'imports-exports':'partial',
  libraries:'partial',
  'error-handling':'planned',
  'type-inference':'implemented',
  'lexical-scope':'partial',
  nullability:'partial',
  'symbol-timeframe-types':'partial',
  'temporal-qualifiers':'partial',
  'external-data-provenance':'partial',
  'prediction-feature-blocks':'planned',
  'prediction-output-statements':'planned',
  'strategy-position-actions':'partial',
  'operator-overloading':'deferred',
};
assert.deepEqual(
  Object.fromEntries(CORE_SPIRIT_LANGUAGE_FEATURES.map(feature=>[feature.id,feature.status])),
  expectedFeatureStatuses,
  'the public maturity matrix must describe the actual CoreSpirit frontend/runtime boundary',
);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR,/Edition12Statement/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR,/FunctionDeclaration/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR,/ImportDeclaration/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR,/CompactPlot/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR,/Hexadecimal/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR,/EscapeSequence/);
assert.match(CORE_SPIRIT_PROGRAM_GRAMMAR,/CrossingOperator/);
assert.match(CORE_SPIRIT_LANGUAGE_SYNTAX_POLICIES.functions,/pure local expressions/);
assert.match(CORE_SPIRIT_LANGUAGE_SYNTAX_POLICIES.editions['1.2'],/value-only enums/);
assert.match(CORE_SPIRIT_LANGUAGE_SYNTAX_POLICIES.lowering.imports,/registered standard-library/);

console.log('CORESPIRIT_LANGUAGE_DEFINITION_CONTRACT_OK');
