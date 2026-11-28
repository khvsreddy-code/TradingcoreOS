import assert from 'node:assert/strict';
import { CoreSpiritParser } from './parser.ts';
import { CORE_SPIRIT_LAYER_PROFILES } from './layeredPlatformContract.ts';
import { CORE_SPIRIT_AUTHORING_SURFACES } from './languageParity.ts';
import { compileCoreSpirit } from './coreSpiritPipeline.ts';
import { serializeCoreSpiritIr, validateCoreSpiritIr } from './irContract.ts';
import {
  CORE_SPIRIT_LANGUAGE_DEFINITION,
  CORE_SPIRIT_FINAL_LANGUAGE_GRAMMAR,
  CORE_SPIRIT_LANGUAGE_DESIGN_REVISION,
  CORE_SPIRIT_LANGUAGE_DESIGN_RULES,
  CORE_SPIRIT_FINAL_TYPE_SYSTEM,
  CORE_SPIRIT_LANGUAGE_REQUIRED_CONSTRUCTS,
  CORE_SPIRIT_LANGUAGE_CONSTRUCT_SEMANTICS,
  CORE_SPIRIT_LANGUAGE_FEATURES,
  CORE_SPIRIT_TYPE_MODEL,
  validateCoreSpiritLanguageDefinition,
} from './coreSpiritLanguageDefinition.ts';

assert.deepEqual(validateCoreSpiritLanguageDefinition(), []);
assert.equal(CORE_SPIRIT_LANGUAGE_DESIGN_REVISION, 'core-spirit-language-design/1');
assert.equal(CORE_SPIRIT_LANGUAGE_DEFINITION.name, 'CoreSpirit');
assert.deepEqual(CORE_SPIRIT_LANGUAGE_DEFINITION.programKinds, [
  'indicator', 'automation', 'prediction', 'strategy',
]);

// Program kinds share the language/library but receive different host policies.
assert.deepEqual(CORE_SPIRIT_LANGUAGE_DESIGN_RULES.programCapabilities, {
  indicator: CORE_SPIRIT_LAYER_PROFILES.script.capabilities,
  automation: CORE_SPIRIT_LAYER_PROFILES.automation.capabilities,
  prediction: CORE_SPIRIT_LAYER_PROFILES.model.capabilities,
  strategy: CORE_SPIRIT_LAYER_PROFILES.strategy.capabilities,
});
assert.equal(CORE_SPIRIT_LANGUAGE_DESIGN_RULES.standardLibrary.sharedAcrossPrograms, true);
assert.match(CORE_SPIRIT_LANGUAGE_DESIGN_RULES.standardLibrary.capabilityRule, /gate effects/);


// The target grammar has a production for every requested language family.
// It is intentionally distinct from the currently accepted v1.2 grammar.
for (const production of [
  'VariableDeclaration', 'SurfaceVariableDeclaration', 'TupleBinding', 'FunctionDeclaration', 'ReturnStatement',
  'TupleExpression', 'TupleType', 'EnumDeclaration', 'TypeDeclaration',
  'ImplementationDeclaration', 'TraitDeclaration', 'ConditionalExpression',
  'SwitchStatement', 'SwitchExpression', 'WhileStatement', 'ForEachStatement',
  'ClosureExpression', 'NamespaceDeclaration', 'ImportDeclaration', 'PlotOptions',
  'ExportDeclaration', 'LibraryModule', 'ErrorPropagationStatement',
  'TypeParameters', 'PredictionFeatureBlock', 'PredictionOutputStatement',
  'StrategyAction', 'EventHandler',
]) {
  assert.ok(
    CORE_SPIRIT_FINAL_LANGUAGE_GRAMMAR.includes(production),
    'final grammar must define ' + production,
  );
}

// Grammar closure: every named nonterminal used on a production right-hand
// side must itself have a production. This catches missing grammar fragments.
const grammarProductions = new Set(
  [...CORE_SPIRIT_FINAL_LANGUAGE_GRAMMAR.matchAll(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*::=/gm)]
    .map(match => match[1]),
);
const grammarRightHandSide = CORE_SPIRIT_FINAL_LANGUAGE_GRAMMAR
  .split('\n')
  .map(line => line.replace(/^\s*[A-Za-z][A-Za-z0-9_]*\s*::=/, ''))
  .join('\n')
  .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
