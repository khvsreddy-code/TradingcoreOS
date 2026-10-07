import { CORE_SPIRIT_BUILTINS, type CoreSpiritBuiltin } from './standardLibrary';
import { coreSpiritComponentRegistry, resolveCoreSpiritComponent, type CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import type { CoreSpiritComponentContract } from './coreSpiritExecutionModel';

export type CoreSpiritLibraryNamespace =
  | 'market' | 'series' | 'math' | 'stats' | 'time' | 'structure'
  | 'volatility' | 'liquidity' | 'probability' | 'model' | 'visual'
  | 'automation' | 'risk' | 'background' | 'ta' | 'data' | 'state';

export type CoreSpiritLibraryEntryStatus = 'builtin' | 'component' | 'catalog';
export type CoreSpiritLibraryNamespaceEntry = Readonly<{
  namespace: CoreSpiritLibraryNamespace;
  member: string;
  qualifiedName: string;
  status: CoreSpiritLibraryEntryStatus;
  canonicalBuiltin?: string;
  componentId?: string;
  description: string;
}>;

const b=(namespace:CoreSpiritLibraryNamespace,member:string,canonicalBuiltin:string,description:string):CoreSpiritLibraryNamespaceEntry=>Object.freeze({namespace,member,qualifiedName:`${namespace}.${member}`,status:'builtin',canonicalBuiltin,description});
const c=(namespace:CoreSpiritLibraryNamespace,member:string,componentId:string,description:string):CoreSpiritLibraryNamespaceEntry=>Object.freeze({namespace,member,qualifiedName:`${namespace}.${member}`,status:'component',componentId,description});
const k=(namespace:CoreSpiritLibraryNamespace,member:string,description:string):CoreSpiritLibraryNamespaceEntry=>Object.freeze({namespace,member,qualifiedName:`${namespace}.${member}`,status:'catalog',description});

export const CORE_SPIRIT_LIBRARY_ROOT_NAMESPACES:readonly CoreSpiritLibraryNamespace[]=Object.freeze([
  'market','series','math','stats','time','structure','volatility','liquidity',
  'probability','model','visual','automation','risk','background','ta','data','state',
]);

export const CORE_SPIRIT_LIBRARY_NAMESPACE_ENTRIES:readonly CoreSpiritLibraryNamespaceEntry[]=Object.freeze([
  b('series','sma','sma','Simple moving average.'),
  b('series','ema','ema','Exponential moving average.'),
  b('series','hma','hma','Hull moving average.'),
  b('series','wma','wma','Weighted moving average.'),
  b('series','rma','rma','Running moving average.'),
  b('series','highest','highest','Rolling maximum.'),
  b('series','lowest','lowest','Rolling minimum.'),
  b('series','sum','sum','Rolling sum.'),
  b('series','mean','mean','Rolling mean.'),
  b('series','change','change','Historical difference.'),
  b('series','pctchange','pctchange','Percentage change.'),
  b('series','zscore','zscore','Rolling z-score.'),
  b('series','normalize','normalize','Rolling normalization.'),
  b('series','persistence','persistence','Rolling persistence.'),
  b('ta','sma','sma','Technical-analysis simple moving average.'),
  b('ta','ema','ema','Technical-analysis exponential moving average.'),
  b('ta','hma','hma','Technical-analysis Hull moving average.'),
  b('ta','rma','rma','Technical-analysis Wilder moving average.'),
  b('ta','rsi','rsi','Technical-analysis RSI.'),
  b('ta','atr','atr','Technical-analysis ATR.'),
  b('ta','stdev','stdev','Technical-analysis standard deviation.'),
  b('ta','variance','variance','Technical-analysis variance.'),
  b('ta','zscore','zscore','Technical-analysis z-score.'),
  b('ta','roc','roc','Technical-analysis rate of change.'),
  b('math','abs','abs','Absolute value.'), b('math','min','min','Minimum.'), b('math','max','max','Maximum.'),
  b('math','sqrt','sqrt','Square root.'), b('math','pow','pow','Power.'), b('math','round','round','Round.'), b('math','sign','sign','Sign.'),
  b('math','toNumber','toNumber','Explicit semantic conversion to unitless number.'), b('math','toPrice','toPrice','Explicit semantic conversion to price.'), b('math','toVolume','toVolume','Explicit semantic conversion to volume.'),
  b('math','toTime','toTime','Explicit semantic conversion to timestamp/time.'), b('math','toDuration','toDuration','Explicit semantic conversion to duration.'), b('math','toCurrency','toCurrency','Explicit semantic conversion to currency/notional.'),
  b('stats','mean','mean','Mean.'), b('stats','median','median','Median.'), b('stats','stdev','stdev','Standard deviation.'),
  b('stats','variance','variance','Variance.'), b('stats','zscore','zscore','Z-score.'), b('stats','persistence','persistence','Persistence.'),
  b('time','barIndex','bar_index','Current bar index.'), b('time','timestamp','time','Current timestamp.'), b('time','timeframe','timeframe','Timeframe reference.'),
  b('structure','highest','highest','Structural high.'), b('structure','lowest','lowest','Structural low.'),
  b('structure','cross','cross','Cross condition.'), b('structure','crossover','crossover','Cross-above condition.'), b('structure','crossunder','crossunder','Cross-below condition.'),
  b('structure','rising','rising','Rising condition.'), b('structure','falling','falling','Falling condition.'),
  b('market','vwap','vwap','Session VWAP.'), b('market','market','market','Market reference.'), b('market','timeframe','timeframe','Timeframe reference.'), k('market','regime','Market regime component surface.'),
  b('volatility','stdev','stdev','Volatility dispersion.'), b('volatility','variance','variance','Variance.'), b('volatility','atr','atr','Average true range.'),
  c('volatility','expansion','volatility.expansion:v1','Volatility expansion component surface.'),
  c('volatility','compression','volatility.compression:v1','Volatility compression component surface.'),
  k('liquidity','sweep','Liquidity sweep component surface.'), k('liquidity','imbalance','Liquidity imbalance component surface.'), k('liquidity','participation','Liquidity participation component surface.'),
  b('probability','probability','probability','Probability primitive.'),
  b('stats','beta','beta','Rolling regression beta.'),
  b('stats','roc','roc','Rate of change.'), b('probability','sigmoid','sigmoid','Sigmoid transform.'), k('probability','calibrate','Probability calibration surface.'), k('probability','entropy','Entropy surface.'),
  b('model','predict','model.predict','Typed model prediction.'), b('model','probability','model.probability','Typed model probability.'), b('model','score','score','Model score.'), b('model','ref','model','Model reference.'), k('model','run','MODEL ABI invocation surface.'),
  b('visual','show','show','Universal SHOW projection.'), b('visual','plot','plot','Plot projection.'),
  b('automation','signal','signal','Signal emission.'), b('automation','emit','emit','Event emission.'), b('automation','order','order','Order intent.'),
  b('automation','notify','automation.notify','Host-routed automation notification event.'),
  b('automation','route','automation.route','Host-routed automation execution event.'),
  b('risk','allowed','risk.allowed','Host risk-policy query; never grants broker authority.'),
  b('background','when','background.when','Conditional chart background projection.')
  b('data','request','request','Market-data request.'), b('data','requestBatch','requestBatch','Batched request.'), b('data','bid','bid','Bid.'), b('data','ask','ask','Ask.'), b('data','spread','spread','Spread.'), b('data','mid','mid','Mid.'),
  b('state','nz','nz','Missing-value fallback.'), b('state','na','na','Missing-value marker.'), b('state','isNa','isNa','Missing-value predicate.'),
]);

const byName=new Map(CORE_SPIRIT_LIBRARY_NAMESPACE_ENTRIES.map(x=>[x.qualifiedName,x] as const));
export function getCoreSpiritLibraryNamespaceEntries(namespace:CoreSpiritLibraryNamespace):readonly CoreSpiritLibraryNamespaceEntry[]{return CORE_SPIRIT_LIBRARY_NAMESPACE_ENTRIES.filter(x=>x.namespace===namespace);}
export function getCoreSpiritLibraryEntry(namespace:string,member:string){return byName.get(`${namespace}.${member}`);}
export function isCoreSpiritLibraryNamespace(value:string):value is CoreSpiritLibraryNamespace{return (CORE_SPIRIT_LIBRARY_ROOT_NAMESPACES as readonly string[]).includes(value);}
export type CoreSpiritResolvedLibraryCall=Readonly<{entry:CoreSpiritLibraryNamespaceEntry;builtin?:CoreSpiritBuiltin;component?:CoreSpiritComponentContract}>;
export function resolveCoreSpiritLibraryCall(namespace:string,member:string,components:CoreSpiritComponentRegistryLike=coreSpiritComponentRegistry):CoreSpiritResolvedLibraryCall|undefined{
  const entry=getCoreSpiritLibraryEntry(namespace,member); if(!entry)return undefined;
  if(entry.status==='builtin'){const builtin=CORE_SPIRIT_BUILTINS.get(entry.canonicalBuiltin??member); return builtin?Object.freeze({entry,builtin}):Object.freeze({entry});}
  if(entry.status==='component'){const component=resolveCoreSpiritComponent(components,entry.componentId??entry.qualifiedName); return component?Object.freeze({entry,component}):Object.freeze({entry});}
  return Object.freeze({entry});
}
