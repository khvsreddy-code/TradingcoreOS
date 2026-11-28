import { CORE_SPIRIT_AUTHORING_LEVELS as RUNTIME_AUTHORING_LEVELS } from './coreSpiritExecutionModel';

/**
 * Versioned source-language contract for CoreSpirit.
 *
 * Public language: CoreSpirit.
 * Existing serialized IR ABI: CoreScript v1 (kept stable for compatibility).
 */
export const CORE_SPIRIT_LANGUAGE_DEFINITION = Object.freeze({
  name: 'CoreSpirit',
  publicLanguage: 'CoreSpirit',
  compilerAbi: 'CoreScript',
  languageVersion: 1,
  currentEdition: '1.2',
  supportedEditions: Object.freeze(['1.0', '1.2'] as const),
  programKinds: Object.freeze(['indicator', 'automation', 'prediction', 'strategy'] as const),
  compatibilityProgramKinds: Object.freeze(['script', 'library'] as const),
  compilerPipeline: Object.freeze(['lexer','parser','name-resolution','semantic-analysis','typed-ir','optimizer','execution-planner','runtime'] as const),
  invariant: 'Program kind selects declarations, capabilities and execution policy; it never selects a different grammar or compiler.',
  surfaceInvariant: 'Edition-specific surface syntax is normalized into one CoreSpirit AST before name resolution, semantic analysis, typed IR and optimization.',
});

/**
 * Normative CoreSpirit source grammar.
 *
 * Edition-specific conveniences are normalized into the same CoreSpirit AST
 * before name resolution, semantic analysis and lowering. This describes the
 * public source language, not its internal lexer tokens.
 */
/**
 * The final CoreSpirit source design. This is the language target, not a claim
 * that every production is already accepted by the v1.2 parser. The accepted
 * grammar remains CORE_SPIRIT_PROGRAM_GRAMMAR; CORE_SPIRIT_LANGUAGE_FEATURES
 * is the executable maturity gate for every construct below.
 */
export const CORE_SPIRIT_LANGUAGE_DESIGN_REVISION = 'core-spirit-language-design/1' as const;

