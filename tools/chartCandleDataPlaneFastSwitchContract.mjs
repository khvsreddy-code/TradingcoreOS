import assert from 'node:assert/strict';
import { MarketDataStore } from '../src/services/marketData/MarketDataStore.ts';
import { ChartHistoryCoordinator } from '../src/services/marketData/chartHistoryCoordinator.ts';
import { INITIAL_HISTORY_CANDLES, historyDemandPageCandles } from '../src/services/marketData/chartHistoryPolicy.ts';

const store = new MarketDataStore();
const cachedSnapshot = {
  key:'fyers:NSE:NIFTY50-INDEX:5minute',
  brokerId:'fyers',
  instrumentKey:'NSE:NIFTY50-INDEX',
  timeframe:'5m',
  candles:[{timestamp:'2026-10-07T07:25:00.000Z',open:1,high:2,low:1,close:2,volume:10}],
  latestTick:undefined,
  revision:3,
  historyReady:true,
  historyLoading:false,
  olderHistoryLoading:false,
};
let stopped = false;
const fakePlane = {
  brokerId:'fyers',
  instrumentKey:'NSE:NIFTY50-INDEX',
  timeframe:'5m',
  getSnapshot:()=>cachedSnapshot,
  subscribe:(listener)=>{
    listener({type:'snapshot',snapshot:cachedSnapshot});
    return ()=>{ stopped=true; };
  },
};
const unsubscribeAttach = store.attach(cachedSnapshot.key, fakePlane);
let replay;
const unsubscribe = store.subscribe(cachedSnapshot.key, event => { replay=event; });
assert.equal(replay?.snapshot.candles.length, 1, 'late chart subscribers must receive cached candles');
assert.equal(replay?.snapshot.historyReady, true);
unsubscribe();
unsubscribeAttach();
assert.equal(stopped, true);

assert.equal(INITIAL_HISTORY_CANDLES['5m'], 900);
assert.equal(INITIAL_HISTORY_CANDLES['1m'], 1200);
assert.equal(historyDemandPageCandles('5m', 225), 900);
assert.equal(historyDemandPageCandles('5m', 400), 1600);

const coordinator = new ChartHistoryCoordinator();
assert.equal(coordinator.maxConcurrent, 6);
const order = [];
const p1 = coordinator.request('initial-old', async () => { order.push('old'); await new Promise(r => setTimeout(r, 5)); return 'old'; }, 'initial');
const p2 = coordinator.request('initial-new', async () => { order.push('new'); return 'new'; }, 'initial');
await Promise.all([p1,p2]);
assert.deepEqual(order, ['old','new'], 'already-running work preserves correctness');
const queued = coordinator.snapshot();
assert.equal(queued.active, 0);
assert.equal(queued.queued, 0);
console.log('CHART_CANDLE_DATA_PLANE_FAST_SWITCH_CONTRACT_OK');
