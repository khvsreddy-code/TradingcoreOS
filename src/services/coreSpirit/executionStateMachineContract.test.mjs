import assert from 'node:assert/strict';
import { CoreSpiritExecutionStateMachine } from './executionStateMachine.ts';
const empty=new CoreSpiritExecutionStateMachine();empty.beginBarRevision(0,0,'realtime');empty.beginScriptExecution();empty.updateOutputs();empty.commitBar();assert.equal(empty.snapshot().committedBars,1);
const m=new CoreSpiritExecutionStateMachine();m.beginHistoricalLoad(2);m.beginHistoricalExecution();
for(let i=0;i<2;i++){m.beginBarRevision(i,0,'historical');m.beginScriptExecution();m.updateOutputs();m.commitBar();}
m.commitHistorical();assert.equal(m.snapshot().phase,'history-committed');assert.equal(m.snapshot().committedHistoricalBars,2);
m.beginBarRevision(2,0,'realtime');m.beginScriptExecution();m.updateOutputs();m.rollbackRevision();assert.equal(m.snapshot().phase,'awaiting-realtime');assert.equal(m.snapshot().rolledBackRevisions,1);
m.beginBarRevision(2,1,'realtime');m.beginScriptExecution();m.updateOutputs();m.commitBar();assert.equal(m.snapshot().phase,'bar-committed');assert.equal(m.snapshot().committedBars,1);
assert.throws(()=>m.rollbackRevision(),/Cannot roll back/);assert.throws(()=>m.beginBarRevision(3,0,'historical'),/expected executing-history/);m.reset();assert.equal(m.snapshot().phase,'initialized');console.log('CORESPIRIT_EXECUTION_STATE_MACHINE_OK');