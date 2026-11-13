import { getCanonicalDataPlane, releaseCanonicalDataPlane, type CanonicalDataPlane } from './canonicalDataPlane';
import type { CoreSpiritDataAlignment, CoreSpiritDataRequest, CoreSpiritDataResolver, CoreSpiritDataResolutionContext, CoreSpiritDataSnapshot } from '../../coreSpirit/types';

export const CORE_SPIRIT_DATA_GRAPH_VERSION = 1 as const;

export type MarketDataGraphTradingSession = Readonly<{
  id: string;
  openSeconds: number;
  closeSeconds: number;
}>;

/** Calendar-aware aggregation. Return null for holidays, overnight periods and session breaks. */
export type MarketDataGraphSessionProfile = Readonly<{
  anchorSecondsUtc?: number;
  calendarId?: string;
  sessionAt?: (timestampSeconds: number) => MarketDataGraphTradingSession | null;
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
  /** Revision of this exact canonical symbol/timeframe dataset. */
  dataRevision?: number | string;
  calendarId?: string;
  /** Exchange/session-aware close boundary; if omitted, timeframe duration is used. */
  closeTime?:Float64Array;
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
  sessionProfile:MarketDataGraphSessionProfile;
  sourceRevision:number;
  tailAggregate?:AggregateTailState;
  consumerLeaseId:string;
  lastUsedAt:number;
};

let marketDataGraphInstanceSequence = 0;

const TIMEFRAME_SECONDS:Record<string,number>={
  '1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,
  '1h':3600,'1H':3600,'60m':3600,'4h':14400,'4H':14400,
  '1d':86400,'1D':86400,'day':86400,
};

function normalizeTimeframe(value:string):string{
  const raw=String(value||'').trim();
  if(!raw||raw==='chart')return raw||'chart';
  // Vela/CoreSpirit commonly expose minute timeframes as bare numerals ('5', '15').
  // Canonicalize them before graph lookup so cross-timeframe requests don't miss.
  if(/^\d+$/.test(raw))return `${Number(raw)}m`;
  const lower=raw.toLowerCase();
  if(lower==='day')return '1D';
  if(lower==='1h'||lower==='60m')return '1H';
  if(lower==='4h')return '4H';
  if(TIMEFRAME_SECONDS[raw])return raw;
  const match=/^(\d+)\s*(m|min|minute|h|hr|hour|d|day)$/i.exec(raw);
  if(!match)return raw;
  const count=Number(match[1]);
  const unit=match[2].toLowerCase();
  if(unit.startsWith('h'))return count===1?'1H':`${count}h`;
  if(unit.startsWith('d'))return count===1?'1D':`${count}D`;
  return `${count}m`;
}

/** Canonical timeframe spelling shared by CoreSpirit data adapters and Vela requests. */
export function normalizeCoreSpiritTimeframe(value:string):string{return normalizeTimeframe(value);}

export function timeframeSeconds(value:string):number{
  const normalized=normalizeTimeframe(value);
  if(TIMEFRAME_SECONDS[normalized])return TIMEFRAME_SECONDS[normalized]!;
  const match=/^(\d+)(m|h|d)$/i.exec(normalized);
  if(!match)return 0;
  const count=Number(match[1]);
  return count*(match[2].toLowerCase()==='m'?60:match[2].toLowerCase()==='h'?3600:86400);
}

function graphKey(symbol:string,timeframe:string):string{
  return `${String(symbol).trim().toUpperCase()}::${normalizeTimeframe(timeframe)}`;
}

function bucketStart(
  timestamp:number,
  intervalSeconds:number,
  anchorSecondsUtc:number,
  sessionProfile?:MarketDataGraphSessionProfile,
):number {
  if (sessionProfile?.sessionAt) {
    const session = sessionProfile.sessionAt(timestamp);
    if (!session || !Number.isFinite(session.openSeconds) || !Number.isFinite(session.closeSeconds) ||
        session.closeSeconds <= session.openSeconds || timestamp < session.openSeconds || timestamp >= session.closeSeconds) return Number.NaN;
    if (intervalSeconds >= 86400) return session.openSeconds;
    return session.openSeconds + Math.floor((timestamp - session.openSeconds) / intervalSeconds) * intervalSeconds;
  }
  if(intervalSeconds>=86400)return Math.floor((timestamp-anchorSecondsUtc)/86400)*86400+anchorSecondsUtc;
  return Math.floor((timestamp-anchorSecondsUtc)/intervalSeconds)*intervalSeconds+anchorSecondsUtc;
}

type ExtremaEntry={key:number;value:number};