export const CORE_SPIRIT_FINAL_LANGUAGE_GRAMMAR = String.raw`
SourceFile              ::= EditionDirective? CapabilityRequirement* Module EOF
EOF                     ::= end-of-input
Module                  ::= ProgramModule | LibraryModule
ProgramModule           ::= ProgramHeader Block
ProgramHeader           ::= ProgramKind String
ProgramKind             ::= "indicator" | "automation" | "prediction" | "strategy"
LibraryModule           ::= "library" String Block
EditionDirective        ::= "edition@" Version
CapabilityRequirement  ::= "requires" QualifiedName ("," QualifiedName)*

Block                   ::= "{" Statement* "}"
Statement               ::= ImportDeclaration
                          | ExportDeclaration
                          | NamespaceDeclaration
                          | TypeDeclaration
                          | EnumDeclaration
                          | TraitDeclaration
                          | ImplementationDeclaration
                          | FunctionDeclaration
                          | VariableDeclaration
                          | SurfaceVariableDeclaration
                          | TupleBinding
                          | Assignment
                          | IfStatement
                          | SwitchStatement
                          | WhileStatement
                          | ForEachStatement
                          | BreakStatement
                          | ContinueStatement
                          | ReturnStatement
                          | ErrorPropagationStatement
                          | EventHandler
                          | PredictionFeatureBlock
                          | PredictionOutputStatement
                          | StrategyAction
                          | SurfaceStatement
                          | ExpressionStatement

VariableDeclaration    ::= ("let" | "const") Identifier TypeAnnotation? "=" Expression Terminator
SurfaceVariableDeclaration
                        ::= Identifier TypeAnnotation? "=" Expression Terminator
TupleBinding           ::= ("let" | "const") "(" Identifier ("," Identifier)+ ")" "=" Expression Terminator
Assignment             ::= Identifier ":=" Expression Terminator
TypeAnnotation         ::= ":" Type
FunctionDeclaration    ::= "fn" Identifier TypeParameters? "(" ParameterList? ")" "->" ReturnType Block
ParameterList          ::= Parameter ("," Parameter)* ","?
Parameter              ::= Identifier ":" Type ("=" Expression)?
ReturnType             ::= Type | "(" Type ("," Type)+ ")"
ReturnStatement        ::= "return" Expression? Terminator
TypeDeclaration        ::= "type" Identifier TypeParameters? "{" FieldDeclaration* "}"
FieldDeclaration       ::= Identifier ":" Type Terminator?
EnumDeclaration        ::= "enum" Identifier "{" EnumMember ("," EnumMember)* ","? "}"
EnumMember             ::= Identifier ("=" (String | Number))?
TraitDeclaration       ::= "trait" Identifier TypeParameters? "{" TraitMember* "}"
TraitMember            ::= FunctionSignature Terminator
FunctionSignature      ::= "fn" Identifier TypeParameters? "(" ParameterList? ")" "->" ReturnType
ImplementationDeclaration
                        ::= "impl" Type ("for" Type)? "{" FunctionDeclaration* "}"
NamespaceDeclaration   ::= "namespace" QualifiedName Block
ImportDeclaration      ::= "import" ImportBindings "from" String
ImportBindings         ::= ImportBinding | "{" ImportBinding ("," ImportBinding)* "}"
ImportBinding          ::= Identifier ("as" Identifier)?
ExportDeclaration      ::= "export" (FunctionDeclaration | TypeDeclaration | EnumDeclaration | TraitDeclaration | NamespaceDeclaration)
EventHandler           ::= "on" QualifiedName ("(" ArgumentList? ")")? Block
                          | "when" Expression ("crosses_above" | "crosses_below" Expression)? Block
IfStatement            ::= "if" "(" Expression ")" Block ("else" Block)?
SwitchStatement        ::= "switch" "(" Expression ")" "{" SwitchArm+ DefaultArm? "}"
SwitchArm              ::= "case" Pattern ("," Pattern)* "=>" Expression Terminator
DefaultArm             ::= "default" "=>" Expression Terminator
WhileStatement         ::= "while" "(" Expression ")" Block
ForEachStatement       ::= "for" "(" ("let")? Identifier "in" Expression ")" Block
BreakStatement         ::= "break" Terminator
ContinueStatement      ::= "continue" Terminator
ErrorPropagationStatement
                        ::= Expression "?" Terminator
ErrorExpression         ::= Expression "?"
PredictionFeatureBlock ::= "features" "{" FeatureDeclaration* "}"
FeatureDeclaration     ::= Identifier (":" Type)? ("=" Expression)? Terminator
PredictionOutputStatement
                        ::= "output" Expression Terminator
StrategyAction         ::= ("enter" | "exit") ("long" | "short") PositionOptions? Terminator
PositionOptions        ::= "(" NamedArgumentList? ")"
SurfaceStatement       ::= "show" Expression
                          | "plot" Expression PlotOptions?
PlotOptions             ::= ("color" "=" Expression)? ("width" "=" Integer)?
                          ("style" "=" Identifier)? ("title" "=" String)?
ExpressionStatement    ::= Expression Terminator

Expression             ::= ConditionalExpression
ConditionalExpression  ::= OrExpression ("?" Expression ":" Expression)?
OrExpression           ::= AndExpression ("or" AndExpression)*
AndExpression          ::= EqualityExpression ("and" EqualityExpression)*
EqualityExpression     ::= ComparisonExpression (("==" | "!=") ComparisonExpression)*
ComparisonExpression   ::= AdditiveExpression (("<" | "<=" | ">" | ">=") AdditiveExpression)*
AdditiveExpression     ::= MultiplicativeExpression (("+" | "-") MultiplicativeExpression)*
MultiplicativeExpression
                        ::= UnaryExpression (("*" | "/" | "%") UnaryExpression)*
UnaryExpression        ::= ("!" | "+" | "-") UnaryExpression | PostfixExpression
PostfixExpression      ::= PrimaryExpression PostfixSuffix*
PostfixSuffix          ::= "[" Expression "]"
                          | "." Identifier
                          | "(" ArgumentList? ")"
                          | "?"
PrimaryExpression      ::= Number | String | Boolean | "null" | Identifier
                          | "(" Expression ")"
                          | TupleExpression | ArrayLiteral | MapLiteral
                          | SwitchExpression | ClosureExpression
TupleExpression        ::= "(" Expression "," Expression ("," Expression)* ","? ")"
ArrayLiteral           ::= "[" (Expression ("," Expression)* ","?)? "]"
MapLiteral             ::= "{" (MapEntry ("," MapEntry)* ","?)? "}"
MapEntry               ::= (Identifier | String) ":" Expression
SwitchExpression       ::= "switch" "(" Expression ")" "{" SwitchArm+ DefaultArm? "}"
ClosureExpression      ::= "fn" "(" ParameterList? ")" ("->" Type)? "=>" Expression
ArgumentList           ::= Expression ("," Expression)* ","?
NamedArgumentList      ::= NamedArgument ("," NamedArgument)* ","?
NamedArgument          ::= Identifier "=" Expression
Pattern                ::= LiteralPattern | Identifier
LiteralPattern         ::= Number | String | Boolean

Type                   ::= FunctionType | TupleType | QualifiedType
QualifiedType          ::= QualifiedName TypeArguments?
TypeArguments          ::= "<" Type ("," Type)* ">"
TypeParameters         ::= "<" TypeParameter ("," TypeParameter)* ">"
TypeParameter          ::= Identifier (":" TypeBound ("+" TypeBound)*)?
TypeBound              ::= QualifiedName
TupleType              ::= "(" Type "," Type ("," Type)* ")"
FunctionType           ::= "fn" "(" (Type ("," Type)*)? ")" "->" Type
QualifiedName          ::= Identifier ("." Identifier)*
Identifier             ::= Letter (Letter | Digit | "_")*
Version                ::= Digit+ ("." Digit+){1,2}
Number                 ::= Hexadecimal | Decimal | Integer
Hexadecimal            ::= ("0x" | "0X") HexDigit+
Decimal                ::= Digit+ ("." Digit+)? Exponent? | "." Digit+ Exponent?
Exponent               ::= ("e" | "E") ("+" | "-")? Digit+
Integer                ::= Digit+
String                  ::= DoubleQuotedString | SingleQuotedString
DoubleQuotedString      ::= DoubleQuote StringCharacter* DoubleQuote
SingleQuotedString      ::= SingleQuote StringCharacter* SingleQuote
DoubleQuote             ::= double-quote-character
SingleQuote             ::= single-quote-character
StringCharacter        ::= EscapeSequence | any character except active quote or EOF
EscapeSequence         ::= Backslash ("n" | "r" | "t" | any single escaped character)
Boolean                ::= "true" | "false"
Terminator             ::= ";" | ImplicitLineTerminator
ImplicitLineTerminator ::= source-line boundary recognized outside delimiters
Comment                ::= "//" characters-to-line-end | "/*" characters "*/"
`.trim();

