import assert from 'node:assert/strict';
import type { CoreSpiritOrderIntent, CoreSpiritStrategyEvent, StrategyRiskDecision } from '../../coreSpirit/strategyContract';
import { coreSpiritIntentsToSimulationActions } from './coreSpiritStrategySimulationAdapter';

const timestamp=Date.parse('2026-01-01T09:15:00.000Z');
const event:CoreSpiritStrategyEvent={id:'event-1',strategyId:'strat-1',kind:'entry',direction:'long',positionId:'pos-1',barIndex:0,
  timestamp,symbol:'NSE:TEST',timeframe:'5m',reason:'confirmed breakout'};
const intent:CoreSpiritOrderIntent={id:'intent-1',strategyEventId:'event-1',symbol:'NSE:TEST',side:'buy',direction:'long',quantity:8,
  sizing:{kind:'quantity',value:8},stop:98,target:108,positionId:'pos-1',requestedAt:timestamp,reason:'breakout entry'};
const decision:StrategyRiskDecision={orderIntentId:'intent-1',allowed:true,reason:'risk approved',approvedQuantity:5};
const actions=coreSpiritIntentsToSimulationActions([{event,intent,decision,sequence:1,execution:{type:'limit',limitPrice:101}}]);
assert.equal(actions.length,1);assert.equal(actions[0]?.kind,'submit');
if(actions[0]?.kind==='submit'){assert.equal(actions[0].intent.quantity,5);assert.equal(actions[0].intent.type,'limit');
  assert.equal(actions[0].intent.stopLossPrice,98);assert.equal(actions[0].intent.takeProfitPrice,108);}
const denied=coreSpiritIntentsToSimulationActions([{event,intent,decision:{...decision,allowed:false,reason:'exposure cap'},sequence:2}]);
assert.equal(denied[0]?.kind,'reject','risk-denied intent is recorded, not silently dropped');
const exitEvent:CoreSpiritStrategyEvent={...event,id:'event-exit',kind:'exit'};
const exitIntent:CoreSpiritOrderIntent={...intent,id:'intent-exit',strategyEventId:'event-exit',side:'sell',direction:'flat',quantity:undefined,
  sizing:{kind:'all'},stop:null,target:null};
const exit=coreSpiritIntentsToSimulationActions([{event:exitEvent,intent:exitIntent,decision:{orderIntentId:'intent-exit',allowed:true,reason:'close',approvedQuantity:99},
  sequence:3,currentPositionQuantity:4}]);
assert.equal(exit[0]?.kind,'submit');if(exit[0]?.kind==='submit'){assert.equal(exit[0].intent.side,'sell');assert.equal(exit[0].intent.quantity,4);}
const noPosition=coreSpiritIntentsToSimulationActions([{event:exitEvent,intent:exitIntent,
  decision:{orderIntentId:'intent-exit',allowed:true,reason:'close'},sequence:4,currentPositionQuantity:0}]);
assert.equal(noPosition[0]?.kind,'reject');
const secondsEvent:CoreSpiritStrategyEvent={...event,timestamp:Date.parse('2026-01-01T09:15:00.000Z')/1000};
const normalized=coreSpiritIntentsToSimulationActions([{event:secondsEvent,intent,decision,sequence:5}]);
assert.equal(normalized[0]?.kind,'submit');if(normalized[0]?.kind==='submit')assert.equal(normalized[0].signalTimeMs,timestamp);
console.log('CORESPIRIT_TO_SIMULATION_ACTION_ADAPTER_OK');