/** Indexed heaps keep current-bucket extrema reversible when the latest bar is revised. */
class IndexedExtremaHeap {
  private readonly entries:ExtremaEntry[]=[];
  private readonly positions=new Map<number,number>();
  constructor(private readonly mode:'max'|'min'){}
  peek():number{return this.entries[0]?.value??Number.NaN;}
  set(key:number,value:number):void{
    const existing=this.positions.get(key);
    if(existing==null){
      const index=this.entries.length;
      this.entries.push({key,value});
      this.positions.set(key,index);
      this.siftUp(index);
      return;
    }
    this.entries[existing]!.value=value;
    const parent=(existing-1)>>1;
    if(existing>0&&this.preferred(this.entries[existing]!,this.entries[parent]!))this.siftUp(existing);
    else this.siftDown(existing);
  }
  private preferred(a:ExtremaEntry,b:ExtremaEntry):boolean{return this.mode==='max'?a.value>b.value:a.value<b.value;}
  private swap(a:number,b:number):void{
    const left=this.entries[a]!,right=this.entries[b]!;
    this.entries[a]=right;this.entries[b]=left;
    this.positions.set(left.key,b);this.positions.set(right.key,a);
  }
  private siftUp(start:number):void{
    let index=start;
    while(index>0){
      const parent=(index-1)>>1;
      if(!this.preferred(this.entries[index]!,this.entries[parent]!))break;
      this.swap(index,parent);index=parent;
    }
  }
  private siftDown(start:number):void{
    let index=start;
    for(;;){
      const left=index*2+1,right=left+1;
      let best=index;
      if(left<this.entries.length&&this.preferred(this.entries[left]!,this.entries[best]!))best=left;
      if(right<this.entries.length&&this.preferred(this.entries[right]!,this.entries[best]!))best=right;
      if(best===index)break;
      this.swap(index,best);index=best;
    }
  }
}

type AggregateTailState={
  bucket:number;
  open:number;
  close:number;
  volume:number;
  count:number;
  highs:IndexedExtremaHeap;
  lows:IndexedExtremaHeap;
  sourceLength:number;
  lastSourceTime:number;
  lastSourceIncluded:boolean;
  lastSourceVolume:number;
};

function createAggregateTail(
  bucket:number,timestamp:number,
  row:{open:number;high:number;low:number;close:number;volume:number},
  sourceLength:number,
):AggregateTailState{
  const state:AggregateTailState={
    bucket,open:row.open,close:row.close,volume:row.volume,count:1,
    highs:new IndexedExtremaHeap('max'),lows:new IndexedExtremaHeap('min'),
    sourceLength,lastSourceTime:timestamp,lastSourceIncluded:true,lastSourceVolume:row.volume,
  };
  state.highs.set(timestamp,row.high);
  state.lows.set(timestamp,row.low);
  return state;
}

