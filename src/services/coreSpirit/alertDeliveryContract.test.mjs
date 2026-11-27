import assert from 'node:assert/strict';
import {CoreSpiritAlertRuntime,coreSpiritAlertFromRuntimeEvent,coreSpiritAlertEventId,normalizeCoreSpiritAlertFrequency} from './alertDelivery.ts';

assert.equal(normalizeCoreSpiritAlertFrequency('alert.freq_once_per_bar_close'),'once-per-bar-close');
assert.equal(normalizeCoreSpiritAlertFrequency('once_per_bar'),'once-per-bar');
assert.equal(normalizeCoreSpiritAlertFrequency('alert.freq_all'),'all');
assert.throws(()=>normalizeCoreSpiritAlertFrequency('alert.freq_once'),/Unsupported Pine alert frequency/);

class Store{
  records=new Map();
  async putIfAbsent(record){if(this.records.has(record.key))return false;this.records.set(record.key,record);return true;}
  async claimPending(now,limit,leaseMs){
    const claimed=[...this.records.values()].filter(r=>(r.status==='pending'&&r.nextAttemptAt<=now)||
      (r.status==='delivering'&&(r.leaseUntil??0)<=now)).slice(0,limit).map(r=>({...r,status:'delivering',leaseUntil:now+leaseMs}));
    for(const record of claimed)this.records.set(record.key,record);
    return claimed;
  }
  async update(record){this.records.set(record.key,record);}
  async listRecent(limit){return [...this.records.values()].sort((a,b)=>b.event.createdAt-a.event.createdAt).slice(0,limit);}
}
const context={scriptRevision:'r1',symbol:'NIFTY',timeframe:'5m',executionMode:'realtime',createdAt:1000,revision:4};
const conditionRuntimeEvent={scriptId:'s1',time:1000,sequence:10,payload:{
  eventType:'alertcondition',conditionId:'indicator:bullish:42',barIndex:10,title:'Bullish',
  message:'Bullish candle',execution:{isConfirmed:true,barPhase:'confirmed'},
}};
const condition=coreSpiritAlertFromRuntimeEvent(conditionRuntimeEvent,context);
assert.equal(condition.eventType,'alertcondition');
assert.equal(condition.frequency,'once-per-bar-close');
assert.equal(condition.conditionId,'indicator:bullish:42');
assert.equal(condition.programId,'s1');
assert.equal(condition.instrumentId,'NIFTY');
assert.equal(condition.revision,4);
assert.equal(condition.id,coreSpiritAlertEventId(condition));
assert.equal(condition.id,coreSpiritAlertFromRuntimeEvent(conditionRuntimeEvent,context).id);
const actionRuntimeEvent={scriptId:'s1',time:1000,sequence:11,payload:{
  eventType:'alert',conditionId:'alert:breakout:88',barIndex:10,message:'breakout',
  frequency:'alert.freq_once_per_bar',execution:{isRealtime:true,barPhase:'forming'},
}};
const action=coreSpiritAlertFromRuntimeEvent(actionRuntimeEvent,context);
assert.equal(action.eventType,'alert');
assert.equal(action.frequency,'once-per-bar');
assert.notEqual(action.id,condition.id,'alert() and alertcondition() must have distinct identities');
assert.notEqual(action.conditionId,condition.conditionId);
const secondCallSiteEvent=coreSpiritAlertFromRuntimeEvent({
  ...actionRuntimeEvent,sequence:12,payload:{...actionRuntimeEvent.payload,conditionId:'alert:second-callsite:99'}
},context);
const allRuntimeEventWithoutSourceSequence={...actionRuntimeEvent,sequence:999,payload:{...actionRuntimeEvent.payload,frequency:'alert.freq_all'}};
assert.throws(()=>coreSpiritAlertFromRuntimeEvent(allRuntimeEventWithoutSourceSequence,context),/host-stamped market event sequence/,
  'the event bus sequence must not be mistaken for the market feed sequence');
const allRuntimeEvent=coreSpiritAlertFromRuntimeEvent({
  ...actionRuntimeEvent,sequence:999,payload:{...actionRuntimeEvent.payload,frequency:'alert.freq_all',sourceSequence:12},
},context);
assert.equal(allRuntimeEvent.sourceSequence,12);
const allRuntimeEventSameTickRevision=coreSpiritAlertFromRuntimeEvent({
  ...actionRuntimeEvent,sequence:1000,payload:{...actionRuntimeEvent.payload,frequency:'alert.freq_all',sourceSequence:12},
},{...context,revision:5});
assert.notEqual(allRuntimeEventSameTickRevision.id,allRuntimeEvent.id,'runtime revision remains part of the deterministic event ID');
const changedRevision=coreSpiritAlertFromRuntimeEvent(conditionRuntimeEvent,{...context,revision:5});
assert.notEqual(changedRevision.id,condition.id,'revision is part of the deterministic event ID');

const store=new Store();let attempts=0;
const runtime=new CoreSpiritAlertRuntime(store,async()=>{attempts++;if(attempts===1)throw Error('temporary');},3,100);
assert.equal(await runtime.enqueue(condition),true);
assert.equal(await runtime.enqueue(condition),false,'same event cannot be enqueued twice');
assert.equal(await runtime.enqueue(action),true,'once-per-bar admits the first developing realtime alert');
assert.equal(await runtime.enqueue(secondCallSiteEvent),false,
  'alert.freq_once_per_bar is global to the script, not independently granted to each alert() callsite');
assert.equal(await runtime.enqueue(changedRevision),false,'once-per-bar dedupe survives duplicate/corrected revisions');
assert.equal(await runtime.enqueue({...condition,replay:true}),false);
assert.equal(await runtime.enqueue({...action,confirmed:false}),false,'once-per-bar cannot repeat on a later revision of the same bar');
const all12=allRuntimeEvent;
assert.equal(await runtime.enqueue(all12),true);
assert.equal(await runtime.enqueue(all12),false);
assert.equal(await runtime.enqueue(allRuntimeEventSameTickRevision),false,
  'a repeated market tick is deduplicated even when runtime revision changed');
const all13={...all12,sourceSequence:13};
assert.equal(await runtime.enqueue(all13),true,'freq_all accepts a new host sequence on the same bar');
assert.equal(await runtime.enqueue({...condition,confirmed:false}),false,'once-per-bar-close must wait for confirmation');
const allNoSequence={...action,frequency:'all',sourceSequence:undefined};
assert.throws(()=>runtime.enqueue(allNoSequence),/unique host-stamped market event sequence/);
assert.equal(await runtime.history(20).then(rows=>rows.length),4,'outbox records expose bounded durable event history');
assert.equal((await runtime.flush(1000)).retried,1);
assert.equal((await runtime.flush(1099)).delivered,0);
assert.equal((await runtime.flush(1100)).delivered,1);
assert.ok([...store.records.values()].some(r=>r.status==='delivered'));
assert.equal(coreSpiritAlertFromRuntimeEvent({...conditionRuntimeEvent,sequence:undefined},{...context,executionMode:'historical'}).replay,true);
assert.throws(()=>coreSpiritAlertFromRuntimeEvent({...actionRuntimeEvent,payload:{...actionRuntimeEvent.payload,frequency:'invalid'}},context),/Unsupported alert frequency/);
console.log('CORESPIRIT_ALERT_DELIVERY_CONTRACT_OK');
