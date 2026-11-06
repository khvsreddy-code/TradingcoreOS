export type CoreSpiritResearchDatasetRef=Readonly<{datasetId:string;objectKey:string;sha256:string;rows:number;symbol:string;timeframe:string;featureNames:readonly string[];targetName:string}>;
export type CoreSpiritResearchJobRequest=Readonly<{dataset:CoreSpiritResearchDatasetRef;walkForward:Readonly<{trainBars:number;validationBars:number;testBars:number;stepBars:number;purgeBars?:number;embargoBars?:number;maxFolds?:number}>;algorithm:'ridge-regression'|'gaussian-hmm';parameters:Readonly<Record<string,number|string|boolean>>}>;
export type CoreSpiritResearchJob=Readonly<{jobId:string;status:'queued'|'running'|'succeeded'|'failed'|'cancelled';progress:number;createdAt:number;updatedAt:number;result?:Readonly<Record<string,unknown>>;error?:string}>;
export type CoreSpiritResearchServiceConfig=Readonly<{baseUrl:string;serviceSecret:string;timeoutMs?:number;fetchImpl?:typeof fetch}>;
/** Server-only research control plane. Large columnar data is referenced by opaque storage key, never uploaded through the chart thread. */
export class CoreSpiritResearchServiceHost{
  private readonly baseUrl:URL;private readonly secret:string;private readonly fetcher:typeof fetch;private readonly timeoutMs:number;
  constructor(config:CoreSpiritResearchServiceConfig){
    if(typeof window!=='undefined')throw new Error('Research service credentials are server-only.');
    const url=new URL(config.baseUrl);
    if(url.protocol!=='https:'&&url.hostname!=='localhost'&&url.hostname!=='127.0.0.1')throw new Error('Research service must use HTTPS outside localhost.');
    if(url.username||url.password||url.search||url.hash)throw new Error('Research service URL cannot contain credentials, query or fragment.');
    if(!config.serviceSecret||config.serviceSecret.length<16)throw new Error('Research service secret is missing or too short.');
    url.pathname=url.pathname.replace(/\/+$/,'')+'/';this.baseUrl=url;this.secret=config.serviceSecret;this.fetcher=config.fetchImpl??fetch;
    this.timeoutMs=config.timeoutMs??10_000;if(!Number.isSafeInteger(this.timeoutMs)||this.timeoutMs<100||this.timeoutMs>30_000)throw new Error('Research control-plane timeout must be between 100 and 30000 ms.');
  }
  private async request(path:string,init:RequestInit,signal?:AbortSignal):Promise<Response>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Research service timeout')),this.timeoutMs);
    const abort=()=>controller.abort(signal?.reason??new Error('Research request cancelled'));
    if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
    try{return await this.fetcher(new URL(path,this.baseUrl).toString(),{...init,signal:controller.signal});}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
  private validateRequest(input:CoreSpiritResearchJobRequest):void{
    const d=input.dataset;
    if(!d.datasetId||!d.objectKey||d.objectKey.length>512||d.objectKey.startsWith('/')||d.objectKey.includes('..')||d.objectKey.includes('://')||/[\\u0000-\\u001f]/.test(d.objectKey))throw new Error('Research dataset reference must be an opaque storage key.');
    if(!/^[a-f0-9]{64}$/.test(d.sha256)||!Number.isSafeInteger(d.rows)||d.rows<3||d.rows>2_000_000)throw new Error('Research dataset checksum or row count is invalid.');
    if(!d.symbol||!d.timeframe||!d.targetName||!d.featureNames.length||d.featureNames.length>64||new Set(d.featureNames).size!==d.featureNames.length||d.featureNames.includes(d.targetName))throw new Error('Research dataset feature schema is invalid or leaks the target into its features.');
    for(const name of d.featureNames)if(!name.trim())throw new Error('Research feature names cannot be empty.');
    const w=input.walkForward;
    for(const key of ['trainBars','validationBars','testBars','stepBars'] as const)if(!Number.isSafeInteger(w[key])||w[key]<=0)throw new Error('Walk-forward '+key+' must be a positive integer.');
    if(!Number.isSafeInteger(w.purgeBars??0)||(w.purgeBars??0)<0||!Number.isSafeInteger(w.embargoBars??0)||(w.embargoBars??0)<0||!Number.isSafeInteger(w.maxFolds??256)||(w.maxFolds??256)<1||(w.maxFolds??256)>256)throw new Error('Research purge, embargo or fold cap is invalid.');
    if(w.trainBars+w.validationBars+w.testBars+(w.purgeBars??0)*2+(w.embargoBars??0)*2>d.rows)throw new Error('Research dataset is too short for the requested fold window.');
  }
  async submit(input:CoreSpiritResearchJobRequest,signal?:AbortSignal):Promise<CoreSpiritResearchJob>{
    this.validateRequest(input);
    const response=await this.request('v1/research/jobs',{method:'POST',headers:{authorization:'Bearer '+this.secret,'content-type':'application/json','x-corespirit-research-abi':'1'},body:JSON.stringify(input)},signal);
    if(!response.ok)throw new Error('Research job submission failed with HTTP '+response.status+'.');
    const job=await response.json() as CoreSpiritResearchJob;
    if(!job||typeof job.jobId!=='string'||!job.jobId||!['queued','running','succeeded','failed','cancelled'].includes(job.status)||!Number.isFinite(job.progress)||job.progress<0||job.progress>1)throw new Error('Research service returned an invalid job envelope.');
    return job;
  }
  async get(jobId:string,signal?:AbortSignal):Promise<CoreSpiritResearchJob>{
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(jobId))throw new Error('Research job id is invalid.');
    const response=await this.request('v1/research/jobs/'+encodeURIComponent(jobId),{method:'GET',headers:{authorization:'Bearer '+this.secret,'x-corespirit-research-abi':'1'}},signal);
    if(!response.ok)throw new Error('Research job lookup failed with HTTP '+response.status+'.');
    const job=await response.json() as CoreSpiritResearchJob;
    if(!job||job.jobId!==jobId||!['queued','running','succeeded','failed','cancelled'].includes(job.status)||!Number.isFinite(job.progress)||job.progress<0||job.progress>1)throw new Error('Research service returned an invalid job envelope.');
    return job;
  }
  async cancel(jobId:string,signal?:AbortSignal):Promise<void>{
    if(!/^[a-zA-Z0-9_-]{1,128}$/.test(jobId))throw new Error('Research job id is invalid.');
    const response=await this.request('v1/research/jobs/'+encodeURIComponent(jobId),{method:'DELETE',headers:{authorization:'Bearer '+this.secret,'x-corespirit-research-abi':'1'}},signal);
    if(!response.ok&&response.status!==404)throw new Error('Research job cancellation failed with HTTP '+response.status+'.');
  }
}