function aggregateRows(
  source:CanonicalDataPlane,target:CanonicalDataPlane,
  intervalSeconds:number,anchorSecondsUtc:number,
  sessionProfile?:MarketDataGraphSessionProfile,
):AggregateTailState|undefined{
  const view=source.market.views();
  const out:number[]=[];
  let currentBucket=Number.NaN;
  let open=0,high=0,low=0,close=0,volume=0;
  let tail:AggregateTailState|undefined;
  let lastSourceTime=Number.NaN,lastSourceBucket=Number.NaN,lastSourceVolume=0;
  const flush=()=>{if(Number.isFinite(currentBucket))out.push(currentBucket,open,high,low,close,volume);};

  for(let i=0;i<view.time.length;i+=1){
    const time=Number(view.time[i]);
    lastSourceTime=time;
    const bucket=bucketStart(time,intervalSeconds,anchorSecondsUtc,sessionProfile);
    // Off-session rows are ignored without splitting a daily/session bucket.
    if(!Number.isFinite(bucket)){
      lastSourceBucket=Number.NaN;lastSourceVolume=0;
      if(tail)tail.lastSourceIncluded=false;
      continue;
    }
    const row={open:Number(view.open[i]),high:Number(view.high[i]),low:Number(view.low[i]),close:Number(view.close[i]),volume:Number(view.volume[i])||0};
    if(![row.open,row.high,row.low,row.close].every(Number.isFinite)){
      lastSourceBucket=Number.NaN;lastSourceVolume=0;
      if(tail)tail.lastSourceIncluded=false;
      continue;
    }
    if(bucket!==currentBucket){
      flush();
      currentBucket=bucket;open=row.open;high=row.high;low=row.low;close=row.close;volume=row.volume;
      tail=createAggregateTail(bucket,time,row,view.time.length);
    }else{
      high=Math.max(high,row.high);low=Math.min(low,row.low);close=row.close;volume+=row.volume;
      tail?.highs.set(time,row.high);tail?.lows.set(time,row.low);
      if(tail){tail.close=close;tail.volume=volume;tail.count+=1;}
    }
    lastSourceBucket=bucket;lastSourceVolume=row.volume;
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
  if(tail){
    tail.sourceLength=view.time.length;
    tail.lastSourceTime=lastSourceTime;
    tail.lastSourceIncluded=Number.isFinite(lastSourceBucket)&&lastSourceBucket===tail.bucket;
    tail.lastSourceVolume=tail.lastSourceIncluded?lastSourceVolume:0;
  }
  return tail;
}
function cloneSnapshotNode(
  plane:CanonicalDataPlane,
  descriptor:MarketDataGraphNodeDescriptor,
  node:GraphNode,
):CoreSpiritGraphSnapshotNode {
  const view=plane.market.views();
  const closeTime=new Float64Array(view.time.length);
  for (let index=0; index<view.time.length; index+=1) {
    const start=Number(view.time[index]);
    const session=node.sessionProfile.sessionAt?.(start);
    const nominalEnd=start+Math.max(0,node.intervalSeconds);
    closeTime[index]=session && Number.isFinite(session.closeSeconds)
      ? Math.min(nominalEnd,session.closeSeconds)
      : nominalEnd;
    if (node.intervalSeconds>=86400 && session) closeTime[index]=session.closeSeconds;
  }
  return {
    id:descriptor.id,
    symbol:descriptor.symbol,
    timeframe:descriptor.timeframe,
    revision:descriptor.revision,
    dataRevision:descriptor.revision,
    calendarId:node.sessionProfile.calendarId,
    closeTime,
    time:new Float64Array(view.time),
    open:new Float64Array(view.open),
    high:new Float64Array(view.high),
    low:new Float64Array(view.low),
    close:new Float64Array(view.close),
    volume:new Float64Array(view.volume),
  };
}

export class CoreSpiritDataGraphResolver implements CoreSpiritDataResolver{
  private nodes=new Map<string,CoreSpiritGraphSnapshotNode>();
  constructor(
    snapshot:CoreSpiritGraphSnapshot,
    private readonly baseSymbol='current',
    private readonly baseTimeframe='chart',
  ){this.replaceSnapshot(snapshot);}

  replaceSnapshot(snapshot:CoreSpiritGraphSnapshot):void{
    this.nodes.clear();
    for(const node of snapshot.nodes) {
      if (node.time.length !== node.open.length || node.time.length !== node.high.length ||
          node.time.length !== node.low.length || node.time.length !== node.close.length ||
          node.time.length !== node.volume.length ||
          (node.closeTime != null && node.closeTime.length !== node.time.length) ||
          !node.symbol?.trim() || !node.timeframe?.trim()) continue;
      // Resolver alignment relies on a strictly increasing canonical timeline.
      // Reject malformed/duplicate timelines rather than binary-searching them.
      let previousTime = Number.NEGATIVE_INFINITY;
      let validTimeline = true;
      for (let index = 0; index < node.time.length; index += 1) {
        const timestamp = Number(node.time[index]);
        if (!Number.isFinite(timestamp) || timestamp <= previousTime ||
            (node.closeTime != null && (!Number.isFinite(Number(node.closeTime[index])) ||
              Number(node.closeTime[index]) < timestamp))) {
          validTimeline = false;
          break;
        }
        previousTime = timestamp;
      }
      if (!validTimeline) continue;
      this.nodes.set(graphKey(node.symbol,node.timeframe),node);
    }
  }

  private defaultContext():CoreSpiritDataResolutionContext {
    return {
      asOfTimestamp:Math.floor(Date.now()/1000),
      baseSymbol:this.baseSymbol,
      baseTimeframe:this.baseTimeframe,
      executionMode:'historical',
      revision:0,
      alignment:'last-confirmed',
    };
  }

  private pickNode(symbol:string,timeframe:string):CoreSpiritGraphSnapshotNode|undefined{
    const actualSymbol=symbol==='current'?this.baseSymbol:symbol;
    const actualTimeframe=timeframe==='chart'?this.baseTimeframe:timeframe;
    return this.nodes.get(graphKey(actualSymbol,actualTimeframe));
  }

  private indexAt(node:CoreSpiritGraphSnapshotNode,asOf:number,alignment:CoreSpiritDataAlignment):number{
    let lo=0,hi=node.time.length;
    while(lo<hi){
      const mid=(lo+hi)>>1;
      if(node.time[mid]!<=asOf)lo=mid+1;else hi=mid;
    }
    let index=lo-1;
    if(index<0)return -1;
    if(alignment==='exact')return node.time[index]===asOf?index:-1;
    if(alignment==='last-confirmed'||alignment==='nearest-confirmed'){
      const seconds=timeframeSeconds(node.timeframe);
      while(index>=0) {
        const close=node.closeTime?.[index] ??
          (seconds>0 ? node.time[index]!+seconds : Number.POSITIVE_INFINITY);
        if(!Number.isFinite(close)||close>asOf)index-=1;
        else break;
      }
    }
    return index;
  }

  private valueAt(request:CoreSpiritDataRequest,ctx?:CoreSpiritDataResolutionContext):CoreSpiritDataSnapshot{
    const node=this.pickNode(request.symbol,request.timeframe);
    if(!node)return {
      value:null,source:'data-graph:missing',symbol:request.symbol,timeframe:request.timeframe,
      state:'historical',confirmationPhase:'confirmed',dataRevision:'missing',
    };
    const alignment=ctx?.alignment??'last-confirmed';
    const asOf=ctx?.asOfTimestamp??Number.POSITIVE_INFINITY;
    let index=this.indexAt(node,asOf,alignment);
    index-=Math.max(0,Math.floor(request.offset||0));
    if(index<0||index>=node.time.length)return {value:null,source:alignment==='exact'?'data-graph:unaligned':'data-graph:empty',symbol:request.symbol,timeframe:request.timeframe,state:'historical'};
    const timestamp=Number(node.time[index]);
    const barDurationSeconds=timeframeSeconds(node.timeframe);
    const closeTimeCandidate = node.closeTime?.[index] ??
      (barDurationSeconds>0 ? timestamp+barDurationSeconds : Number.NaN);
    const closeTime = Number.isFinite(closeTimeCandidate) ? closeTimeCandidate : undefined;
    const dataRevision = node.dataRevision ?? node.revision;
    const effectiveStaleAgeMs = Math.max(0,asOf-(closeTime ?? timestamp))*1000;
    const isConfirmed=closeTime != null && closeTime<=asOf;
    if (closeTime == null && ctx && ctx.executionMode !== 'realtime') {
      return {
        value:null,source:'data-graph:unconfirmed',symbol:node.symbol,timeframe:node.timeframe,
        timestamp,state:'developing',confirmationPhase:'developing',revision:node.revision,dataRevision,
      };
    }
    if(ctx?.maxStalenessMs!=null&&Number.isFinite(asOf)&&effectiveStaleAgeMs>ctx.maxStalenessMs){
      return {
        value:null,source:'data-graph:stale',symbol:node.symbol,timeframe:node.timeframe,
        timestamp,...(closeTime==null?{}:{closeTimestamp:closeTime}),
        state:closeTime==null?'developing':'historical',
        confirmationPhase:closeTime==null?'developing':'confirmed',
        revision:node.revision,dataRevision,
      };
    }
    const columns:Record<string,Float64Array>={time:node.time,open:node.open,high:node.high,low:node.low,close:node.close,volume:node.volume};
    const value=columns[request.field]?.[index];
    const common = {
      symbol:node.symbol,
      timeframe:node.timeframe,
      timestamp,
      ...(closeTime==null?{}:{closeTimestamp:closeTime}),
      revision:node.revision,
      dataRevision:node.dataRevision ?? node.revision,
      confirmationPhase:isConfirmed ? 'confirmed' as const : 'developing' as const,
    };
    if (ctx && ctx.executionMode !== 'realtime' && !isConfirmed) {
      return { ...common, value:null, source:'data-graph:unconfirmed', state:'developing' };
    }
    if(value==null||!Number.isFinite(Number(value))) {
      return { ...common, value:null, source:'data-graph', state:isConfirmed?'historical':'developing' };
    }
    return {
      ...common,
      value:Number(value),
      source:'data-graph',
      state:isConfirmed?'confirmed':'developing',
    };
  }

  request=(request:CoreSpiritDataRequest)=>this.valueAt(request,this.defaultContext());
  requestAt=(request:CoreSpiritDataRequest,ctx:CoreSpiritDataResolutionContext)=>this.valueAt(request,ctx);
  requestBatch=(requests:CoreSpiritDataRequest[],ctx?:CoreSpiritDataResolutionContext)=>{
    const effectiveContext=ctx??this.defaultContext();
    return requests.map(request=>this.valueAt(request,effectiveContext));
  };
  series=(request:CoreSpiritDataRequest,ctx?:CoreSpiritDataResolutionContext)=>{
    const effectiveContext=ctx??this.defaultContext();
    const node=this.pickNode(request.symbol,request.timeframe);
    if(!node)return [];
    const columns:Record<string,Float64Array>={time:node.time,open:node.open,high:node.high,low:node.low,close:node.close,volume:node.volume};
    let index=this.indexAt(node,effectiveContext.asOfTimestamp,effectiveContext.alignment);
    const seconds=timeframeSeconds(node.timeframe);
    if (effectiveContext.executionMode !== 'realtime') {
      while (index >= 0) {
        const close=node.closeTime?.[index] ??
          (seconds>0 ? Number(node.time[index])+seconds : Number.POSITIVE_INFINITY);
        if(!Number.isFinite(close)||close>effectiveContext.asOfTimestamp) index -= 1;
        else break;
      }
    }
    return Array.from(columns[request.field]?.subarray(0,Math.max(0,index+1))??[]);
  };
  cacheKey=(request:CoreSpiritDataRequest)=>{
    const symbol=request.symbol==='current'?this.baseSymbol:request.symbol;
    const timeframe=request.timeframe==='chart'?this.baseTimeframe:request.timeframe;
    const node=this.nodes.get(graphKey(symbol,timeframe));
    const dataRevision=node?.dataRevision ?? node?.revision ?? 'missing';
    // Key only by this canonical dataset, not the global graph revision: updates
    // to another symbol/timeframe must not evict this dependency's cache entry.
    return `data-graph:${graphKey(symbol,timeframe)}:${node?.id ?? 'missing'}:${dataRevision}:${node?.calendarId ?? 'no-calendar'}`;
  };
}

export function createGraphResolver(snapshot:CoreSpiritGraphSnapshot,baseSymbol='current',baseTimeframe='chart'):CoreSpiritDataGraphResolver{
  return new CoreSpiritDataGraphResolver(snapshot,baseSymbol,baseTimeframe);
}

export function graphSnapshotTransferables(snapshot:CoreSpiritGraphSnapshot):Transferable[]{
  const transferables:Transferable[]=[];
  for(const node of snapshot.nodes){
    transferables.push(node.time.buffer,node.open.buffer,node.high.buffer,node.low.buffer,node.close.buffer,node.volume.buffer);
    if (node.closeTime) transferables.push(node.closeTime.buffer);
  }
  return transferables;
}

export class MarketDataGraph{
  private readonly nodes=new Map<MarketDataGraphNodeKey,GraphNode>();
  /** Reverse dependency index: live source updates touch only their direct timeframe children. */
  private readonly childrenBySource=new Map<MarketDataGraphNodeKey,Set<MarketDataGraphNodeKey>>();
  private revision=0;
  private readonly instanceId=++marketDataGraphInstanceSequence;
  private readonly symbolPins=new Map<string,number>();
  private idleSweepTimer?:ReturnType<typeof setTimeout>;
  private fullAggregationRebuilds=0;
  private incrementalTailUpdates=0;
  private idleEvictions=0;
  private dependencyNodesVisited=0;

  constructor(
    private readonly defaultSession:MarketDataGraphSessionProfile={anchorSecondsUtc:0},
    private readonly maxSymbols=64,
    private readonly maxBytes=128*1024*1024,
    private readonly maxIdleMs=5*60_000,
  ){}

  get graphRevision():number{return this.revision;}

  retainSymbol(symbol:string):()=>void {
    const key=String(symbol||'').trim().toUpperCase();
    if(!key)return ()=>{};
    this.symbolPins.set(key,(this.symbolPins.get(key)??0)+1);
    for(const node of this.nodes.values())if(node.descriptor.symbol.trim().toUpperCase()===key)this.touchNode(node);
    if(this.idleSweepTimer){clearTimeout(this.idleSweepTimer);this.idleSweepTimer=undefined;}
    // Re-arm expiry for other unpinned symbols; one active chart must not
    // suppress cleanup for every instrument in the shared graph.
    this.scheduleIdleSweep();
    let released=false;
    return ()=>{
      if(released)return;
      released=true;
      const count=Math.max(0,(this.symbolPins.get(key)??0)-1);
      if(count===0)this.symbolPins.delete(key);else this.symbolPins.set(key,count);
      this.trimIdleSymbols();
    };
  }

  private touchNode(node:GraphNode):void { node.lastUsedAt=Date.now(); }

  private scheduleIdleSweep():void {
    if(this.idleSweepTimer){clearTimeout(this.idleSweepTimer);this.idleSweepTimer=undefined;}
    let nextExpiry=Number.POSITIVE_INFINITY;
    for(const node of this.nodes.values()){
      const symbol=node.descriptor.symbol.trim().toUpperCase();
      if((this.symbolPins.get(symbol)??0)>0)continue;
      if(node.plane.listConsumers().some(consumer=>consumer.id!==node.consumerLeaseId))continue;
      nextExpiry=Math.min(nextExpiry,node.lastUsedAt+Math.max(1,this.maxIdleMs));
    }
    if(!Number.isFinite(nextExpiry))return;
    const delay=Math.max(25,nextExpiry-Date.now());
    this.idleSweepTimer=setTimeout(()=>{
      this.idleSweepTimer=undefined;
      this.trimIdleSymbols();
    },delay);
    (this.idleSweepTimer as ReturnType<typeof setTimeout> & {unref?:()=>void}).unref?.();
  }

  evictSymbol(symbol:string):number {
    const normalized=String(symbol||'').trim().toUpperCase();
    if(!normalized||(this.symbolPins.get(normalized)??0)>0)return 0;
    const matches=[...this.nodes.entries()].filter(([,node])=>node.descriptor.symbol.trim().toUpperCase()===normalized);
    if(!matches.length)return 0;
    if(matches.some(([,node])=>node.plane.listConsumers().some(consumer=>consumer.id!==node.consumerLeaseId)))return 0;
    for(const [key,node] of matches){
      if(node.sourceKey){
        const siblings=this.childrenBySource.get(node.sourceKey);
        siblings?.delete(key);
        if(siblings?.size===0)this.childrenBySource.delete(node.sourceKey);
      }
      this.childrenBySource.delete(key);
      node.plane.detachConsumer(node.consumerLeaseId);
      releaseCanonicalDataPlane(node.plane.timelineKey,node.plane);
      this.nodes.delete(key);
    }
    this.revision+=1;
    return matches.length;
  }

  trimIdleSymbols(now=Date.now()):number {
    const groups=new Map<string,{lastUsedAt:number;bytes:number}>();
    for(const node of this.nodes.values()){
      const symbol=node.descriptor.symbol.trim().toUpperCase();
      const group=groups.get(symbol)??{lastUsedAt:0,bytes:0};
      group.lastUsedAt=Math.max(group.lastUsedAt,node.lastUsedAt);
      group.bytes+=node.plane.estimatedBytes;
      groups.set(symbol,group);
    }
    const limit=Math.max(1,Math.floor(this.maxSymbols));
    const budget=Math.max(0,this.maxBytes);
    let totalBytes=[...groups.values()].reduce((sum,group)=>sum+group.bytes,0);
    let remaining=groups.size,removed=0;
    const candidates=[...groups.entries()].sort((a,b)=>a[1].lastUsedAt-b[1].lastUsedAt);
    // Idle expiry is independent of capacity pressure.
    for(const [symbol,group] of candidates){
      if(now-group.lastUsedAt<Math.max(1,this.maxIdleMs)||(this.symbolPins.get(symbol)??0)>0)continue;
      const count=this.evictSymbol(symbol);
      if(count>0){
        remaining-=1;removed+=count;this.idleEvictions+=count;
        totalBytes=Math.max(0,totalBytes-group.bytes);
      }
    }
    // Existing graph entry/byte budgets remain enforced after idle expiry.
    for(const [symbol,group] of candidates){
      if(remaining<=limit&&totalBytes<=budget)break;
      if((this.symbolPins.get(symbol)??0)>0)continue;
      const count=this.evictSymbol(symbol);
      if(count>0){remaining-=1;removed+=count;totalBytes=Math.max(0,totalBytes-group.bytes);}
    }
    this.scheduleIdleSweep();
    return removed;
  }
  stats():Readonly<{
    symbols:number;nodes:number;pinnedSymbols:number;estimatedBytes:number;maxSymbols:number;maxBytes:number;
    fullAggregationRebuilds:number;incrementalTailUpdates:number;idleEvictions:number;dependencyNodesVisited:number;
  }> {
    const symbols=new Set([...this.nodes.values()].map(node=>node.descriptor.symbol.trim().toUpperCase()));
    let estimatedBytes=0;
    for(const node of this.nodes.values())estimatedBytes+=node.plane.estimatedBytes;
    return Object.freeze({
      symbols:symbols.size,nodes:this.nodes.size,
      pinnedSymbols:[...symbols].filter(symbol=>(this.symbolPins.get(symbol)??0)>0).length,
      estimatedBytes,maxSymbols:Math.max(1,Math.floor(this.maxSymbols)),maxBytes:Math.max(0,this.maxBytes),
      fullAggregationRebuilds:this.fullAggregationRebuilds,
      incrementalTailUpdates:this.incrementalTailUpdates,
      idleEvictions:this.idleEvictions,
      dependencyNodesVisited:this.dependencyNodesVisited,
    });
  }

  private ensureBase(symbol:string,timeframe:string):GraphNode{
    const normalized=normalizeTimeframe(timeframe);
    const key=graphKey(symbol,normalized);
    const existing=this.nodes.get(key);
    if(existing){this.touchNode(existing);return existing;}
    const plane=getCanonicalDataPlane(`graph:${this.instanceId}:${key}`);
    const consumerLeaseId=`market-data-graph:${this.instanceId}:${key}`;
    plane.attachConsumer(consumerLeaseId,'graph');
    const descriptor:MarketDataGraphNodeDescriptor={id:`graph:${key}`,key,symbol:String(symbol).trim(),timeframe:normalized,kind:'base',revision:0,length:0};
    const sessionProfile:MarketDataGraphSessionProfile = {
      ...this.defaultSession,
      anchorSecondsUtc:this.defaultSession.anchorSecondsUtc??0,
    };
    const node:GraphNode={descriptor,plane,intervalSeconds:timeframeSeconds(normalized),anchorSecondsUtc:sessionProfile.anchorSecondsUtc??0,sessionProfile,sourceRevision:0,consumerLeaseId,lastUsedAt:Date.now()};
    this.nodes.set(key,node);
    return node;
  }

  syncBase(symbol:string,timeframe:string,candles:readonly {timestamp:string;open:number;high:number;low:number;close:number;volume:number}[],session?:MarketDataGraphSessionProfile):void{
    const node=this.ensureBase(symbol,timeframe);
    if(session?.anchorSecondsUtc!=null)node.anchorSecondsUtc=session.anchorSecondsUtc;
    if (session) node.sessionProfile = { ...node.sessionProfile, ...session };
    this.touchNode(node);
    node.plane.replaceHistoricalCandleRows(candles);
    node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
    this.rebuildDependents(node.descriptor.key);
    this.revision+=1;
    this.trimIdleSymbols();
  }

  updateBaseLast(symbol:string,timeframe:string,candle:{timestamp:string;open:number;high:number;low:number;close:number;volume:number},session?:MarketDataGraphSessionProfile):void{
    const baseKey=graphKey(symbol,timeframe);
    const created=!this.nodes.has(baseKey);
    const node=this.ensureBase(symbol,timeframe);
    // First-time tick-only symbols still receive an idle-expiry timer. Existing
    // hot updates never pay a whole-graph sweep cost.
    if(created)this.trimIdleSymbols();
    const previousSession=node.sessionProfile;
    const nextSession=session?{...node.sessionProfile,...session}:node.sessionProfile;
    const sessionCalendarChanged=nextSession.anchorSecondsUtc!==node.anchorSecondsUtc||
      nextSession.calendarId!==previousSession.calendarId||
      nextSession.sessionAt!==previousSession.sessionAt;
    if(session?.anchorSecondsUtc!=null)node.anchorSecondsUtc=session.anchorSecondsUtc;
    if(session)node.sessionProfile=nextSession;
    const t=Math.floor(Date.parse(candle.timestamp)/1000);
    if(!Number.isFinite(t))return;
    const lastTime=node.plane.market.length?node.plane.market.time[node.plane.market.length-1]:NaN;
    const row={time:t,open:candle.open,high:candle.high,low:candle.low,close:candle.close,volume:candle.volume};
    if(t===lastTime)node.plane.updateLast(row);
    else if(t>lastTime||!Number.isFinite(lastTime))node.plane.append(row);
    else {
      // A live delta older than this shared graph's tail is stale, not a new
      // one-row dataset. Historical corrections have an explicit reconciliation
      // API; they must never replace the entire graph snapshot.
      return;
    }
    node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
    this.touchNode(node);
    // A changed exchange calendar/anchor invalidates the bucket identity and
    // therefore requires a full rebuild. Stable calendars keep the O(log n) tail path.
    if(sessionCalendarChanged)this.rebuildDependents(node.descriptor.key);
    else this.rebuildDependentTails(node.descriptor.key);
    this.revision+=1;
    // No global LRU scan on each market update. The pre-scheduled idle sweep
    // refreshes its deadline from lastUsedAt; capacity checks run on graph changes.
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
    this.touchNode(source);
    const key=graphKey(symbol,normalized);
    const plane=getCanonicalDataPlane(`graph:${this.instanceId}:${key}`);
    const consumerLeaseId=`market-data-graph:${this.instanceId}:${key}`;
    plane.attachConsumer(consumerLeaseId,'graph');
    const descriptor:MarketDataGraphNodeDescriptor={id:`graph:${key}`,key,symbol:String(symbol).trim(),timeframe:normalized,sourceKey:source.descriptor.key,kind:'derived',revision:0,length:0};
    const sessionProfile = source.sessionProfile;
    const node:GraphNode={descriptor,plane,sourceKey:source.descriptor.key,intervalSeconds:targetSeconds,anchorSecondsUtc:source.anchorSecondsUtc,sessionProfile,sourceRevision:0,consumerLeaseId,lastUsedAt:Date.now()};
    this.nodes.set(key,node);
    const dependentKeys=this.childrenBySource.get(source.descriptor.key)??new Set<MarketDataGraphNodeKey>();
    dependentKeys.add(key);
    this.childrenBySource.set(source.descriptor.key,dependentKeys);
    this.fullAggregationRebuilds+=1;
    node.tailAggregate=aggregateRows(source.plane,plane,targetSeconds,node.anchorSecondsUtc,node.sessionProfile);
    node.sourceRevision=source.plane.revision;
    node.descriptor={...node.descriptor,revision:plane.revision,length:plane.length};
    this.revision+=1;
    this.trimIdleSymbols();
    return node;
  }

  ensureNode(symbol:string,timeframe:string):GraphNode|undefined{
    const normalized=normalizeTimeframe(timeframe);
    const key=graphKey(symbol,normalized);
    const existing=this.nodes.get(key);
    if(existing){this.touchNode(existing);return existing;}
    return this.ensureDerived(symbol,normalized)??((normalized==='chart')?this.nodes.get(graphKey(symbol,'chart')):undefined);
  }

  getNodeDescriptor(symbol:string,timeframe:string):MarketDataGraphNodeDescriptor|undefined{
    return this.ensureNode(symbol,timeframe)?.descriptor;
  }

  private rebuildNodeFromSource(node:GraphNode,source:GraphNode):void {
    node.sessionProfile=source.sessionProfile;
    node.anchorSecondsUtc=source.anchorSecondsUtc;
    this.fullAggregationRebuilds+=1;
    node.tailAggregate=aggregateRows(source.plane,node.plane,node.intervalSeconds,node.anchorSecondsUtc,node.sessionProfile);
    node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
    node.sourceRevision=source.plane.revision;
  }

  private rebuildDependents(sourceKey:string):void {
    const queue=[sourceKey],visited=new Set<string>();
    while(queue.length){
      const current=queue.shift()!;
      if(visited.has(current))continue;
      visited.add(current);
      const children=this.childrenBySource.get(current);
      if(!children)continue;
      const source=this.nodes.get(current);
      if(!source)continue;
      for(const childKey of children){
        this.dependencyNodesVisited+=1;
        const node=this.nodes.get(childKey);
        if(!node)continue;
        this.rebuildNodeFromSource(node,source);
        queue.push(node.descriptor.key);
      }
    }
  }

  private rebuildDependentTails(sourceKey:string):void {
    const source=this.nodes.get(sourceKey);
    if(!source||!source.plane.market.length)return;
    const children=this.childrenBySource.get(sourceKey);
    if(!children)return;
    for(const childKey of children){
      this.dependencyNodesVisited+=1;
      const node=this.nodes.get(childKey);
      if(!node)continue;
      const result=this.updateDependentTail(node,source);
      if(result==='unchanged')continue;
      if(result==='rebuild')this.rebuildNodeFromSource(node,source);
      this.rebuildDependentTails(node.descriptor.key);
    }
  }

  private updateDependentTail(node:GraphNode,source:GraphNode):'updated'|'unchanged'|'rebuild' {
    const view=source.plane.market.views();
    const lastIndex=view.time.length-1;
    if(lastIndex<0)return 'unchanged';
    const timestamp=Number(view.time[lastIndex]);
    const open=Number(view.open[lastIndex]),high=Number(view.high[lastIndex]);
    const low=Number(view.low[lastIndex]),close=Number(view.close[lastIndex]);
    const volume=Number(view.volume[lastIndex])||0;
    if(!Number.isFinite(timestamp)||![open,high,low,close].every(Number.isFinite))return 'rebuild';

    let state=node.tailAggregate;
    if(!state)return 'rebuild';
    const replacingLatest=view.time.length===state.sourceLength&&timestamp===state.lastSourceTime;
    const appendingLatest=view.time.length===state.sourceLength+1&&timestamp>state.lastSourceTime;
    if(!replacingLatest&&!appendingLatest)return 'rebuild';

    const bucket=bucketStart(timestamp,node.intervalSeconds,node.anchorSecondsUtc,node.sessionProfile);
    state.sourceLength=view.time.length;
    state.lastSourceTime=timestamp;
    if(!Number.isFinite(bucket)){
      state.lastSourceIncluded=false;
      state.lastSourceVolume=0;
      node.sourceRevision=source.plane.revision;
      return 'unchanged';
    }

    if(bucket!==state.bucket){
      state=createAggregateTail(bucket,timestamp,{open,high,low,close,volume},view.time.length);
      node.tailAggregate=state;
    }else if(replacingLatest&&state.lastSourceIncluded){
      state.highs.set(timestamp,high);
      state.lows.set(timestamp,low);
      state.volume+=volume-state.lastSourceVolume;
      if(state.count===1)state.open=open;
      state.close=close;
      state.lastSourceVolume=volume;
      node.tailAggregate=state;
    }else{
      state.highs.set(timestamp,high);
      state.lows.set(timestamp,low);
      if(state.count===0)state.open=open;
      state.close=close;
      state.volume+=volume;
      state.count+=1;
      state.lastSourceIncluded=true;
      state.lastSourceVolume=volume;
      node.tailAggregate=state;
    }

    const row={time:bucket,open:state.open,high:state.highs.peek(),low:state.lows.peek(),close:state.close,volume:state.volume};
    if(![row.open,row.high,row.low,row.close,row.volume].every(Number.isFinite))return 'rebuild';
    const targetLength=node.plane.market.length;
    const targetLastTime=targetLength?Number(node.plane.market.time[targetLength-1]):Number.NaN;
    if(Number.isFinite(targetLastTime)&&targetLastTime===bucket)node.plane.updateLast(row);
    else if(!Number.isFinite(targetLastTime)||bucket>targetLastTime)node.plane.append(row);
    else return 'rebuild';
    node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
    node.sourceRevision=source.plane.revision;
    this.incrementalTailUpdates+=1;
    return 'updated';
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
    const symbols=[...new Set(requests.map(request=>String(request.symbol==='current'?baseSymbol:request.symbol).trim().toUpperCase()).filter(Boolean))];
    const releases=symbols.map(symbol=>this.retainSymbol(symbol));
    try {
      const unique=new Map<string,GraphNode>();
      for(const request of requests){
        const symbol=request.symbol==='current'?baseSymbol:request.symbol;
        const timeframe=request.timeframe==='chart'?baseTimeframe:request.timeframe;
        const node=this.ensureNode(symbol,timeframe);
        if(node)unique.set(node.descriptor.key,node);
      }
      const nodes=[...unique.values()].map(node=>cloneSnapshotNode(node.plane,node.descriptor,node));
      return Object.freeze({version:CORE_SPIRIT_DATA_GRAPH_VERSION,revision:this.revision,nodes:Object.freeze(nodes)});
    } finally {
      for(const release of releases)release();
      this.trimIdleSymbols();
    }
  }

  resolverSnapshot(snapshot:CoreSpiritGraphSnapshot,baseSymbol='current',baseTimeframe='chart'):CoreSpiritDataResolver{
    return createGraphResolver(snapshot,baseSymbol,baseTimeframe);
  }

  listNodes():readonly MarketDataGraphNodeDescriptor[]{
    return Object.freeze([...this.nodes.values()].map(node=>node.descriptor));
  }

  clear():void{
    if(this.idleSweepTimer){clearTimeout(this.idleSweepTimer);this.idleSweepTimer=undefined;}
    const symbols=[...new Set([...this.nodes.values()].map(node=>node.descriptor.symbol))];
    for(const symbol of symbols)this.evictSymbol(symbol);
  }
}

export const marketDataGraph=new MarketDataGraph({anchorSecondsUtc:13500});
