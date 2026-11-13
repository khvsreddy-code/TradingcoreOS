import assert from 'node:assert/strict';
import { HistoryStore } from './HistoryStore';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';
const candle=(minute:number,close:number):HistoricalCandle=>({timestamp:new Date(Date.UTC(2026,9,24,10,minute)).toISOString(),open:close,high:close+1,low:close-1,close,volume:100});

const persisted=new Map<string,{key:string;data:HistoricalCandle[];updatedAt:number;revision:number;target:number}>();
const writes:Array<{key:string;count:number;revision:number}>=[];
let failuresRemaining=0;
const adapter={
  available:()=>true,
  async read(key:string){return persisted.get(key);},
  async write(key:string,data:HistoricalCandle[],updatedAt:number,revision:number){
    writes.push({key,count:data.length,revision});
    if(failuresRemaining>0){failuresRemaining-=1;return false;}
    persisted.set(key,{key,data:data.map(row=>({...row})),updatedAt,revision,target:2_000});return true;
  },
  clear(){persisted.clear();},
};

const live=new HistoryStore(20,600_000,4,adapter);
const forming={...candle(10,110),phase:'developing',confirmed:false} as HistoricalCandle;
for(let i=0;i<100;i+=1)live.upsertLatest('fyers','NSE:PERSIST-TEST','1m',{...forming,close:110+i,high:111+i},20);
assert.equal(writes.length,0,'forming updates never write to IndexedDB');
assert.equal(live.stats().dirtyBuckets,0);
assert.equal(live.stats().scheduledCheckpoints,0);
live.upsertLatest('fyers','NSE:PERSIST-TEST','1m',{...forming,phase:'confirmed',confirmed:true,close:209,high:210},20);
assert.equal(live.stats().dirtyBuckets,1,'confirmed transition marks the bucket dirty');
assert.equal(await live.persistConfirmedNow('fyers','NSE:PERSIST-TEST','1m'),true);
assert.equal(writes.length,1);
assert.equal(persisted.get('fyers:NSE:PERSIST-TEST:1m')?.data.length,1);
assert.equal(persisted.get('fyers:NSE:PERSIST-TEST:1m')?.data[0]?.confirmed,true);

const retry=new HistoryStore(20,600_000,4,adapter);
retry.set('fyers','NSE:RETRY-TEST','1m',[candle(11,111)],20);
failuresRemaining=1;
assert.equal(await retry.persistConfirmedNow('fyers','NSE:RETRY-TEST','1m'),false);
assert.equal(retry.stats().dirtyBuckets,1);
assert.equal(retry.stats().checkpointRetries,1);
assert.equal(retry.stats().scheduledCheckpoints,1);
assert.equal(await retry.flushDirty(),true,'page-hide flush retries dirty persistence');
assert.equal(retry.stats().dirtyBuckets,0);
assert.equal(retry.stats().checkpointRetries,0);

const evictionDb=new Map<string,{key:string;data:HistoricalCandle[];updatedAt:number;revision:number;target:number}>();
const evictionAdapter={
  available:()=>true,
  async read(key:string){return evictionDb.get(key);},
  async write(key:string,data:HistoricalCandle[],updatedAt:number,revision:number){evictionDb.set(key,{key,data:data.map(row=>({...row})),updatedAt,revision,target:2_000});return true;},
  clear(){evictionDb.clear();},
};
const eviction=new HistoryStore(20,600_000,1,evictionAdapter);
eviction.set('fyers','NSE:EVICT-OLD','1m',[candle(12,112)],20);
eviction.set('fyers','NSE:EVICT-NEW','1m',[candle(13,113)],20);
assert.equal(eviction.stats().detachedCheckpoints,1);
assert.equal(evictionDb.has('fyers:NSE:EVICT-OLD:1m'),false,'eviction does not synchronously persist rows');
assert.equal(await eviction.flushDirty(),true);
assert.equal(evictionDb.has('fyers:NSE:EVICT-OLD:1m'),true,'detached confirmed history remains recoverable locally');
console.log('HISTORY_STORE_PERSISTENCE_LIFECYCLE_OK');
