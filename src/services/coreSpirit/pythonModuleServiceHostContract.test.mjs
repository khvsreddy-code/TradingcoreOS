import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {CoreSpiritPythonModuleServiceHost} from './pythonModuleServiceHost.ts';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const bytes=new Uint8Array([1,2,3,4]);
const digest=await crypto.subtle.digest('SHA-256',bytes);
const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
const manifest={abiVersion:1,moduleId:'python-features',version:hash,language:'python',transport:'host',deterministic:true,stateless:true,exports:['predict'],
 dependencies:[{name:'numpy',version:'2.1.0',artifactHash:'a'.repeat(64)}],
 inputs:{x:{dtype:'f64',shape:[1]}},outputs:{y:{dtype:'f64',shape:[1]}},maxInputBytes:1024,maxOutputBytes:1024,maxMemoryBytes:1024*1024,maxSteps:10000,maxLatencyMs:1000};
const calls=[];
const host=new CoreSpiritPythonModuleServiceHost({baseUrl:'https://python.example/api',serviceSecret:'s'.repeat(32),fetchImpl:async(url,init)=>{calls.push({url:String(url),init});return new Response('',{status:204});}});
await host.loadModule(manifest,bytes,{schemaVersion:1,packages:manifest.dependencies});
assert.match(calls[0].url,/python-features/);
assert.equal(calls[0].init.method,'PUT');
assert.equal(calls[0].init.headers['x-dependency-lock']!==undefined,true);
await assert.rejects(()=>host.loadModule({...manifest,version:'f'.repeat(64)},bytes,{schemaVersion:1,packages:manifest.dependencies}),/artifact hash/);
assert.throws(()=>new CoreSpiritPythonModuleServiceHost({baseUrl:'http://python.example',serviceSecret:'s'.repeat(32)}),/HTTPS/);
let signalSeen;
const cancellable=new CoreSpiritPythonModuleServiceHost({baseUrl:'https://python.example',serviceSecret:'s'.repeat(32),fetchImpl:(_url,init)=>new Promise((_resolve,reject)=>{signalSeen=init.signal;init.signal.addEventListener('abort',()=>reject(new Error('aborted')));})});
const controller=new AbortController();
const pending=cancellable.invoke(manifest,{requestId:'r',moduleId:manifest.moduleId,version:manifest.version,exportName:'predict',context:{runId:'run',symbol:'NIFTY',timeframe:'5m',barIndex:1,timestamp:1,confirmed:true,deterministicSeed:'seed'},inputs:{x:{dtype:'f64',shape:[1],data:[1]}}},controller.signal);
controller.abort();
await assert.rejects(pending,/aborted/);
assert.equal(signalSeen.aborted,true);
console.log('CORESPIRIT_PYTHON_MODULE_HOST_CONTRACT_OK');