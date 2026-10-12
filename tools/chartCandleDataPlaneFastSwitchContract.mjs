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
const warmLimited = new ChartHistoryCoordinator();
let releaseWarmWork;
const warmGate = new Promise((resolve) => { releaseWarmWork = resolve; });
const warmTasks = Array.from({ length: 8 }, (_, index) =>
  warmLimited.request('speculative-' + index, () => warmGate.then(() => index), 'warm')
);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(warmLimited.snapshot().activeWarm, warmLimited.maxConcurrentWarm, 'speculative history must be concurrency-capped');

let urgentStarted = false;
const urgent = warmLimited.request('urgent-user-selection', async () => {
  urgentStarted = true;
  return 'visible';
}, 'initial');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(urgentStarted, true, 'active warm requests must leave a slot for a user-selected dataset');
releaseWarmWork();
await Promise.all([...warmTasks, urgent]);
assert.equal(warmLimited.snapshot().active, 0);
assert.equal(warmLimited.snapshot().queued, 0);

const promoted = new ChartHistoryCoordinator();
const unblock = [];
const blockers = Array.from({ length: promoted.maxConcurrent }, (_, index) =>
  promoted.request('block-' + index, () => new Promise((resolve) => unblock.push(resolve)), 'initial')
);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(promoted.snapshot().active, promoted.maxConcurrent, 'blockers should fill the history budget');

const promotedOrder = [];
const queuedWarm = promoted.request('selected', async () => { promotedOrder.push('selected'); return 'selected'; }, 'warm');
const otherWarm = promoted.request('background', async () => { promotedOrder.push('background'); return 'background'; }, 'warm');
const selectedForeground = promoted.request('selected', async () => { promotedOrder.push('duplicate-selected'); return 'wrong'; }, 'initial');
unblock[0]('released');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(promotedOrder[0], 'selected', 'foreground selection must promote ahead of speculative history');
for (const release of unblock.slice(1)) release('released');
await Promise.all([...blockers, queuedWarm, otherWarm, selectedForeground]);
assert.equal(promoted.snapshot().queued, 0);
assert.equal(promoted.snapshot().active, 0);

console.log('CHART_CANDLE_DATA_PLANE_FAST_SWITCH_CONTRACT_OK');