const referencedNonterminals = new Set(
  [...grammarRightHandSide.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)].map(match => match[0]),
);
for (const symbol of referencedNonterminals) {
  assert.ok(grammarProductions.has(symbol), 'undefined grammar nonterminal: ' + symbol);
}

// The feature maturity catalogue must cover every required construct. Planned
// syntax remains design-only until parser, semantic analysis, lowering and VM
// contracts are implemented; a grammar production is not runtime evidence.
const statusById = new Map(CORE_SPIRIT_LANGUAGE_FEATURES.map(item => [item.id, item.status]));
for (const id of CORE_SPIRIT_LANGUAGE_REQUIRED_CONSTRUCTS) {
  assert.ok(statusById.has(id), 'missing maturity status for ' + id);
  const feature = CORE_SPIRIT_LANGUAGE_FEATURES.find(item => item.id === id);
  assert.ok(feature?.semantics.trim(), 'missing maturity semantics for ' + id);
  assert.ok(CORE_SPIRIT_LANGUAGE_CONSTRUCT_SEMANTICS[id]?.trim(), 'missing normative semantics for ' + id);
}
assert.equal(statusById.get('multiple-return-values'), 'planned');
assert.equal(statusById.get('tuples'), 'planned');
assert.equal(statusById.get('interfaces-traits'), 'planned');
assert.equal(statusById.get('closures'), 'planned');
assert.equal(statusById.get('error-handling'), 'planned');
assert.equal(statusById.get('operator-overloading'), 'deferred');

// One type vocabulary, with orthogonal phase, provenance, storage and
// availability axes. Check required public names and type-system invariants.
for (const typeName of ['Int','Float','Bool','String','Color','Void']) {
  assert.ok(CORE_SPIRIT_FINAL_TYPE_SYSTEM.primitiveTypes.includes(typeName));
}
for (const typeName of ['Bar','Price','Volume','Timestamp','Symbol','Timeframe']) {
  assert.ok(CORE_SPIRIT_FINAL_TYPE_SYSTEM.marketTypes.includes(typeName));
}
for (const typeName of ['Array<T>','Map<K,V>','Matrix<T>','Tensor<T>']) {
  assert.ok(CORE_SPIRIT_FINAL_TYPE_SYSTEM.collectionTypes.includes(typeName));
}
for (const typeName of ['Event<T>','Signal<T>','OrderIntent','Position','Prediction<T>','Model<T>']) {
  assert.ok(CORE_SPIRIT_FINAL_TYPE_SYSTEM.executionTypes.includes(typeName));
}
assert.ok(CORE_SPIRIT_FINAL_TYPE_SYSTEM.errorTypes.includes('Result<T,E>'));
assert.ok(CORE_SPIRIT_FINAL_TYPE_SYSTEM.optionalTypes.includes('Option<T>'));
assert.equal(CORE_SPIRIT_FINAL_TYPE_SYSTEM.maturity, CORE_SPIRIT_TYPE_MODEL);
assert.equal(CORE_SPIRIT_FINAL_TYPE_SYSTEM.temporalConstructors.find(item=>item.name==='Confirmed<T>')?.sourceName,'confirmed<T>');
for (const typeName of [
  'Series<T>','Historical<T>','CurrentBar<T>','Realtime<T>','Confirmed<T>',
  'Developing<T>','State<T>','Intrabar<T>','External<T>','Forecast<T>','Option<T>',
]) {
  assert.ok(
    CORE_SPIRIT_FINAL_TYPE_SYSTEM.temporalConstructors.some(item => item.name === typeName),
    'missing temporal/domain constructor ' + typeName,
  );
}
assert.ok(CORE_SPIRIT_FINAL_TYPE_SYSTEM.invariants.some(item => item.includes('Forecast')));
assert.ok(CORE_SPIRIT_FINAL_TYPE_SYSTEM.invariants.some(item => item.includes('symbol and timeframe')));
assert.ok(CORE_SPIRIT_FINAL_TYPE_SYSTEM.operators.userDefinedOverloading.includes('Excluded'));

