import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { candleTimestampMs, mergeCanonicalCandleRows } from './chartCandleEvents';

type Bucket = {
  data: HistoricalCandle[]; updatedAt: number; oldestAt: number; newestAt: number;
  target: number; revision: number;
  /** Field-aware object-cache estimate; browser heap telemetry is reported separately. */
  estimatedBytes: number; dirty: boolean; checkpointRevision: number; persistedRevision: number;
  loading?: Promise<HistoricalCandle[]>;
};
export const HISTORY_CHECKPOINT_INTERVAL_MS = 1_500;
export const HISTORY_CHECKPOINT_RETRY_BASE_MS = 2_000;
export const HISTORY_CHECKPOINT_RETRY_MAX_MS = 60_000;
const CANDLE_OBJECT_HEADER_ESTIMATE = 40;
const CANDLE_PROPERTY_SLOT_ESTIMATE = 8;
type BrowserHeapSnapshot = Readonly<{usedJSHeapSize:number|null;totalJSHeapSize:number|null;jsHeapSizeLimit:number|null}>;
function isConfirmedHistoryCandle(row: HistoricalCandle): boolean {
  return row.confirmed !== false && row.phase !== 'developing' && row.phase !== 'realtime' && row.phase !== 'forecast';
}
function estimateValueBytes(value: unknown): number {
  if (typeof value === 'string') return 24 + value.length * 2;
  if (typeof value === 'number') return 8;
  if (typeof value === 'boolean') return 4;
  if (value == null) return 4;
  return 16;
}
/** Shallow, field-aware estimate only; browser heap telemetry is a separate measurement. */
function estimateCandleObjectBytes(row: HistoricalCandle): number {
  let bytes=CANDLE_OBJECT_HEADER_ESTIMATE;
  for(const [key,value] of Object.entries(row as unknown as Record<string,unknown>))
    bytes+=CANDLE_PROPERTY_SLOT_ESTIMATE+key.length*2+estimateValueBytes(value);
  return bytes;
}
function estimateCandleRowsBytes(rows: readonly HistoricalCandle[]): number {
  return 24+rows.length*8+rows.reduce((total,row)=>total+estimateCandleObjectBytes(row),0);
}
function browserHeapSnapshot(): BrowserHeapSnapshot {
  const memory=(globalThis.performance as (Performance & {memory?:{usedJSHeapSize?:number;totalJSHeapSize?:number;jsHeapSizeLimit?:number}})|undefined)?.memory;
  const finiteOrNull=(value:unknown)=>value==null||!Number.isFinite(Number(value))?null:Number(value);
  return Object.freeze({
    usedJSHeapSize:finiteOrNull(memory?.usedJSHeapSize),
    totalJSHeapSize:finiteOrNull(memory?.totalJSHeapSize),
    jsHeapSizeLimit:finiteOrNull(memory?.jsHeapSizeLimit),
  });
}

export const PERSISTED_HISTORY_CANDLE_LIMIT = 2_000;
const HISTORY_DB_NAME = 'tradingcore-history-cache-v1';
const HISTORY_DB_STORE = 'datasets';
export type PersistedHistoryBucket = { key: string; data: HistoricalCandle[]; updatedAt: number; revision: number; target: number };
export type HistoryPersistenceAdapter = Readonly<{
  available(): boolean;
  read(key: string): Promise<PersistedHistoryBucket | undefined>;
  write(key: string, data: HistoricalCandle[], updatedAt: number, revision: number): Promise<boolean | null>;
  clear(): void;
}>;
let historyDbPromise: Promise<IDBDatabase | null> | undefined;

function openHistoryDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (historyDbPromise) return historyDbPromise;
  historyDbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(HISTORY_DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(HISTORY_DB_STORE)) request.result.createObjectStore(HISTORY_DB_STORE, { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); historyDbPromise = undefined; };
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return historyDbPromise;
}

