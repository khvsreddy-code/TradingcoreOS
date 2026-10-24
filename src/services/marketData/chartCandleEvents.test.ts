import assert from 'node:assert/strict';
import { createCandleDatasetChange, invalidationModeForCandleChange, mergeCanonicalCandleRows, isCurrentCandleDatasetChange } from './chartCandleEvents';

type Candle = { timestamp: string; open: number; high: number; low: number; close: number; volume: number };
const candle = (minute: number, close: number): Candle => ({
  timestamp: new Date(Date.UTC(2026, 9, 24, 10, minute)).toISOString(),
  open: close, high: close + 1, low: close - 1, close, volume: 10,
});
const initial = [candle(0,100), candle(1,101), candle(2,102)];
const replace = [{...initial[2]!,high:107,close:106}];
const append = [candle(3,106)];
const backfill = [candle(0,99),candle(1,101),candle(2,102)];
const correction = [{...initial[1]!,high:109,close:108}];
const incremental = mergeCanonicalCandleRows(mergeCanonicalCandleRows(mergeCanonicalCandleRows(initial,replace),append),mergeCanonicalCandleRows([], [...backfill,...correction]));
const rebuilt = mergeCanonicalCandleRows([], [...initial,...replace,...append,...backfill,...correction]);
assert.deepEqual(incremental,rebuilt,'mixed append/replace/backfill/correction must equal a full canonical rebuild');
const seconds = incremental.map(row => Date.parse(row.timestamp)/1000);
assert.deepEqual(seconds,[...new Set(seconds)].sort((a,b)=>a-b),'canonical candles must be unique and sorted');
assert.equal(incremental.length,4);
assert.equal(incremental[1]?.close,108,'latest correction wins equal timestamp');
assert.equal(incremental[0]?.close,99,'incoming backfill wins equal timestamp');

const appendChange = createCandleDatasetChange({datasetKey:'NSE:NIFTY|5m',datasetGeneration:4,previousRevision:8,revision:9,kind:'append',from:3,to:4,candleCount:4,timestampMs:Date.parse(append[0]!.timestamp)});
const correctionChange = createCandleDatasetChange({datasetKey:'NSE:NIFTY|5m',datasetGeneration:4,previousRevision:9,revision:10,kind:'correction',from:1,to:4,candleCount:4});
const backfillChange = createCandleDatasetChange({datasetKey:'NSE:NIFTY|5m',datasetGeneration:4,previousRevision:10,revision:11,kind:'backfill',from:0,to:4,candleCount:4});
assert.equal(invalidationModeForCandleChange(appendChange),'incremental');
assert.equal(invalidationModeForCandleChange(correctionChange),'full-replay');
assert.equal(invalidationModeForCandleChange(backfillChange),'full-replay');
assert.equal(isCurrentCandleDatasetChange(appendChange,{datasetKey:'NSE:NIFTY|5m',datasetGeneration:4,revision:9}),true);
assert.equal(isCurrentCandleDatasetChange(appendChange,{datasetKey:'NSE:NIFTY|5m',datasetGeneration:5}),false);
assert.throws(()=>createCandleDatasetChange({datasetKey:'NSE:NIFTY|5m',datasetGeneration:4,previousRevision:9,revision:9,kind:'replace',from:3,to:4,candleCount:4}),/advance monotonically/);
console.log('CHART_CANDLE_EVENT_CANONICALIZATION_OK');