// Each authoring level and workload uses the same parser/compiler/IR contract.
// Only the program declaration and compiler-enforced execution lane differ.
const cases = [
  ['indicator', 'Trend Geometry', 'indicator "Trend Geometry" { let value = ta.ema(close, 20); }'],
  ['automation', 'Breakout Monitor', 'automation "Breakout Monitor" { let value = ta.ema(close, 20); }'],
  ['prediction', 'NIFTY Direction', 'prediction "NIFTY Direction" { let value = ta.ema(close, 20); }'],
  ['strategy', 'Trend Strategy', 'strategy "Trend Strategy" { let value = ta.ema(close, 20); }'],
];
let pipelineStages;
for (const [kind, title, source] of cases) {
  const parsed = new CoreSpiritParser(source).parseDetailed();
  assert.deepEqual(parsed.diagnostics, [], kind + ' must parse with the shared parser');
  assert.equal(parsed.ast.programKind, kind);
  assert.equal(parsed.ast.programTitle, title);

  const compiled = compileCoreSpirit(source, 'final-language-' + kind);
  const errors = compiled.diagnostics.filter(item => item.severity === 'error');
  assert.deepEqual(errors, [], kind + ' compile errors: ' + errors.map(item => item.message).join('\n'));
  assert.ok(compiled.ir, kind + ' must lower to typed CoreSpirit IR');
  assert.ok(validateCoreSpiritIr(compiled.ir), kind + ' produced invalid CoreSpirit IR');
  assert.equal(compiled.ir.programKind, kind);
  assert.equal(compiled.ir.language, 'CoreScript');
  assert.equal(compiled.ir.languageVersion, 1);
  assert.equal(compiled.ir.programLayer,
    kind === 'indicator' ? 'script' :
    kind === 'automation' ? 'automation' :
    kind === 'prediction' ? 'model' : 'strategy');

  const stages = compiled.ir.compilerPipeline.stages.join('>');
  pipelineStages ??= stages;
  assert.equal(stages, pipelineStages, 'program kind must not select a separate compiler pipeline');

  const serialized = serializeCoreSpiritIr(compiled.ir);
  const decoded = JSON.parse(serialized);
  assert.equal(decoded.version, 1);
  assert.equal(decoded.programKind, kind);
  assert.equal(decoded.sourceId, 'final-language-' + kind);
}

// The canonical IR serializer must never emit JavaScript's bare undefined
// token. Object fields follow JSON omission semantics; array holes become null.
const serializationBase = compileCoreSpirit(
  'indicator "Serialization Probe" { let value = close; }',
  'final-language-serialization-probe',
).ir;
assert.ok(serializationBase);
const serializationProbe = {
  ...serializationBase,
  omittedUndefined: undefined,
  arrayUndefined: [undefined],
};
const serializationProbeJson = serializeCoreSpiritIr(serializationProbe);
const serializationProbeValue = JSON.parse(serializationProbeJson);
assert.equal(Object.hasOwn(serializationProbeValue, 'omittedUndefined'), false);
assert.deepEqual(serializationProbeValue.arrayUndefined, [null]);

// The authoring model explicitly separates a guided surface from compiler
// identity. Every level is bound to the same frontend, AST, compiler and runtime.
const authoringPipelines = ['beginner','trader','quant','system'].map(level => CORE_SPIRIT_AUTHORING_SURFACES[level]);
for (const key of ['parser','ast','compiler','runtime']) {
  assert.equal(new Set(authoringPipelines.map(item => item[key])).size, 1,
    'all authoring levels must share the same ' + key);
}
for (const level of ['beginner','trader','quant','system']) {
  const policy = CORE_SPIRIT_LANGUAGE_DESIGN_RULES.authoringLevels[level];
  assert.ok(policy && policy.length > 20, 'missing authoring contract for ' + level);
}
assert.match(CORE_SPIRIT_FINAL_LANGUAGE_GRAMMAR, /FeatureDeclaration\s+::= Identifier \(":" Type\)\? \("=" Expression\)\? Terminator/);
assert.match(CORE_SPIRIT_LANGUAGE_CONSTRUCT_SEMANTICS['surface-declarations'], /same let AST\/IR/);
assert.match(CORE_SPIRIT_LANGUAGE_DESIGN_RULES.effects.capabilityChecking, /runtime/);
assert.match(CORE_SPIRIT_LANGUAGE_DESIGN_RULES.ir.execution, /validated IR only/);

console.log('CORESPIRIT_FINAL_LANGUAGE_DESIGN_CONTRACT_OK');
