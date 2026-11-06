import type {CoreSpiritPolyglotHost,CoreSpiritPolyglotLanguage,CoreSpiritPolyglotTransport,CoreSpiritPolyglotModuleManifest,CoreSpiritPolyglotRequest,CoreSpiritPolyglotResponse} from './polyglotModules';
import {validateCoreSpiritPolyglotManifest} from './polyglotModules';
export type CoreSpiritIsolatedPolyglotServiceConfig=Readonly<{baseUrl:string;serviceSecret:string;timeoutMs?:number;fetchImpl?:typeof fetch;maxArtifactBytes?:number}>;
function transportFor(language:CoreSpiritPolyglotLanguage):CoreSpiritPolyglotTransport{
  if(language==='python')return 'host';
  if(language==='onnx')return 'onnx-runtime';
  if(language==='wasm')return 'wasm';
  return 'native-rpc';
}
/** Server-only content-addressed host for Rust/C++/Julia/R, ONNX Runtime and WASM worker services. */
export class CoreSpiritIsolatedPolyglotServiceHost implements CoreSpiritPolyglotHost{
  readonly transport:CoreSpiritPolyglotTransport;
  private readonly baseUrl:URL;private readonly secret:string;private readonly fetcher:typeof fetch;private readonly timeoutMs:number;private readonly maxArtifactBytes:number;
  constructor(readonly language:Exclude<CoreSpiritPolyglotLanguage,'python'>,config:CoreSpiritIsolatedPolyglotServiceConfig){
    if(typeof window!=='undefined')throw new Error('Polyglot service credentials are server-only; do not instantiate this host in a browser.');
    const url=new URL(config.baseUrl);
    if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('Polyglot service must use HTTPS outside localhost.');
    if(url.username||url.password||url.search||url.hash)throw new Error('Polyglot service URL cannot contain credentials, query or fragment.');
    if(!config.serviceSecret||config.serviceSecret.length<16)throw new Error('Polyglot service secret is missing or too short.');
    url.pathname = url.pathname.replace(/\/+$/, '') + '/';
    this.baseUrl=url;this.secret=config.serviceSecret;this.fetcher=config.fetchImpl??fetch;this.transport=transportFor(language);
    this.timeoutMs=config.timeoutMs??8000;if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<100||this.timeoutMs>30_000)throw new Error('Polyglot timeout must be between 100 and 30000 ms.');
    this.maxArtifactBytes=config.maxArtifactBytes??256*1024*1024;
    if(!Number.isSafeInteger(this.maxArtifactBytes)||this.maxArtifactBytes<1||this.maxArtifactBytes>512*1024*1024)throw new Error('Polyglot artifact limit must be between 1 byte and 512 MiB.');
  }
  private async request(path:string,init:RequestInit,signal?:AbortSignal):Promise<Response>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Polyglot service timeout')),this.timeoutMs);
    const abort=()=>controller.abort(signal?.reason??new Error('Polyglot operation cancelled'));
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    try{return await this.fetcher(new URL(path,this.baseUrl).toString(),{...init,signal:controller.signal});}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  async loadModule(manifest:CoreSpiritPolyglotModuleManifest,artifact:Uint8Array,signal?:AbortSignal):Promise<void>{
    validateCoreSpiritPolyglotManifest(manifest);
    if(manifest.language!==this.language||manifest.transport!==this.transport)throw new Error('Polyglot artifact manifest does not match this host.');
    if(!artifact.length||artifact.byteLength>this.maxArtifactBytes)throw new Error('Polyglot artifact exceeds the configured host limit.');
    const artifactBuffer=artifact.buffer.slice(artifact.byteOffset,artifact.byteOffset+artifact.byteLength) as ArrayBuffer;
    const digest=await crypto.subtle.digest('SHA-256',artifactBuffer);
    const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==manifest.version)throw new Error('Polyglot artifact bytes do not match the declared SHA-256 identity.');
    const response=await this.request('v1/modules/'+encodeURIComponent(manifest.moduleId)+'/'+encodeURIComponent(manifest.version),{
      method:'PUT',headers:{authorization:'Bearer '+this.secret,'content-type':'application/octet-stream',
        'x-corespirit-abi':'1','x-corespirit-language':this.language,'x-corespirit-transport':this.transport,
        'x-module-manifest':JSON.stringify(manifest)},body:artifact as unknown as BodyInit,
    },signal);
    if(!response.ok)throw new Error('Polyglot module registration failed with HTTP '+response.status+'.');
  }
  async invoke(manifest:CoreSpiritPolyglotModuleManifest,request:CoreSpiritPolyglotRequest,signal?:AbortSignal):Promise<CoreSpiritPolyglotResponse>{
    validateCoreSpiritPolyglotManifest(manifest);
    if(manifest.language!==this.language||manifest.transport!==this.transport)throw new Error('Polyglot request manifest does not match this host.');
    const response=await this.request('v1/modules/execute',{method:'POST',headers:{authorization:'Bearer '+this.secret,
      'content-type':'application/json','x-corespirit-abi':'1','x-corespirit-language':this.language,
      'x-corespirit-transport':this.transport,'x-request-id':request.requestId},body:JSON.stringify({manifest,request})},signal);
    if(!response.ok)throw new Error('Polyglot service returned HTTP '+response.status+'.');
    const raw=await response.text();
    if(new TextEncoder().encode(raw).byteLength>manifest.maxOutputBytes+64*1024)throw new Error('Polyglot response exceeds the ABI output envelope.');
    let body:CoreSpiritPolyglotResponse;try{body=JSON.parse(raw) as CoreSpiritPolyglotResponse;}catch{throw new Error('Polyglot service returned malformed JSON.');}
    if(!body||typeof body!=='object'||!body.outputs||typeof body.checksum!=='string')throw new Error('Polyglot service returned an invalid ABI response.');
    return body;
  }
}