export const CORE_SPIRIT_LANGUAGE_DESIGN_RULES = Object.freeze({
  programKinds: Object.freeze({
    indicator: 'Consumes bar-aligned and scalar data, computes deterministic values, and emits visual outputs. It cannot place orders or invoke privileged automation effects.',
    automation: 'Subscribes to declared events and produces capability-gated alerts, webhooks or other controlled actions. Every side effect is authorized by the host policy, never by source text alone.',
    prediction: 'Declares named features with provenance and missing-data rules, resolves a versioned model artifact through the host, and emits a typed forecast/prediction output. Forecast values are not observed market history.',
    strategy: 'Evaluates deterministic historical/realtime logic and emits broker-neutral OrderIntent values. Sizing, risk checks, routing and broker credentials remain host-owned.',
  }),
  authoringLevels: Object.freeze({
    beginner: 'Guided declarations, built-in data, visual building blocks and straightforward conditions. Simplification is an editor/policy profile, not a separate grammar.',
    trader: 'Market series, symbols, timeframes, multi-timeframe data, indicators and broker-neutral strategy intent.',
    quant: 'Statistical domains, typed collections, matrix/tensor operations, datasets, models and research workflows.',
    system: 'Modules, custom kernels, event processing, explicit capabilities, sandboxed execution and deployment.',
  }),
  declarations: Object.freeze({
    variables: 'let creates a local binding initialized once; reassignment is explicit and uses := only for stateful bindings. Beginner surface syntax may omit let and is normalized to the same declaration node.',
    constants: 'const is immutable after initialization. It cannot contain mutable state<T> or intrabar<T> storage.',
    functions: 'Named functions have typed parameters and an explicit return type. They are pure by default; effects require a separately checked capability contract.',
    returns: 'A function returns one value or a fixed-arity tuple. Every control-flow path must return a value compatible with its declared return type.',
    tuples: 'Tuples are fixed-size product values with positional, statically known element types. Destructuring arity and element types are checked at compile time.',
    enums: 'Enums are nominal finite sets of named values. Exhaustive switching is checked; values have stable serialized identities.',
    records: 'type declares nominal records. Fields are statically typed; field access is checked and record identity is not interchangeable with an anonymous map.',
    methods: 'impl attaches statically resolved methods to a type. Receiver type is the first implicit parameter; no runtime monkey-patching or reflection.',
    generics: 'Type parameters are compile-time only and must satisfy explicit bounds. Monomorphization or equivalent specialization happens before executable IR; no dynamic structural fallback.',
    traits: 'Traits declare required method signatures. Implementations are explicit; coherence permits at most one applicable implementation for a type/trait pair.',
    conditions: 'if and switch are expressions/statements with statically checked boolean conditions and compatible branch result types.',
    loops: 'while and for-in have deterministic iteration semantics and mandatory host instruction/iteration limits. break and continue target the innermost loop.',
    iterators: 'Iteration is over approved bounded collections/ranges. A custom iterator protocol is admitted only after its lifetime, termination and resource contract is implemented.',
    closures: 'Closures capture immutable values by value. Mutable state and capabilities are not implicitly captured; captured values must satisfy worker-transferability rules.',
    namespaces: 'Namespaces are lexical qualification scopes, not dynamic objects. Name resolution is deterministic and ambiguity is a compile error.',
    modules: 'Imports resolve only through the versioned module manifest. Modules are content-addressed, dependency-locked and never fetched from arbitrary filesystem/network paths at compile or execution time.',
    libraries: 'A library exports typed declarations and no top-level side effects. Import cycles are rejected; public ABI is versioned independently from source formatting.',
    errors: 'Fallible operations return Result<T,E>; optional values use Option<T>. The postfix ? operator propagates a compatible error/none path. Unhandled failures become typed runtime diagnostics, not silent nulls.',
    inference: 'Local binding types are inferred from initializer expressions. Public function parameters, exported declarations and module ABI boundaries require explicit types.',
    scope: 'Lexical block scope; inner declarations may shadow outer locals only under a single documented shadowing rule. No implicit dynamic scope or implicit global writes.',
    overloading: 'User-defined operator overloading is intentionally excluded. Built-in operators have fixed, domain-safe signatures; named functions provide extensibility.',
  }),
  temporalSafety: Object.freeze({
    scalar: 'A scalar is independent of a bar-indexed market sequence.',
    series: 'Series<T> is aligned to one symbol/timeframe sequence; indexing is historical-only and bounded by declared lookback.',
    historical: 'Historical<T> is immutable finalized observation. Future offsets and lookahead are compile-time errors.',
    currentBar: 'CurrentBar<T> is the active bar revision and may change before confirmation.',
    developing: 'Developing<T> can be revised intrabar; downstream calculations must be replay-safe.',
    realtime: 'Realtime<T> carries live provenance. Side effects are gated by the execution policy and may be deduplicated by event/revision identity.',
    confirmed: 'Confirmed<T> is final for its bar. Developing values cannot flow into a Confirmed<T> parameter or output.',
    state: 'State<T> persists across bars and participates in deterministic checkpoint/rollback.',
    intrabar: 'Intrabar<T> has separate intrabar persistence and rollback semantics; it is never implicitly interchangeable with State<T>.',
    external: 'External<T> carries source, symbol, timeframe, availability and request provenance. It is capability-checked and lookahead-checked.',
    forecast: 'Forecast<T> is a model-produced future value. It cannot flow into observed/historical market features without an explicit evaluation/labeling boundary.',
    optional: 'Option<T> represents presence/absence. It must be narrowed or handled before an unsafe value access.',
  }),
  effects: Object.freeze({
    pureByDefault: 'Pure computation has no broker, network, filesystem, clock or ambient mutable-state access.',
    capabilityChecking: 'Every effect is declared, checked at compile time, and independently authorized by the host at runtime.',
    brokerBoundary: 'Source programs emit broker-neutral intents; secrets, account access, risk enforcement and order routing remain outside the language runtime.',
    deterministicExecution: 'Given the same source, artifact versions, market revisions and inputs, compilation and pure execution produce the same IR/results.',
  }),
  ir: Object.freeze({
    canonical: 'All four program kinds and all authoring levels lower to the same versioned CoreSpirit IR ABI.',
    typed: 'Semantic types, temporal qualifiers, provenance, capabilities and source maps are validated before optimization and retained in the artifact contract.',
    execution: 'The VM executes validated IR only. AST nodes and editor metadata are never executable authority.',
    optimization: 'Optimizations must preserve temporal semantics, effect order, source locations and deterministic replay behavior.',
  }),
} as const);

