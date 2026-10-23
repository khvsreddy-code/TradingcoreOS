import { getCanonicalDataPlane, type CanonicalDataPlane } from './canonicalDataPlane';
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
};

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

function aggregateRows(
  source:CanonicalDataPlane,
  target:CanonicalDataPlane,
  intervalSeconds:number,
  anchorSecondsUtc:number,
  sessionProfile?:MarketDataGraphSessionProfile,
):void {
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
    const bucket=bucketStart(t,intervalSeconds,anchorSecondsUtc,sessionProfile);
    // Ignore off-session observations without splitting immediately. The next
    // valid bar tells us whether the gap changed the bucket (overnight/holiday)
    // or merely interrupted the same bucket (a scheduled session break).
    if (!Number.isFinite(bucket)) continue;
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
          (node.closeTime != null && node.closeTime.length !== node.time.length)) continue;
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
      while(index>=0&&seconds>0&&(node.closeTime?.[index] ?? node.time[index]!+seconds)>asOf)index-=1;
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
    const freshnessTimestamp=timestamp+(barDurationSeconds>0?barDurationSeconds:0);
    const dataRevision = node.dataRevision ?? node.revision;
    const closeTime = node.closeTime?.[index] ?? freshnessTimestamp;
    const effectiveStaleAgeMs = Math.max(0,asOf-closeTime)*1000;
    if(ctx?.maxStalenessMs!=null&&Number.isFinite(asOf)&&effectiveStaleAgeMs>ctx.maxStalenessMs){
      return {
        value:null,source:'data-graph:stale',symbol:node.symbol,timeframe:node.timeframe,
        timestamp,state:'historical',confirmationPhase:'confirmed',revision:node.revision,dataRevision,
      };
    }
    const columns:Record<string,Float64Array>={time:node.time,open:node.open,high:node.high,low:node.low,close:node.close,volume:node.volume};
    const value=columns[request.field]?.[index];
    const seconds=timeframeSeconds(node.timeframe);
    const closeBoundary=node.closeTime?.[index] ?? timestamp+seconds;
    const isConfirmed=seconds<=0||closeBoundary<=asOf;
    const common = {
      symbol:node.symbol,
      timeframe:node.timeframe,
      timestamp,
      revision:node.revision,
      dataRevision:node.dataRevision ?? node.revision,
      confirmationPhase:isConfirmed ? 'confirmed' as const : 'developing' as const,
    };
    if (ctx && ctx.executionMode !== 'realtime' && !isConfirmed && seconds > 0) {
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
    if (effectiveContext.executionMode !== 'realtime' && seconds > 0) {
      while (index >= 0 && (node.closeTime?.[index] ?? Number(node.time[index])+seconds) > effectiveContext.asOfTimestamp) index -= 1;
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
    const sessionProfile:MarketDataGraphSessionProfile = {
      ...this.defaultSession,
      anchorSecondsUtc:this.defaultSession.anchorSecondsUtc??0,
    };
    const node:GraphNode={descriptor,plane,intervalSeconds:timeframeSeconds(normalized),anchorSecondsUtc:sessionProfile.anchorSecondsUtc??0,sessionProfile,sourceRevision:0};
    this.nodes.set(key,node);
    return node;
  }

  syncBase(symbol:string,timeframe:string,candles:readonly {timestamp:string;open:number;high:number;low:number;close:number;volume:number}[],session?:MarketDataGraphSessionProfile):void{
    const node=this.ensureBase(symbol,timeframe);
    if(session?.anchorSecondsUtc!=null)node.anchorSecondsUtc=session.anchorSecondsUtc;
    if (session) node.sessionProfile = { ...node.sessionProfile, ...session };
    node.plane.replaceHistoricalCandleRows(candles);
    node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
    this.rebuildDependents(node.descriptor.key);
    this.revision+=1;
  }

  updateBaseLast(symbol:string,timeframe:string,candle:{timestamp:string;open:number;high:number;low:number;close:number;volume:number},session?:MarketDataGraphSessionProfile):void{
    const node=this.ensureBase(symbol,timeframe);
    if(session?.anchorSecondsUtc!=null)node.anchorSecondsUtc=session.anchorSecondsUtc;
    if (session) node.sessionProfile = { ...node.sessionProfile, ...session };
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
    this.rebuildDependentTails(node.descriptor.key);
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
    const sessionProfile = source.sessionProfile;
    const node:GraphNode={descriptor,plane,sourceKey:source.descriptor.key,intervalSeconds:targetSeconds,anchorSecondsUtc:source.anchorSecondsUtc,sessionProfile,sourceRevision:0};
    this.nodes.set(key,node);
    aggregateRows(source.plane,plane,targetSeconds,node.anchorSecondsUtc,node.sessionProfile);
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
    const queue=[sourceKey];
    const visited=new Set<string>();
    while(queue.length){
      const current=queue.shift()!;
      if(visited.has(current))continue;
      visited.add(current);
      for(const node of this.nodes.values()){
        if(node.sourceKey!==current)continue;
        const source=this.nodes.get(node.sourceKey);
        if(!source)continue;
        node.sessionProfile = source.sessionProfile;
        node.anchorSecondsUtc = source.anchorSecondsUtc;
        aggregateRows(source.plane,node.plane,node.intervalSeconds,node.anchorSecondsUtc,node.sessionProfile);
        node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
        node.sourceRevision=source.plane.revision;
        queue.push(node.descriptor.key);
      }
    }
  }

  private rebuildDependentTails(sourceKey:string):void{
    for(const node of this.nodes.values()){
      if(node.sourceKey!==sourceKey)continue;
      const source=this.nodes.get(sourceKey);
      if(!source||!source.plane.market.length)continue;
      node.sessionProfile = source.sessionProfile;
      node.anchorSecondsUtc = source.anchorSecondsUtc;

      const sourceView=source.plane.market.views();
      const lastIndex=sourceView.time.length-1;
      const lastTimestamp=Number(sourceView.time[lastIndex]);
      const bucket=bucketStart(lastTimestamp,node.intervalSeconds,node.anchorSecondsUtc,node.sessionProfile);
      if (!Number.isFinite(bucket)) continue;
      let from=lastIndex;
      while(from>0){
        const previousTimestamp=Number(sourceView.time[from-1]);
        if(!Number.isFinite(previousTimestamp)||bucketStart(previousTimestamp,node.intervalSeconds,node.anchorSecondsUtc,node.sessionProfile)!==bucket)break;
        from-=1;
      }

      let open=Number.NaN,high=Number.NaN,low=Number.NaN,close=Number.NaN,volume=0;
      for(let i=from;i<=lastIndex;i+=1){
        const o=Number(sourceView.open[i]),h=Number(sourceView.high[i]),l=Number(sourceView.low[i]),c=Number(sourceView.close[i]);
        if(!Number.isFinite(o)||!Number.isFinite(h)||!Number.isFinite(l)||!Number.isFinite(c))continue;
        if(!Number.isFinite(open))open=o;
        high=Number.isFinite(high)?Math.max(high,h):h;
        low=Number.isFinite(low)?Math.min(low,l):l;
        close=c;
        volume+=Number(sourceView.volume[i])||0;
      }
      if(!Number.isFinite(open)||!Number.isFinite(high)||!Number.isFinite(low)||!Number.isFinite(close))continue;

      const targetLength=node.plane.market.length;
      const targetLastTime=targetLength?Number(node.plane.market.time[targetLength-1]):Number.NaN;
      const row={time:bucket,open,high,low,close,volume};
      if(Number.isFinite(targetLastTime)&&targetLastTime===bucket)node.plane.updateLast(row);
      else if(!Number.isFinite(targetLastTime)||bucket>targetLastTime)node.plane.append(row);
      else {
        // Out-of-order corrections are rare; rebuild once rather than corrupting alignment.
        aggregateRows(source.plane,node.plane,node.intervalSeconds,node.anchorSecondsUtc,node.sessionProfile);
      }
      node.descriptor={...node.descriptor,revision:node.plane.revision,length:node.plane.length};
      node.sourceRevision=source.plane.revision;
      this.rebuildDependentTails(node.descriptor.key);
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
    const nodes=[...unique.values()].map(node=>cloneSnapshotNode(node.plane,node.descriptor,node));
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
