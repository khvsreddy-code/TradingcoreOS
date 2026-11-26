/**
 * Pine Script v6 built-in API contracts.
 *
 * The reference manual is the authority for API names and signatures. This
 * registry records what CoreSpirit can execute today, what needs a host
 * capability, and what remains catalog-only. Catalog entries are intentionally
 * rejected by compilation; discoverability is never treated as implementation.
 */
export const PINE_V6_REFERENCE_MANUAL_URL = 'https://www.tradingview.com/pine-script-reference/v6/';

export type PineV6BuiltinNamespace =
  | 'ta' | 'math' | 'array' | 'matrix' | 'map' | 'str' | 'color' | 'input'
  | 'request' | 'timeframe' | 'time' | 'syminfo' | 'chart' | 'barstate'
  | 'strategy' | 'line' | 'box' | 'label' | 'table' | 'polyline' | 'log'
  | 'linefill' | 'runtime';

export type PineV6NamespaceCoverage = 'partial' | 'host-dependent' | 'catalog-only';
export type PineV6BuiltinStatus = 'implemented' | 'partial' | 'host-dependent' | 'catalog-only';
export type PineV6Qualifier = 'const' | 'input' | 'simple' | 'series';
export type PineV6ParameterType = 'numeric' | 'boolean' | 'string' | 'color' | 'array' | 'matrix' | 'map' | 'any';

export type PineV6BuiltinParameter = Readonly<{
  name: string;
  type: PineV6ParameterType;
  qualifier: PineV6Qualifier;
  optional: boolean;
  defaultValue?: unknown;
  variadic?: boolean;
}>;

export type PineV6BuiltinOverload = Readonly<{
  parameters: readonly PineV6BuiltinParameter[];
  minArgs: number;
  maxArgs: number;
  returnType: string;
  historicalRequirement: string;
  realtimeBehavior: string;
  executionCost: string;
  errorBehavior: string;
  testFixture: string;
}>;

export type PineV6NamespaceInventoryEntry = Readonly<{
  namespace: PineV6BuiltinNamespace;
  coverage: PineV6NamespaceCoverage;
  description: string;
  referenceUrl: string;
}>;

export type PineV6BuiltinDefinition = Readonly<{
  namespace: PineV6BuiltinNamespace;
  name: string;
  qualifiedName: string;
  status: PineV6BuiltinStatus;
  overloads: readonly PineV6BuiltinOverload[];
  referenceUrl: string;
  executionBuiltin?: string;
  knownDifferences: readonly string[];
}>;

const reference = PINE_V6_REFERENCE_MANUAL_URL;
const parameter = (
  name: string,
  type: PineV6ParameterType,
  qualifier: PineV6Qualifier = 'series',
  optional = false,
  defaultValue?: unknown,
  variadic = false,
): PineV6BuiltinParameter => Object.freeze({
  name, type, qualifier, optional,
  ...(defaultValue !== undefined ? { defaultValue } : {}),
  ...(variadic ? { variadic: true } : {}),
});

const overload = (
  parameters: readonly PineV6BuiltinParameter[],
  returnType: string,
  minArgs: number,
  maxArgs: number,
  historicalRequirement: string,
  realtimeBehavior: string,
  executionCost: string,
  testFixture: string,
): PineV6BuiltinOverload => Object.freeze({
  parameters: Object.freeze([...parameters]),
  minArgs, maxArgs, returnType, historicalRequirement, realtimeBehavior,
  executionCost,
  errorBehavior: 'Invalid arity or incompatible argument types produce a compile diagnostic. Missing samples propagate na; invalid runtime values fail closed.',
  testFixture,
});

const numeric = (name: string, qualifier: PineV6Qualifier = 'series', optional = false, defaultValue?: unknown) =>
  parameter(name, 'numeric', qualifier, optional, defaultValue);
const boolean = (name: string, qualifier: PineV6Qualifier = 'simple', optional = false, defaultValue?: unknown) =>
  parameter(name, 'boolean', qualifier, optional, defaultValue);

function definition(
  namespace: PineV6BuiltinNamespace,
  name: string,
  status: PineV6BuiltinStatus,
  overloads: readonly PineV6BuiltinOverload[],
  executionBuiltin?: string,
  knownDifferences: readonly string[] = [],
): PineV6BuiltinDefinition {
  return Object.freeze({
    namespace, name, qualifiedName: namespace + '.' + name, status,
    overloads: Object.freeze([...overloads]), referenceUrl: reference,
    ...(executionBuiltin ? { executionBuiltin } : {}),
    knownDifferences: Object.freeze([...knownDifferences]),
  });
}

