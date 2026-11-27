import assert from 'node:assert/strict';
import {runStrategySimulation} from './strategySimulator.ts';
const bars=[
 {timestamp:'2026-02-01T09:15:00.000Z',open:100,high:101,low:99,close:100,volume:10000},
 {timestamp:'2026-02-01T09:20:00.000Z',open:100,high:110,low:80,close:105,volume:10000},
 {timestamp:'2026-02-01T09:25:00.000Z',open:105,high:108,low:95,close:102,volume:10000},
 {timestamp:'2026-02-01T09:30:00.000Z',open:102,high:106,low:98,close:104,volume:10000},
];
const dataset=[{symbol:'NSE:TEST',timeframe:'5m',bars}];
const checksum='b'.repeat(64),time=Date.parse(bars[0].timestamp);
const financed=runStrategySimulation({strategyId:'margin-and-pyramiding',sourceProgramChecksum:checksum,datasetId:'d1',datasets:dataset,
 actions:[
  {kind:'submit',signalTimeMs:time,sequence:1,intent:{orderId:'entry-1',signalId:'s1',symbol:'NSE:TEST',side:'buy',type:'market',quantity:2500,entryId:'L1',countsTowardPyramiding:true}},
  {kind:'submit',signalTimeMs:time,sequence:2,intent:{orderId:'entry-2',signalId:'s2',symbol:'NSE:TEST',side:'buy',type:'market',quantity:10,entryId:'L2',countsTowardPyramiding:true}},
 ],
 config:{initialCash:100000,slippageBps:0,spreadBps:0,brokeragePerOrder:0,maxParticipationRate:1,
  lotSize:1,maxPositionQuantity:3000,maxGrossExposure:500000,maxGrossExposureMultiple:5,allowShort:false,
  pyramiding:1,marginLongPercent:50,marginShortPercent:100},
});
const firstFill=financed.ledger.find(event=>event.eventType==='fill'&&event.orderId==='entry-1');
assert.equal(firstFill?.filledQuantity,2000,'50% initial margin caps gross position to 2x equity');
assert.ok(financed.ledger.some(event=>event.eventType==='order_rejected'&&event.orderId==='entry-2'&&/pyramiding/.test(event.reason??'')));

const reversal=runStrategySimulation({strategyId:'strategy-entry-reversal',sourceProgramChecksum:checksum,datasetId:'d1',datasets:dataset,
 actions:[
  {kind:'submit',signalTimeMs:time,sequence:1,intent:{orderId:'long-10',signalId:'long-signal',symbol:'NSE:TEST',side:'buy',type:'market',quantity:10,entryId:'Long',countsTowardPyramiding:true}},
  {kind:'submit',signalTimeMs:Date.parse(bars[1].timestamp),sequence:2,intent:{orderId:'short-5',signalId:'short-signal',symbol:'NSE:TEST',side:'sell',type:'market',quantity:5,entryId:'Short',countsTowardPyramiding:true}},
 ],
 config:{slippageBps:0,spreadBps:0,brokeragePerOrder:0,maxParticipationRate:1,allowShort:true}});
assert.equal(reversal.positions.find(position=>position.symbol==='NSE:TEST')?.quantity,-5,
  'strategy.entry short 5 reverses long 10 with a transaction size of 15');
assert.equal(reversal.ledger.find(event=>event.eventType==='fill'&&event.orderId==='short-5')?.filledQuantity,15);
const oca=runStrategySimulation({strategyId:'oca-cancel',sourceProgramChecksum:checksum,datasetId:'d1',datasets:dataset,
 actions:[
  {kind:'submit',signalTimeMs:time,sequence:1,intent:{orderId:'oca-first',signalId:'oca1',symbol:'NSE:TEST',side:'buy',type:'limit',quantity:2,limitPrice:105,ocaGroup:'entry-oca',ocaType:'cancel'}},
  {kind:'submit',signalTimeMs:time,sequence:2,intent:{orderId:'oca-second',signalId:'oca2',symbol:'NSE:TEST',side:'buy',type:'limit',quantity:2,limitPrice:90,ocaGroup:'entry-oca',ocaType:'cancel'}},
 ],
 config:{slippageBps:0,spreadBps:0,brokeragePerOrder:0,maxParticipationRate:1,allowShort:true}});
assert.ok(oca.ledger.some(event=>event.eventType==='fill'&&event.orderId==='oca-first'));
assert.ok(oca.ledger.some(event=>event.eventType==='order_cancelled'&&event.orderId==='oca-second'&&/OCA sibling/.test(event.reason??'')));

const ocaReduce=runStrategySimulation({strategyId:'oca-reduce',sourceProgramChecksum:checksum,datasetId:'d1',datasets:dataset,
 actions:[
  {kind:'submit',signalTimeMs:time,sequence:1,intent:{orderId:'reduce-first',signalId:'r1',symbol:'NSE:TEST',side:'buy',type:'limit',quantity:1,limitPrice:105,ocaGroup:'reduce-group',ocaType:'reduce'}},
  {kind:'submit',signalTimeMs:time,sequence:2,intent:{orderId:'reduce-second',signalId:'r2',symbol:'NSE:TEST',side:'buy',type:'limit',quantity:2,limitPrice:95,ocaGroup:'reduce-group',ocaType:'reduce'}},
 ],
 config:{slippageBps:0,spreadBps:0,brokeragePerOrder:0,maxParticipationRate:1,allowShort:true}});
assert.ok(ocaReduce.ledger.some(event=>event.eventType==='fill'&&event.orderId==='reduce-first'));
const reducedFill=ocaReduce.ledger.find(event=>event.eventType==='fill'&&event.orderId==='reduce-second');
assert.equal(reducedFill?.filledQuantity,1,'OCA reduce decrements, rather than cancels, a sibling order size');
const cancelledAll=runStrategySimulation({strategyId:'cancel-all',sourceProgramChecksum:checksum,datasetId:'d1',datasets:dataset,
 actions:[
  {kind:'submit',signalTimeMs:time,sequence:1,intent:{orderId:'working-1',signalId:'w1',symbol:'NSE:TEST',side:'buy',type:'limit',quantity:2,limitPrice:50,entryId:'one'}},
  {kind:'submit',signalTimeMs:time,sequence:2,intent:{orderId:'working-2',signalId:'w2',symbol:'NSE:TEST',side:'buy',type:'limit',quantity:2,limitPrice:40,entryId:'two'}},
  {kind:'cancel-all',signalTimeMs:Date.parse(bars[1].timestamp),sequence:3},
 ],
 config:{slippageBps:0,spreadBps:0,brokeragePerOrder:0,maxParticipationRate:1,allowShort:true}});
assert.ok(cancelledAll.ledger.some(event=>event.eventType==='order_cancelled'&&event.orderId==='working-1'));
assert.ok(cancelledAll.ledger.some(event=>event.eventType==='order_cancelled'&&event.orderId==='working-2'));
console.log('STRATEGY_SIMULATOR_MARGIN_PYRAMIDING_OCA_OK');
