/**
 * Point-in-time OHLCV feature engineering for the CoreSpirit research plane.
 *
 * Features are built from confirmed bars only. Every output column has its own
 * availability timestamp column; a derived feature inherits the latest
 * availability of every source observation that contributed to its value.
 * Warm-up rows stay NaN and are never fabricated as zeros.
 */
import { atr, ema, linearRegression, rollingMean, rollingStd } from './numericalKernels';

export type CoreSpiritResearchMarketField = 'open'|'high'|'low'|'close'|'volume';
export type CoreSpiritResearchAuxiliaryFeature = Readonly<{
  values:Float64Array;
  availableAtMs:Float64Array;
  source:'market-breadth'|'sector'|'futures'|'options'|'macro'|'event'|'user-supplied';
}>;
export type CoreSpiritResearchFeatureInput = Readonly<{
  symbol:string;
  timeframe:string;
  timestampsMs:Float64Array;
  confirmed:Uint8Array;
  open:Float64Array;
  high:Float64Array;
  low:Float64Array;
  close:Float64Array;
  volume:Float64Array;
  availableAtMs:Readonly<Record<CoreSpiritResearchMarketField,Float64Array>>;
  /** Timestamped upstream features such as breadth, sector strength, futures basis, OI, IV, Greeks or licensed event data. */
  auxiliary?:Readonly<Record<string,CoreSpiritResearchAuxiliaryFeature>>;
  periods?:Readonly<{
    realizedVolatility?:number;atr?:number;relativeVolume?:number;
    trend?:number;momentum?:number;shortVolatility?:number;
  }>;
}>;
export type CoreSpiritResearchFeatureSet = Readonly<{
  symbol:string;
  timeframe:string;
  timestampsMs:Float64Array;
  featureNames:readonly string[];
  features:Readonly<Record<string,Float64Array>>;
  availabilityMsByFeature:Readonly<Record<string,Float64Array>>;
  featureSources:Readonly<Record<string,'ohlcv-derived'|'market-breadth'|'sector'|'futures'|'options'|'macro'|'event'|'user-supplied'>>;
  pointInTimeSchema:Readonly<{
    decisionTimestampColumn:'timestamp_ms';
    confirmedColumn:'is_confirmed';
    phaseColumn:'bar_phase';
    availabilityColumns:Readonly<Record<string,string>>;
    availabilityRule:'availableAt<=timestamp';
  }>;
  quality:Readonly<{
    rowCount:number;
    usableRows:number;
    warmupRows:number;
    confirmedOnly:true;
    featureAvailabilityVerified:true;
  }>;
}>;

const FIELDS:readonly CoreSpiritResearchMarketField[]=['open','high','low','close','volume'];
const MAX_ROWS=2_000_000;
const MAX_PERIOD=500;

function validatePeriod(value:number|undefined,fallback:number,label:string):number{
  const period=value??fallback;
  if(!Number.isSafeInteger(period)||period<2||period>MAX_PERIOD)throw new Error(label+' must be an integer between 2 and '+MAX_PERIOD+'.');
  return period;
}
function assertColumn(name:string,column:Float64Array,length:number):void{
  if(!(column instanceof Float64Array)||column.length!==length)throw new Error('Research market column '+name+' must be a Float64Array with '+length+' rows.');
}
function maxWindowAvailability(values:Float64Array,period:number):Float64Array{
  const result=new Float64Array(values.length);result.fill(Number.NaN);
  const deque=new Int32Array(values.length);
  let head=0,tail=0,invalid=0;
  for(let index=0;index<values.length;index++){
    const value=values[index]!;
    if(Number.isFinite(value)){
      while(tail>head&&values[deque[tail-1]!]!<=value)tail--;
      deque[tail++]=index;
    }else invalid++;
    const expired=index-period;
    if(expired>=0){
      if(!Number.isFinite(values[expired]!))invalid--;
      if(tail>head&&deque[head]===expired)head++;
    }
    if(index>=period-1&&invalid===0&&tail>head)result[index]=values[deque[head]!]!;
  }
  return result;
}
function maxColumns(...columns:Float64Array[]):Float64Array{
  const length=columns[0]?.length??0;
  const result=new Float64Array(length);result.fill(Number.NaN);
  for(let i=0;i<length;i++){
    let maximum=Number.NEGATIVE_INFINITY;
    for(const column of columns){
      const value=column[i]!;
      if(!Number.isFinite(value))throw new Error('Feature dependency has no valid availability timestamp.');
      maximum=Math.max(maximum,value);
    }
    result[i]=maximum;
  }
  return result;
}
function cumulativeMaxColumns(...columns:Float64Array[]):Float64Array{
  const length=columns[0]?.length??0;
  const result=new Float64Array(length);let maximum=Number.NEGATIVE_INFINITY;
  for(let i=0;i<length;i++){
    for(const column of columns){
      const value=column[i]!;
      if(!Number.isFinite(value))throw new Error('Feature dependency has no valid availability timestamp.');
      maximum=Math.max(maximum,value);
    }
    result[i]=maximum;
  }
  return result;
}
function assertFeatureAvailability(name:string,values:Float64Array,availableAt:Float64Array,timestamps:Float64Array):void{
  if(values.length!==timestamps.length||availableAt.length!==timestamps.length)throw new Error('Research feature '+name+' has inconsistent column lengths.');
  for(let i=0;i<values.length;i++){
    if(Number.isFinite(values[i]!)){
      if(!Number.isSafeInteger(availableAt[i]!)||availableAt[i]!>timestamps[i]!) {
        throw new Error('Research feature '+name+' was not available at decision timestamp for row '+i+'.');
      }
    }else availableAt[i]=Number.NaN;
  }
}

