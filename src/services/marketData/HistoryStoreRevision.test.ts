import assert from 'node:assert/strict';
import { HistoryStore } from './HistoryStore';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';
const candle=(minute:number,close:number):HistoricalCandle=>({
  timestamp:new Date(Date.UTC(2026,9,24,10,minute)).toISOString(),
  open:close,high:close+1,low:close-1,close,volume:100,
});
const store=new HistoryStore(20,600_000,4);
store.set('fyers','NSE:HISTORY-TEST','5m',[candle(0,100),candle(1,101),candle(2,102),candle(3,103)],4);
const before=store.range('fyers','NSE:HISTORY-TEST','5m')!;
store.set('fyers','NSE:HISTORY-TEST','5m',[candle(2,108),candle(3,103)],2);
const merged=store.get('fyers','NSE:HISTORY-TEST','5m')!;
assert.equal(merged.length,4,'a late shorter snapshot must not erase known candles');
const seconds=merged.map(row=>Date.parse(row.timestamp)/1000);
assert.deepEqual(seconds,[...seconds].sort((a,b)=>a-b),'cache remains chronologically ordered');
assert.equal(new Set(seconds).size,seconds.length,'cache timestamps stay unique');
assert.equal(merged[2]?.close,108,'incoming corrections win duplicate timestamps');
const after=store.range('fyers','NSE:HISTORY-TEST','5m')!;
assert.ok(after.revision>before.revision,'cache revision advances on merge');
assert.ok(after.estimatedBytes > merged.length*80,'field-aware estimate includes strings and optional row metadata');
assert.equal(store.estimatedBytesFor('fyers','NSE:HISTORY-TEST','5m'),after.estimatedBytes);
assert.equal(store.stats().objectCacheEstimatedBytes,after.estimatedBytes);
assert.equal(store.stats().typedArrayBytes,0,'object-row and typed-array accounting remain separate');
assert.ok(store.stats().heapUsedBytes === null || store.stats().heapUsedBytes > 0,'real heap is reported when the browser exposes it');
assert.equal(store.stats().candleCount,4);

const untrusted = { ...candle(4, 104), source: 'unknown' } as HistoricalCandle;
store.set('fyers','NSE:HISTORY-TEST','5m',[untrusted],5);
assert.equal(store.get('fyers','NSE:HISTORY-TEST','5m')!.length,4,'unknown-source candles cannot enter the history cache');
assert.equal(store.get('fyers','NSE:HISTORY-TEST','5m')!.some(row => row.timestamp === untrusted.timestamp),false,'unknown-source rows are excluded from merged cache data');
store.upsertLatest('fyers','NSE:HISTORY-TEST','5m',untrusted,5);
assert.equal(store.get('fyers','NSE:HISTORY-TEST','5m')!.length,4,'unknown-source latest bars cannot contaminate a valid cache');

// Developing candles are retained in memory but do not dirty IndexedDB state.
const liveStore=new HistoryStore(20,600_000,4);
const forming={...candle(5,105),phase:'developing',confirmed:false} as HistoricalCandle;
liveStore.upsertLatest('fyers','NSE:LIVE-TEST','5m',forming,20);
assert.equal(liveStore.getStale('fyers','NSE:LIVE-TEST','5m')?.length,1);
assert.equal(liveStore.stats().dirtyBuckets,0,'forming-bar updates do not schedule durable persistence');
liveStore.upsertLatest('fyers','NSE:LIVE-TEST','5m',{...forming,close:106,high:107},20);
assert.equal(liveStore.stats().dirtyBuckets,0,'forming-bar replacements stay memory-only');
liveStore.upsertLatest('fyers','NSE:LIVE-TEST','5m',{...forming,phase:'confirmed',confirmed:true,close:106,high:107},20);
assert.equal(liveStore.stats().dirtyBuckets,1,'confirmation marks the local checkpoint dirty');
assert.ok(liveStore.range('fyers','NSE:LIVE-TEST','5m')?.estimatedBytes);
assert.equal(await liveStore.persistConfirmedNow('fyers','NSE:LIVE-TEST','5m'),true,
  'without IndexedDB the independent bounded HistoryStore remains the recovery copy');
assert.equal(liveStore.stats().dirtyBuckets,1,
  'lack of IndexedDB must not falsely mark an in-memory-only checkpoint as durable');
console.log('HISTORY_STORE_LATE_RESPONSE_MERGE_OK');
