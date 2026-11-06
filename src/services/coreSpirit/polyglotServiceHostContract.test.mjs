import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {CoreSpiritPolyglotRegistry} from './polyglotModules.ts';
import {CoreSpiritIsolatedPolyglotServiceHost} from './polyglotServiceHost.ts';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const artifact=new Uint8Array([9,8,7,6]),digest=await crypto.subtle.digest('SHA-256',artifact);
const version=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
const output={outputs:{y:{dtype:'f64',shape:[1],data:[42]}},checksum:'c'.repeat(64)};
const languages=[['rust','native-rpc'],['cpp','native-rpc'],['julia','native-rpc'],['r','native-rpc'],['onnx','onnx-runtime'],['wasm','wasm']];
for(const [language,transport] of languages){
 const manifest={abiVersion:1,moduleId:'module-'+language,version,language,transport,deterministic:true,stateless:true,exports:['predict'],
   inputs:{x:{dtype:'f64',shape:[1]}},outputs:{y:{dtype:'f64',shape:[1]}},maxInputBytes:1024,maxOutputBytes:1024,maxMemoryBytes:1024*1024,maxSteps:10000,maxLatencyMs:1000};
 const host=new CoreSpiritIsolatedPolyglotServiceHost(language,{baseUrl:'https://runtime.example',serviceSecret:'s'.repeat(32),fetchImpl:async(_url,init)=>init.method==='PUT'?new Response(null,{status:204}):new Response(JSON.stringify(output),{status:200,headers:{'content-type':'application/json'}})});
 await host.loadModule(manifest,artifact);
 const registry=new CoreSpiritPolyglotRegistry();registry.register(manifest,host);
 const result=await registry.execute({requestId:'r-'+language,moduleId:manifest.moduleId,version,exportName:'predict',
   context:{runId:'run',symbol:'NIFTY',timeframe:'5m',barIndex:3,timestamp:3,confirmed:true,deterministicSeed:'seed'},
   inputs:{x:{dtype:'f64',shape:[1],data:[1]}}});
 assert.deepEqual(result,output);
}
console.log('CORESPIRIT_POLYGLOT_REMOTE_HOSTS_CONTRACT_OK');