/**
 * Build a compact reusable OHLCV feature set. This is a causal baseline feature
 * family, not a substitute for licensed options, breadth, futures or event data.
 */
export function buildCoreSpiritResearchFeatures(input:CoreSpiritResearchFeatureInput):CoreSpiritResearchFeatureSet{
  const n=input.timestampsMs.length;
  if(!input.symbol?.trim()||!input.timeframe?.trim()||n<3||n>MAX_ROWS)throw new Error('Research feature input identity or row count is invalid.');
  if(!(input.confirmed instanceof Uint8Array)||input.confirmed.length!==n)throw new Error('Research confirmed flags must be a Uint8Array with '+n+' rows.');
  for(const field of FIELDS)assertColumn(field,input[field],n);
  for(const field of FIELDS)assertColumn(field+' availability',input.availableAtMs[field],n);
  const volPeriod=validatePeriod(input.periods?.realizedVolatility,20,'realized volatility period');
  const atrPeriod=validatePeriod(input.periods?.atr,14,'ATR period');
  const volumePeriod=validatePeriod(input.periods?.relativeVolume,20,'relative volume period');
  const trendPeriod=validatePeriod(input.periods?.trend,20,'trend period');
  const momentumPeriod=validatePeriod(input.periods?.momentum,5,'momentum period');
  const shortVolatilityPeriod=validatePeriod(input.periods?.shortVolatility,5,'short volatility period');

  for(let i=0;i<n;i++){
    const timestamp=input.timestampsMs[i]!;
    if(!Number.isSafeInteger(timestamp)||timestamp<0||(i>0&&timestamp<=input.timestampsMs[i-1]!))throw new Error('Research bar timestamps must be strictly increasing epoch-millisecond values.');
    if(input.confirmed[i]!==1)throw new Error('Research feature engineering accepts confirmed bars only; unconfirmed row '+i+' was supplied.');
    const values=FIELDS.map(field=>input[field][i]!);
    const availability=FIELDS.map(field=>input.availableAtMs[field][i]!);
    if(values.some(value=>!Number.isFinite(value))||availability.some(value=>!Number.isSafeInteger(value)||value<0||value>timestamp)) {
      throw new Error('Research OHLCV row '+i+' contains invalid values or data unavailable at its decision timestamp.');
    }
    const [open,high,low,close,volume]=values;
    if(Math.min(open!,high!,low!,close!)<=0||volume!<0||high!<Math.max(open!,close!,low!)||low!>Math.min(open!,close!,high!)){
      throw new Error('Research OHLCV row '+i+' violates market candle invariants.');
    }
  }

  const returns=new Float64Array(n);returns.fill(Number.NaN);
  const logReturns=new Float64Array(n);logReturns.fill(Number.NaN);
  const returnAvailability=new Float64Array(n);returnAvailability.fill(Number.NaN);
  for(let i=1;i<n;i++){
    const previous=input.close[i-1]!,current=input.close[i]!;
    returns[i]=current/previous-1;
    logReturns[i]=Math.log(current/previous);
    returnAvailability[i]=Math.max(input.availableAtMs.close[i]!,input.availableAtMs.close[i-1]!);
  }

  const rangePct=new Float64Array(n);const rangeAvailability=maxColumns(input.availableAtMs.high,input.availableAtMs.low,input.availableAtMs.close);
  for(let i=0;i<n;i++)rangePct[i]=(input.high[i]!-input.low[i]!)/input.close[i]!;

  const volatilityRaw=rollingStd(logReturns,volPeriod);
  const volatility=new Float64Array(n);volatility.fill(Number.NaN);
  for(let i=0;i<n;i++)if(Number.isFinite(volatilityRaw[i]!))volatility[i]=volatilityRaw[i]!*Math.sqrt(volPeriod);
  const volatilityAvailability=maxWindowAvailability(returnAvailability,volPeriod);

  const atrRaw=atr(input.high,input.low,input.close,atrPeriod);
  const normalizedAtr=new Float64Array(n);normalizedAtr.fill(Number.NaN);
  for(let i=0;i<n;i++)if(Number.isFinite(atrRaw[i]!))normalizedAtr[i]=atrRaw[i]!/input.close[i]!;
  // Wilder ATR is recursive: every prior true-range observation since the
  // seed can contribute, so its availability is the cumulative source maximum.
  const atrAvailability=cumulativeMaxColumns(input.availableAtMs.high,input.availableAtMs.low,input.availableAtMs.close);

  const averageVolume=rollingMean(input.volume,volumePeriod);
  const relativeVolume=new Float64Array(n);relativeVolume.fill(Number.NaN);
  for(let i=0;i<n;i++)if(Number.isFinite(averageVolume[i]!)&&averageVolume[i]!>0)relativeVolume[i]=input.volume[i]!/averageVolume[i]!;
  const relativeVolumeAvailability=maxWindowAvailability(input.availableAtMs.volume,volumePeriod);

  const emaValues=ema(input.close,trendPeriod);
  const emaDistance=new Float64Array(n);emaDistance.fill(Number.NaN);
  for(let i=0;i<n;i++)if(Number.isFinite(emaValues[i]!))emaDistance[i]=input.close[i]!/emaValues[i]!-1;
  const trendRegression=linearRegression(input.close,trendPeriod);
  const normalizedTrendSlope=new Float64Array(n);normalizedTrendSlope.fill(Number.NaN);
  for(let i=0;i<n;i++)if(Number.isFinite(trendRegression.slope[i]!))normalizedTrendSlope[i]=trendRegression.slope[i]!/input.close[i]!;
  const trendAvailability=maxWindowAvailability(input.availableAtMs.close,trendPeriod);
  const emaAvailability=cumulativeMaxColumns(input.availableAtMs.close);
  const momentum=new Float64Array(n);momentum.fill(Number.NaN);
  const momentumAvailability=new Float64Array(n);momentumAvailability.fill(Number.NaN);
  for(let i=momentumPeriod;i<n;i++){momentum[i]=input.close[i]!/input.close[i-momentumPeriod]!-1;momentumAvailability[i]=Math.max(input.availableAtMs.close[i]!,input.availableAtMs.close[i-momentumPeriod]!);}
  const shortVolatilityRaw=rollingStd(logReturns,shortVolatilityPeriod);
  const volatilityExpansion=new Float64Array(n);volatilityExpansion.fill(Number.NaN);
  for(let i=0;i<n;i++)if(Number.isFinite(shortVolatilityRaw[i]!)&&Number.isFinite(volatilityRaw[i]!)&&volatilityRaw[i]!>0)volatilityExpansion[i]=shortVolatilityRaw[i]!/volatilityRaw[i]!;
  const volatilityExpansionAvailability=maxWindowAvailability(returnAvailability,volPeriod);
  const closeLocation=new Float64Array(n);closeLocation.fill(Number.NaN);
  for(let i=0;i<n;i++){const width=input.high[i]!-input.low[i]!;if(width>0)closeLocation[i]=(input.close[i]!-input.low[i]!)/width;}
  const closeLocationAvailability=rangeAvailability;

  const volatilityName='realized_volatility_'+volPeriod;
  const atrName='normalized_atr_'+atrPeriod;
  const volumeName='relative_volume_'+volumePeriod;
  const features:Record<string,Float64Array>={
    returns_1:returns,
    log_returns_1:logReturns,
    range_pct_1:rangePct,
    [volatilityName]:volatility,
    [atrName]:normalizedAtr,
    [volumeName]:relativeVolume,
    ['ema_distance_'+trendPeriod]:emaDistance,
    ['ema_slope_'+trendPeriod]:normalizedTrendSlope,
    ['momentum_'+momentumPeriod]:momentum,
    ['volatility_expansion_'+shortVolatilityPeriod+'_'+volPeriod]:volatilityExpansion,
    close_location_value:closeLocation,
  };
  const availabilityMsByFeature:Record<string,Float64Array>={
    returns_1:Float64Array.from(returnAvailability),
    log_returns_1:Float64Array.from(returnAvailability),
    range_pct_1:rangeAvailability,
    [volatilityName]:volatilityAvailability,
    [atrName]:atrAvailability,
    [volumeName]:relativeVolumeAvailability,
    ['ema_distance_'+trendPeriod]:emaAvailability,
    ['ema_slope_'+trendPeriod]:trendAvailability,
    ['momentum_'+momentumPeriod]:momentumAvailability,
    ['volatility_expansion_'+shortVolatilityPeriod+'_'+volPeriod]:volatilityExpansionAvailability,
    close_location_value:closeLocationAvailability,
  };
  const featureSources:Record<string,'ohlcv-derived'|'market-breadth'|'sector'|'futures'|'options'|'macro'|'event'|'user-supplied'>=
    Object.fromEntries(Object.keys(features).map(name=>[name,'ohlcv-derived']));
  for(const [name,auxiliary] of Object.entries(input.auxiliary??{})){
    if(!/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(name)||name in features)throw new Error('Auxiliary research feature name is invalid or duplicates a built-in feature: '+name);
    assertColumn('auxiliary feature '+name,auxiliary.values,n);
    assertColumn('auxiliary availability '+name,auxiliary.availableAtMs,n);
    if(!['market-breadth','sector','futures','options','macro','event','user-supplied'].includes(auxiliary.source))throw new Error('Auxiliary research feature '+name+' has an invalid source category.');
    const values=Float64Array.from(auxiliary.values);
    const availability=Float64Array.from(auxiliary.availableAtMs);
    for(let i=0;i<n;i++){
      if(Number.isFinite(values[i]!)){
        if(!Number.isSafeInteger(availability[i]!)||availability[i]!<0||availability[i]!>input.timestampsMs[i]!)throw new Error('Auxiliary feature '+name+' is unavailable at decision timestamp for row '+i+'.');
      }else availability[i]=Number.NaN;
    }
    features[name]=values;
    availabilityMsByFeature[name]=availability;
    featureSources[name]=auxiliary.source;
  }
  const featureNames=Object.keys(features);
  for(const name of featureNames)assertFeatureAvailability(name,features[name]!,availabilityMsByFeature[name]!,input.timestampsMs);
  let usableRows=0;
  for(let i=0;i<n;i++)if(featureNames.every(name=>Number.isFinite(features[name]![i]!)))usableRows++;
  const availabilityColumns=Object.fromEntries(featureNames.map(name=>[name,name+'_available_at_ms']));
  return Object.freeze({
    symbol:input.symbol,timeframe:input.timeframe,timestampsMs:Float64Array.from(input.timestampsMs),
    featureNames:Object.freeze(featureNames),features:Object.freeze(features),
    availabilityMsByFeature:Object.freeze(availabilityMsByFeature),
    featureSources:Object.freeze(featureSources),
    pointInTimeSchema:Object.freeze({
      decisionTimestampColumn:'timestamp_ms' as const,confirmedColumn:'is_confirmed' as const,
      phaseColumn:'bar_phase' as const,availabilityColumns:Object.freeze(availabilityColumns),
      availabilityRule:'availableAt<=timestamp' as const,
    }),
    quality:Object.freeze({
      rowCount:n,usableRows,warmupRows:n-usableRows,confirmedOnly:true as const,
      featureAvailabilityVerified:true as const,
    }),
  });
}