export const CORE_SPIRIT_PROGRAM_GRAMMAR = String.raw`
Source                 ::= Edition10Source | Edition12Source
Edition10Source        ::= Edition10Directive? CapabilityRequirement* (Program10 | LegacyScript10) EOF
Edition12Source        ::= Edition12Directive CapabilityRequirement* (Program12 | LegacyScript12) EOF
Edition10Directive     ::= "edition@1.0"
Edition12Directive     ::= "edition@1.2"
CapabilityRequirement ::= "requires" QualifiedName ("," QualifiedName)*

Program10              ::= ProgramHeader Block10
Program12              ::= ProgramHeader Block12
ProgramHeader          ::= ProgramKind String
ProgramKind            ::= "indicator" | "strategy" | "automation" | "prediction"
LegacyScript10         ::= CoreStatement*
LegacyScript12         ::= (CoreStatement | Edition12OnlyStatement)*
Block10                ::= "{" CoreStatement* "}"
Block12                ::= "{" (CoreStatement | Edition12OnlyStatement)* "}"
Block                  ::= Block10 | Block12

CoreStatement          ::= VariableDeclaration
                         | FunctionDeclaration
                         | RecordDeclaration
                         | EventHandler
                         | IfStatement
                         | AssignmentStatement
                         | ReturnStatement
                         | ExpressionStatement
                         | SurfaceStatement
VariableDeclaration    ::= ("let" | "const") Identifier TypeAnnotation? "=" Expression Terminator
TypeAnnotation         ::= ":" TypeName
AssignmentStatement    ::= Identifier ":=" Expression Terminator
FunctionDeclaration    ::= "fn" Identifier "(" ParameterList? ")" "->" TypeName Block10
ParameterList          ::= Parameter ("," Parameter)*
Parameter              ::= Identifier ":" TypeName
ReturnStatement        ::= "return" Expression Terminator
RecordDeclaration      ::= "type" Identifier "{" FieldDeclaration* "}"
FieldDeclaration       ::= Identifier ":" TypeName Terminator?

EventHandler           ::= "on" QualifiedName ("(" ArgumentList? ")")? Block
IfStatement            ::= "if" "(" Expression ")" Block ("else" Block)?
ExpressionStatement    ::= Expression Terminator

Expression             ::= ConditionalExpression
ConditionalExpression  ::= OrExpression ("?" Expression ":" Expression)?
OrExpression           ::= AndExpression ("or" AndExpression)*
AndExpression          ::= EqualityExpression ("and" EqualityExpression)*
EqualityExpression     ::= ComparisonExpression (("==" | "!=") ComparisonExpression)*
ComparisonExpression   ::= AdditiveExpression (("<" | "<=" | ">" | ">=") AdditiveExpression)*
AdditiveExpression     ::= MultiplicativeExpression (("+" | "-") MultiplicativeExpression)*
MultiplicativeExpression ::= UnaryExpression (("*" | "/" | "%") UnaryExpression)*
UnaryExpression        ::= ("!" | "+" | "-") UnaryExpression | PostfixExpression
PostfixExpression      ::= PrimaryExpression PostfixSuffix*
PostfixSuffix          ::= "[" Expression "]" | "." Identifier | "(" ArgumentList? ")"
PrimaryExpression      ::= Number | String | Boolean | "null" | Identifier
                         | "(" Expression ")" | ArrayLiteral | MapLiteral
ArgumentList           ::= Expression ("," Expression)*
ArrayLiteral           ::= "[" (Expression ("," Expression)*)? "]"
MapLiteral             ::= "{" (MapEntry ("," MapEntry)*)? "}"
MapEntry               ::= (Identifier | String) ":" Expression

TypeName               ::= Identifier GenericArguments?
GenericArguments       ::= "<" TypeName ("," TypeName)* ">"
QualifiedName          ::= Identifier ("." Identifier)*
Identifier             ::= Letter (Letter | Digit | "_")*
Number                 ::= Hexadecimal | Decimal | Integer
Hexadecimal            ::= ("0x" | "0X") HexDigit+
Decimal                ::= (Digit+ ("." Digit+)? | "." Digit+) Exponent?
Exponent               ::= ("e" | "E") ("+" | "-")? Digit+
Integer                ::= Digit+
String                 ::= '"' StringCharacter* '"' | "'" StringCharacter* "'"
StringCharacter        ::= EscapeSequence | any character except active quote or EOF
EscapeSequence         ::= Backslash ("n" | "r" | "t" | any single escaped character)
Boolean                ::= "true" | "false"
Letter                 ::= "A".."Z" | "a".."z" | "_"
Digit                  ::= "0".."9"
HexDigit               ::= Digit | "A".."F" | "a".."f"
Backslash              ::= U+005C
Terminator             ::= ";" | ImplicitLineTerminator
ImplicitLineTerminator ::= source-line boundary recognized by surface normalization
Comment                ::= "//" characters-to-line-end | "/*" characters "*/"

SurfaceStatement       ::= SurfaceWhen | SurfaceShow
SurfaceWhen            ::= "when" SurfaceCondition (Block | ":" IndentedBlock)
SurfaceCondition       ::= Expression (CrossingOperator Expression)?
CrossingOperator       ::= "crosses_above" | "crosses_below"
SurfaceShow            ::= "show" Expression
SurfaceLowering        ::= SurfaceWhen -> IfStatement
                         | SurfaceShow -> canonical visual-emission call

Edition12OnlyStatement ::= EnumDeclaration | ImportDeclaration | WhileStatement
                         | ForEachStatement | BreakStatement | ContinueStatement
                         | CompactPlot
EnumDeclaration        ::= "enum" Identifier "{" EnumMember ("," EnumMember)* ","? "}"
EnumMember             ::= Identifier ("=" (String | Number))?
ImportDeclaration      ::= "import" ("*" "as" Identifier
                         | "{" ImportBinding ("," ImportBinding)* "}") "from" String
ImportBinding          ::= Identifier ("as" Identifier)?
WhileStatement         ::= "while" "(" Expression ")" Block12
ForEachStatement       ::= "for" "(" "let"? Identifier "in" Expression ")" Block12
BreakStatement         ::= "break" Terminator
ContinueStatement      ::= "continue" Terminator
CompactPlot            ::= "plot" Expression PlotOptions?
PlotOptions            ::= ("color" "=" Expression)? ("width" "=" Integer)?
                         ("style" "=" Identifier)? ("title" "=" String)?
IndentedBlock          ::= indentation-delimited (CoreStatement | Edition12OnlyStatement)+
`.trim();

