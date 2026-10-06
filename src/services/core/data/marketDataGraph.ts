import { getCanonicalDataPlane, type CanonicalDataPlane } from './canonicalDataPlane';
import type { CoreSpiritDataAlignment, CoreSpiritDataRequest, CoreSpiritDataResolver, CoreSpiritDataResolutionContext, CoreSpiritDataSnapshot } from '../coreSpirit/types';

export const CORE_SPIRIT_DATA_GRAPH_VERSION = 1 as const;

export type MarketDataGraphSessionProfile = Readonly<{
  anchorSecondsUtc?: number;
}>;

export type MarketDataGraphNodeKey = string;

export type MarketDataGraphNodeDescriptor = Readonly<{
  id:string;
  key:MarketDataGraphNodeKey;
  symbol:string;
  timeframe:string;
  sourceKey?:string;
  kind:'base'|'derived';
  revision:number;
  length:number;
}>;

export type CoreSpiritGraphSnapshotNode = {
  id:string;
  symbol:string;
  timeframe:string;
  revision:number;
  time:Float64Array;
  open:Float64Array;
  high:Float64Array;
  low:Float64Array;
  close:Float64Array;
  volume:Float64Array;
};

export type CoreSpiritGraphSnapshot = Readonly<{
  version:typeof CORE_SPIRIT_DATA_GRAPH_VERSION;
  revision:number;
  nodes:readonly CoreSpiritGraphSnapshotNode[];
}>;

type GraphNode={
  descriptor:MarketDataGraphNodeDescriptor;
  plane:CanonicalDataPlane;
  sourceKey?:string;
  intervalSeconds:number;
  anchorSecondsUtc:number;
  sourceRevision:number;
};

const TIMEFRAME_SECONDS:Record<string,number>={
  '1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,
  '1h':3600,'1H':3600,'60m':3600,'4h':14400,'4H':14400,
  '1d':86400,'1D':86400,'day':86400,
};

function normalizeTimeframe(value:string):string{
  const raw=String(value||'').trim();
  if(!raw||raw==='chart')return raw||'chart';
  const lower=raw.toLowerCase();
  if(lower==='day')return '1D';
  if(lower==='1h'||lower==='60m')return '1H';
  if(lower==='4h')return '4H';
  if(TIMEFRAME_SECONDS[raw])return raw;
  const match=/^(\\d+)\\s*(m|min|minute|h|hr|hour|d|day)$/i.exec(raw);
  if(!match)return raw;
  const count=Number(match[1]);
  const unit=match[2].toLowerCase();
  if(unit.startsWith('h'))return count===1?'1H':`${count}h`;
  if(unit.startsWith('d'))return count===1?'1D':`${count}D`;
  return `${count}m`;
}

export function timeframeSeconds(value:string):number{
  const normalized=normalizeTimeframe(value);
  if(TIMEFRAME_SECONDS[normalized])return TIMEFRAME_SECONDS[normalized]!;
  const match=/^(\\d+)(m|h|d)$/i.exec(normalized);
  if(!match)return 0;
  const count=Number(match[1]);
  return count*(match[2].toLowerCase()==='m'?60:match[2].toLowerCase()==='h'?3600:86400);
}

function graphKey(symbol:string,timeframe:string):string{
  return `${String(symbol).trim().toUpperCase()}::${normalizeTimeframe(timeframe)}`;
}

function bucketStart(timestamp:number,intervalSeconds:number,anchorSecondsUtc:number):number{
  if(intervalSeconds>=86400)return Math.floor((timestamp-anchorSecondsUtc)/86400)*86400+anchorSecondsUtc;
  return Math.floor((timestamp-anchorSecondsUtc)/intervalSeconds)*intervalSeconds+anchorSecondsUtc;
}

