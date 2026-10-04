import type { HistoricalCandle } from '../brokers/BrokerAdapter';
import type { CanonicalMarketDataPacket } from '../core/data/canonicalMarketDataTransport';
import { assertCanonicalMarketDataPacket } from '../core/data/canonicalMarketDataTransport';
import { IndicatorConfig, series, vwap, bollinger, keltner, donchian, rsi, macd, supertrend, stochastic, ichimoku, advancedIndicatorModel } from './indicatorEngine';
import { createIndicatorDependencyCache, dependencyNodeKeysFor, evaluateIndicatorDependencyGraph, isDependencyGraphSupported } from './indicatorDependencyGraph';
import { IncrementalIndicatorRuntime } from './incrementalIndicatorEngine';

const workerKinds = new Set([
  'EMA','SMA','HMA','VWAP','Bollinger Bands','Keltner Channels','Donchian Channels','RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI','Supertrend','Ichimoku Cloud'
]);

const datasetCaches = new Map<string, ReturnType<typeof createIndicatorDependencyCache>>();
const incrementalRuntimes = new Map<string, IncrementalIndicatorRuntime>();
const STATE_LIMIT = 12;
const DATASET_CACHE_LIMIT = 8;

function touch<T>(map:Map<string,T>,key:string,value:T){map.delete(key);map.set(key,value);while(map.size>STATE_LIMIT)map.delete(map.keys().next().value as string);return value;}
function getDatasetCache(datasetKey:string,revision:number){const key=`${datasetKey}|${revision}`,existing=datasetCaches.get(key);if(existing){datasetCaches.delete(key);datasetCaches.set(key,existing);return existing;}const cache=createIndicatorDependencyCache();datasetCaches.set(key,cache);while(datasetCaches.size>DATASET_CACHE_LIMIT)datasetCaches.delete(datasetCaches.keys().next().value as string);return cache;}
function getIncrementalRuntime(key:string){const existing=incrementalRuntimes.get(key);if(existing)return touch(incrementalRuntimes,key,existing);return touch(incrementalRuntimes,key,new IncrementalIndicatorRuntime());}

function packetToCandles(packet: CanonicalMarketDataPacket): HistoricalCandle[] {
  assertCanonicalMarketDataPacket(packet);
  const rows = new Array<HistoricalCandle>(packet.length);
  for (let i = 0; i < packet.length; i += 1) {
    rows[i] = {
      timestamp: new Date(packet.time[i]! * 1000).toISOString(),
      open: packet.open[i]!,
      high: packet.high[i]!,
      low: packet.low[i]!,
      close: packet.close[i]!,
      volume: packet.volume[i] || 0,
    };
  }
  return rows;
}