/**
 * Normative rules that cannot be expressed by syntax productions alone.
 * Program kinds and authoring levels never select separate grammars.
 */
export const CORE_SPIRIT_LANGUAGE_SYNTAX_POLICIES = Object.freeze({
  editions: Object.freeze({
    '1.0': 'Core statements and the legacy readable surface. Edition-specific v1.2 syntax is rejected.',
    '1.2': 'Adds bounded while/for-in control flow, break/continue, value-only enums, standard-library imports and compact plot declarations.',
  }),
  lowering: Object.freeze({
    when: 'when condition { ... } and when condition: indented-body lower to an ordinary conditional block; crosses_above/crosses_below lower to registered crossing predicates.',
    show: 'show expression lowers to the canonical visual-emission ABI; it does not create a separate renderer or execution engine.',
    compactPlot: 'edition@1.2 plot expression options lower to the existing plot call contract.',
    enums: 'value-only enum members lower to generated scalar constants; enum values are not nominal runtime objects.',
    imports: 'imports resolve only through the registered standard-library namespace catalogue; no filesystem or network module loading.',
  }),
  functions: 'Named functions require typed parameters and a declared return type. The current implementation accepts pure local expressions followed by exactly one terminal return and inlines them. Recursion, closures, effectful calls and general control flow are rejected.',
  loops: 'while and for-in loops are edition@1.2 syntax and are bounded by the host VM instruction budget; break and continue target the innermost loop.',
  collections: 'Array and map values are homogeneous, bounded, bounds-checked collections. Matrix/tensor shape rules are semantic contracts; implicit structured broadcasting is rejected.',
});

export { CORE_SPIRIT_PROGRAM_EXECUTION_LAYERS } from './coreSpiritProgramPolicy';
import { CORE_SPIRIT_PROGRAM_EXECUTION_LAYERS } from './coreSpiritProgramPolicy';

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
  { id: 'constants', status: 'implemented', semantics: 'const declarations create immutable bindings; const cannot be reassigned or use mutable state<T>/intrabar<T> storage. Referenced collection contents retain their collection mutability contract.' },
  { id: 'functions', status: 'partial', semantics: 'Named functions have typed parameters and one return type; the current implementation inlines pure expression functions only. Recursion, closures, effectful calls and general control flow are rejected.' }, 
  { id: 'parameters', status: 'implemented', semantics: 'Function parameters use explicit TypeName declarations.' },
  { id: 'return-values', status: 'implemented', semantics: 'A function returns one typed expression; bare and multiple returns are not part of this grammar yet.' },
  { id: 'multiple-return-values', status: 'planned', semantics: 'Tuple-valued returns require tuple types, destructuring and IR/runtime contracts.' },
  { id: 'tuples', status: 'planned', semantics: 'Tuple literals, tuple types and destructuring are not yet in the CoreScript AST.' },
  { id: 'enums', status: 'partial', semantics: 'Edition 1.2 supports value-only enums lowered to generated scalar constants. Nominal enum values, exhaustive matching and stable enum serialization are not implemented.' }, 
  { id: 'user-defined-record-types', status: 'partial', semantics: 'type declarations parse named fields; constructors, visibility and full nominal guarantees need completion.' },
  { id: 'methods', status: 'partial', semantics: 'Member calls exist for registered namespaces/collections; user-defined method declarations and dispatch do not.' },
  { id: 'generics', status: 'partial', semantics: 'Nested generic type syntax parses; generic parameter binding, constraints and monomorphization are incomplete.' },
  { id: 'interfaces-traits', status: 'planned', semantics: 'No trait/interface declaration or coherence/implementation rules are in the current grammar.' },
  { id: 'conditional-expressions', status: 'implemented', semantics: 'Conditional expressions are right-associative and lower through the shared expression pipeline.' },
  { id: 'switch-expressions', status: 'planned', semantics: 'Switch expressions are not part of the native CoreSpirit grammar; Pine frontend switch syntax is isolated compatibility behavior.' }, 
  { id: 'loops', status: 'implemented', semantics: 'Host-bounded while and foreach constructs lower to explicit control-flow IR.' },
  { id: 'iterators', status: 'partial', semantics: 'Foreach supports current collection lowering; a user-defined iterator protocol is not available.' },
  { id: 'closures', status: 'planned', semantics: 'Captures, lifetime rules and closure conversion are not implemented.' },
  { id: 'namespaces', status: 'partial', semantics: 'Built-in namespace/member calls exist; user-defined namespace declarations are not complete.' },
  { id: 'imports-exports', status: 'partial', semantics: 'Edition 1.2 imports resolve only registered standard-library namespaces. User-module imports, exports, visibility, cycle handling and dependency locking are not implemented.' }, 
  { id: 'libraries', status: 'partial', semantics: 'A library program kind exists for compatibility; publishable/importable source modules are not complete.' },
  { id: 'error-handling', status: 'planned', semantics: 'Result/Option propagation and recoverable error semantics are not yet in the grammar.' },
  { id: 'type-inference', status: 'implemented', semantics: 'Expression inference and semantic series/domain qualifiers feed the typed IR environment.' },
  { id: 'lexical-scope', status: 'partial', semantics: 'Block/function scopes are recognized, but shadowing, lifetime and capture rules need a dedicated conformance suite.' },
  { id: 'nullability', status: 'partial', semantics: 'null is accepted by the current type system, but strict Option<T> and nullable-flow narrowing are not complete.' },
  { id: 'symbol-timeframe-types', status: 'partial', semantics: 'Market and timeframe references carry identity, but stable nominal Symbol and Timeframe source types are not fully formalized.' },
  { id: 'temporal-qualifiers', status: 'partial', semantics: 'Series/state/intrabar/confirmed/developing/forecast concepts exist; compile-time prevention across every external-data and prediction boundary is not yet exhaustive.' },
  { id: 'external-data-provenance', status: 'partial', semantics: 'External data resolution is host-owned and causality-checked, but provenance is not yet a first-class type qualifier on every value.' },
  { id: 'prediction-feature-blocks', status: 'planned', semantics: 'A declarative features block with typed feature extraction, missing-data rules and feature provenance is not yet a native CoreSpirit construct.' },
  { id: 'prediction-output-statements', status: 'planned', semantics: 'The proposed output <prediction> statement requires a typed output declaration and host artifact contract; visual show/plot is not a substitute for model output.' },
  { id: 'strategy-position-actions', status: 'partial', semantics: 'OrderIntent and strategy-layer operations exist, but the proposed enter/exit long/short authoring forms and default sizing rules are not yet a stable native syntax.' },
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
    const: 'Creates an immutable binding. Reassignment through := is rejected, and const cannot wrap mutable state<T> or intrabar<T> storage; collection contents keep their own mutability contract.',
    assignment: 'The := operator updates a stateful binding; ordinary = is reserved for declarations/surface shorthand.',
    functions: 'Named functions use typed parameters and a declared return type; only pure expression bodies with one terminal return are accepted and inlined before IR lowering. Recursion, closures, effects and general control flow are rejected.',
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

