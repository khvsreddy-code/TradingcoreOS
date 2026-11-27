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
  { namespace:'str', coverage:'partial', description:'String formatting, conversion, searching, splitting, replacement and Unicode operations; regex and date/time formatting remain catalog-only.', referenceUrl:reference },
  { namespace:'color', coverage:'partial', description:'Color construction, channel extraction, transparency and gradient operations; named constant values remain catalog-only.', referenceUrl:reference },
  { namespace:'input', coverage:'catalog-only', description:'Settings declarations, constraints, grouping and input-qualified values.', referenceUrl:reference },
  { namespace:'request', coverage:'host-dependent', description:'Cross-symbol/timeframe, intrabar, financial and economic data requests.', referenceUrl:reference },
  { namespace:'timeframe', coverage:'catalog-only', description:'Chart timeframe metadata and conversion helpers.', referenceUrl:reference },
  { namespace:'time', coverage:'catalog-only', description:'Timestamps, session/timezone operations and calendar components.', referenceUrl:reference },
  { namespace:'syminfo', coverage:'catalog-only', description:'Symbol, exchange, tick-size, currency and contract metadata.', referenceUrl:reference },
  { namespace:'chart', coverage:'catalog-only', description:'Chart type, visible-range, scale and point metadata.', referenceUrl:reference },
  { namespace:'barstate', coverage:'catalog-only', description:'Historical, realtime, confirmed, first/last and new-bar state.', referenceUrl:reference },
  { namespace:'strategy', coverage:'partial', description:'Strategy commands and deterministic simulator order handling; position/accounting value bindings remain incomplete.', referenceUrl:reference },
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
  partial('ta','highest','highest',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires a complete rolling window.','Current-bar revisions replace the active source value.','O(1) amortized per bar.','pine-ta-highest',['The one-argument overload defaulting to high is not implemented.']),
  partial('ta','lowest','lowest',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires a complete rolling window.','Current-bar revisions replace the active source value.','O(1) amortized per bar.','pine-ta-lowest',['The one-argument overload defaulting to low is not implemented.']),
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
  partial('ta','tr','tr',[boolean('handle_na','simple',true,false)],'series<float>',0,1,'Previous close is required unless handle_na is true.','Uses current OHLC and prior close; no future data.','O(1).','pine-ta-tr',['The callable ta.tr(handle_na) overload is supported; bare ta.tr variable member access still needs member-value lowering.']),
  partial('ta','stdev','stdev',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires a complete rolling window.','Developing-bar replacement is supported.','O(1) amortized per bar.','pine-ta-stdev',['Pine optional biased argument is not implemented; CoreSpirit currently uses population variance (ddof=0).']),
  partial('ta','variance','variance',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires a complete rolling window.','Developing-bar replacement is supported.','O(1) amortized per bar.','pine-ta-variance',['Pine optional biased argument is not implemented; CoreSpirit currently uses population variance (ddof=0).']),

  // Deterministic math calls use a separate pure-kernel module.
  mathUnary('abs'), mathUnary('sqrt'), mathBinary('pow'), mathUnary('log'), mathUnary('exp'),
  supported('math','floor','floor',[numeric('number')],'int',1,1,'No history required.','Pure deterministic scalar evaluation.','O(1).','pine-math-floor'),
  supported('math','ceil','ceil',[numeric('number')],'int',1,1,'No history required.','Pure deterministic scalar evaluation.','O(1).','pine-math-ceil'),
  mathUnary('sin'), mathUnary('cos'), mathUnary('tan'),
  mathUnary('asin'), mathUnary('acos'), mathUnary('atan'), mathUnary('log10'),
  mathUnary('sign'),

  definition('math','round','implemented',[
    overload([numeric('number')],'int',1,1,'No historical samples required.','Pure deterministic scalar evaluation; ties round up.','O(1).','pine-math-round-integer'),
    overload([numeric('number'),numeric('precision','simple')],'float',2,2,'No historical samples required.','Pure deterministic scalar evaluation at the requested decimal precision.','O(1).','pine-math-round-precision'),
  ],'round'),
  supported('math','todegrees','todegrees',[numeric('radians')],'float',1,1,'No historical samples required.','Pure deterministic scalar evaluation.','O(1).','pine-math-todegrees'),
  supported('math','toradians','toradians',[numeric('degrees')],'float',1,1,'No historical samples required.','Pure deterministic scalar evaluation.','O(1).','pine-math-toradians'),

  supported('math','avg','avg',[numeric('number0'),numeric('number1'),parameter('numberN','numeric','series',true,undefined,true)],'float',2,10,'No historical samples required.','Pure deterministic scalar evaluation.','O(number of arguments).','pine-math-avg'),
  supported('math','sum','sum',[numeric('source'),numeric('length')],'series<float>',2,2,'Requires the requested source window; missing samples follow the current rolling sum kernel rules.','Current-bar revisions replace the active rolling contribution.','O(1) amortized per bar.','pine-math-sum'),
  supported('math','min','min',[numeric('number0'),numeric('number1'),parameter('numberN','numeric','series',true,undefined,true)],'float',2,10,'No historical samples required.','Pure deterministic scalar evaluation.','O(number of arguments).','pine-math-min'),
  supported('math','max','max',[numeric('number0'),numeric('number1'),parameter('numberN','numeric','series',true,undefined,true)],'float',2,10,'No historical samples required.','Pure deterministic scalar evaluation.','O(number of arguments).','pine-math-max'),

  // The current host request adapter is not yet a full Pine expression request.
  hostBound('request','security',[
    parameter('symbol','string','series'),
    parameter('timeframe','string','series'),
    parameter('expression','any','series'),
    parameter('gaps','any','simple',true,'barmerge.gaps_off'),
    parameter('lookahead','any','simple',true,'barmerge.lookahead_off'),
    boolean('ignore_invalid_symbol','input',true,false),
    parameter('currency','string','series',true,'syminfo.currency'),
    numeric('calc_bars_count','simple',true),
  ],'series<T>',3,8,'pine-request-security-host',['The current CoreSpirit host adapter accepts bounded symbol/timeframe/field/offset/alignment requests only. It does not yet evaluate arbitrary Pine expression ASTs, tuple expressions, currency conversion, gaps/lookahead policies or calc_bars_count.']),
  hostBound('request','security_lower_tf',[
    parameter('symbol','string','series'),
    parameter('timeframe','string','series'),
    parameter('expression','any','series'),
    boolean('ignore_invalid_symbol','series',true,false),
    parameter('currency','string','series',true,'syminfo.currency'),
    boolean('ignore_invalid_timeframe','series',true,false),
    numeric('calc_bars_count','simple',true),
  ],'array<T>',3,7,'pine-request-security-lower-tf-host',['The current lower-timeframe host adapter does not support Pine tuple expression evaluation, typed arrays, currency conversion, ignore_invalid_timeframe or calc_bars_count semantics.']),
  hostBound('request','currency_rate',[parameter('from','string','simple'),parameter('to','string','simple'),boolean('ignore_invalid_currency','simple',true,false)],'series<float>',2,3,'pine-request-currency-rate',['Currency conversion data is not currently exposed by the CoreSpirit data resolver.']),
  hostBound('request','dividends',[parameter('ticker','string','simple'),parameter('field','any','simple'),parameter('gaps','any','simple',true),parameter('lookahead','any','simple',true)],'series<float>',2,6,'pine-request-dividends',['Corporate-action data and gaps/lookahead alignment are not implemented.']),
  hostBound('request','splits',[parameter('ticker','string','simple'),parameter('field','any','simple'),parameter('gaps','any','simple',true),parameter('lookahead','any','simple',true)],'series<float>',2,5,'pine-request-splits',['Corporate-action data and gaps/lookahead alignment are not implemented.']),
  hostBound('request','earnings',[parameter('ticker','string','simple'),parameter('field','any','simple'),parameter('gaps','any','simple',true),parameter('lookahead','any','simple',true)],'series<float>',2,6,'pine-request-earnings',['Earnings event data and gaps/lookahead alignment are not implemented.']),
  hostBound('request','financial',[parameter('symbol','string','simple'),parameter('financial_id','string','simple'),parameter('period','string','simple')],'series<float>',3,6,'pine-request-financial',['Fundamental financial datasets are not exposed by the CoreSpirit data resolver.']),
  hostBound('request','economic',[parameter('country_code','string','simple'),parameter('field','string','simple')],'series<float>',2,4,'pine-request-economic',['Macroeconomic datasets are not exposed by the CoreSpirit data resolver.']),
  hostBound('request','seed',[parameter('source','string','simple'),parameter('symbol','string','simple'),parameter('expression','any','series')],'series<float>',3,5,'pine-request-seed',['External GitHub-hosted seed datasets are not supported by the current data resolver.']),
  hostBound('request','footprint',[parameter('ticker','string','simple')],'series<footprint>',1,4,'pine-request-footprint',['CoreSpirit has its own orderflow/footprint host API; Pine footprint object compatibility is not implemented.']),
  catalog('request','quandl',[parameter('ticker','string','simple'),parameter('expression','string','simple')],'series<float>',2,4,'pine-request-quandl',['Legacy Quandl data request integration is not implemented.']),


  // Tuples, reference collections, settings, drawing IDs and strategy engine
  // still need dedicated runtime contracts before these become executable.
  catalog('ta','macd',macdArgs,'[series<float>,series<float>,series<float>]',4,4,'pine-ta-macd',['Tuple return ABI and MACD reference fixtures are not yet implemented.']),

  catalog('ta','stoch',[numeric('source'),numeric('peak'),numeric('valley'),numeric('period','simple')],'series<float>',4,4,'pine-ta-stoch',['Stochastic kernel and reference fixtures are not yet implemented.']),
  catalog('ta','bb',bandsArgs,'[series<float>,series<float>,series<float>]',3,3,'pine-ta-bb',['Tuple return ABI and precise standard-deviation semantics are not implemented.']),
  catalog('ta','supertrend',[numeric('factor','simple'),numeric('atr_period','simple')],'[series<float>,series<int>]',2,2,'pine-ta-supertrend',['Stateful direction/flip semantics and tuple returns are not implemented.']),
  supported('ta','vwma','vwma',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires a complete rolling price and volume window.','Forming-bar price and volume revisions replace the current weighted contribution.','O(1) amortized per bar.','pine-ta-vwma'),
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
  catalog('ta','alma',[numeric('source'),numeric('length','simple'),numeric('offset','simple'),numeric('sigma','simple')],'series<float>',4,4,'pine-ta-alma'),
  catalog('ta','bbw',[numeric('source'),numeric('length','simple'),numeric('multiplier','simple')],'series<float>',3,3,'pine-ta-bbw'),
  catalog('ta','dev',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'pine-ta-dev'),
  catalog('ta','dmi',[numeric('di_length','simple'),numeric('adx_smoothing','simple')],'[series<float>,series<float>,series<float>]',2,2,'pine-ta-dmi',['Tuple return ABI is not implemented.']),
  catalog('ta','accdist',[],'series<float>',0,0,'pine-ta-accdist',['Pine exposes accumulation/distribution as a namespace variable; typed value-member lowering is not implemented.']),

  supported('ta','mom','change',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires the current source value and length bars of prior source history.','Developing-bar revisions replace the current lagged observation.','O(1) amortized per bar with a fixed-capacity lag ring.','pine-ta-mom'),
  catalog('ta','percentile_linear_interpolation',[numeric('source'),numeric('length','simple'),numeric('percentage','simple')],'series<float>',3,3,'pine-ta-percentile-linear'),
  catalog('ta','percentile_nearest_rank',[numeric('source'),numeric('length','simple'),numeric('percentage','simple')],'series<float>',3,3,'pine-ta-percentile-nearest'),
  catalog('ta','percentrank',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'pine-ta-percentrank'),
  catalog('ta','pivotlow',[numeric('source'),numeric('leftbars','simple'),numeric('rightbars','simple')],'series<float>',2,4,'pine-ta-pivotlow',['Requires future rightbars confirmation; causal confirmation delay and max_bars_back rules are not implemented.']),
  catalog('ta','pivothigh',[numeric('source'),numeric('leftbars','simple'),numeric('rightbars','simple')],'series<float>',2,4,'pine-ta-pivothigh',['Requires future rightbars confirmation; causal confirmation delay and max_bars_back rules are not implemented.']),
  supported('ta','range','ta_range',[numeric('source'),numeric('length','simple')],'series<float>',2,2,'Requires length consecutive finite source observations.','Current-bar revisions replace the active source; no future samples are read.','O(1) amortized per bar using the monotonic extrema window.','pine-ta-range'),
  catalog('ta','sar',[numeric('start','simple'),numeric('increment','simple'),numeric('maximum','simple')],'series<float>',3,3,'pine-ta-sar'),
  catalog('ta','swma',[numeric('source')],'series<float>',1,1,'pine-ta-swma'),
  catalog('ta','tsi',[numeric('source'),numeric('short_length','simple'),numeric('long_length','simple')],'series<float>',3,3,'pine-ta-tsi'),
  catalog('ta','wpr',[numeric('length','simple')],'series<float>',1,1,'pine-ta-wpr'),



  catalog('math','pi',[],'const<float>',0,0,'pine-math-pi'),
  catalog('math','e',[],'const<float>',0,0,'pine-math-e'),
  catalog('math','phi',[],'const<float>',0,0,'pine-math-phi'),

  catalog('math','random',[numeric('minimum','series',true,0),numeric('maximum','series',true,1),numeric('seed','series',true)],'series<float>',0,3,'pine-math-random',['Seeded deterministic stream and rollback-safe random state are not implemented.']),
  catalog('math','round_to_mintick',[numeric('number')],'series<float>',1,1,'pine-math-round-to-mintick',['Requires symbol mintick metadata in the scalar execution context.']),

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
  catalog('array','shift',[parameter('id','array')],'T',1,1,'pine-array-shift'),
  catalog('array','unshift',[parameter('id','array'),parameter('value','any')],'int',2,2,'pine-array-unshift'),
  catalog('array','insert',[parameter('id','array'),numeric('index'),parameter('value','any')],'void',3,3,'pine-array-insert'),
  catalog('array','remove',[parameter('id','array'),numeric('index')],'T',2,2,'pine-array-remove'),
  catalog('array','reverse',[parameter('id','array')],'void',1,1,'pine-array-reverse'),
  catalog('array','sort',[parameter('id','array'),parameter('order','any','simple',true)],'void',1,2,'pine-array-sort'),
  catalog('array','slice',[parameter('id','array'),numeric('index_from'),numeric('index_to')],'array<T>',3,3,'pine-array-slice'),
  catalog('array','copy',[parameter('id','array')],'array<T>',1,1,'pine-array-copy'),
  catalog('matrix','rows',[parameter('id','matrix')],'int',1,1,'pine-matrix-rows'),
  catalog('matrix','columns',[parameter('id','matrix')],'int',1,1,'pine-matrix-columns'),
  catalog('matrix','add',[parameter('id1','matrix'),parameter('id2','matrix')],'matrix<T>',2,2,'pine-matrix-add'),
  catalog('matrix','mult',[parameter('id1','matrix'),parameter('id2','matrix')],'matrix<T>',2,2,'pine-matrix-mult'),
  catalog('matrix','transpose',[parameter('id','matrix')],'matrix<T>',1,1,'pine-matrix-transpose'),
  catalog('matrix','det',[parameter('id','matrix')],'float',1,1,'pine-matrix-det'),
  catalog('matrix','inv',[parameter('id','matrix')],'matrix<T>',1,1,'pine-matrix-inv'),
  catalog('matrix','sum',[parameter('id','matrix')],'float',1,1,'pine-matrix-sum'),
  catalog('matrix','avg',[parameter('id','matrix')],'float',1,1,'pine-matrix-avg'),
  catalog('map','remove',[parameter('id','map'),parameter('key','any')],'void',2,2,'pine-map-remove'),
  catalog('map','keys',[parameter('id','map')],'array<K>',1,1,'pine-map-keys'),
  catalog('map','values',[parameter('id','map')],'array<V>',1,1,'pine-map-values'),
  catalog('map','size',[parameter('id','map')],'int',1,1,'pine-map-size'),
  supported('str','substring','pine.str.substring',[parameter('source','string'),numeric('begin'),numeric('end','series',true)],'string',2,3,'No historical samples required.','Unicode code-point slicing with start-inclusive/end-exclusive boundaries.','O(source length).','pine-str-substring'),
  supported('str','replace','pine.str.replace',[parameter('source','string'),parameter('target','string'),parameter('replacement','string')],'string',3,3,'No historical samples required.','Replaces the first literal occurrence only.','O(source length).','pine-str-replace'),
  supported('str','split','pine.str.split',[parameter('source','string'),parameter('separator','string')],'array<string>',2,2,'No historical samples required.','Returns a bounded array of literal-separator substrings.','O(source length).','pine-str-split'),
  supported('str','lower','pine.str.lower',[parameter('source','string')],'string',1,1,'No historical samples required.','Locale-independent Unicode lowercase conversion.','O(source length).','pine-str-lower'),
  supported('str','upper','pine.str.upper',[parameter('source','string')],'string',1,1,'No historical samples required.','Locale-independent Unicode uppercase conversion.','O(source length).','pine-str-upper'),
  supported('str','contains','pine.str.contains',[parameter('source','string'),parameter('substring','string')],'bool',2,2,'No historical samples required.','Literal substring containment.','O(source length).','pine-str-contains'),
  supported('str','startswith','pine.str.startswith',[parameter('source','string'),parameter('prefix','string')],'bool',2,2,'No historical samples required.','Literal prefix test.','O(prefix length).','pine-str-startswith'),
  supported('str','endswith','pine.str.endswith',[parameter('source','string'),parameter('suffix','string')],'bool',2,2,'No historical samples required.','Literal suffix test.','O(suffix length).','pine-str-endswith'),
  supported('str','pos','pine.str.pos',[parameter('source','string'),parameter('substring','string')],'int',2,2,'No historical samples required.','Returns the first code-point offset or na when not found.','O(source length).','pine-str-pos'),
  supported('str','replace_all','pine.str.replace_all',[parameter('source','string'),parameter('target','string'),parameter('replacement','string')],'string',3,3,'No historical samples required.','Replaces all non-overlapping literal occurrences.','O(source length + output length).','pine-str-replace-all'),
  supported('str','repeat','pine.str.repeat',[parameter('source','string'),numeric('repeat','series'),parameter('separator','string','series',true)],'string',2,3,'No historical samples required.','Rejects negative/non-integer counts and caps output at Pine limits.','O(output length).','pine-str-repeat'),
  supported('str','trim','pine.str.trim',[parameter('source','string')],'string',1,1,'No historical samples required.','Trims leading and trailing whitespace.','O(source length).','pine-str-trim'),
  catalog('str','match',[parameter('source','string'),parameter('regex','string')],'string',2,2,'pine-str-match',['Pine regex behavior is not interchangeable with JavaScript regular expressions.']),
  catalog('str','format_time',[numeric('time'),parameter('format','string','simple'),parameter('timezone','string','simple',true)],'string',1,3,'pine-str-format-time',['Timezone-aware Pine date/time token formatting is not implemented.']),

  supported('color','from_gradient','pine.color.from_gradient',[numeric('value'),numeric('bottom_value'),numeric('top_value'),parameter('bottom_color','color'),parameter('top_color','color')],'color',5,5,'No historical samples required.','Clamped linear interpolation of RGBA channels, including transparency.','O(1).','pine-color-gradient'),
  supported('color','r','pine.color.r',[parameter('color','color')],'int',1,1,'No historical samples required.','Returns the red channel in the 0..255 range.','O(1).','pine-color-r'),
  supported('color','g','pine.color.g',[parameter('color','color')],'int',1,1,'No historical samples required.','Returns the green channel in the 0..255 range.','O(1).','pine-color-g'),
  supported('color','b','pine.color.b',[parameter('color','color')],'int',1,1,'No historical samples required.','Returns the blue channel in the 0..255 range.','O(1).','pine-color-b'),
  supported('color','t','pine.color.t',[parameter('color','color')],'float',1,1,'No historical samples required.','Returns Pine transparency in the 0..100 range from the alpha byte.','O(1).','pine-color-t'),
  catalog('input','source',[parameter('defval','any'),parameter('title','string')],'input<series<float>>',2,10,'pine-input-source'),
  catalog('input','symbol',[parameter('defval','string'),parameter('title','string')],'input<string>',2,10,'pine-input-symbol'),
  catalog('input','timeframe',[parameter('defval','string'),parameter('title','string')],'input<string>',2,10,'pine-input-timeframe'),
  catalog('input','session',[parameter('defval','string'),parameter('title','string')],'input<string>',2,10,'pine-input-session'),
  catalog('input','color',[parameter('defval','color'),parameter('title','string')],'input<color>',2,10,'pine-input-color'),
  catalog('input','text_area',[parameter('defval','string'),parameter('title','string')],'input<string>',2,10,'pine-input-text-area'),

  partial('str','format','pine.str.format',[parameter('formatString','string'),parameter('arguments','any','series',true,undefined,true)],'string',1,10,'No historical samples required.','Supports positional placeholders, quoted literal braces and numeric number-pattern placeholders; specialized date/time formatting remains separate.','O(format length + output length).','pine-str-format',['The complete Pine number/date formatting token set is not yet implemented.']),
  partial('str','tostring','pine.str.tostring',[parameter('value','any'),parameter('format','string','simple',true)],'string',1,2,'No historical samples required.','Supports scalar formatting and bounded array/map display; enum and matrix format parity is pending.','O(value size).','pine-str-tostring',['format.mintick/percent/volume and all array/matrix-specific formatting are not yet implemented.']),
  supported('str','tonumber','pine.str.tonumber',[parameter('value','string')],'float',1,1,'No historical samples required.','Invalid numeric strings return na; accepts ASCII sign and decimal-point syntax.','O(source length).','pine-str-tonumber'),
  supported('str','length','pine.str.length',[parameter('value','string')],'int',1,1,'No historical samples required.','Counts Unicode code points, including invisible characters.','O(source length).','pine-str-length'),
  supported('color','rgb','pine.color.rgb',[numeric('red'),numeric('green'),numeric('blue'),numeric('transp','series',true,0)],'color',3,4,'No historical samples required.','Channels clamp to 0..255 and transparency to 0..100 before RGBA encoding.','O(1).','pine-color-rgb'),
  supported('color','new','pine.color.new',[parameter('color','color'),numeric('transp')],'color',2,2,'No historical samples required.','Replaces color transparency while preserving RGB channels.','O(1).','pine-color-new'),
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
  catalog('line','new',[numeric('x1'),numeric('y1'),numeric('x2'),numeric('y2')],'line',4,8,'pine-line-new'),
  catalog('box','new',[numeric('left'),numeric('top'),numeric('right'),numeric('bottom')],'box',4,10,'pine-box-new'),
  catalog('label','new',[numeric('x'),numeric('y')],'label',2,10,'pine-label-new'),
  catalog('table','new',[parameter('position','string'),numeric('columns','simple'),numeric('rows','simple')],'table',3,8,'pine-table-new'),
  catalog('polyline','new',[parameter('points','array')],'polyline',1,6,'pine-polyline-new'),

  catalog('timeframe','period',[],'simple<string>',0,0,'pine-timeframe-period'),
  catalog('timeframe','multiplier',[],'simple<int>',0,0,'pine-timeframe-multiplier'),
  catalog('timeframe','isseconds',[],'simple<bool>',0,0,'pine-timeframe-isseconds'),
  catalog('timeframe','isminutes',[],'simple<bool>',0,0,'pine-timeframe-isminutes'),
  catalog('timeframe','isintraday',[],'simple<bool>',0,0,'pine-timeframe-isintraday'),
  catalog('timeframe','isdaily',[],'simple<bool>',0,0,'pine-timeframe-isdaily'),
  catalog('timeframe','isweekly',[],'simple<bool>',0,0,'pine-timeframe-isweekly'),
  catalog('timeframe','ismonthly',[],'simple<bool>',0,0,'pine-timeframe-ismonthly'),
  catalog('timeframe','isdwm',[],'simple<bool>',0,0,'pine-timeframe-isdwm'),
  catalog('timeframe','main_period',[],'simple<string>',0,0,'pine-timeframe-main-period'),
  catalog('time','time',[],'series<int>',0,0,'pine-time-time'),
  catalog('time','time_close',[],'series<int>',0,0,'pine-time-time-close'),
  catalog('time','year',[],'series<int>',0,0,'pine-time-year'),
  catalog('time','month',[],'series<int>',0,0,'pine-time-month'),
  catalog('time','dayofmonth',[],'series<int>',0,0,'pine-time-dayofmonth'),
  catalog('time','dayofweek',[],'series<int>',0,0,'pine-time-dayofweek'),
  catalog('time','weekofyear',[],'series<int>',0,0,'pine-time-weekofyear'),
  catalog('time','hour',[],'series<int>',0,0,'pine-time-hour'),
  catalog('time','minute',[],'series<int>',0,0,'pine-time-minute'),
  catalog('time','second',[],'series<int>',0,0,'pine-time-second'),
  catalog('syminfo','ticker',[],'simple<string>',0,0,'pine-syminfo-ticker'),
  catalog('syminfo','prefix',[],'simple<string>',0,0,'pine-syminfo-prefix'),
  catalog('syminfo','basecurrency',[],'simple<string>',0,0,'pine-syminfo-basecurrency'),
  catalog('syminfo','currency',[],'simple<string>',0,0,'pine-syminfo-currency'),
  catalog('syminfo','description',[],'simple<string>',0,0,'pine-syminfo-description'),
  catalog('syminfo','main_tickerid',[],'simple<string>',0,0,'pine-syminfo-main-tickerid'),
  catalog('syminfo','mincontract',[],'simple<float>',0,0,'pine-syminfo-mincontract'),
  catalog('syminfo','pointvalue',[],'simple<float>',0,0,'pine-syminfo-pointvalue'),
  catalog('syminfo','root',[],'simple<string>',0,0,'pine-syminfo-root'),
  catalog('syminfo','session',[],'simple<string>',0,0,'pine-syminfo-session'),
  catalog('syminfo','type',[],'simple<string>',0,0,'pine-syminfo-type'),
  catalog('syminfo','timezone',[],'simple<string>',0,0,'pine-syminfo-timezone'),
  catalog('syminfo','volumetype',[],'simple<string>',0,0,'pine-syminfo-volumetype'),
  catalog('syminfo','expiration_date',[],'simple<int>',0,0,'pine-syminfo-expiration-date'),
  catalog('syminfo','isin',[],'simple<string>',0,0,'pine-syminfo-isin'),
  catalog('syminfo','industry',[],'simple<string>',0,0,'pine-syminfo-industry'),
  catalog('syminfo','sector',[],'simple<string>',0,0,'pine-syminfo-sector'),
  catalog('syminfo','current_contract',[],'simple<string>',0,0,'pine-syminfo-current-contract'),
  catalog('syminfo','minmove',[],'simple<int>',0,0,'pine-syminfo-minmove'),
  catalog('syminfo','pricescale',[],'simple<int>',0,0,'pine-syminfo-pricescale'),
  catalog('syminfo','employees',[],'simple<int>',0,0,'pine-syminfo-employees'),
  catalog('syminfo','shareholders',[],'simple<int>',0,0,'pine-syminfo-shareholders'),
  catalog('syminfo','shares_outstanding_float',[],'simple<float>',0,0,'pine-syminfo-shares-float'),
  catalog('syminfo','shares_outstanding_total',[],'simple<int>',0,0,'pine-syminfo-shares-total'),

  catalog('chart','is_standard',[],'simple<bool>',0,0,'pine-chart-is-standard'),
  catalog('chart','is_heikinashi',[],'simple<bool>',0,0,'pine-chart-is-heikinashi'),
  catalog('chart','is_renko',[],'simple<bool>',0,0,'pine-chart-is-renko'),
  catalog('chart','is_kagi',[],'simple<bool>',0,0,'pine-chart-is-kagi'),
  catalog('chart','is_pnf',[],'simple<bool>',0,0,'pine-chart-is-pnf'),
  catalog('chart','is_linebreak',[],'simple<bool>',0,0,'pine-chart-is-linebreak'),
  catalog('chart','is_range',[],'simple<bool>',0,0,'pine-chart-is-range'),
  catalog('chart','is_time_based',[],'simple<bool>',0,0,'pine-chart-is-time-based'),
  catalog('barstate','isfirst',[],'series<bool>',0,0,'pine-barstate-isfirst'),
  catalog('barstate','islast',[],'series<bool>',0,0,'pine-barstate-islast'),
  catalog('barstate','ishistory',[],'series<bool>',0,0,'pine-barstate-ishistory'),
  catalog('barstate','isnew',[],'series<bool>',0,0,'pine-barstate-isnew'),
  catalog('barstate','islastconfirmedhistory',[],'series<bool>',0,0,'pine-barstate-islastconfirmedhistory'),
  partial('strategy','entry','pine_strategy_entry',[
    parameter('id','string','simple'),parameter('direction','string','simple'),
    numeric('qty','series',true),numeric('limit','series',true),numeric('stop','series',true),
    parameter('oca_name','string','simple',true),parameter('oca_type','string','simple',true),parameter('comment','string','series',true),
    parameter('alert_message','string','series',true),boolean('disable_alert','simple',true),
  ],'void',2,10,'Strategy orders are simulated after the signal bar; fills use the configured deterministic broker emulator.',
    'Orders are host-isolated simulation intents. Forming-bar order recalculation and TradingView tick parity are not yet guaranteed.',
    'One command per call site and bar; simulator order admission is bounded.','pine-strategy-entry',['Named arguments and full Pine declaration defaults are not yet wired into the strategy command ABI.']),
  partial('strategy','order','pine_strategy_order',[
    parameter('id','string','simple'),parameter('direction','string','simple'),
    numeric('qty','series',true),numeric('limit','series',true),numeric('stop','series',true),
    parameter('oca_name','string','simple',true),parameter('oca_type','string','simple',true),parameter('comment','string','series',true),
    parameter('alert_message','string','series',true),boolean('disable_alert','simple',true),
  ],'void',2,10,'Strategy orders are simulated after the signal bar; market, limit, stop and stop-limit forms are supported.',
    'Orders remain simulation-only and cannot reach a live broker from the strategy namespace.',
    'One command per call site and bar; simulator order admission is bounded.','pine-strategy-order',['Named-argument permutations, same-tick OCA races, and exact OCA group semantics remain partially modeled.']),
  partial('strategy','exit','pine_strategy_exit',[
    parameter('id','string','simple'),parameter('from_entry','string','simple',true),
    numeric('qty','series',true),numeric('qty_percent','series',true),numeric('profit','series',true),
    numeric('limit','series',true),numeric('loss','series',true),numeric('stop','series',true),
    numeric('trail_price','series',true),numeric('trail_points','series',true),numeric('trail_offset','series',true),
    parameter('comment','string','series',true),parameter('comment_profit','string','series',true),
    parameter('comment_loss','string','series',true),parameter('comment_trailing','string','series',true),
    parameter('alert_message','string','series',true),parameter('alert_profit','string','series',true),
    parameter('alert_loss','string','series',true),parameter('alert_trailing','string','series',true),boolean('disable_alert','simple',true),
  ],'void',1,20,'Exit brackets require an open matching simulated position and become eligible after the signal bar.',
    'Stop/limit and profit/loss tick brackets are modeled; trailing stops and same-bar immediacy are rejected.',
    'Bounded to one retained bracket per command event; OHLC ambiguity uses the configured policy.','pine-strategy-exit',['Pyramided per-entry lots, trailing stops, full OCA semantics and exact partial-exit reconciliation are not yet conformant.']),
  partial('strategy','close','pine_strategy_close',[
    parameter('id','string','simple'),parameter('comment','string','series',true),numeric('qty','series',true),
    numeric('qty_percent','series',true),parameter('alert_message','string','series',true),boolean('immediately','simple',true),
    boolean('disable_alert','simple',true),
  ],'void',1,7,'Market close is queued after the signal bar and fills on the next eligible simulated bar.',
    'immediately=true is explicitly rejected by the adapter; simulation is never a live broker action.',
    'One bounded close intent per call site and bar.','pine-strategy-close',['Same-bar close execution and alert-message fill substitution are not modeled.']),
  partial('strategy','close_all','pine_strategy_close_all',[
    parameter('comment','string','series',true),parameter('alert_message','string','series',true),
    boolean('immediately','simple',true),boolean('disable_alert','simple',true),
  ],'void',0,4,'Closes all simulated open positions on the next eligible bar.',
    'immediately=true is explicitly rejected by the adapter.','Bounded by the simulator symbol cap.','pine-strategy-close-all',['Same-bar close execution is not modeled.']),
  partial('strategy','cancel','pine_strategy_cancel',[parameter('id','string','simple')],'void',1,1,
    'Cancels matching pending simulation orders by Pine entry ID.','No live broker order is ever addressed.','Linear scan over bounded simulation orders.','pine-strategy-cancel',[]),
  partial('strategy','cancel_all','pine_strategy_cancel_all',[],'void',0,0,
    'Cancels all pending orders and protective exits in the simulation run.','No live broker order is ever addressed.','Linear scan over bounded simulation state.','pine-strategy-cancel-all',[]),
  catalog('strategy','equity',[],'series<float>',0,0,'pine-strategy-equity'),
  catalog('strategy','initial_capital',[],'const<float>',0,0,'pine-strategy-initial-capital'),
  catalog('strategy','grossloss',[],'series<float>',0,0,'pine-strategy-grossloss'),
  catalog('strategy','grossprofit',[],'series<float>',0,0,'pine-strategy-grossprofit'),
  catalog('strategy','wintrades',[],'series<int>',0,0,'pine-strategy-wintrades'),
  catalog('strategy','losstrades',[],'series<int>',0,0,'pine-strategy-losstrades'),
  catalog('strategy','position_avg_price',[],'series<float>',0,0,'pine-strategy-position-avg-price'),
  catalog('strategy','position_size',[],'series<float>',0,0,'pine-strategy-position-size'),
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

function stripQualifier(type: string): string {
  return type.trim()
    .replace(/^(series|simple|input|const)\s*</,'')
    .replace(/^(series|simple|input|const)\s+/,'')
    .replace(/>$/,'');
}
function numericType(type: string): boolean {
  return ['number','numeric','int','float'].includes(stripQualifier(type));
}
function actualQualifier(type: string): PineV6Qualifier | undefined {
  const match=type.trim().match(/^(const|input|simple|series)(?:<|\s)/);
  return match?.[1] as PineV6Qualifier | undefined;
}
const qualifierRank: Readonly<Record<PineV6Qualifier,number>> = Object.freeze({
  const:0,input:1,simple:2,series:3,
});
function qualifierMatches(type: string, expected: PineV6Qualifier): boolean {
  const actual=actualQualifier(type);
  return actual === undefined || qualifierRank[actual] <= qualifierRank[expected];
}
function typeMatches(actual: string, expected: PineV6ParameterType): boolean {
  if (actual === 'unknown' || expected === 'any') return true;
  const value=stripQualifier(actual);
  if (expected === 'numeric') return numericType(actual);
  if (expected === 'boolean') return ['bool','boolean'].includes(value);
  if (expected === 'string') return value === 'string';
  if (expected === 'color') return value === 'color';
  return value.startsWith(expected + '<');
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
      const actualType=argumentTypes[index] ?? 'unknown';
      if (!expected || !typeMatches(actualType,expected.type) || !qualifierMatches(actualType,expected.qualifier)) { valid = false; break; }
    }
    if (valid) return Object.freeze({valid:true});
  }
  return Object.freeze({valid:false,code:'BUILTIN_ARGUMENT_TYPE',message:'Argument types do not match a registered overload for ' + entry.qualifiedName + '.'});
}

export function pineV6BuiltinIsExecutable(entry: PineV6BuiltinDefinition | undefined): boolean {
  return !!entry && (entry.status === 'implemented' || entry.status === 'partial');
}