function supported(namespace: PineV6BuiltinNamespace, name: string, runtimeName: string, args: readonly PineV6BuiltinParameter[], returnType: string, minArgs: number, maxArgs: number, history: string, realtime: string, cost: string, fixture: string) {
  return definition(namespace,name,'implemented',[overload(args,returnType,minArgs,maxArgs,history,realtime,cost,fixture)],runtimeName);
}
function partial(namespace: PineV6BuiltinNamespace, name: string, runtimeName: string, args: readonly PineV6BuiltinParameter[], returnType: string, minArgs: number, maxArgs: number, history: string, realtime: string, cost: string, fixture: string, differences: readonly string[]) {
  return definition(namespace,name,'partial',[overload(args,returnType,minArgs,maxArgs,history,realtime,cost,fixture)],runtimeName,differences);
}
function hostBound(namespace: PineV6BuiltinNamespace, name: string, args: readonly PineV6BuiltinParameter[], returnType: string, minArgs: number, maxArgs: number, fixture: string, differences: readonly string[]) {
  return definition(namespace,name,'host-dependent',[overload(args,returnType,minArgs,maxArgs,'Provider must return causally aligned data for the requested context.','Developing values require an explicit realtime snapshot; historical values must not leak future bars.','Bounded by the CoreSpirit data resolver and provider admission policy.',fixture)],undefined,differences);
}
function catalog(namespace: PineV6BuiltinNamespace, name: string, args: readonly PineV6BuiltinParameter[], returnType: string, minArgs: number, maxArgs: number, fixture: string, differences: readonly string[] = ['No conformant executable implementation is registered yet.']) {
  return definition(namespace,name,'catalog-only',[overload(args,returnType,minArgs,maxArgs,'Defined by the Pine v6 reference manual; runtime history contract is not implemented.','Realtime/replay parity is not established.','Not executable.',fixture)],undefined,differences);
}

const rolling = (fixture: string, runtimeName: string) =>
  supported('ta',runtimeName,runtimeName,[numeric('source'),numeric('length','simple')],'series<float>',2,2,
    'Requires a full length of consecutive finite source observations.',
    'Forming-bar updates replace the current contribution; no future data is read.',
    'O(1) amortized per bar using CoreSpirit stateful series cursors.',fixture);

const mathUnary = (name: string, runtimeName = name) =>
  supported('math',name,runtimeName,[numeric('number')],'float',1,1,
    'No historical samples required.','Pure deterministic scalar evaluation.','O(1).','pine-math-'+name);
const mathBinary = (name: string, runtimeName = name) =>
  supported('math',name,runtimeName,[numeric('left'),numeric('right')],'float',2,2,
    'No historical samples required.','Pure deterministic scalar evaluation.','O(1).','pine-math-'+name);