function aggregateRows(source:CanonicalDataPlane,target:CanonicalDataPlane,intervalSeconds:number,anchorSecondsUtc:number):void{
  const view=source.market.views();
  const out:number[]=[];
  let currentBucket=Number.NaN;
  let open=0,high=0,low=0,close=0,volume=0;

  const flush=()=>{
    if(!Number.isFinite(currentBucket))return;
    out.push(currentBucket,open,high,low,close,volume);
  };

  for(let i=0;i<view.time.length;i+=1){
    const t=Number(view.time[i]);
    if(!Number.isFinite(t))continue;
    const bucket=bucketStart(t,intervalSeconds,anchorSecondsUtc);
    if(bucket!==currentBucket){
      flush();
      currentBucket=bucket;
      open=Number(view.open[i]);
      high=Number(view.high[i]);
      low=Number(view.low[i]);
      close=Number(view.close[i]);
      volume=Number(view.volume[i])||0;
      continue;
    }
    high=Math.max(high,Number(view.high[i]));
    low=Math.min(low,Number(view.low[i]));
    close=Number(view.close[i]);
    volume+=Number(view.volume[i])||0;
  }
  flush();

  const rows=out.length/6;
  target.replaceColumns({
    time:Float64Array.from({length:rows},(_,i)=>out[i*6]!),
    open:Float64Array.from({length:rows},(_,i)=>out[i*6+1]!),
    high:Float64Array.from({length:rows},(_,i)=>out[i*6+2]!),
    low:Float64Array.from({length:rows},(_,i)=>out[i*6+3]!),
    close:Float64Array.from({length:rows},(_,i)=>out[i*6+4]!),
    volume:Float64Array.from({length:rows},(_,i)=>out[i*6+5]!),
    timeUnit:'seconds',
  });
}

function cloneSnapshotNode(plane:CanonicalDataPlane,descriptor:MarketDataGraphNodeDescriptor):CoreSpiritGraphSnapshotNode{
  const view=plane.market.views();
  return {
    id:descriptor.id,
    symbol:descriptor.symbol,
    timeframe:descriptor.timeframe,
    revision:descriptor.revision,
    time:new Float64Array(view.time),
    open:new Float64Array(view.open),
    high:new Float64Array(view.high),
    low:new Float64Array(view.low),
    close:new Float64Array(view.close),
    volume:new Float64Array(view.volume),
  };
}

export type CoreSpiritDataGraphResolver=createGraphResolver;

export function createGraphResolver(snapshot:CoreSpiritGraphSnapshot,baseSymbol='current',baseTimeframe='chart'):CoreSpiritDataResolver{
  const nodes=new Map<string,CoreSpiritGraphSnapshotNode>();
  for(const node of snapshot.nodes)nodes.set(graphKey(node.symbol,node.timeframe),node);

  const pickNode=(symbol:string,timeframe:string):CoreSpiritGraphSnapshotNode|undefined=>{
    const actualSymbol=symbol==='current'?baseSymbol:symbol;
    const actualTimeframe=timeframe==='chart'?baseTimeframe:timeframe;
    return nodes.get(graphKey(actualSymbol,actualTimeframe));
  };

  const indexAt=(node:CoreSpiritGraphSnapshotNode,asOf:number,alignment:CoreSpiritDataAlignment):number=>{
    let lo=0,hi=node.time.length;
    while(lo<hi){
      const mid=(lo+hi)>>1;
      if(node.time[mid]!<=asOf)lo=mid+1;else hi=mid;
    }
    let index=lo-1;
    if(index<0)return -1;
    if(alignment==='last-confirmed'&&index>=0){
      const seconds=timeframeSeconds(node.timeframe);
      if(seconds>0&&node.time[index]!+seconds>asOf)index-=1;
    }
    return index;
  };

  const valueAt=(request:CoreSpiritDataRequest,ctx?:CoreSpiritDataResolutionContext):CoreSpiritDataSnapshot=>{
    const node=pickNode(request.symbol,request.timeframe);
    if(!node)return {value:null,source:'data-graph:missing',symbol:request.symbol,timeframe:request.timeframe,state:'historical'};
    const alignment=ctx?.alignment??'last-confirmed';
    const asOf=ctx?.asOfTimestamp??Number.POSITIVE_INFINITY;
    let index=alignment==='developing'||alignment==='nearest-confirmed'||alignment==='exact'||Number.isFinite(asOf)
      ? indexAt(node,asOf,alignment)
      : node.time.length-1;
    index-=Math.max(0,Math.floor(request.offset||0));
    if(index<0||index>=node.time.length)return {value:null,source:'data-graph:empty',symbol:request.symbol,timeframe:request.timeframe,state:'historical'};
    const field=request.field;
    const columns:Record<string,Float64Array>={time:node.time,open:node.open,high:node.high,low:node.low,close:node.close,volume:node.volume};
    const timestamp=Number(node.time[index]);
    const isConfirmed=timeframeSeconds(node.timeframe)>0 ? timestamp+timeframeSeconds(node.timeframe)<=asOf : true;
    return {
      value:Number(columns[field]?.[index]),
      source:'data-graph',
      symbol:node.symbol,
      timeframe:node.timeframe,
      timestamp,
      state:isConfirmed?'confirmed':'developing',
    };
  };

  return {
    request:request=>valueAt(request),
    requestAt:(request,ctx)=>valueAt(request,ctx),
    requestBatch:(requests,)=>{
      const now=Date.now();
      return requests.map(request=>valueAt(request,{asOfTimestamp:now,baseSymbol,baseTimeframe,executionMode:'realtime',revision:snapshot.revision,alignment:'last-confirmed'}));
    },
    series:(request,ctx)=>{
      const node=pickNode(request.symbol,request.timeframe);
      if(!node)return [];
      const columns:Record<string,Float64Array>={time:node.time,open:node.open,high:node.high,low:node.low,close:node.close,volume:node.volume};
      const index=ctx?indexAt(node,ctx.asOfTimestamp,ctx.alignment):node.time.length-1;
      return Array.from(columns[request.field]?.subarray(0,Math.max(0,index+1))??[]);
    },
    cacheKey:request=>`data-graph:${graphKey(request.symbol==='current'?baseSymbol:request.symbol,request.timeframe==='chart'?baseTimeframe:request.timeframe)}:${snapshot.revision}`,
  };
}

