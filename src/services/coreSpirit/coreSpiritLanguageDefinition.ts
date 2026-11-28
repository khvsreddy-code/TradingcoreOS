import { CORE_SPIRIT_AUTHORING_LEVELS as RUNTIME_AUTHORING_LEVELS } from './coreSpiritExecutionModel';

/**
 * Versioned source-language contract for CoreSpirit.
 *
 * Public language: CoreSpirit.
 * Existing serialized IR ABI: CoreScript v1 (kept stable for compatibility).
 */
export const CORE_SPIRIT_LANGUAGE_DEFINITION = Object.freeze({
  name: 'CoreSpirit',
  compilerAbi: 'CoreScript',
  languageVersion: 1,
  currentEdition: '1.2',
  programKinds: Object.freeze(['indicator', 'automation', 'prediction', 'strategy'] as const),
  compatibilityProgramKinds: Object.freeze(['script', 'library'] as const),
  compilerPipeline: Object.freeze(['lexer','parser','name-resolution','semantic-analysis','typed-ir','optimizer','execution-planner','runtime'] as const),
  invariant: 'Program kind selects declarations, capabilities and execution policy; it never selects a different grammar or compiler.',
});

export const CORE_SPIRIT_PROGRAM_GRAMMAR = [
  'Program ::= EditionDirective? CapabilityRequirement* (ProgramBlock | LegacyStatement*) EOF',
  'ProgramBlock ::= ProgramHeader Block',
  'ProgramHeader ::= "indicator" String | "automation" String | "prediction" String | "strategy" String',
  'Block ::= "{" Statement* "}"',
  'Statement ::= VariableDeclaration | FunctionDeclaration | TypeDeclaration | EventDeclaration | ConditionalStatement | WhenStatement | WhileStatement | ForEachStatement | ReturnStatement | AssignmentStatement | ExpressionStatement | "break" | "continue"',
  'VariableDeclaration ::= ("let" | "const") Identifier (":" TypeName)? "=" Expression Terminator?',
  'FunctionDeclaration ::= "fn" Identifier "(" ParameterList? ")" "->" TypeName Block',
  'ParameterList ::= Parameter ("," Parameter)*',
  'Parameter ::= Identifier ":" TypeName',
  'TypeDeclaration ::= "type" Identifier "{" Field* "}"',
  'Field ::= Identifier ":" TypeName (";" | newline)',
  'EventDeclaration ::= "on" QualifiedName ("(" ArgumentList? ")")? Block',
  'ConditionalStatement ::= "if" "(" Expression ")" Block ("else" Block)?',
  'WhenStatement ::= "when" Expression Block | "when" Expression ":" IndentedBlock',
  'WhileStatement ::= "while" "(" Expression ")" Block',
  'ForEachStatement ::= "for" "(" ("let")? Identifier "in" Expression ")" Block',
  'AssignmentStatement ::= Identifier ":=" Expression Terminator?',
  'ReturnStatement ::= "return" Expression Terminator?',
  'ExpressionStatement ::= Expression Terminator?',
  'Terminator ::= ";" | newline',
  'TypeName ::= QualifiedName ("<" TypeName ("," TypeName)* ">")?',
  'Expression ::= Conditional',
  'Conditional ::= OrExpression ("?" Expression ":" Expression)?',
  'OrExpression ::= AndExpression ("or" AndExpression)*',
  'AndExpression ::= EqualityExpression ("and" EqualityExpression)*',
  'EqualityExpression ::= ComparisonExpression (("==" | "!=") ComparisonExpression)*',
  'ComparisonExpression ::= AdditiveExpression (("<" | "<=" | ">" | ">=") AdditiveExpression)*',
  'AdditiveExpression ::= MultiplicativeExpression (("+" | "-") MultiplicativeExpression)*',
  'MultiplicativeExpression ::= UnaryExpression (("*" | "/" | "%") UnaryExpression)*',
  'UnaryExpression ::= ("!" | "+" | "-") UnaryExpression | Postfix',
  'Postfix ::= Primary (Index | Member | Call)*',
  'Primary ::= Number | String | Boolean | "null" | Identifier | "(" Expression ")" | ArrayLiteral | MapLiteral',
  'ArrayLiteral ::= "[" (Expression ("," Expression)*)? "]"',
  'MapLiteral ::= "{" (MapEntry ("," MapEntry)*)? "}"',
  'MapEntry ::= (Identifier | String) ":" Expression',
  'LegacyStatement ::= Statement | SurfaceShow | SurfaceWhen',
  'SurfaceShow ::= "show" Expression',
  'SurfaceWhen ::= "when" Expression ":" IndentedBlock | "when" Expression Block',
].join('\\n');

