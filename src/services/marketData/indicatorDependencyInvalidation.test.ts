import assert from 'node:assert/strict';
import { createIndicatorDependencyCache, evaluateIndicatorDependencyGraph, invalidateIndicatorDependencyCache } from './indicatorDependencyGraph';
import { createCandleDatasetChange } from './chartCandleEvents';
import type { IndicatorConfig } from './indicatorEngine';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';
const candles:HistoricalCandle[]=Array.from({length:6},(_,i)=>({
 timestamp:new Date(Date.UTC(2026,9,24,10,i)).toISOString(),open:100+i,high:102+i,low:99+i,close:101+i,volume:100,
}));
const configs:IndicatorConfig[]=[{id:'ema-close',kind:'EMA',enabled:true,period:3,source:'close'} as IndicatorConfig];
const cache=createIndicatorDependencyCache();
evaluateIndicatorDependencyGraph(candles,configs,cache);
assert.ok(cache.has('source:close'));assert.ok(cache.has('ema:close:3'));
const append=createCandleDatasetChange({datasetKey:'chart:test|5m',datasetGeneration:1,previousRevision:1,revision:2,kind:'append',from:5,to:6,candleCount:6});
const result=invalidateIndicatorDependencyCache(cache,configs,append);
assert.equal(result.mode,'incremental');assert.ok(result.invalidatedKeys.includes('source:close'));assert.ok(result.invalidatedKeys.includes('ema:close:3'));
assert.equal(cache.size,0,'full-series graph arrays must not survive a candle tail change');
evaluateIndicatorDependencyGraph(candles,configs,cache);
const correction=createCandleDatasetChange({datasetKey:'chart:test|5m',datasetGeneration:1,previousRevision:2,revision:3,kind:'correction',from:1,to:6,candleCount:6});
evaluateIndicatorDependencyGraph(candles,configs,cache,correction);
assert.equal(cache.size,2,'corrected input requires invalidation before full recompute');
console.log('INDICATOR_DEPENDENCY_INVALIDATION_OK');