export const PINE_V6_BUILTIN_NAMESPACE_INVENTORY: readonly PineV6NamespaceInventoryEntry[] = Object.freeze([
  { namespace:'ta', coverage:'partial', description:'Technical analysis, smoothing, momentum, volatility and statistical series functions.', referenceUrl:reference },
  { namespace:'math', coverage:'partial', description:'Scalar math functions, constants and series-aware numerical operations.', referenceUrl:reference },
  { namespace:'array', coverage:'catalog-only', description:'Typed array constructors, accessors, mutation and collection algorithms.', referenceUrl:reference },
  { namespace:'matrix', coverage:'catalog-only', description:'Typed matrices, element access, mutation and linear-algebra operations.', referenceUrl:reference },
  { namespace:'map', coverage:'catalog-only', description:'Typed key/value maps with reference identity and collection methods.', referenceUrl:reference },
  { namespace:'str', coverage:'catalog-only', description:'String formatting, conversion, searching, splitting and replacement.', referenceUrl:reference },
  { namespace:'color', coverage:'catalog-only', description:'Color construction, channel extraction, alpha and gradient operations.', referenceUrl:reference },
  { namespace:'input', coverage:'catalog-only', description:'Settings declarations, constraints, grouping and input-qualified values.', referenceUrl:reference },
  { namespace:'request', coverage:'host-dependent', description:'Cross-symbol/timeframe, intrabar, financial and economic data requests.', referenceUrl:reference },
  { namespace:'timeframe', coverage:'catalog-only', description:'Chart timeframe metadata and conversion helpers.', referenceUrl:reference },
  { namespace:'time', coverage:'catalog-only', description:'Timestamps, session/timezone operations and calendar components.', referenceUrl:reference },
  { namespace:'syminfo', coverage:'catalog-only', description:'Symbol, exchange, tick-size, currency and contract metadata.', referenceUrl:reference },
  { namespace:'chart', coverage:'catalog-only', description:'Chart type, visible-range, scale and point metadata.', referenceUrl:reference },
  { namespace:'barstate', coverage:'catalog-only', description:'Historical, realtime, confirmed, first/last and new-bar state.', referenceUrl:reference },
  { namespace:'strategy', coverage:'catalog-only', description:'Strategy properties, accounting, orders, fills and open/closed trade state.', referenceUrl:reference },
  { namespace:'line', coverage:'catalog-only', description:'Pine line drawing object lifecycle and property mutation.', referenceUrl:reference },
  { namespace:'box', coverage:'catalog-only', description:'Pine box drawing object lifecycle and property mutation.', referenceUrl:reference },
  { namespace:'label', coverage:'catalog-only', description:'Pine label drawing object lifecycle and property mutation.', referenceUrl:reference },
  { namespace:'table', coverage:'catalog-only', description:'Pine table creation, cell mutation and resource lifecycle.', referenceUrl:reference },
  { namespace:'polyline', coverage:'catalog-only', description:'Polyline objects and point-list drawing lifecycle.', referenceUrl:reference },
  { namespace:'log', coverage:'catalog-only', description:'Structured informational, warning and error diagnostics.', referenceUrl:reference },
  { namespace:'linefill', coverage:'catalog-only', description:'Line-fill objects and visual lifecycle.', referenceUrl:reference },
  { namespace:'runtime', coverage:'catalog-only', description:'Runtime information and controlled runtime error functions.', referenceUrl:reference },
]);

const macdArgs = [numeric('source'),numeric('fast_length','simple'),numeric('slow_length','simple'),numeric('signal_length','simple')];
const bandsArgs = [numeric('source'),numeric('length','simple'),numeric('multiplier','simple')];

