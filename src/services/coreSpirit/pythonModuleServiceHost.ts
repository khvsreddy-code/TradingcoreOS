import type {CoreSpiritPolyglotHost,CoreSpiritPolyglotModuleManifest,CoreSpiritPolyglotRequest,CoreSpiritPolyglotResponse,CoreSpiritPolyglotDependency} from './polyglotModules';
import {validateCoreSpiritPolyglotManifest} from './polyglotModules';
export type CoreSpiritPythonModuleServiceConfig=Readonly<{baseUrl:string;serviceSecret:string;timeoutMs?:number;fetchImpl?:typeof fetch}>;
export type CoreSpiritPythonDependencyLock=Readonly<{schemaVersion:1;packages:readonly CoreSpiritPolyglotDependency[]}>;
function validateDependencyLock(lock:CoreSpiritPythonDependencyLock):void{
  if(lock.schemaVersion!==1||!Array.isArray(lock.packages)||lock.packages.length>256)throw new Error('Python dependency lock is invalid or exceeds 256 packages.');
  const names=new Set<string>();
  for(const item of lock.packages){
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(item.name)||names.has(item.name))throw new Error('Python dependency names must be unique and normalized.');
    if(!/^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$/.test(item.version))throw new Error('Python dependencies must use exact pinned versions.');
    if(!/^[a-f0-9]{64}$/.test(item.artifactHash))throw new Error('Python dependency artifacts require SHA-256 hashes.');
    names.add(item.name);
  }
}
/** Remote isolated Python executor/loader. The Python service owns sandboxing and package installation. */
export class CoreSpiritPythonModuleServiceHost implements CoreSpiritPolyglotHost{
  readonly language='python' as const;readonly transport='host' as const;
  private readonly fetcher:typeof fetch;private readonly timeoutMs:number;private readonly baseUrl:URL;private readonly secret:string;
  constructor(config:CoreSpiritPythonModuleServiceConfig){
    if (typeof window !== 'undefined') throw new Error('Python module service credentials are server-only; do not instantiate this host in a browser.');
    const url=new URL(config.baseUrl);
    if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('Python module service must use HTTPS outside localhost.');
    if(!config.serviceSecret||config.serviceSecret.length<16)throw new Error('Python module service secret is missing or too short.');
    if(url.username||url.password||url.search||url.hash)throw new Error('Python module service URL cannot contain credentials, query or fragment.');
    this.baseUrl=url;this.fetcher=config.fetchImpl??fetch;this.secret=config.serviceSecret;
    this.timeoutMs=config.timeoutMs??8000;if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<100||this.timeoutMs>30_000)throw new Error('Python module service timeout must be between 100 and 30000 ms.');
  }
  private endpoint(path:string):string{return new URL(path,this.baseUrl).toString();}
  private async request(path:string,init:RequestInit,signal?:AbortSignal):Promise<Response>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Python module service timeout')),this.timeoutMs);
    const abort=()=>controller.abort(signal?.reason??new Error('Python module operation cancelled'));
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    try{return await this.fetcher(this.endpoint(path),{...init,signal:controller.signal});}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  /** Register a content-addressed module package; the service must verify dependencies and sandbox it. */
  async loadModule(manifest:CoreSpiritPolyglotModuleManifest,packageBytes:Uint8Array,dependencyLock:CoreSpiritPythonDependencyLock,signal?:AbortSignal):Promise<void>{
    validateCoreSpiritPolyglotManifest(manifest);validateDependencyLock(dependencyLock);
    if(manifest.language!=='python'||manifest.transport!=='host')throw new Error('Python loader accepts Python host modules only.');
    if(!packageBytes.length||packageBytes.byteLength>64*1024*1024)throw new Error('Python module package must be between 1 byte and 64 MiB.');
    const digest=await crypto.subtle.digest('SHA-256',packageBytes);
    const actualHash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    if(actualHash!==manifest.version)throw new Error('Python package bytes do not match the declared module artifact hash.');
    if(JSON.stringify(dependencyLock.packages)!==JSON.stringify(manifest.dependencies??[]))throw new Error('Python dependency lock does not match the registered module manifest.');
    const response=await this.request('v1/modules/'+encodeURIComponent(manifest.moduleId)+'/'+encodeURIComponent(manifest.version),{
      method:'PUT',headers:{'authorization':'Bearer '+this.secret,'content-type':'application/octet-stream',
        'x-corespirit-abi':'1','x-module-manifest':JSON.stringify(manifest),'x-dependency-lock':JSON.stringify(dependencyLock)},
      body:packageBytes as unknown as BodyInit,
    },signal);
    if(!response.ok)throw new Error('Python module registration failed with HTTP '+response.status+'.');
  }
  async invoke(manifest:CoreSpiritPolyglotModuleManifest,request:CoreSpiritPolyglotRequest,signal?:AbortSignal):Promise<CoreSpiritPolyglotResponse>{
    validateCoreSpiritPolyglotManifest(manifest);
    if(manifest.language!=='python'||manifest.transport!=='host')throw new Error('Python executor received a non-Python manifest.');
    const response=await this.request('v1/modules/execute',{method:'POST',headers:{'content-type':'application/json',
      'authorization':'Bearer '+this.secret,'x-corespirit-abi':'1','x-request-id':request.requestId},
      body:JSON.stringify({manifest,request})},signal);
    if(!response.ok)throw new Error('Python module service returned HTTP '+response.status+'.');
    const body=await response.json() as CoreSpiritPolyglotResponse;
    if(!body||typeof body!=='object'||!body.outputs||typeof body.checksum!=='string')throw new Error('Python module service returned an invalid ABI response.');
    return body;
  }
}
