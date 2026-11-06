import assert from 'node:assert/strict';
import {CoreSpiritAlertRuntime} from './alertDelivery.ts';
class Store{records=new Map();async putIfAbsent(r){if(this.records.has(r.key))return false;this.records.set(r.key,r);return true;}async claimPending(now,limit,leaseMs){const claimed=[...this.records.values()].filter(r=>(r.status==='pending'&&r.nextAttemptAt<=now)||(r.status==='delivering'&&(r.leaseUntil??0)<=now)).slice(0,limit).map(r=>({...r,status:'delivering',leaseUntil:now+leaseMs}));for(const r of claimed)this.records.set(r.key,r);return claimed;}async update(r){this.records.set(r.key,r);}}
const store=new Store();let attempts=0;const runtime=new CoreSpiritAlertRuntime(store,async()=>{attempts++;if(attempts===1)throw Error('temporary');},3,100);
const event={id:'event-1',scriptId:'s1',scriptRevision:'r1',symbol:'NIFTY',timeframe:'5m',barIndex:10,barTimestamp:1000,confirmed:true,replay:false,message:'breakout',frequency:'once-per-bar-close',createdAt:1000};
assert.equal(await runtime.enqueue(event),true);assert.equal(await runtime.enqueue({...event,id:'event-2'}),false);
assert.equal(await runtime.enqueue({...event,id:'replay',replay:true}),false);
assert.deepEqual(await runtime.flush(1000),{delivered:0,retried:1,failed:0});
assert.deepEqual(await runtime.flush(1099),{delivered:0,retried:0,failed:0});
assert.deepEqual(await runtime.flush(1100),{delivered:1,retried:0,failed:0});
assert.equal(attempts,2);console.log('CORESPIRIT_ALERT_DELIVERY_CONTRACT_OK');