export const CORE_SPIRIT_PROGRAM_EXECUTION_LAYERS = Object.freeze({
  indicator:'script',
  strategy:'strategy',
  automation:'automation',
  prediction:'model',
  library:'script',
  script:'script',
} as const);

export const CORE_SPIRIT_AUTHORING_LEVELS = Object.freeze([
  Object.freeze({ id: 'beginner', goal: 'Readable declarations, basic conditions, built-in market series and visual output.', features: Object.freeze(['let','expressions','if','show','built-in-series']) }),
  Object.freeze({ id: 'trader', goal: 'Indicators, symbols, timeframes, multi-timeframe data and broker-neutral strategy intent.', features: Object.freeze(['market-data','multi-symbol','multi-timeframe','strategy','order-intents']) }),
  Object.freeze({ id: 'quant', goal: 'Statistics, structured numerical types, models, experiments and research workflows.', features: Object.freeze(['statistics','arrays','matrices','tensors','models','research']) }),
  Object.freeze({ id: 'system', goal: 'Event processing, controlled automation, external modules, custom kernels and deployment.', features: Object.freeze(['events','automation','capabilities','modules','custom-kernels','deployment']) }),
] as const);

export type CoreSpiritLanguageFeatureStatus = 'implemented' | 'partial' | 'planned' | 'deferred';
export type CoreSpiritLanguageFeatureContract = Readonly<{ id: string; status: CoreSpiritLanguageFeatureStatus; semantics: string }>;

/** A token or AST node alone is not evidence that a feature is implemented end-to-end. */
export const CORE_SPIRIT_LANGUAGE_FEATURES: readonly CoreSpiritLanguageFeatureContract[] = Object.freeze([
  { id: 'variables', status: 'implemented', semantics: 'let declarations infer a type or validate an explicit type; assignment uses := for stateful values.' },
  { id: 'constants', status: 'partial', semantics: 'const is parsed, but immutable binding enforcement is not yet a complete semantic invariant.' },
  { id: 'functions', status: 'implemented', semantics: 'Named functions have typed parameters and return types and are desugared before canonical IR lowering.' },
  { id: 'parameters', status: 'implemented', semantics: 'Function parameters use explicit TypeName declarations.' },
  { id: 'return-values', status: 'implemented', semantics: 'A function returns one typed expression; bare and multiple returns are not part of this grammar yet.' },
  { id: 'multiple-return-values', status: 'planned', semantics: 'Tuple-valued returns require tuple types, destructuring and IR/runtime contracts.' },
  { id: 'tuples', status: 'planned', semantics: 'Tuple literals, tuple types and destructuring are not yet in the CoreScript AST.' },
  { id: 'enums', status: 'planned', semantics: 'Enums require nominal identity, exhaustive matching and stable serialization.' },
  { id: 'user-defined-record-types', status: 'partial', semantics: 'type declarations parse named fields; constructors, visibility and full nominal guarantees need completion.' },
  { id: 'methods', status: 'partial', semantics: 'Member calls exist for registered namespaces/collections; user-defined method declarations and dispatch do not.' },
  { id: 'generics', status: 'partial', semantics: 'Nested generic type syntax parses; generic parameter binding, constraints and monomorphization are incomplete.' },
  { id: 'interfaces-traits', status: 'planned', semantics: 'No trait/interface declaration or coherence/implementation rules are in the current grammar.' },
  { id: 'conditional-expressions', status: 'implemented', semantics: 'Conditional expressions are right-associative and lower through the shared expression pipeline.' },
  { id: 'switch-expressions', status: 'partial', semantics: 'Switch expression parsing is currently Pine-frontend-specific, not yet a native CoreSpirit construct.' },
  { id: 'loops', status: 'implemented', semantics: 'Host-bounded while and foreach constructs lower to explicit control-flow IR.' },
  { id: 'iterators', status: 'partial', semantics: 'Foreach supports current collection lowering; a user-defined iterator protocol is not available.' },
  { id: 'closures', status: 'planned', semantics: 'Captures, lifetime rules and closure conversion are not implemented.' },
  { id: 'namespaces', status: 'partial', semantics: 'Built-in namespace/member calls exist; user-defined namespace declarations are not complete.' },
  { id: 'imports-exports', status: 'planned', semantics: 'Import resolution, visibility, cycles and reproducible dependency locking belong to the shared module system.' },
  { id: 'libraries', status: 'partial', semantics: 'A library program kind exists for compatibility; publishable/importable source modules are not complete.' },
  { id: 'error-handling', status: 'planned', semantics: 'Result/Option propagation and recoverable error semantics are not yet in the grammar.' },
  { id: 'type-inference', status: 'implemented', semantics: 'Expression inference and semantic series/domain qualifiers feed the typed IR environment.' },
  { id: 'lexical-scope', status: 'partial', semantics: 'Block/function scopes are recognized, but shadowing, lifetime and capture rules need a dedicated conformance suite.' },
  { id: 'operator-overloading', status: 'deferred', semantics: 'Not included in v1: built-in domain-safe operators are preferred over user-defined overload resolution.' },
]);