function readPersistedHistory(key: string): Promise<PersistedHistoryBucket | undefined> {
  return openHistoryDb().then(db => new Promise(resolve => {
    if (!db) { resolve(undefined); return; }
    try {
      const request = db.transaction(HISTORY_DB_STORE, 'readonly').objectStore(HISTORY_DB_STORE).get(key);
      request.onsuccess = () => {
        const value = request.result as PersistedHistoryBucket | undefined;
        resolve(value && value.key === key && Array.isArray(value.data) ? value : undefined);
      };
      request.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

async function writePersistedHistory(key:string,data:HistoricalCandle[],updatedAt:number,revision:number):Promise<boolean|null>{
  const db=await openHistoryDb();
  // null means IndexedDB is unavailable; the independent bounded HistoryStore
  // remains the recovery copy, so chart-plane eviction can still release memory.
  if(!db)return null;
  if(!data.length)return true;
  return new Promise<boolean>(resolve=>{
    try{
      const transaction=db.transaction(HISTORY_DB_STORE,'readwrite');
      transaction.objectStore(HISTORY_DB_STORE).put({key,data,updatedAt,revision,target:PERSISTED_HISTORY_CANDLE_LIMIT} satisfies PersistedHistoryBucket);
      transaction.oncomplete=()=>resolve(true);
      transaction.onerror=()=>resolve(false);
      transaction.onabort=()=>resolve(false);
    }catch{resolve(false);}
  });
}
function clearPersistedHistory(): void {
  void openHistoryDb().then(db => {
    if (!db) return;
    try { db.transaction(HISTORY_DB_STORE, 'readwrite').objectStore(HISTORY_DB_STORE).clear(); } catch {}
  });
}

const indexedDbHistoryPersistence: HistoryPersistenceAdapter = Object.freeze({
  available: () => typeof indexedDB !== 'undefined',
  read: readPersistedHistory,
  write: writePersistedHistory,
  clear: clearPersistedHistory,
});

/** Shared in-memory candle store. Live updates stay here; IndexedDB is a bounded
 * recovery checkpoint and never participates in the live chart mutation path. */
export class HistoryStore {
  private buckets=new Map<string,Bucket>();
  private readonly inFlightCheckpoints=new Map<string,Promise<boolean>>();
  private readonly persistenceWrites=new Map<string,Promise<boolean|null>>();
  private readonly hydrations=new Map<string,Promise<HistoricalCandle[]|undefined>>();
  private readonly checkpointTimers=new Map<string,ReturnType<typeof setTimeout>>();
  private readonly retryAttempts=new Map<string,number>();
  private readonly pendingDetachedCheckpoints=new Map<string,{bucket:Bucket;timer?:ReturnType<typeof setTimeout>}>();
  private checkpointFailures=0;
  constructor(
    private readonly maxCandles = 50_000,
    private readonly ttlMs = 600_000,
    private readonly maxBuckets = 96,
    private readonly persistence: HistoryPersistenceAdapter = indexedDbHistoryPersistence,
  ) {}
  private touch(key:string,bucket:Bucket):Bucket{this.buckets.delete(key);this.buckets.set(key,bucket);return bucket;}
  private snapshotConfirmed(bucket:Bucket):HistoricalCandle[]{
    return bucket.data.filter(isConfirmedHistoryCandle).slice(-PERSISTED_HISTORY_CANDLE_LIMIT).map(row=>({...row}));
  }
  private queueDetachedCheckpoint(key:string,bucket:Bucket,delayMs=0):void{
    if(!bucket.dirty||!this.persistence.available())return;
    const existing=this.pendingDetachedCheckpoints.get(key);
    if(existing&&existing.bucket.updatedAt>bucket.updatedAt)return;
    if(existing?.timer)clearTimeout(existing.timer);
    const pending:{bucket:Bucket;timer?:ReturnType<typeof setTimeout>}={bucket};
    pending.timer=setTimeout(()=>{
      this.pendingDetachedCheckpoints.delete(key);
      void this.writeDetachedSnapshot(key,bucket);
    },Math.max(0,delayMs));
    this.pendingDetachedCheckpoints.set(key,pending);
  }
  private persistDetached(key:string,bucket:Bucket):void{
    // Snapshotting the persisted window is deferred until after the live
    // mutation/eviction stack has returned.
    this.queueDetachedCheckpoint(key,bucket);
  }
  private enqueuePersistenceWrite(key:string,data:HistoricalCandle[],updatedAt:number,revision:number):Promise<boolean|null>{
    const previous=this.persistenceWrites.get(key);
    const task=(previous??Promise.resolve(null)).catch(()=>null)
      .then(()=>this.persistence.write(key,data,updatedAt,revision)).catch(()=>false);
    this.persistenceWrites.set(key,task);
    void task.then(()=>{if(this.persistenceWrites.get(key)===task)this.persistenceWrites.delete(key);});
    return task;
  }
  private writeDetachedSnapshot(key:string,bucket:Bucket):Promise<boolean>{
    if(!this.persistence.available()){
      this.pendingDetachedCheckpoints.set(key,{bucket});
      return Promise.resolve(false);
    }
    const data=this.snapshotConfirmed(bucket);
    if(!data.length)return Promise.resolve(true);
    return this.enqueuePersistenceWrite(key,data,bucket.updatedAt,bucket.checkpointRevision).then(result=>{
      if(result===true){this.retryAttempts.delete(key);return true;}
      if(result===null){this.pendingDetachedCheckpoints.set(key,{bucket});return false;}
      this.checkpointFailures+=1;
      const attempts=(this.retryAttempts.get(key)??0)+1;
      this.retryAttempts.set(key,attempts);
      const delay=Math.min(HISTORY_CHECKPOINT_RETRY_MAX_MS,HISTORY_CHECKPOINT_RETRY_BASE_MS*2**Math.min(8,attempts-1));
      this.queueDetachedCheckpoint(key,bucket,delay);
      return false;
    });
  }
  private trimBuckets():void{
    while(this.buckets.size>Math.max(1,this.maxBuckets)){
      const oldest=this.buckets.entries().next().value as [string,Bucket]|undefined;
      if(!oldest)break;
      if(oldest[1].dirty)this.persistDetached(oldest[0],oldest[1]);
      const timer=this.checkpointTimers.get(oldest[0]);
      if(timer)clearTimeout(timer);
      this.checkpointTimers.delete(oldest[0]);
      this.buckets.delete(oldest[0]);
    }
  }
  key(broker:string,symbol:string,timeframe:string){return `${broker.toLowerCase()}:${symbol}:${timeframe}`;}
  async hydrate(broker:string,symbol:string,timeframe:string):Promise<HistoricalCandle[]|undefined>{
    const key=this.key(broker,symbol,timeframe);
    const resident=this.buckets.get(key);
    if(resident)return resident.data;
    const pending=this.hydrations.get(key);
    if(pending)return pending;
    const promise=(async()=>{
      const saved=await this.persistence.read(key);
      if(!saved?.data.length)return undefined;
      const rows=saved.data.filter((row):row is HistoricalCandle=>{
        if(!row||typeof row!=='object')return false;
        if (row.source === 'unknown' || !isConfirmedHistoryCandle(row))return false;
        const time=Date.parse(String(row.timestamp));
        const open=Number(row.open),high=Number(row.high),low=Number(row.low),close=Number(row.close),volume=Number(row.volume??0);
        return Number.isFinite(time)&&time>0&&[open,high,low,close].every(Number.isFinite)&&high>=Math.max(open,close)&&low<=Math.min(open,close)&&high>=low&&Number.isFinite(volume)&&volume>=0;
      }).sort((a,b)=>Date.parse(String(a.timestamp))-Date.parse(String(b.timestamp)));
      const data=this.merge([],rows).slice(-PERSISTED_HISTORY_CANDLE_LIMIT);
      if(!data.length)return undefined;
      const stamps=data.map(row=>Date.parse(String(row.timestamp))).filter(Number.isFinite);
      const oldestAt=Math.min(...stamps),newestAt=Math.max(...stamps);
      if(!Number.isFinite(oldestAt)||!Number.isFinite(newestAt))return undefined;
      const current=this.buckets.get(key);
      if(current)return current.data;
      const revision=Math.max(1,Number(saved.revision)||1);
      const bucket:Bucket={
        data,updatedAt:Number.isFinite(Number(saved.updatedAt))?Number(saved.updatedAt):0,
        oldestAt,newestAt,target:PERSISTED_HISTORY_CANDLE_LIMIT,revision,
        estimatedBytes:estimateCandleRowsBytes(data),dirty:false,checkpointRevision:revision,persistedRevision:revision,
      };
      this.buckets.set(key,bucket);
      this.trimBuckets();
      return data;
    })().finally(()=>this.hydrations.delete(key));
    this.hydrations.set(key,promise);
    return promise;
  }
  /** One dirty transition starts a checkpoint window; later ticks don't move its deadline. */
  private schedulePersist(key:string,bucket:Bucket,delayMs=HISTORY_CHECKPOINT_INTERVAL_MS):void{
    if(!this.persistence.available()||!bucket.dirty||this.checkpointTimers.has(key))return;
    const timer=setTimeout(()=>{
      this.checkpointTimers.delete(key);
      void this.checkpoint(key);
    },Math.max(0,delayMs));
    this.checkpointTimers.set(key,timer);
  }
  private checkpoint(key:string,force=false):Promise<boolean>{
    const existing=this.inFlightCheckpoints.get(key);
    if(existing)return existing.then(success=>{
      const latest=this.buckets.get(key);
      if(!latest||(!force&&!latest.dirty))return success;
      return this.checkpoint(key,force);
    });
    const bucket=this.buckets.get(key);
    if(!bucket?.data.length||(!force&&!bucket.dirty))return Promise.resolve(true);
    const data=this.snapshotConfirmed(bucket);
    if(!data.length){bucket.dirty=false;return Promise.resolve(true);}
    const revision=bucket.checkpointRevision;
    const task=this.enqueuePersistenceWrite(key,data,bucket.updatedAt,revision).then(result=>{
      if(this.buckets.get(key)!==bucket)return result!==false;
      if(result===null)return true; // IndexedDB is unavailable; memory remains the recovery owner.
      if(result===true){
        this.retryAttempts.delete(key);
        bucket.persistedRevision=Math.max(bucket.persistedRevision,revision);
        if(bucket.checkpointRevision===revision)bucket.dirty=false;
        else this.schedulePersist(key,bucket);
        return true;
      }
      this.checkpointFailures+=1;
      const attempts=(this.retryAttempts.get(key)??0)+1;
      this.retryAttempts.set(key,attempts);
      const delay=Math.min(HISTORY_CHECKPOINT_RETRY_MAX_MS,HISTORY_CHECKPOINT_RETRY_BASE_MS*2**Math.min(8,attempts-1));
      this.schedulePersist(key,bucket,delay);
      return false;
    }).finally(()=>{if(this.inFlightCheckpoints.get(key)===task)this.inFlightCheckpoints.delete(key);});
    this.inFlightCheckpoints.set(key,task);
    return task;
  }
  get(broker:string,symbol:string,timeframe:string):HistoricalCandle[]|undefined{
    const key=this.key(broker,symbol,timeframe),bucket=this.buckets.get(key);
    if(!bucket||Date.now()-bucket.updatedAt>this.ttlMs)return undefined;
    return this.touch(key,bucket).data;
  }
  getStale(broker:string,symbol:string,timeframe:string):HistoricalCandle[]|undefined{
    const key=this.key(broker,symbol,timeframe),bucket=this.buckets.get(key);
    return bucket?this.touch(key,bucket).data:undefined;
  }
  set(broker:string,symbol:string,timeframe:string,rows:HistoricalCandle[],target=25_000,persist=true){
    const key=this.key(broker,symbol,timeframe),previous=this.buckets.get(key);
    const data=this.merge(previous?.data??[],rows).slice(-this.maxCandles);
    if(!data.length)return data;
    let oldestAt=Number.POSITIVE_INFINITY,newestAt=Number.NEGATIVE_INFINITY;
    for(const row of data){
      const timestamp=Date.parse(String(row.timestamp));
      if(!Number.isFinite(timestamp))continue;
      if(timestamp<oldestAt)oldestAt=timestamp;
      if(timestamp>newestAt)newestAt=timestamp;
    }
    if(!Number.isFinite(oldestAt)||!Number.isFinite(newestAt))return data;
    const bucket:Bucket={
      data,updatedAt:Date.now(),oldestAt,newestAt,target,
      revision:(previous?.revision??0)+1,
      estimatedBytes:estimateCandleRowsBytes(data),
      dirty:Boolean(previous?.dirty)||(persist&&data.some(isConfirmedHistoryCandle)),
      checkpointRevision:(previous?.checkpointRevision??previous?.persistedRevision??0)+(persist&&data.some(isConfirmedHistoryCandle)?1:0),
      persistedRevision:previous?.persistedRevision??0,
    };
    this.buckets.delete(key);this.buckets.set(key,bucket);this.trimBuckets();
    if(persist)this.schedulePersist(key,bucket);
    return data;
  }
  mergeInto(broker:string,symbol:string,timeframe:string,rows:HistoricalCandle[],target=25_000){
    const current=this.getStale(broker,symbol,timeframe)||[];
    return this.set(broker,symbol,timeframe,this.merge(current,rows),target);
  }
  /** Update the live in-memory tail. Forming bars never schedule IndexedDB work. */
  upsertLatest(broker:string,symbol:string,timeframe:string,row:HistoricalCandle,target=25_000){
    if (row.source === 'unknown')return this.getStale(broker,symbol,timeframe)||[];
    const key=this.key(broker,symbol,timeframe),bucket=this.buckets.get(key);
    if(!bucket)return this.set(broker,symbol,timeframe,[row],target,isConfirmedHistoryCandle(row));
    this.touch(key,bucket);
    const timestamp=candleTimestampMs(row.timestamp);
    if(timestamp==null)return bucket.data;
    const last=bucket.data[bucket.data.length-1],lastTimestamp=last?candleTimestampMs(last.timestamp):undefined;
    const previousBytes=last?estimateCandleObjectBytes(last):0;
    if(lastTimestamp!=null&&Math.floor(timestamp/1000)===Math.floor(lastTimestamp/1000)){
      bucket.data[bucket.data.length-1]=row;
      bucket.estimatedBytes+=estimateCandleObjectBytes(row)-previousBytes;
    }else if(lastTimestamp==null||timestamp>lastTimestamp){
      bucket.data.push(row);
      bucket.estimatedBytes+=8+estimateCandleObjectBytes(row);
    }else return bucket.data;
    if(bucket.data.length>this.maxCandles){
      const removed=bucket.data.splice(0,bucket.data.length-this.maxCandles);
      bucket.estimatedBytes-=removed.reduce((sum,candle)=>sum+8+estimateCandleObjectBytes(candle),0);
    }
    bucket.updatedAt=Date.now();bucket.target=target;bucket.revision+=1;
    bucket.estimatedBytes=Math.max(0,bucket.estimatedBytes);
    bucket.oldestAt=Date.parse(String(bucket.data[0]?.timestamp));
    bucket.newestAt=Date.parse(String(bucket.data[bucket.data.length-1]?.timestamp));
    if(isConfirmedHistoryCandle(row)){bucket.dirty=true;bucket.checkpointRevision+=1;this.schedulePersist(key,bucket);}
    return bucket.data;
  }
  merge(a:HistoricalCandle[],b:HistoricalCandle[]){
    const trusted=(rows:HistoricalCandle[])=>rows.filter(row => row && row.source !== 'unknown');
    return mergeCanonicalCandleRows(trusted(a),trusted(b),this.maxCandles);
  }
  estimatedBytesFor(broker:string,symbol:string,timeframe:string):number{
    return this.buckets.get(this.key(broker,symbol,timeframe))?.estimatedBytes??0;
  }
  async persistConfirmedNow(broker:string,symbol:string,timeframe:string):Promise<boolean>{
    const key=this.key(broker,symbol,timeframe),timer=this.checkpointTimers.get(key);
    if(timer)clearTimeout(timer);
    this.checkpointTimers.delete(key);
    return this.checkpoint(key,true);
  }
  /** Best-effort local IndexedDB flush on pagehide/visibility loss; no cloud sync. */
  async flushDirty():Promise<boolean>{
    // Detached LRU buckets are part of local recovery. Drain them before
    // resident buckets so same-key writes remain ordered.
    const detached=[...this.pendingDetachedCheckpoints.entries()];
    for(const [key,pending] of detached){
      if(pending.timer)clearTimeout(pending.timer);
      this.pendingDetachedCheckpoints.delete(key);
    }
    const detachedResults=detached.map(([key,pending])=>this.writeDetachedSnapshot(key,pending.bucket));
    const keys=[...this.buckets.entries()].filter(([,bucket])=>bucket.dirty).map(([key])=>key);
    const residentResults=keys.map(key=>{
      const timer=this.checkpointTimers.get(key);
      if(timer)clearTimeout(timer);
      this.checkpointTimers.delete(key);
      return this.checkpoint(key,true);
    });
    if(!detachedResults.length&&!residentResults.length)return true;
    const results=await Promise.all([...detachedResults,...residentResults]);
    return results.every(Boolean);
  }
  stats(){
    let candleCount=0,objectCacheEstimatedBytes=0,dirtyBuckets=0;
    for(const bucket of this.buckets.values()){
      candleCount+=bucket.data.length;
      objectCacheEstimatedBytes+=bucket.estimatedBytes;
      if(bucket.dirty)dirtyBuckets+=1;
    }
    const heap=browserHeapSnapshot();
    return Object.freeze({
      buckets:this.buckets.size,candleCount,
      estimatedBytes:objectCacheEstimatedBytes,objectCacheEstimatedBytes,
      typedArrayBytes:0,
      heapUsedBytes:heap.usedJSHeapSize,heapTotalBytes:heap.totalJSHeapSize,heapLimitBytes:heap.jsHeapSizeLimit,
      dirtyBuckets,inFlightWrites:this.inFlightCheckpoints.size,
      scheduledCheckpoints:this.checkpointTimers.size,
      detachedCheckpoints:this.pendingDetachedCheckpoints.size,
      checkpointRetries:this.retryAttempts.size,checkpointFailures:this.checkpointFailures,
      checkpointIntervalMs:HISTORY_CHECKPOINT_INTERVAL_MS,
      maxCandlesPerBucket:this.maxCandles,maxBuckets:this.maxBuckets,
    });
  }
  range(broker:string,symbol:string,timeframe:string){
    const bucket=this.buckets.get(this.key(broker,symbol,timeframe));
    return bucket?{
      oldestAt:bucket.oldestAt,newestAt:bucket.newestAt,count:bucket.data.length,target:bucket.target,
      updatedAt:bucket.updatedAt,revision:bucket.revision,estimatedBytes:bucket.estimatedBytes,
      dirty:bucket.dirty,checkpointRevision:bucket.checkpointRevision,persistedRevision:bucket.persistedRevision,
    }:undefined;
  }
  getBefore(broker:string,symbol:string,timeframe:string,beforeTimestamp:string,limit=1000):HistoricalCandle[]{
    const key=this.key(broker,symbol,timeframe),bucket=this.buckets.get(key);
    if(!bucket?.data.length)return [];
    this.touch(key,bucket);
    const before=Date.parse(String(beforeTimestamp));
    if(!Number.isFinite(before))return [];
    let lo=0,hi=bucket.data.length;
    while(lo<hi){
      const mid=(lo+hi)>>1,ts=Date.parse(String(bucket.data[mid]?.timestamp));
      if(Number.isFinite(ts)&&ts<before)lo=mid+1;else hi=mid;
    }
    const count=Math.max(1,Math.min(Math.floor(Number(limit)||1000),5000));
    return bucket.data.slice(Math.max(0,lo-count),lo);
  }
  invalidate(broker?:string){
    const prefix=broker?`${broker.toLowerCase()}:`:undefined;
    for(const key of [...this.buckets.keys()]){
      if(prefix&&!key.startsWith(prefix))continue;
      const timer=this.checkpointTimers.get(key);
      if(timer)clearTimeout(timer);
      this.checkpointTimers.delete(key);this.buckets.delete(key);this.retryAttempts.delete(key);
    }
    for(const [key,pending] of [...this.pendingDetachedCheckpoints]){
      if(prefix&&!key.startsWith(prefix))continue;
      if(pending.timer)clearTimeout(pending.timer);
      this.pendingDetachedCheckpoints.delete(key);this.retryAttempts.delete(key);
    }
  }
  clear(){this.invalidate();this.inFlightCheckpoints.clear();this.persistence.clear();}
}
export const historyStore = new HistoryStore(50_000, 120_000, 32);

// Start local recovery transactions while the browser is still alive to flush them.
if (typeof window !== 'undefined') {
  const flushLocalRecovery = () => { void historyStore.flushDirty(); };
  window.addEventListener('pagehide', flushLocalRecovery, { capture: true });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushLocalRecovery();
    }, { capture: true });
  }
}

function normalizeTickTimestampSeconds(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return NaN;
    return value > 1e12 ? value / 1000 : value;
  }
  const text = String(value ?? '').trim();
  if (!text) return NaN;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric / 1000 : numeric;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed / 1000 : NaN;
}

export function reconcileRealtimeCandle(existing: HistoricalCandle[], tick: { price: number; timestamp: number | string }, intervalSeconds: number, maxCandles = 50_000, mutateExisting = false): { candles: HistoricalCandle[]; bucketChanged: boolean } {
  const timestamp = normalizeTickTimestampSeconds(tick.timestamp);
  if (!Number.isFinite(tick.price) || !Number.isFinite(timestamp) || !Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    return { candles: existing, bucketChanged: false };
  }

  const last = existing[existing.length - 1];
  const lastTimestamp = last ? normalizeTickTimestampSeconds(last.timestamp) : NaN;

  // A live broker packet can carry a stale last-trade timestamp even though
  // the packet itself arrived just now. Never let that timestamp prevent the
  // forming candle from receiving the fresh LTP. For an older timestamp, pin
  // the update to the current forming candle; for a newer timestamp, advance
  // normally. This keeps the chart moving while still respecting candle
  // boundaries.
  const effectiveTimestamp = Number.isFinite(lastTimestamp)
    ? Math.max(timestamp, lastTimestamp)
    : timestamp;

  // Align the live bucket to the timestamp grid already used by the broker's
  // historical candles. This matters for NSE 1H/1D candles (for example 09:15
  // session alignment) where UTC epoch-flooring would create a 03:00 bucket.
  const bucket = Number.isFinite(lastTimestamp)
    ? Math.floor((effectiveTimestamp - (lastTimestamp % intervalSeconds)) / intervalSeconds) * intervalSeconds + (lastTimestamp % intervalSeconds)
    : Math.floor(effectiveTimestamp / intervalSeconds) * intervalSeconds;

  const lastBucket = Number.isFinite(lastTimestamp)
    ? Math.floor((lastTimestamp - (lastTimestamp % intervalSeconds)) / intervalSeconds) * intervalSeconds + (lastTimestamp % intervalSeconds)
    : undefined;

  if (lastBucket != null && Math.abs(bucket - lastBucket) > 604800) return { candles: existing, bucketChanged: false };

  const next = existing.slice();
  if (!last || lastBucket !== bucket) {
    next.push({
      timestamp: new Date(bucket * 1000).toISOString(),
      open: last?.close ?? tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
      // Broker quote volume is often cumulative session volume, not candle
      // volume. Do not copy it into the new candle and inflate the bar.
      volume: 0,
    });
    return { candles: next.slice(-maxCandles), bucketChanged: true };
  }

  if (mutateExisting && last) {
    last.high = Math.max(Number(last.high), tick.price);
    last.low = Math.min(Number(last.low), tick.price);
    last.close = tick.price;
    return { candles: existing, bucketChanged: false };
  }
  const updated = {
    ...last,
    high: Math.max(Number(last.high), tick.price),
    low: Math.min(Number(last.low), tick.price),
    close: tick.price,
  };
  next[next.length - 1] = updated;
  return { candles: next, bucketChanged: false };
}
