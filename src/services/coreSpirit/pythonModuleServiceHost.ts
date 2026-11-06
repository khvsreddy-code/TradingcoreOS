import type {CoreSpiritPolyglotHost,CoreSpiritPolyglotModuleManifest,CoreSpiritPolyglotRequest,CoreSpiritPolyglotResponse} from './polyglotModules';
export type CoreSpiritPythonModuleServiceConfig=Readonly<{baseUrl:string;serviceSecret:string;timeoutMs?:number;fetchImpl?:typeof fetch}>;
/** Remote isolated Python executor. It sends only the declared ABI payload, never source code or local credentials. */
export class CoreSpiritPythonModuleServiceHost implements CoreSpiritPolyglotHost{
  readonly language='python' as const;readonly transport='host' as const;
  private readonly fetcher:typeof fetch;private readonly timeoutMs:number;private readonly endpoint:string;
  constructor(config:CoreSpiritPythonModuleServiceConfig){
    const url=new URL(config.baseUrl);
    if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('Python module service must use HTTPS outside localhost.');
    if(!config.serviceSecret||config.serviceSecret.length<16)throw new Error('Python module service secret is missing or too short.');
    this.endpoint=new URL('/v1/modules/execute',url).toString();this.fetcher=config.fetchImpl??fetch;
    this.timeoutMs=config.timeoutMs??8000;if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<100||this.timeoutMs>30_000)throw new Error('Python module service timeout must be between 100 and 30000 ms.');
    this.secret=config.serviceSecret;
  }
  private readonly secret:string;
  async invoke(manifest:CoreSpiritPolyglotModuleManifest,request:CoreSpiritPolyglotRequest):Promise<CoreSpiritPolyglotResponse>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const response=await this.fetcher(this.endpoint,{method:'POST',signal:controller.signal,
        headers:{'content-type':'application/json','authorization':'Bearer '+this.secret,'x-corespirit-abi':'1','x-request-id':request.requestId},
        body:JSON.stringify({manifest,request})});
      if(!response.ok)throw new Error('Python module service returned HTTP '+response.status+'.');
      const body=await response.json() as CoreSpiritPolyglotResponse;
      if(!body||typeof body!=='object'||!body.outputs||typeof body.checksum!=='string')throw new Error('Python module service returned an invalid ABI response.');
      return body;
    }finally{clearTimeout(timer);}
  }
}
