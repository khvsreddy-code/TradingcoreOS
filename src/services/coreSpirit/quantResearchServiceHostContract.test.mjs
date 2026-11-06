import assert from 'node:assert/strict';
import {CoreSpiritResearchServiceHost} from './quantResearchServiceHost.ts';
const request={dataset:{datasetId:'nifty-5y',objectKey:'research/nifty/5m/v1',sha256:'a'.repeat(64),rows:500000,symbol:'NIFTY',timeframe:'5m',featureNames:['returns','volatility'],targetName:'forward_return_5'},
 walkForward:{trainBars:100000,validationBars:20000,testBars:20000,stepBars:10000,purgeBars:5,embargoBars:5},algorithm:'ridge-regression',parameters:{ridge:.001}};
const calls=[];
const host=new CoreSpiritResearchServiceHost({baseUrl:'https://research.example/api',serviceSecret:'r'.repeat(32),fetchImpl:async(url,init)=>{calls.push({url:String(url),init});if(init.method==='POST')return new Response(JSON.stringify({jobId:'job_1',status:'queued',progress:0,createdAt:1,updatedAt:1}),{status:202});if(init.method==='GET')return new Response(JSON.stringify({jobId:'job_1',status:'succeeded',progress:1,createdAt:1,updatedAt:2,result:{folds:4}}),{status:200});return new Response(null,{status:204});}});
const job=await host.submit(request);assert.equal(job.jobId,'job_1');assert.match(calls[0].url,/v1\/research\/jobs/);
const completed=await host.get('job_1');assert.equal(completed.status,'succeeded');
await host.cancel('job_1');assert.equal(calls[2].init.method,'DELETE');
await assert.rejects(()=>host.submit({...request,dataset:{...request.dataset,objectKey:'https://evil.example/data'}}),/opaque storage key/);
await assert.rejects(()=>host.get('../other'),/job id/);
console.log('CORESPIRIT_LARGE_DATA_RESEARCH_HOST_CONTRACT_OK');