export function graphSnapshotTransferables(snapshot:CoreSpiritGraphSnapshot):Transferable[]{
  const transferables:Transferable[]=[];
  for(const node of snapshot.nodes){
    transferables.push(node.time.buffer,node.open.buffer,node.high.buffer,node.low.buffer,node.close.buffer,node.volume.buffer);
  }
  return transferables;
}

export class MarketDataGraph{
  private readonly nodes=new Map<MarketDataGraphNodeKey,GraphNode>();
  private revision=0;

  constructor(private readonly defaultSession:MarketDataGraphSessionProfile={anchorSecondsUtc:0}){}

  get graphRevision():number{return this.revision;}

  private ensureBase(symbol:string,timeframe:string):GraphNode{
    const normalized=normalizeTimeframe(timeframe);
    const key=graphKey(symbol,normalized);
    const existing=this.nodes.get(key);
    if(existing)return existing;
    const plane=getCanonicalDataPlane(`graph:${key}`);
    const descriptor:MarketDataGraphNodeDescriptor={id:`graph:${key}`,key,symbol:String(symbol).trim(),timeframe:normalized,kind:'base',revision:0,length:0};
    const node:GraphNode={descriptor,plane,intervalSeconds:timeframeSeconds(normalized),anchorSecondsUtc:this.defaultSession.anchorSecondsUtc??0,sourceRevision:0};
    this.nodes.set(key,node);
    return node;
  }

  syncBase(symbol:string,timeframe:string,candles:readonly {timestamp:string;open:number;high:number;low:number;close:number;volume:number}[],session?:MarketDataGraphSessionProfile):void{
    const node=this.ensureBase(symbol,timeframe);
    if(session?.anchorSecondsUtc!=null)node.anchorSecondsUtc=session.anchorSecondsUtc;
    node.plane.replaceHistoricalCandleRows(candles);
    node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
    this.rebuildDependents(node.key);
    this.revision+=1;
  }

  updateBaseLast(symbol:string,timeframe:string,candle:{timestamp:string;open:number;high:number;low:number;close:number;volume:number},session?:MarketDataGraphSessionProfile):void{
    const node=this.ensureBase(symbol,timeframe);
    if(session?.anchorSecondsUtc!=null)node.anchorSecondsUtc=session.anchorSecondsUtc;
    const t=Math.floor(Date.parse(candle.timestamp)/1000);
    if(!Number.isFinite(t))return;
    const lastTime=node.plane.market.length?node.plane.market.time[node.plane.market.length-1]:NaN;
    const row={time:t,open:candle.open,high:candle.high,low:candle.low,close:candle.close,volume:candle.volume};
    if(t===lastTime)node.plane.updateLast(row);
    else if(t>lastTime||!Number.isFinite(lastTime))node.plane.append(row);
    else node.plane.replaceHistoricalCandleRows([candle]);
    node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
    this.rebuildDependentTails(node.key);
    this.revision+=1;
  }

  private chooseSource(symbol:string,targetSeconds:number):GraphNode|undefined{
    const candidates=[...this.nodes.values()].filter(node=>node.descriptor.symbol===symbol&&node.intervalSeconds>0&&node.intervalSeconds<targetSeconds&&targetSeconds%node.intervalSeconds===0);
    candidates.sort((a,b)=>a.intervalSeconds-b.intervalSeconds);
    return candidates[0];
  }