export const CORE_SPIRIT_TYPE_MODEL = Object.freeze({
  primitiveContracts: Object.freeze([
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
  collectionContracts: Object.freeze([
    Object.freeze({ name:'Array<T>', sourceName:'array<T>', status:'implemented' as const }),
    Object.freeze({ name:'Map<K,V>', sourceName:'map<K,V>', status:'partial' as const }),
    Object.freeze({ name:'Vector<T>', sourceName:'vector<T>', status:'partial' as const }),
    Object.freeze({ name:'Matrix<T>', sourceName:'matrix<T>', status:'partial' as const }),
    Object.freeze({ name:'Tensor<T>', sourceName:'tensor<T>', status:'partial' as const }),
  ]),
  temporalTypeContracts: Object.freeze([
    Object.freeze({ name:'Series<T>', sourceName:'series<T>', status:'implemented' as const }),
    Object.freeze({ name:'CurrentBar<T>', sourceName:'bar<T>', status:'partial' as const }),
    Object.freeze({ name:'Historical<T>', sourceName:'historical phase metadata', status:'partial' as const }),
    Object.freeze({ name:'Realtime<T>', sourceName:'realtime phase metadata', status:'partial' as const }),
    Object.freeze({ name:'Confirmed<T>', sourceName:'confirmed<T>', status:'implemented' as const }),
    Object.freeze({ name:'Developing<T>', sourceName:'developing<T>', status:'implemented' as const }),
    Object.freeze({ name:'State<T>', sourceName:'state<T>', status:'implemented' as const }),
    Object.freeze({ name:'Intrabar<T>', sourceName:'intrabar<T>', status:'implemented' as const }),
    Object.freeze({ name:'External<T>', sourceName:'host-resolved external data', status:'partial' as const }),
    Object.freeze({ name:'Forecast<T>', sourceName:'forecast<T>', status:'partial' as const }),
    Object.freeze({ name:'Optional<T>', sourceName:'Option<T>', status:'planned' as const }),
  ]),
  temporalQualifierContracts: Object.freeze([
    Object.freeze({ name:'historical', representation:'series<T> with historical provenance', status:'partial' as const, invariant:'Only previously observed bars are eligible; future offsets are invalid.' }),
    Object.freeze({ name:'current-bar', representation:'active bar revision', status:'partial' as const, invariant:'Unconfirmed fields may change until the bar is committed.' }),
    Object.freeze({ name:'realtime', representation:'series<T> with realtime phase metadata', status:'partial' as const, invariant:'Realtime observations are revisioned; effects are host-policy gated.' }),
    Object.freeze({ name:'confirmed', representation:'confirmed<T>', status:'implemented' as const, invariant:'A developing value cannot satisfy a confirmed-value requirement.' }),
    Object.freeze({ name:'developing', representation:'developing<T>', status:'implemented' as const, invariant:'The value may be revised until bar confirmation.' }),
    Object.freeze({ name:'stateful', representation:'state<T>', status:'implemented' as const, invariant:'State is checkpointed and rolled back across realtime revisions.' }),
    Object.freeze({ name:'intrabar-stateful', representation:'intrabar<T>', status:'implemented' as const, invariant:'Intrabar state has separate persistence semantics from state<T>.' }),
    Object.freeze({ name:'external', representation:'host-resolved external market data', status:'partial' as const, invariant:'External data is capability-checked and causality-checked by the host.' }),
    Object.freeze({ name:'forecast', representation:'forecast<T>', status:'partial' as const, invariant:'Forecasts are model outputs, not observed market history.' }),
    Object.freeze({ name:'optional', representation:'Option<T>', status:'planned' as const, invariant:'Null-safe access and flow narrowing are not yet a complete type-system contract.' }),
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
    'Series and scalar values are distinct; scalar numeric operands broadcast only in semantic operations that explicitly permit it, while structured collection broadcasting is rejected.',
    'Price, volume, time and duration carry domain meaning and cannot be mixed as arbitrary dimensionless numbers.',
    'Historical/confirmed/developing/realtime/forecast are temporal phases, not interchangeable labels.',
    'Persistent state and intrabar state have different rollback/storage semantics.',
    'Market references retain symbol/timeframe identity; external data access remains capability- and causality-checked.',
    'Prediction and forecast values are not observed market values and cannot silently flow into historical inputs.',
  ]),
} as const);


/**
 * Full public type vocabulary and orthogonal type axes. The status fields in
 * CORE_SPIRIT_TYPE_MODEL remain the implementation gate; these names define
 * the stable design surface and do not imply every constructor is executable.
 */
export const CORE_SPIRIT_FINAL_TYPE_SYSTEM = Object.freeze({
  primitiveTypes: Object.freeze(['Int','Float','Bool','String','Color','Void'] as const),
  marketTypes: Object.freeze(['Bar','Price','Volume','Timestamp','Symbol','Timeframe'] as const),
  collectionTypes: Object.freeze(['Array<T>','Map<K,V>','Matrix<T>','Tensor<T>'] as const),
  executionTypes: Object.freeze(['Event<T>','Signal<T>','OrderIntent','Position','Prediction<T>','Model<T>'] as const),
  errorTypes: Object.freeze(['Result<T,E>'] as const),
  optionalTypes: Object.freeze(['Option<T>'] as const),
  maturity: CORE_SPIRIT_TYPE_MODEL,
  temporalConstructors: Object.freeze([
    Object.freeze({name:'Series<T>',sourceName:'series<T>',axis:'shape',meaning:'Bar-aligned values for one symbol/timeframe; scalar and series values never silently exchange.'}),
    Object.freeze({name:'Historical<T>',sourceName:'historical<T>',axis:'phase',meaning:'Finalized past observations only; positive/future indexing is forbidden.'}),
    Object.freeze({name:'CurrentBar<T>',sourceName:'bar<T>',axis:'phase',meaning:'The active bar snapshot; may be revised until the host commits the bar.'}),
    Object.freeze({name:'Realtime<T>',sourceName:'realtime<T>',axis:'phase',meaning:'Live host observations with revision identity and policy-gated effects.'}),
    Object.freeze({name:'Confirmed<T>',sourceName:'confirmed<T>',axis:'phase',meaning:'Finalized bar value; developing inputs cannot satisfy this requirement.'}),
    Object.freeze({name:'Developing<T>',sourceName:'developing<T>',axis:'phase',meaning:'An unconfirmed value that can change and must be replay-safe.'}),
    Object.freeze({name:'State<T>',sourceName:'state<T>',axis:'storage',meaning:'Persistent mutable state with deterministic checkpoint and rollback semantics.'}),
    Object.freeze({name:'Intrabar<T>',sourceName:'intrabar<T>',axis:'storage',meaning:'Intrabar-persistent state with separate storage and rollback behavior.'}),
    Object.freeze({name:'External<T>',sourceName:'external<T>',axis:'provenance',meaning:'Host-resolved external data carrying provider, symbol, timeframe, availability and causality metadata.'}),
    Object.freeze({name:'Forecast<T>',sourceName:'forecast<T>',axis:'value-kind',meaning:'Model-produced future value; not an observed market value or historical feature.'}),
    Object.freeze({name:'Option<T>',sourceName:'option<T>',axis:'availability',meaning:'Explicitly present or absent; unsafe access requires narrowing or handling.'}),
  ]),
  orthogonalAxes: Object.freeze({
    shape:Object.freeze(['scalar','series','array','map','matrix','tensor']),
    phase:Object.freeze(['historical','current-bar','developing','confirmed','realtime','forecast']),
    storage:Object.freeze(['immutable','persistent-state','intrabar-state']),
    provenance:Object.freeze(['observed','derived','external','model-produced']),
    availability:Object.freeze(['required','optional']),
    identity:Object.freeze(['symbol','timeframe','unit','currency','scale']),
  }),
  invariants:Object.freeze([
    'A type may carry one value shape, temporal phase, storage policy, provenance and availability state at the same time.',
    'Temporal safety is not inferred from a variable name or authoring level; it is checked from typed value metadata.',
    'Series identity includes symbol and timeframe. Cross-symbol or cross-timeframe values require an explicit conversion/request boundary.',
    'Historical and confirmed values are immutable observations; developing and realtime values may be revised.',
    'Forecast/model-produced values cannot be treated as observed market history.',
    'Persistent State<T> and Intrabar<T> are different storage contracts and are not assignable to one another.',
    'Option<T> must be narrowed before extracting T; null is reserved for foreign-boundary compatibility.',
    'Price, Volume, Timestamp and Duration are domain values, not interchangeable dimensionless floats.',
    'Array, Map, Matrix and Tensor element/key/value/shape constraints are checked before runtime execution.',
  ]),
  inference:{
    localBindings:'Infer from the initializer after resolving literal, builtin, series and collection types.',
    functionParameters:'Explicit types at exported/public boundaries; inferred generic arguments at call sites.',
    returns:'Infer only when the declaration has a single unambiguous return type; exported functions declare the return type.',
    collections:'Infer homogeneous element/value types; empty collection literals require an explicit element/key/value type.',
    numericLiterals:'Integer literals begin as Int; mixed Int/Float arithmetic promotes to Float only under defined numeric rules.',
    nullability:'null never widens an arbitrary value to a nullable top type; use Option<T>.',
  },
  operators:{
    arithmetic:'Fixed built-in overloads for numeric and domain-safe Price/Volume/Time/Duration combinations.',
    comparison:'Compatible scalar/series domains only; ordered comparisons reject Bool/String and incompatible units.',
    logical:'and/or/not require Bool and preserve deterministic short-circuit semantics.',
    collections:'No implicit Matrix/Tensor broadcasting, shape coercion or collection arithmetic.',
    userDefinedOverloading:'Excluded from the language to avoid unpredictable overload resolution and hidden effects.',
  },
} as const);

export const CORE_SPIRIT_LANGUAGE_CONSTRUCT_SEMANTICS = Object.freeze({
  variables:'let creates one lexically scoped binding. A binding is initialized once; persistent or intrabar mutation must use an explicitly typed state container and :=.',
  'surface-declarations':'Beginner-friendly name = expression syntax is declaration sugar only when the name is not already bound; it lowers to the same let AST/IR and never changes reassignment semantics.',
  constants:'const cannot be reassigned and cannot bind mutable State<T> or Intrabar<T>. Referenced collections retain their own separately specified mutation contract.',
  functions:'Functions have explicit parameter and return contracts, are pure by default, and are checked before inlining or lowering. Recursive/effectful behavior requires future explicit execution contracts.',
  parameters:'Parameters are immutable value inputs. A series parameter accepts only compatible symbol/timeframe, domain and temporal qualifiers; defaults are evaluated at the call boundary.',
  'return-values':'A function returns exactly one value unless its declared return type is a tuple. Return type compatibility is checked on every control-flow exit.',
  'multiple-return-values':'Multiple results are represented as a fixed-arity tuple, not implicit out-parameters or mutable caller bindings.',
  tuples:'Tuple element positions and types are fixed at compile time. Destructuring arity must exactly match the tuple type; tuples are not dynamically indexed.',
  enums:'Enums are nominal finite domains with stable member identity. Exhaustive switch expressions must cover all variants or provide a default arm.',
  'user-defined-record-types':'Records are nominal, statically laid out values with declared fields. Construction, field access and serialization follow the record declaration; arbitrary maps are not structural substitutes.',
  methods:'Methods are statically resolved through an explicit impl block. The receiver participates in type checking as the first parameter; no reflection or runtime monkey-patching.',
  generics:'Generic parameters are compile-time type variables with declared bounds. Inference resolves type arguments at calls; unresolved or unsatisfied constraints are compile errors.',
  'interfaces-traits':'Traits declare required signatures and associated constraints. Implementations are explicit and coherence rejects ambiguous or overlapping implementations.',
  'conditional-expressions':'if expressions evaluate one selected branch; both branches must produce compatible types and conditions must be Bool.',
  'switch-expressions':'Switch evaluates its subject once, selects one arm, checks compatible arm result types and requires exhaustive coverage for closed enums unless a default exists.',
  loops:'while and for-in have deterministic order, bounded iteration and a host-enforced instruction budget. break/continue target the nearest enclosing loop.',
  iterators:'Built-in iterators expose a deterministic finite sequence. Custom iterators must declare termination, bounds and element type before they can be used.',
  closures:'Closures capture immutable, transferable values by value. Capturing mutable state, ambient host handles or undeclared capabilities is rejected.',
  namespaces:'Namespaces are lexical name qualification. Resolution is deterministic; ambiguous names must be explicitly qualified or aliased.',
  'imports-exports':'Imports resolve only against a signed/content-addressed module manifest with exact dependency versions. Export visibility is explicit; filesystem/network source resolution is forbidden.',
  libraries:'Libraries are reusable modules with declared exports and no implicit top-level side effects. Their ABI, dependency graph and content identity are versioned.',
  'error-handling':'Fallible functions return Result<T,E>; absence uses Option<T>. The postfix ? propagates a compatible error/absence and cannot discard or invent an error value.',
  'type-inference':'Local expression types are inferred from literals, operators, calls, series and collection members. Public APIs and exported module boundaries require explicit stable types.',
  'lexical-scope':'Names resolve in nested lexical scopes. Shadowing is explicit and deterministic; use-after-scope, duplicate declarations and implicit global mutation are rejected.',
  'operator-overloading':'User-defined operator overloading is not supported. Built-in operators have fixed signatures and domain rules; extension behavior uses named functions.',
  nullability:'Option<T> is the only native optional-value contract. null is limited to foreign-boundary compatibility and must be converted before ordinary typed use.',
  'symbol-timeframe-types':'Symbol and Timeframe identity are part of market-series types. Mixing identities requires an explicit request/conversion boundary with availability and causality validation.',
  'temporal-qualifiers':'Historical, current-bar, developing, realtime and confirmed phases are checked at compile time. Developing/realtime data cannot satisfy a confirmed-only input.',
  'external-data-provenance':'External values carry provider, symbol, timeframe, source timestamp, availability and lookahead metadata; the host validates provenance and capabilities.',
  'prediction-feature-blocks':'Each feature has a name, type, source, observation time, missing-data policy and leakage boundary. Feature construction cannot read future labels.',
  'prediction-output-statements':'output emits a typed Prediction<T>/Forecast<T> artifact with horizon and provenance. It is not an observed series and never places an order by itself.',
  'strategy-position-actions':'enter/exit produce broker-neutral OrderIntent values. Quantity, risk limits, account authorization and routing remain host policy, not implicit language defaults.',
} as const);

export const CORE_SPIRIT_LANGUAGE_REQUIRED_CONSTRUCTS = Object.freeze([
  'variables','constants','functions','parameters','return-values','multiple-return-values','tuples',
  'enums','user-defined-record-types','methods','generics','interfaces-traits',
  'conditional-expressions','switch-expressions','loops','iterators','closures','namespaces',
  'imports-exports','libraries','error-handling','type-inference','lexical-scope',
  'operator-overloading','nullability','symbol-timeframe-types','temporal-qualifiers',
  'external-data-provenance','prediction-feature-blocks','prediction-output-statements',
  'strategy-position-actions',
] as const);

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
  for (const id of CORE_SPIRIT_LANGUAGE_REQUIRED_CONSTRUCTS) {
    if (!ids.has(id)) errors.push('Required CoreSpirit language construct is missing from the maturity matrix: ' + id);
    if (!(id in CORE_SPIRIT_LANGUAGE_CONSTRUCT_SEMANTICS)) errors.push('Required CoreSpirit language construct has no semantic rule: ' + id);
  }
  for (const [name, semantics] of Object.entries(CORE_SPIRIT_LANGUAGE_DESIGN_RULES.declarations)) {
    if (!String(semantics).trim()) errors.push('CoreSpirit declaration semantics are missing: ' + name);
  }
  const typeNames = [
    ...CORE_SPIRIT_FINAL_TYPE_SYSTEM.primitiveTypes,
    ...CORE_SPIRIT_FINAL_TYPE_SYSTEM.marketTypes,
    ...CORE_SPIRIT_FINAL_TYPE_SYSTEM.collectionTypes,
    ...CORE_SPIRIT_FINAL_TYPE_SYSTEM.executionTypes,
    ...CORE_SPIRIT_FINAL_TYPE_SYSTEM.temporalConstructors.map(item => item.name),
  ];
  if (new Set(typeNames).size !== typeNames.length) errors.push('CoreSpirit final type system contains duplicate type constructors.');
  if (!CORE_SPIRIT_FINAL_LANGUAGE_GRAMMAR.includes('TraitDeclaration') ||
      !CORE_SPIRIT_FINAL_LANGUAGE_GRAMMAR.includes('TupleBinding') ||
      !CORE_SPIRIT_FINAL_LANGUAGE_GRAMMAR.includes('ClosureExpression') ||
      !CORE_SPIRIT_FINAL_LANGUAGE_GRAMMAR.includes('ErrorPropagationStatement')) {
    errors.push('CoreSpirit final grammar is missing a required language production.');
  }
  return errors;
}
