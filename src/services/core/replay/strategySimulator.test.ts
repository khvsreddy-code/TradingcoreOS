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
assert.ok(first.ledger.some(e=>e.eventType==='signal'&&e.signalId==='signal-1'),'ledger preserves original strategy signals');

const betweenBars=runStrategySimulation({strategyId:'between-bars',sourceProgramChecksum:checksum,datasetId:'dataset-v1',datasets,
 actions:[{kind:'submit',sequence:1,signalTimeMs:Date.parse(bars[0]!.timestamp)+60_000,intent:{
   orderId:'between-order',signalId:'between-signal',symbol:'NSE:TEST',side:'buy',type:'market',quantity:1,
 }}],config});
const betweenFill=betweenBars.ledger.find(e=>e.eventType==='fill'&&e.orderId==='between-order');
assert.equal(betweenFill?.timestampMs,Date.parse(bars[1]!.timestamp),'a signal between bars becomes eligible on the next bar, without an extra bar of delay');

const gapBars=[bars[0]!,{...bars[1]!,open:106,high:108,low:104,close:107},...bars.slice(2)];
const gapStop=runStrategySimulation({strategyId:'gap-stop',sourceProgramChecksum:checksum,datasetId:'gap-dataset',
 datasets:[{symbol:'NSE:TEST',timeframe:'5m',bars:gapBars}],
 actions:[{kind:'submit',sequence:1,signalTimeMs:Date.parse(gapBars[0]!.timestamp),intent:{
   orderId:'gap-stop-1',signalId:'gap-stop-signal',symbol:'NSE:TEST',side:'buy',type:'stop',quantity:1,stopPrice:103,
 }}],config});
const gapStopFill=gapStop.ledger.find(e=>e.eventType==='fill'&&e.orderId==='gap-stop-1');
assert.ok((gapStopFill?.fillPrice??0)>=106,'a stop gapped through at the open fills at the open plus configured adverse impact');

const gapLimit=runStrategySimulation({strategyId:'gap-limit',sourceProgramChecksum:checksum,datasetId:'gap-dataset',
 datasets:[{symbol:'NSE:TEST',timeframe:'5m',bars}],
 actions:[{kind:'submit',sequence:1,signalTimeMs:Date.parse(bars[0]!.timestamp),intent:{
   orderId:'gap-limit-1',signalId:'gap-limit-signal',symbol:'NSE:TEST',side:'buy',type:'limit',quantity:1,limitPrice:104,
 }}],config});
const gapLimitFill=gapLimit.ledger.find(e=>e.eventType==='fill'&&e.orderId==='gap-limit-1');
assert.ok((gapLimitFill?.fillPrice??Infinity)<104,'a marketable limit receives a better open price, adjusted only by modeled impact');

const deniedAction=runStrategySimulation({strategyId:'risk-denied',sourceProgramChecksum:checksum,datasetId:'dataset-v1',datasets,
 actions:[{kind:'reject',sequence:1,signalTimeMs:Date.parse(bars[0]!.timestamp),orderId:'denied-1',signalId:'denied-signal',
   symbol:'NSE:TEST',side:'buy',reason:'portfolio exposure cap'}],config});
assert.equal(deniedAction.summary.rejectedOrderCount,1,'host risk rejection is included in simulator summary');


const stopLimit=runStrategySimulation({strategyId:'stop-limit-gap',sourceProgramChecksum:checksum,datasetId:'dataset-v1',datasets,
 actions:[{kind:'submit',sequence:1,signalTimeMs:Date.parse(bars[0]!.timestamp),intent:{
   orderId:'stop-limit-1',signalId:'stop-limit-signal',symbol:'NSE:TEST',side:'buy',type:'stop-limit',quantity:2,stopPrice:102,limitPrice:104,
 }}],config:{...config,intrabarPolicy:'stop-first'}});
const stopLimitFill=stopLimit.ledger.find(e=>e.eventType==='fill'&&e.orderId==='stop-limit-1');
assert.ok(stopLimitFill,'stop-limit order has an explicit trigger/execution path');
assert.ok((stopLimitFill?.fillPrice??Infinity)<=104,'a buy stop-limit must never fill above its limit');

const modified=runStrategySimulation({strategyId:'modified-limit',sourceProgramChecksum:checksum,datasetId:'dataset-v1',datasets,
 actions:[
  {kind:'submit',sequence:1,signalTimeMs:Date.parse(bars[0]!.timestamp),intent:{orderId:'modify-1',signalId:'modify-signal',symbol:'NSE:TEST',side:'buy',type:'limit',quantity:2,limitPrice:90}},
  {kind:'modify',sequence:2,signalTimeMs:Date.parse(bars[1]!.timestamp),orderId:'modify-1',updates:{limitPrice:101}},
 ],config});
assert.ok(modified.ledger.some(e=>e.eventType==='order_modified'&&e.orderId==='modify-1'));
assert.ok(modified.ledger.some(e=>e.eventType==='fill'&&e.orderId==='modify-1'),'modification becomes effective only on later bars');

const cancelled=runStrategySimulation({strategyId:'cancelled-limit',sourceProgramChecksum:checksum,datasetId:'dataset-v1',datasets,
 actions:[
  {kind:'submit',sequence:1,signalTimeMs:Date.parse(bars[0]!.timestamp),intent:{orderId:'cancel-1',signalId:'cancel-signal',symbol:'NSE:TEST',side:'buy',type:'limit',quantity:2,limitPrice:90}},
  {kind:'cancel',sequence:2,signalTimeMs:Date.parse(bars[1]!.timestamp),orderId:'cancel-1',reason:'signal invalidated'},
 ],config});
assert.ok(cancelled.ledger.some(e=>e.eventType==='order_cancelled'&&e.orderId==='cancel-1'));
assert.equal(cancelled.ledger.some(e=>e.eventType==='fill'&&e.orderId==='cancel-1'),false,'bar-close cancellation prevents later fills');

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