self.onmessage = (event: MessageEvent<{
  requestId:number;
  market?:CanonicalMarketDataPacket;
  bar?:CanonicalMarketDataPacket;
  configs:IndicatorConfig[];
  datasetKey?:string;
  revision?:number;
  mode?:'snapshot'|'incremental';
  operation?:'replace'|'append';
  incrementalKey?:string;
  seedOnMiss?:boolean;
  primeIncremental?:boolean;
}>) => {
  const {requestId,market,bar,configs,datasetKey='anonymous',revision=0,mode='snapshot',operation='replace',incrementalKey=datasetKey,seedOnMiss=false,primeIncremental=false}=event.data;
  try {
    const candles = market ? packetToCandles(market) : [];
    const latestBar = bar ? packetToCandles(bar)[0] : undefined;

    if(mode==='incremental'){
      const effectiveBar = latestBar || candles[candles.length - 1];
      if(!effectiveBar)throw new Error('Incremental indicator update missing forming bar.');
      const existed=incrementalRuntimes.has(incrementalKey);
      const runtime=existed ? incrementalRuntimes.get(incrementalKey)! : getIncrementalRuntime(incrementalKey);
      const evaluation=(!existed || seedOnMiss) && candles.length
        ? runtime.seed(candles,configs)
        : runtime.update(effectiveBar,operation,configs);
      if(evaluation.resetRequired){
        if(!candles.length){self.postMessage({requestId,results:[],incremental:true,resetRequired:true,updateCost:evaluation.updateCost});return;}
        const seeded=runtime.seed(candles,configs);
        self.postMessage({requestId,results:seeded.results,incremental:true,incrementalMode:'reset',processedBars:seeded.processedBars,updateCost:'full linear resync'});return;
      }
      self.postMessage({requestId,results:evaluation.results,incremental:true,incrementalMode:'update',processedBars:evaluation.processedBars,updateCost:evaluation.updateCost});return;
    }

    if(!market) throw new Error('Indicator snapshot missing canonical market packet.');
    const graphConfigs=configs.filter(c=>c.enabled&&isDependencyGraphSupported(c.kind));
    const graphCache=getDatasetCache(datasetKey,revision);
    const graph=evaluateIndicatorDependencyGraph(candles,graphConfigs,graphCache);

    let incrementalResults:any[]=[];
    if(primeIncremental){
      const runtime=getIncrementalRuntime(incrementalKey);
      incrementalResults=runtime.seed(candles,configs).results;
    }
    const incrementalIds=new Set((primeIncremental?incrementalResults:[]).map(x=>x.id));
    const graphResults=graph.results.filter(x=>!incrementalIds.has(x.id));
    const computedKinds=new Set(graphConfigs.map(c=>`${c.id}:${c.kind}`));
    const legacyResults=configs.filter(c=>c.enabled&&workerKinds.has(c.kind)&&!computedKinds.has(`${c.id}:${c.kind}`)&&!incrementalIds.has(c.id)).map(cfg=>{
      if(cfg.kind==='VWAP')return{id:cfg.id,kind:cfg.kind,data:vwap(candles,cfg.source||'hlc3')};
      if(cfg.kind==='Bollinger Bands')return{id:cfg.id,kind:cfg.kind,data:bollinger(candles,cfg.period||20,cfg.multiplier||2,cfg.source||'close')};
      if(cfg.kind==='Keltner Channels')return{id:cfg.id,kind:cfg.kind,data:keltner(candles,cfg.period||20,cfg.multiplier||2,cfg.source||'close')};
      if(cfg.kind==='Donchian Channels')return{id:cfg.id,kind:cfg.kind,data:donchian(candles,cfg.period||20)};
      if(cfg.kind==='RSI')return{id:cfg.id,kind:cfg.kind,data:rsi(candles,cfg.period||14,cfg.source||'close')};
      if(cfg.kind==='MACD')return{id:cfg.id,kind:cfg.kind,data:macd(candles,cfg.fast||12,cfg.slow||26,cfg.signal||9,cfg.source||'close')};
      if(cfg.kind==='Supertrend')return{id:cfg.id,kind:cfg.kind,data:supertrend(candles,cfg.period||10,cfg.multiplier||3)};
      if(cfg.kind==='Stochastic')return{id:cfg.id,kind:cfg.kind,data:stochastic(candles,cfg.period||14,cfg.smooth||3,cfg.signal||3,cfg.source||'close')};
      if(cfg.kind==='Ichimoku Cloud')return{id:cfg.id,kind:cfg.kind,data:ichimoku(candles,cfg.period||9,cfg.slow||26,cfg.displacement||26)};
      return{id:cfg.id,kind:cfg.kind,data:series(candles,cfg.kind,cfg)};
    });
    const primed = primeIncremental ? incrementalResults : [];
    self.postMessage({requestId,results:[...primed,...graphResults,...legacyResults],dependencyGraph:{nodeKeys:dependencyNodeKeysFor(graphConfigs),...graph.stats},incrementalSeeded:primeIncremental});
  } catch(error:any){self.postMessage({requestId,error:error?.message||'Indicator worker failed'});}
};

export {};