export const CORE_SPIRIT_LANGUAGE_SEMANTICS = Object.freeze({
  programs: Object.freeze({
    sharedPipeline: Object.freeze(['lexer','parser','AST','name-resolution','semantic-analysis','typed-IR','optimizer','execution-planner','runtime']),
    executionLayers: CORE_SPIRIT_PROGRAM_EXECUTION_LAYERS,
    defaultProgram: 'script',
    declarationRule: 'A declared program kind owns its execution layer; an explicit conflicting layer is a compile error.',
    compatibility: 'Unwrapped source remains a legacy script program and uses the same pipeline.',
  }),
  declarations: Object.freeze({
    let: 'A local declaration is initialized once; unqualified types are inferred from the initializer.',
    const: 'Parsed as a declaration but immutable assignment rejection is not yet complete.',
    assignment: 'The := operator updates a stateful binding; ordinary = is reserved for declarations/surface shorthand.',
    functions: 'Named functions use typed parameters and a declared return type; function bodies desugar before IR lowering.',
    return: 'Exactly one expression value is supported by the current function ABI.',
  }),
  temporalValues: Object.freeze({
    scalar: 'One value independent of a bar-indexed series.',
    series: 'A value aligned to a symbol/timeframe bar sequence; indexing uses historical bar offsets.',
    currentBar: 'A field read without an offset resolves against the active bar revision.',
    historical: 'Previously observed bars are immutable inputs to a given replay revision.',
    developing: 'The active unconfirmed bar can change and causes deterministic revision rollback/recompute.',
    realtime: 'Live host observations are revisioned; side effects must pass host execution policy.',
    confirmed: 'A finalised bar value; live order intents are gated on confirmation policy.',
    state: 'Persistent state survives bar transitions and is checkpointed.',
    intrabar: 'Intrabar state has separate storage/rollback semantics from persistent state.',
    forecast: 'A model-produced future value; it is not an observed market input and must not flow backward into historical features.',
    externalData: 'External symbol/timeframe data is host-resolved, capability-checked and causality-checked.',
  }),
  effects: Object.freeze({
    pureExpressions: 'Expressions and numerical functions may be evaluated by the shared runtime without host side effects.',
    visuals: 'show/plot surface declarations lower to canonical visual emission contracts.',
    orderIntents: 'Strategies create broker-neutral intent records; broker credentials and direct broker APIs are unavailable to source programs.',
    automation: 'Automation requires an automation execution layer and explicit host capabilities for privileged effects.',
    prediction: 'Prediction programs execute in the model lane and consume validated model/data artifacts through host resolvers.',
  }),
  collections: Object.freeze({
    arrays: 'Array elements are homogeneous at the semantic type boundary; indexing is bounds-checked by collection runtime.',
    maps: 'Map keys and values have typed contracts; key iteration order is not a language guarantee.',
    matricesTensors: 'Shape is part of the semantic contract; implicit broadcasting is rejected in numeric semantic operations.',
  }),
} as const);