  ensureDerived(symbol:string,timeframe:string):GraphNode|undefined{
    const normalized=normalizeTimeframe(timeframe);
    const targetSeconds=timeframeSeconds(normalized);
    if(!targetSeconds)return undefined;
    const existing=this.nodes.get(graphKey(symbol,normalized));
    if(existing)return existing;
    const source=this.chooseSource(symbol,targetSeconds);
    if(!source)return undefined;
    const key=graphKey(symbol,normalized);
    const plane=getCanonicalDataPlane(`graph:${key}`);
    const descriptor:MarketDataGraphNodeDescriptor={id:`graph:${key}`,key,symbol:String(symbol).trim(),timeframe:normalized,sourceKey:source.descriptor.key,kind:'derived',revision:0,length:0};
    const node:GraphNode={descriptor,plane,sourceKey:source.descriptor.key,intervalSeconds:targetSeconds,anchorSecondsUtc:source.anchorSecondsUtc,sourceRevision:0};
    this.nodes.set(key,node);
    aggregateRows(source.plane,plane,targetSeconds,node.anchorSecondsUtc);
    node.descriptor={...node.descriptor,revision:plane.revision,length:plane.length};
    this.revision+=1;
    return node;
  }

  ensureNode(symbol:string,timeframe:string):GraphNode|undefined{
    const normalized=normalizeTimeframe(timeframe);
    const key=graphKey(symbol,normalized);
    return this.nodes.get(key)??this.ensureDerived(symbol,normalized)??((normalized==='chart')?this.nodes.get(graphKey(symbol,'chart')):undefined);
  }

  getNodeDescriptor(symbol:string,timeframe:string):MarketDataGraphNodeDescriptor|undefined{
    return this.ensureNode(symbol,timeframe)?.descriptor;
  }

  private rebuildDependents(sourceKey:string):void{
    let changed=true;
    while(changed){
      changed=false;
      for(const node of this.nodes.values()){
        if(node.sourceKey!==sourceKey)continue;
        const source=this.nodes.get(node.sourceKey);
        if(!source)continue;
        aggregateRows(source.plane,node.plane,node.intervalSeconds,node.anchorSecondsUtc);
        node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
        node.sourceRevision=source.plane.revision;
        changed=true;
      }
      if(changed)sourceKey='';
    }
  }

  private rebuildDependentTails(sourceKey:string):void{
    for(const node of this.nodes.values()){
      if(node.sourceKey!==sourceKey)continue;
      const source=this.nodes.get(sourceKey);
      if(!source||!source.plane.market.length)continue;
      aggregateRows(source.plane,node.plane,node.intervalSeconds,node.anchorSecondsUtc);
      node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
      node.sourceRevision=source.plane.revision;
    }
  }

  resolve(symbol:string,timeframe:string):CanonicalDataPlane|undefined{
    const node=this.ensureNode(symbol,timeframe);
    return node?.plane;
  }

  snapshot(
    requests:readonly {symbol:string;timeframe:string;fields?:readonly string[]}[],
    baseSymbol='current',
    baseTimeframe='chart',
  ):CoreSpiritGraphSnapshot{
    const unique=new Map<string,GraphNode>();
    for(const request of requests){
      const symbol=request.symbol==='current'?baseSymbol:request.symbol;
      const timeframe=request.timeframe==='chart'?baseTimeframe:request.timeframe;
      const node=this.ensureNode(symbol,timeframe);
      if(node)unique.set(node.descriptor.key,node);
    }
    const nodes=[...unique.values()].map(node=>cloneSnapshotNode(node.plane,node.descriptor));
    return Object.freeze({version:CORE_SPIRIT_DATA_GRAPH_VERSION,revision:this.revision,nodes:Object.freeze(nodes)});
  }

  resolverSnapshot(snapshot:CoreSpiritGraphSnapshot,baseSymbol='current',baseTimeframe='chart'):CoreSpiritDataResolver{
    return createGraphResolver(snapshot,baseSymbol,baseTimeframe);
  }

  listNodes():readonly MarketDataGraphNodeDescriptor[]{
    return Object.freeze([...this.nodes.values()].map(node=>node.descriptor));
  }

  clear():void{
    this.nodes.clear();
    this.revision+=1;
  }
}

export const marketDataGraph=new MarketDataGraph({anchorSecondsUtc:13500});