export const PINE_V6_BUILTIN_REGISTRY: readonly PineV6BuiltinDefinition[] = Object.freeze([
  // ta.* functions routed into existing CoreSpirit streaming/stateful kernels.
  rolling('pine-ta-sma','sma'),
  rolling('pine-ta-ema','ema'),
  rolling('pine-ta-rma','rma'),
  rolling('pine-ta-wma','wma'),
  rolling('pine-ta-highest','highest'),
  rolling('pine-ta-lowest','lowest'),
  rolling('pine-ta-sum','sum'),
  supported('ta','rsi','rsi',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires length + 1 source samples for Wilder gain/loss seeding.','Wilder state replaces the developing-bar observation.','O(1) amortized per bar.','pine-ta-rsi'),
  supported('ta','atr','atr',[numeric('length','simple')],'series<float>',1,1,'Requires length true-range samples; first-bar previous close is unavailable.','Wilder state replaces the developing-bar OHLC contribution.','O(1) amortized per bar.','pine-ta-atr'),
  supported('ta','roc','roc',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires the current value and length bars of history.','Causal historical lookup; no future data.','O(1) per bar.','pine-ta-roc'),
  supported('ta','change','change',[numeric('source'),numeric('length','simple',true,1)],'series<float>',1,2,'Requires the current value and the requested history offset.','Causal historical lookup; no future data.','O(1) per bar.','pine-ta-change'),
  supported('ta','cross','cross',[numeric('source1'),numeric('source2')],'series<bool>',2,2,'Requires one prior value of both series.','Uses prior committed crossing state when a bar is revised.','O(1) per bar.','pine-ta-cross'),
  supported('ta','crossover','crossover',[numeric('source1'),numeric('source2')],'series<bool>',2,2,'Requires one prior value of both series.','Uses prior committed crossing state when a bar is revised.','O(1) per bar.','pine-ta-crossover'),
  supported('ta','crossunder','crossunder',[numeric('source1'),numeric('source2')],'series<bool>',2,2,'Requires one prior value of both series.','Uses prior committed crossing state when a bar is revised.','O(1) per bar.','pine-ta-crossunder'),
  supported('ta','rising','rising',[numeric('source'),numeric('length','simple')],'series<bool>',2,2,'Requires length prior source observations.','Checks strict monotonic rise using causal history only.','O(length) per bar.','pine-ta-rising'),
  supported('ta','falling','falling',[numeric('source'),numeric('length','simple')],'series<bool>',2,2,'Requires length prior source observations.','Checks strict monotonic fall using causal history only.','O(length) per bar.','pine-ta-falling'),
  supported('ta','tr','tr',[boolean('handle_na','simple',true,false)],'series<float>',0,1,'Previous close is required unless handle_na is true.','Uses current OHLC and prior close; no future data.','O(1).','pine-ta-tr'),
  partial('ta','stdev','stdev',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires a complete rolling window.','Developing-bar replacement is supported.','O(1) amortized per bar.','pine-ta-stdev',['Pine optional biased argument is not implemented; CoreSpirit currently uses population variance (ddof=0).']),
  partial('ta','variance','variance',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires a complete rolling window.','Developing-bar replacement is supported.','O(1) amortized per bar.','pine-ta-variance',['Pine optional biased argument is not implemented; CoreSpirit currently uses population variance (ddof=0).']),

  // Deterministic math calls use a separate pure-kernel module.
  mathUnary('abs'), mathUnary('sqrt'), mathBinary('pow'), mathUnary('log'), mathUnary('exp'),
  mathUnary('floor'), mathUnary('ceil'), mathUnary('sin'), mathUnary('cos'), mathUnary('tan'),
  mathUnary('asin'), mathUnary('acos'), mathUnary('atan'), mathUnary('log10'),
  mathUnary('sign'),
  mathBinary('atan2'),
  supported('math','round','round',[numeric('number'),numeric('precision','simple',true,0)],'float',1,2,'No historical samples required.','Pure deterministic scalar evaluation.','O(1).','pine-math-round'),
  supported('math','todegrees','todegrees',[numeric('radians')],'float',1,1,'No historical samples required.','Pure deterministic scalar evaluation.','O(1).','pine-math-todegrees'),
  supported('math','toradians','toradians',[numeric('degrees')],'float',1,1,'No historical samples required.','Pure deterministic scalar evaluation.','O(1).','pine-math-toradians'),

  supported('math','avg','avg',[numeric('number0'),numeric('number1'),parameter('numberN','numeric','series',true,undefined,true)],'float',2,10,'No historical samples required.','Pure deterministic scalar evaluation.','O(number of arguments).','pine-math-avg'),
  supported('math','sum','sum',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires the requested source window; missing samples follow the current rolling sum kernel rules.','Current-bar revisions replace the active rolling contribution.','O(1) amortized per bar.','pine-math-sum'),
  supported('math','min','min',[numeric('number0'),numeric('number1'),parameter('numberN','numeric','series',true,undefined,true)],'float',2,10,'No historical samples required.','Pure deterministic scalar evaluation.','O(number of arguments).','pine-math-min'),
  supported('math','max','max',[numeric('number0'),numeric('number1'),parameter('numberN','numeric','series',true,undefined,true)],'float',2,10,'No historical samples required.','Pure deterministic scalar evaluation.','O(number of arguments).','pine-math-max'),

  // The current host request adapter is not yet a full Pine expression request.
  hostBound('request','security',[parameter('symbol','string','simple'),parameter('timeframe','string','simple'),parameter('expression','any','series'),boolean('ignore_invalid_symbol','simple',true,false)],'series<float>',3,4,'pine-request-security-host',['Current request lowering resolves a bounded host field/offset request; it does not yet evaluate arbitrary Pine expression ASTs or all gaps/lookahead/session options.']),
  hostBound('request','security_lower_tf',[parameter('symbol','string','simple'),parameter('timeframe','string','simple'),parameter('expression','any','series')],'array<float>',3,3,'pine-request-security-lower-tf-host',['Lower-timeframe requests are constrained by the data resolver; full tuple, expression and Pine array semantics are not implemented.']),

  // Tuples, reference collections, settings, drawing IDs and strategy engine
  // still need dedicated runtime contracts before these become executable.
  catalog('ta','macd',macdArgs,'[series<float>,series<float>,series<float>]',4,4,'pine-ta-macd',['Tuple return ABI and MACD reference fixtures are not yet implemented.']),
  catalog('ta','adx',[numeric('di_length','simple'),numeric('adx_smoothing','simple')],'series<float>',2,2,'pine-ta-adx',['Directional movement and Wilder smoothing parity is not yet implemented.']),
  catalog('ta','stoch',[numeric('source'),numeric('peak'),numeric('valley'),numeric('period','simple')],'series<float>',4,4,'pine-ta-stoch',['Stochastic kernel and reference fixtures are not yet implemented.']),
  catalog('ta','bb',bandsArgs,'[series<float>,series<float>,series<float>]',3,3,'pine-ta-bb',['Tuple return ABI and precise standard-deviation semantics are not implemented.']),
  catalog('ta','supertrend',[numeric('factor','simple'),numeric('atr_period','simple')],'[series<float>,series<int>]',2,2,'pine-ta-supertrend',['Stateful direction/flip semantics and tuple returns are not implemented.']),
  catalog('ta','vwma',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'pine-ta-vwma',['Volume-weighted rolling kernel is not implemented.']),
  catalog('ta','hma',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'pine-ta-hma',['Hull moving average kernel is not implemented in the Pine runtime.']),
  catalog('ta','cci',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'pine-ta-cci'),
  catalog('ta','mfi',[numeric('length','simple')],'series<float>',1,1,'pine-ta-mfi'),
  catalog('ta','vwap',[numeric('source')],'series<float>',1,2,'pine-ta-vwap',['CoreSpirit session VWAP currently uses hlc3 and does not yet implement the complete source/anchor overload family.']),
  catalog('ta','obv',[],'series<float>',0,0,'pine-ta-obv',['On-balance volume is a variable-style series in Pine; member-value lowering is not implemented.']),
  catalog('ta','pvt',[],'series<float>',0,0,'pine-ta-pvt',['Price-volume trend series kernel is not implemented.']),
  catalog('ta','nvi',[],'series<float>',0,0,'pine-ta-nvi',['Negative volume index series kernel is not implemented.']),
  catalog('ta','pvi',[],'series<float>',0,0,'pine-ta-pvi',['Positive volume index series kernel is not implemented.']),
  catalog('ta','wad',[],'series<float>',0,0,'pine-ta-wad',['Williams accumulation/distribution series kernel is not implemented.']),
  catalog('ta','wvad',[],'series<float>',0,0,'pine-ta-wvad',['Williams variable accumulation/distribution series kernel is not implemented.']),
  catalog('ta','iii',[],'series<float>',0,0,'pine-ta-iii',['Intraday intensity index series kernel is not implemented.']),
  catalog('ta','correlation',[numeric('source1'),numeric('source2'),numeric('length','simple')],'series<float>',3,3,'pine-ta-correlation',['A rolling correlation kernel exists in research math, but Pine ta.correlation runtime semantics are not wired.']),
  catalog('ta','linreg',[numeric('source'),numeric('length','simple'),numeric('offset','simple',true,0)],'series<float>',2,3,'pine-ta-linreg',['Linear-regression kernel exists, but Pine offset and series return semantics are not wired.']),
  catalog('ta','highestbars',[numeric('source'),numeric('length','simple')],'series<int>',2,2,'pine-ta-highestbars'),
  catalog('ta','lowestbars',[numeric('source'),numeric('length','simple')],'series<int>',2,2,'pine-ta-lowestbars'),
  catalog('ta','barssince',[boolean('condition')],'series<int>',1,1,'pine-ta-barssince'),
  catalog('ta','cum',[numeric('source')],'series<float>',1,1,'pine-ta-cum'),


  catalog('math','pi',[],'const<float>',0,0,'pine-math-pi'),
  catalog('math','e',[],'const<float>',0,0,'pine-math-e'),
  catalog('math','phi',[],'const<float>',0,0,'pine-math-phi'),
  catalog('math','e',[],'const<float>',0,0,'pine-math-e'),
  catalog('array','new',[parameter('size','numeric','simple',true,0),parameter('initial_value','any','series',true,null)],'array<T>',0,2,'pine-array-new'),
  catalog('array','from',[parameter('values','any','series',false)],'array<T>',1,1,'pine-array-from'),
  catalog('array','get',[parameter('id','array'),numeric('index','series')],'T',2,2,'pine-array-get'),
  catalog('array','set',[parameter('id','array'),numeric('index'),parameter('value','any')],'void',3,3,'pine-array-set'),
  catalog('array','push',[parameter('id','array'),parameter('value','any')],'void',2,2,'pine-array-push'),
  catalog('array','pop',[parameter('id','array')],'T',1,1,'pine-array-pop'),
  catalog('array','size',[parameter('id','array')],'int',1,1,'pine-array-size'),
  catalog('matrix','new',[numeric('rows','simple'),numeric('columns','simple'),parameter('initial_value','any','series',true,null)],'matrix<T>',2,3,'pine-matrix-new'),
  catalog('matrix','get',[parameter('id','matrix'),numeric('row'),numeric('column')],'T',3,3,'pine-matrix-get'),
  catalog('matrix','set',[parameter('id','matrix'),numeric('row'),numeric('column'),parameter('value','any')],'void',4,4,'pine-matrix-set'),
  catalog('map','new',[],'map<K,V>',0,0,'pine-map-new'),
  catalog('map','put',[parameter('id','map'),parameter('key','any'),parameter('value','any')],'void',3,3,'pine-map-put'),
  catalog('map','get',[parameter('id','map'),parameter('key','any')],'V',2,2,'pine-map-get'),
  catalog('map','contains',[parameter('id','map'),parameter('key','any')],'bool',2,2,'pine-map-contains'),
  catalog('str','format',[parameter('format','string'),parameter('arguments','any','series',true,undefined,true)],'string',1,10,'pine-str-format'),
  catalog('str','tostring',[parameter('value','any')],'string',1,1,'pine-str-tostring'),
  catalog('str','tonumber',[parameter('value','string')],'float',1,1,'pine-str-tonumber'),
  catalog('str','length',[parameter('value','string')],'int',1,1,'pine-str-length'),
  catalog('color','rgb',[numeric('red'),numeric('green'),numeric('blue'),numeric('transp','simple',true,0)],'color',3,4,'pine-color-rgb'),
  catalog('color','new',[parameter('color','color'),numeric('transp','simple')],'color',2,2,'pine-color-new'),
  catalog('input','int',[numeric('defval'),parameter('title','string')],'input<int>',2,10,'pine-input-int'),
  catalog('input','float',[numeric('defval'),parameter('title','string')],'input<float>',2,10,'pine-input-float'),
  catalog('input','bool',[boolean('defval'),parameter('title','string')],'input<bool>',2,10,'pine-input-bool'),
  catalog('input','string',[parameter('defval','string'),parameter('title','string')],'input<string>',2,10,'pine-input-string'),
  catalog('timeframe','in_seconds',[parameter('timeframe','string','simple')],'simple<int>',1,1,'pine-timeframe-in-seconds'),
  catalog('time','timestamp',[parameter('timezone','string','simple'),numeric('year','simple'),numeric('month','simple'),numeric('day','simple')],'series<int>',4,7,'pine-time-timestamp'),
  catalog('syminfo','tickerid',[],'simple<string>',0,0,'pine-syminfo-tickerid'),
  catalog('syminfo','mintick',[],'simple<float>',0,0,'pine-syminfo-mintick'),
  catalog('chart','left_visible_bar_time',[],'series<int>',0,0,'pine-chart-left-visible-time'),
  catalog('barstate','isrealtime',[],'series<bool>',0,0,'pine-barstate-isrealtime'),
  catalog('barstate','isconfirmed',[],'series<bool>',0,0,'pine-barstate-isconfirmed'),
  catalog('strategy','entry',[parameter('id','string'),parameter('direction','string')],'void',2,10,'pine-strategy-entry'),
  catalog('strategy','exit',[parameter('id','string')],'void',1,10,'pine-strategy-exit'),
  catalog('line','new',[numeric('x1'),numeric('y1'),numeric('x2'),numeric('y2')],'line',4,8,'pine-line-new'),
  catalog('box','new',[numeric('left'),numeric('top'),numeric('right'),numeric('bottom')],'box',4,10,'pine-box-new'),
  catalog('label','new',[numeric('x'),numeric('y')],'label',2,10,'pine-label-new'),
  catalog('table','new',[parameter('position','string'),numeric('columns','simple'),numeric('rows','simple')],'table',3,8,'pine-table-new'),
  catalog('polyline','new',[parameter('points','array')],'polyline',1,6,'pine-polyline-new'),
  catalog('log','info',[parameter('message','any')],'void',1,1,'pine-log-info'),
]);

const inventoryNamespaces = new Set(PINE_V6_BUILTIN_NAMESPACE_INVENTORY.map(entry => entry.namespace));
const seen = new Set<string>();
for (const entry of PINE_V6_BUILTIN_REGISTRY) {
  if (!inventoryNamespaces.has(entry.namespace)) throw new Error('Pine v6 builtin namespace is missing from inventory: ' + entry.namespace);
  if (seen.has(entry.qualifiedName)) throw new Error('Duplicate Pine v6 builtin contract: ' + entry.qualifiedName);
  seen.add(entry.qualifiedName);
  if (!entry.overloads.length) throw new Error('Builtin requires at least one overload: ' + entry.qualifiedName);
  for (const item of entry.overloads) {
    if (item.minArgs < 0 || item.maxArgs < item.minArgs || !item.returnType || !item.testFixture) throw new Error('Invalid overload contract: ' + entry.qualifiedName);
    if (item.parameters.some(argument => !argument.name || !argument.type || !argument.qualifier)) throw new Error('Incomplete argument contract: ' + entry.qualifiedName);
    if (!item.historicalRequirement || !item.realtimeBehavior || !item.executionCost || !item.errorBehavior) throw new Error('Incomplete execution contract: ' + entry.qualifiedName);
  }
}

const byQualifiedName = new Map(PINE_V6_BUILTIN_REGISTRY.map(entry => [entry.qualifiedName,entry] as const));

export function getPineV6BuiltinDefinition(namespace: string, name: string): PineV6BuiltinDefinition | undefined {
  return byQualifiedName.get(namespace + '.' + name);
}

function numericType(type: string): boolean {
  const value = type.replace(/^(series|simple|input|const)</,'').replace(/>$/,'');
  return ['number','numeric','int','float'].includes(value);
}
function typeMatches(actual: string, expected: PineV6ParameterType): boolean {
  if (actual === 'unknown' || expected === 'any') return true;
  if (expected === 'numeric') return numericType(actual);
  if (expected === 'boolean') return ['bool','boolean','series<bool>','simple<bool>','input<bool>'].includes(actual);
  if (expected === 'string') return ['string','series<string>','simple<string>','input<string>','const<string>'].includes(actual);
  if (expected === 'color') return ['color','series<color>','simple<color>','input<color>'].includes(actual);
  return actual.startsWith(expected + '<');
}

export type PineV6BuiltinValidation = Readonly<{
  valid: boolean;
  code?: 'BUILTIN_ARGUMENT_COUNT' | 'BUILTIN_ARGUMENT_TYPE';
  message?: string;
}>;

export function validatePineV6BuiltinArguments(
  entry: PineV6BuiltinDefinition,
  argumentTypes: readonly string[],
): PineV6BuiltinValidation {
  if (entry.status === 'catalog-only' || entry.status === 'host-dependent') return Object.freeze({ valid: true });
  const candidates = entry.overloads.filter(item => argumentTypes.length >= item.minArgs && argumentTypes.length <= item.maxArgs);
  if (!candidates.length) {
    const expected = entry.overloads.map(item => item.minArgs === item.maxArgs ? String(item.minArgs) : item.minArgs + '..' + item.maxArgs).join(' or ');
    return Object.freeze({ valid:false, code:'BUILTIN_ARGUMENT_COUNT', message:entry.qualifiedName + ' expects ' + expected + ' arguments; received ' + argumentTypes.length + '.' });
  }
  for (const candidate of candidates) {
    let valid = true;
    for (let index = 0; index < argumentTypes.length; index += 1) {
      const expected = candidate.parameters[index] ?? (candidate.parameters.at(-1)?.variadic ? candidate.parameters.at(-1) : undefined);
      if (!expected || !typeMatches(argumentTypes[index] ?? 'unknown',expected.type)) { valid = false; break; }
    }
    if (valid) return Object.freeze({valid:true});
  }
  return Object.freeze({valid:false,code:'BUILTIN_ARGUMENT_TYPE',message:'Argument types do not match a registered overload for ' + entry.qualifiedName + '.'});
}

export function pineV6BuiltinIsExecutable(entry: PineV6BuiltinDefinition | undefined): boolean {
  return !!entry && (entry.status === 'implemented' || entry.status === 'partial');
}