export const CORE_SPIRIT_TYPE_MODEL = Object.freeze({  primitiveContracts: Object.freeze([
    Object.freeze({ name:'Int', sourceName:'int', runtimeName:'int', status:'implemented' as const }),
    Object.freeze({ name:'Float', sourceName:'float', runtimeName:'float', status:'implemented' as const }),
    Object.freeze({ name:'Bool', sourceName:'bool', runtimeName:'boolean', aliases:Object.freeze(['boolean']), status:'implemented' as const }),
    Object.freeze({ name:'String', sourceName:'string', runtimeName:'string', status:'implemented' as const }),
    Object.freeze({ name:'Color', sourceName:'color', runtimeName:'color', status:'partial' as const }),
    Object.freeze({ name:'Void', sourceName:'void', runtimeName:'udt:void', status:'planned' as const }),
    Object.freeze({ name:'Null', sourceName:'null', runtimeName:'null', status:'partial' as const }),
  ]),
  marketValueContracts: Object.freeze([
    Object.freeze({ name:'Price', sourceName:'price', semanticAtom:'price', status:'implemented' as const }),
    Object.freeze({ name:'Volume', sourceName:'volume', semanticAtom:'volume', status:'implemented' as const }),
    Object.freeze({ name:'Timestamp', sourceName:'time', semanticAtom:'time', status:'implemented' as const }),
    Object.freeze({ name:'Symbol', sourceName:'market<T>', semanticAtom:'market:ref', status:'partial' as const }),
    Object.freeze({ name:'Timeframe', sourceName:'timeframe<T>', semanticAtom:'timeframe:ref', status:'partial' as const }),
    Object.freeze({ name:'Bar', sourceName:'bar<T>', semanticAtom:'bar', status:'partial' as const }),
  ]),
  executionValueContracts: Object.freeze([
    Object.freeze({ name:'Event<T>', sourceName:'event<T>', status:'partial' as const }),
    Object.freeze({ name:'Signal<T>', sourceName:'signal-intent', status:'implemented' as const }),
    Object.freeze({ name:'OrderIntent', sourceName:'order-intent', status:'implemented' as const }),
    Object.freeze({ name:'Position', sourceName:'position<T>', status:'partial' as const }),
    Object.freeze({ name:'Prediction<T>', sourceName:'prediction<T>', status:'partial' as const }),
    Object.freeze({ name:'Model<T>', sourceName:'model<T>', status:'partial' as const }),
  ]),

  primitives: Object.freeze(['int','float','number','bool','boolean','string','color','null','probability','void']),
  market: Object.freeze(['Price','Volume','Timestamp','Symbol','Timeframe','Bar','price','volume','time','market<T>','bar<T>','tick<T>','orderbook<T>','footprint<T>','portfolio<T>','position<T>','order<T>','fill<T>']),
  collections: Object.freeze(['array<T>','map<K,V>','vector<T>','matrix<T>','tensor<T>']),
  temporalContainers: Object.freeze(['scalar<T>','series<T>','window<T>','state<T>','intrabar<T>','event<T>','snapshot<T>','stream<T>','confirmed<T>','developing<T>','forecast<T>']),
  temporalPhases: Object.freeze(['historical','confirmed','developing','realtime','forecast']),
  modelAndExecution: Object.freeze(['model<T>','prediction<T>','distribution<T>','feature<T>','featureSet<T>','dataset<T>','trainingData<T>','experiment<T>','modelArtifact<T>','signal-intent','order-intent']),
  invariants: Object.freeze([
    'Series and scalar values are distinct; scalar-to-series broadcast is explicit in semantic typing.',
    'Price, volume, time and duration carry domain meaning and cannot be mixed as arbitrary dimensionless numbers.',
    'Historical/confirmed/developing/realtime/forecast are temporal phases, not interchangeable labels.',
    'Persistent state and intrabar state have different rollback/storage semantics.',
    'Market references retain symbol/timeframe identity; external data access remains capability- and causality-checked.',
    'Prediction and forecast values are not observed market values and cannot silently flow into historical inputs.',
  ]),
} as const);

export function getCoreSpiritLanguageFeature(id: string): CoreSpiritLanguageFeatureContract | undefined {
  return CORE_SPIRIT_LANGUAGE_FEATURES.find(feature => feature.id === id);
}

export function validateCoreSpiritLanguageDefinition(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const feature of CORE_SPIRIT_LANGUAGE_FEATURES) {
    if (ids.has(feature.id)) errors.push('Duplicate language feature: ' + feature.id);
    ids.add(feature.id);
    if (!feature.semantics.trim()) errors.push('Language feature is missing semantic rules: ' + feature.id);
  }
  if (CORE_SPIRIT_AUTHORING_LEVELS.map(level => level.id).join(',') !== 'beginner,trader,quant,system') errors.push('Authoring levels must remain ordered beginner, trader, quant, system.');
  if (CORE_SPIRIT_AUTHORING_LEVELS.map(level => level.id).join(',') !== RUNTIME_AUTHORING_LEVELS.join(',')) errors.push('Language authoring levels diverge from runtime policy levels.');
  if (CORE_SPIRIT_LANGUAGE_DEFINITION.programKinds.join(',') !== 'indicator,automation,prediction,strategy') errors.push('The four primary CoreSpirit program kinds changed without a language-version review.');
  return errors;
}
