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
assert.equal(after.estimatedBytes,merged.length*80,'estimated bytes track retained candle rows');
assert.equal(store.estimatedBytesFor('fyers','NSE:HISTORY-TEST','5m'),merged.length*80);
assert.equal(store.stats().candleCount,4);

const untrusted = { ...candle(4, 104), source: 'unknown' } as HistoricalCandle;
store.set('fyers','NSE:HISTORY-TEST','5m',[untrusted],5);
assert.equal(store.get('fyers','NSE:HISTORY-TEST','5m')!.length,4,'unknown-source candles cannot enter the history cache');
assert.equal(store.get('fyers','NSE:HISTORY-TEST','5m')!.some(row => row.timestamp === untrusted.timestamp),false,'unknown-source rows are excluded from merged cache data');
store.upsertLatest('fyers','NSE:HISTORY-TEST','5m',untrusted,5);
assert.equal(store.get('fyers','NSE:HISTORY-TEST','5m')!.length,4,'unknown-source latest bars cannot contaminate a valid cache');
console.log('HISTORY_STORE_LATE_RESPONSE_MERGE_OK');
