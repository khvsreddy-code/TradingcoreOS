import assert from 'node:assert/strict';
import {CoreSpiritResearchServiceHost} from './quantResearchServiceHost.ts';
const request={dataset:{
 datasetId:'nifty-5y',objectKey:'research/nifty/5m/v1',sha256:'a'.repeat(64),rows:500000,
 symbol:'NIFTY',timeframe:'5m',featureNames:['returns','volatility'],targetName:'forward_return_5',
 provenance:{provider:'fyers',instrumentId:'NSE:NIFTY50-INDEX',exchangeTimezone:'Asia/Kolkata',
  timestampConvention:'bar-close',dataArrivalAtMs:1760000000000,dataRevision:'fyers-history-v3',
  missingIntervals:3,qualityStatus:'verified',historicalAvailability:{fromMs:1700000000000,toMs:1759999999000}},
 pointInTime:{decisionTimestampColumn:'timestamp_ms',confirmedColumn:'is_confirmed',phaseColumn:'bar_phase',
  availabilityColumns:{returns:'returns_available_at_ms',volatility:'volatility_available_at_ms'},
  availabilityRule:'availableAt<=timestamp'}
 },
 walkForward:{trainBars:100000,validationBars:20000,testBars:20000,stepBars:10000,purgeBars:5,embargoBars:5},
 algorithm:'ridge-regression',parameters:{ridge:.001}};
const calls=[];
assert.throws(()=>new CoreSpiritResearchServiceHost({baseUrl:'ftp://localhost/research',serviceSecret:'r'.repeat(32)}),/HTTPS or explicit HTTP loopback/);
assert.doesNotThrow(()=>new CoreSpiritResearchServiceHost({baseUrl:'http://127.0.0.1:8080/research',serviceSecret:'r'.repeat(32)}));
const host=new CoreSpiritResearchServiceHost({baseUrl:'https://research.example/api',serviceSecret:'r'.repeat(32),fetchImpl:async(url,init)=>{calls.push({url:String(url),init});if(init.method==='POST')return new Response(JSON.stringify({jobId:'job_1',status:'queued',progress:0,createdAt:1,updatedAt:1}),{status:202});if(init.method==='GET')return new Response(JSON.stringify({jobId:'job_1',status:'succeeded',progress:1,createdAt:1,updatedAt:2,result:{folds:4}}),{status:200});return new Response(null,{status:204});}});
const job=await host.submit(request);assert.equal(job.jobId,'job_1');assert.match(calls[0].url,/v1\/research\/jobs/);
const completed=await host.get('job_1');assert.equal(completed.status,'succeeded');
await host.cancel('job_1');assert.equal(calls[2].init.method,'DELETE');
await assert.rejects(()=>host.submit({...request,dataset:{...request.dataset,objectKey:'https://evil.example/data'}}),/opaque storage key/);
await assert.rejects(()=>host.get('../other'),/job id/);

const incompleteAvailability={...request.dataset,pointInTime:{...request.dataset.pointInTime,availabilityColumns:{returns:'returns_available_at_ms'}}};
await assert.rejects(()=>host.submit({...request,dataset:incompleteAvailability}),/Every research feature must have its own explicit availability timestamp column/);
const invalidTimezone={...request.dataset,provenance:{...request.dataset.provenance,exchangeTimezone:'Mars/Olympus'}};
await assert.rejects(()=>host.submit({...request,dataset:invalidTimezone}),/valid IANA timezone/);
const unverifiedSource={...request.dataset,provenance:{...request.dataset.provenance,provider:'',qualityStatus:'verified'}};
await assert.rejects(()=>host.submit({...request,dataset:unverifiedSource}),/provenance must identify/);

console.log('CORESPIRIT_LARGE_DATA_RESEARCH_HOST_CONTRACT_OK');