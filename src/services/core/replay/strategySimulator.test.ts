import assert from 'node:assert/strict';
import { runStrategySimulation, type SimulationAction, type SimulationDataset } from './strategySimulator.ts';
const bars=[
 {timestamp:'2026-01-01T09:15:00.000Z',open:100,high:102,low:99,close:101,volume:100},
 {timestamp:'2026-01-01T09:20:00.000Z',open:101,high:104,low:100,close:103,volume:100},
 {timestamp:'2026-01-01T09:25:00.000Z',open:103,high:105,low:98,close:99,volume:100},
 {timestamp:'2026-01-01T09:30:00.000Z',open:99,high:101,low:97,close:100,volume:100},
 {timestamp:'2026-01-01T09:35:00.000Z',open:100,high:103,low:99,close:102,volume:100},
];
const datasets:SimulationDataset[]=[{symbol:'NSE:TEST',timeframe:'5m',bars}];
const checksum='a'.repeat(64);
const actions:SimulationAction[]=[
 {kind:'submit',sequence:1,signalTimeMs:Date.parse(bars[0]!.timestamp),reason:'long breakout',intent:{orderId:'order-1',signalId:'signal-1',symbol:'NSE:TEST',side:'buy',type:'market',quantity:5,stopLossPrice:98,takeProfitPrice:104}},
 {kind:'submit',sequence:2,signalTimeMs:Date.parse(bars[1]!.timestamp),reason:'limit follow-up',intent:{orderId:'order-2',signalId:'signal-2',symbol:'NSE:TEST',side:'sell',type:'limit',quantity:2,limitPrice:104}},
];
const config={initialCash:100_000,slippageBps:2,spreadBps:2,brokeragePerOrder:5,brokerageBps:1,exchangeFeeBps:0.5,taxesBps:0.25,
 maxParticipationRate:0.5,lotSize:1,maxPositionQuantity:10,maxGrossExposure:1_000_000,maxGrossExposureMultiple:2,
 allowShort:false,defaultTimeInForceBars:3,intrabarPolicy:'stop-first' as const,executionDetail:'ohlc' as const};
const first=runStrategySimulation({strategyId:'breakout',sourceProgramChecksum:checksum,datasetId:'dataset-v1',datasets,actions,config});
const second=runStrategySimulation({strategyId:'breakout',sourceProgramChecksum:checksum,datasetId:'dataset-v1',datasets,actions,config});
assert.equal(first.simulationId,second.simulationId);
assert.deepEqual(first.ledger,second.ledger,'identical inputs must produce an identical ledger');
assert.equal(first.executionAuthority,'simulation-only');
assert.ok(first.ledger.every(e=>e.simulated&&e.executionAuthority==='simulation-only'));
assert.ok(first.ledger.some(e=>e.eventType==='order_submitted'&&e.orderId==='order-1'));
assert.ok(first.ledger.some(e=>e.eventType==='fill'&&e.orderId==='order-1'),'market order fills on a later bar, never its signal bar');
assert.ok(first.summary.feesPaid>0);
assert.equal(first.assumptions.liveBrokerOrdersSubmitted,false);

const partial=runStrategySimulation({strategyId:'volume-limited',sourceProgramChecksum:checksum,datasetId:'dataset-v1',datasets,
 actions:[{kind:'submit',sequence:1,signalTimeMs:Date.parse(bars[0]!.timestamp),intent:{orderId:'partial-1',signalId:'partial-signal',symbol:'NSE:TEST',side:'buy',type:'limit',quantity:30,limitPrice:101}}],
 config:{...config,maxParticipationRate:0.1,defaultTimeInForceBars:2}});
assert.ok(partial.ledger.some(e=>e.eventType==='partial_fill'));
assert.ok(partial.ledger.some(e=>e.eventType==='order_expired'));

const conflictBars=[bars[0]!,{...bars[1]!,low:98},...bars.slice(2)];
const conflict=runStrategySimulation({strategyId:'bracket-conflict',sourceProgramChecksum:checksum,datasetId:'dataset-v1',
 datasets:[{symbol:'NSE:TEST',timeframe:'5m',bars:conflictBars}],
 actions:[{kind:'submit',sequence:1,signalTimeMs:Date.parse(conflictBars[0]!.timestamp),intent:{orderId:'bracket-1',signalId:'bracket-signal',symbol:'NSE:TEST',side:'buy',type:'market',quantity:2,stopLossPrice:99,takeProfitPrice:102}}],
 config:{...config,intrabarPolicy:'reject-ambiguous',maxParticipationRate:1}});
assert.ok(conflict.ledger.some(e=>e.eventType==='ambiguous_intrabar'));

const invalidBars=[bars[0]!,{...bars[1]!,high:99},...bars.slice(2)];
assert.throws(()=>runStrategySimulation({strategyId:'invalid',sourceProgramChecksum:checksum,datasetId:'bad',
 datasets:[{symbol:'NSE:TEST',timeframe:'5m',bars:invalidBars}],actions:[]}),/Invalid replay dataset/);
const double=runStrategySimulation({strategyId:'portfolio',sourceProgramChecksum:checksum,datasetId:'two-symbols',
 datasets:[{symbol:'AAA',timeframe:'1m',bars},{symbol:'BBB',timeframe:'1m',bars:bars.map(b=>({...b,open:b.open*2,high:b.high*2,low:b.low*2,close:b.close*2}))}],
 actions:[
 {kind:'submit',sequence:1,signalTimeMs:Date.parse(bars[0]!.timestamp),intent:{orderId:'aaa',signalId:'s-aaa',symbol:'AAA',side:'buy',type:'market',quantity:2}},
 {kind:'submit',sequence:2,signalTimeMs:Date.parse(bars[0]!.timestamp),intent:{orderId:'bbb',signalId:'s-bbb',symbol:'BBB',side:'buy',type:'market',quantity:2}},
 ],
 config:{...config,maxGrossExposure:500}});
assert.ok(double.summary.maxGrossExposure<=500+1e-7,'gross exposure cap applies across symbols');
console.log('STRATEGY_SIMULATOR_DETERMINISTIC_LEDGER_OK');
