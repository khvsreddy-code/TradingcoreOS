import assert from 'node:assert/strict';
import {runCoreSpiritPineStrategySimulation,coreSpiritPineStrategyCommandsToSimulationActions} from './pineStrategySimulationAdapter.ts';

const bars=[
 {timestamp:'2026-01-01T09:15:00.000Z',open:100,high:102,low:99,close:101,volume:1000},
 {timestamp:'2026-01-01T09:20:00.000Z',open:101,high:104,low:100,close:103,volume:1000},
 {timestamp:'2026-01-01T09:25:00.000Z',open:103,high:105,low:98,close:99,volume:1000},
 {timestamp:'2026-01-01T09:30:00.000Z',open:99,high:101,low:97,close:100,volume:1000},
 {timestamp:'2026-01-01T09:35:00.000Z',open:100,high:103,low:99,close:102,volume:1000},
];
const datasets=[{symbol:'NSE:TEST',timeframe:'5m',bars}];
const stamp=(index)=>Date.parse(bars[index].timestamp);
const command=(id,command,args,index)=>({
 kind:'event',id,time:stamp(index)/1000,name:'strategy.'+command,
 metadata:{coreSpiritStrategyCommand:{
  version:1,command,programId:'pine-program-1',symbol:'NSE:TEST',timeframe:'5m',
  barIndex:index,barTimestampMs:stamp(index),revision:0,sourceCallId:id,args,
 }},
});
const outputs=[
 command('entry-event','entry',['Long','long',2],0),
 command('pending-event','order',['Pending','long',2,90],0),
 command('exit-event','exit',['Exit','Long',2,null,null,105,null,98],2),
 command('cancel-event','cancel',['Pending'],2),
];
const result=runCoreSpiritPineStrategySimulation({
 strategyId:'strategy-backtest-1',sourceProgramChecksum:'a'.repeat(64),datasetId:'bars-v1',
 datasets,outputs,defaultQuantity:1,
 config:{slippageBps:0,spreadBps:0,brokeragePerOrder:0,maxParticipationRate:1,allowShort:false},
});
assert.equal(result.simulation.environment,'simulation');
assert.equal(result.simulation.executionAuthority,'simulation-only');
assert.ok(result.actions.some(action=>action.kind==='submit'&&action.intent.entryId==='Long'));
assert.ok(result.actions.some(action=>action.kind==='exit'&&action.entryId==='Long'));
assert.ok(result.actions.some(action=>action.kind==='cancel'&&action.entryId==='Pending'));
assert.ok(result.simulation.ledger.some(event=>event.eventType==='fill'&&event.orderId==='entry-event'));
assert.ok(result.simulation.ledger.some(event=>event.eventType==='protective_exit'&&event.orderId==='exit-event'));
assert.ok(result.simulation.ledger.some(event=>event.eventType==='order_cancelled'&&event.orderId==='pending-event'));
assert.equal(result.simulation.closedTrades.length,1);
assert.ok(result.simulation.ledger.every(event=>event.simulated===true&&event.executionAuthority==='simulation-only'));
assert.equal(result.diagnostics.length,0);
assert.ok(result.metrics,'multi-bar strategy runs expose performance analytics');
assert.equal(result.metrics.observations,bars.length);

const trail=coreSpiritPineStrategyCommandsToSimulationActions([
 command('trail-event','exit',['Exit','Long',undefined,undefined,undefined,undefined,undefined,undefined,99,undefined,2],2),
],{defaultQuantity:1,datasets});
assert.equal(trail.actions[0]?.kind,'reject','unsupported trailing-stop behavior must fail closed');
assert.match(trail.diagnostics[0]??'',/Trailing-stop parameters are not modeled/);
const immediate=coreSpiritPineStrategyCommandsToSimulationActions([
 command('immediate-event','close',['Long',undefined,1,undefined,undefined,true],2),
],{defaultQuantity:1,datasets});
assert.equal(immediate.actions[0]?.kind,'reject','same-bar close must not be silently shifted');
assert.match(immediate.diagnostics[0]??'',/immediately=true/);

const duplicate=coreSpiritPineStrategyCommandsToSimulationActions([
 command('same-event','entry',['Long','long',1],0),
 command('same-event','entry',['Long','long',1],0),
],{defaultQuantity:1,datasets});
assert.equal(duplicate.actions.length,1,'repeated output identity cannot submit a duplicate simulation action');
console.log('CORESPIRIT_PINE_STRATEGY_SIMULATION_ADAPTER_OK');
