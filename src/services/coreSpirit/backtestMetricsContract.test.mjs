import assert from 'node:assert/strict';
import {calculateCoreSpiritBacktestMetrics,compareCoreSpiritBenchmark} from './backtestMetrics.ts';
const equity=[{timestampMs:1,cash:1000,equity:1000,grossExposure:0},{timestampMs:2,cash:980,equity:990,grossExposure:200},{timestampMs:3,cash:1010,equity:1020,grossExposure:300},{timestampMs:4,cash:1030,equity:1030,grossExposure:100}];
const trades=[{netPnl:40,realizedGrossPnl:45,allocatedEntryFees:2,allocatedExitFees:3,quantity:1,exitTimestampMs:3},{netPnl:-10,realizedGrossPnl:-6,allocatedEntryFees:2,allocatedExitFees:2,quantity:1,exitTimestampMs:4}];
const m=calculateCoreSpiritBacktestMetrics(equity,trades,1000,252);
assert.equal(m.netProfit,30);assert.equal(m.winRate,.5);assert.equal(m.grossProfit,40);assert.equal(m.grossLoss,10);assert.equal(m.profitFactor,4);assert.equal(m.feesPaid,9);assert.equal(m.maxGrossExposure,300);assert.ok(m.maxDrawdown>=10);
assert.deepEqual(compareCoreSpiritBenchmark(equity,[{timestampMs:1,equity:2000},{timestampMs:2,equity:2010},{timestampMs:3,equity:2020},{timestampMs:4,equity:2040}]).observations,4);
assert.throws(()=>calculateCoreSpiritBacktestMetrics([...equity].reverse(),trades,1000),/chronological/);
console.log('CORESPIRIT_BACKTEST_METRICS_CONTRACT_OK');