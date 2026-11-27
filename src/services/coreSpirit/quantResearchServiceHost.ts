export type CoreSpiritResearchDatasetProvenance=Readonly<{
  provider:string;
  instrumentId:string;
  exchangeTimezone:string;
  timestampConvention:'bar-open'|'bar-close'|'event-time';
  dataArrivalAtMs:number;
  dataRevision:string;
  missingIntervals:number;
  qualityStatus:'verified'|'degraded'|'incomplete'|'unknown';
  historicalAvailability:Readonly<{fromMs:number;toMs:number}>;
}>;
export type CoreSpiritResearchPointInTimeSchema=Readonly<{
  decisionTimestampColumn:string;
  confirmedColumn:string;
  phaseColumn:string;
  availabilityColumns:Readonly<Record<string,string>>;
  availabilityRule:'availableAt<=timestamp';
}>;
export type CoreSpiritResearchDatasetRef=Readonly<{
  datasetId:string;objectKey:string;sha256:string;rows:number;symbol:string;timeframe:string;
  featureNames:readonly string[];targetName:string;
  provenance:CoreSpiritResearchDatasetProvenance;
  pointInTime:CoreSpiritResearchPointInTimeSchema;
}>;
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
    if(!d.datasetId||d.datasetId.length>128||!d.objectKey||d.objectKey.length>512||d.objectKey.startsWith('/')||d.objectKey.includes('..')||d.objectKey.includes('://')||/[\u0000-\u001f]/.test(d.objectKey))throw new Error('Research dataset reference must be an opaque storage key.');
    if(!/^[a-f0-9]{64}$/.test(d.sha256)||!Number.isSafeInteger(d.rows)||d.rows<3||d.rows>2_000_000)throw new Error('Research dataset checksum or row count is invalid.');
    if(!d.symbol||d.symbol.length>128||!d.timeframe||d.timeframe.length>32||!d.targetName||!d.featureNames.length||d.featureNames.length>64||new Set(d.featureNames).size!==d.featureNames.length||d.featureNames.includes(d.targetName))throw new Error('Research dataset feature schema is invalid or leaks the target into its features.');
    const fieldName=/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;
    for(const name of d.featureNames)if(typeof name!=='string'||!fieldName.test(name))throw new Error('Research feature names must be normalized identifiers.');
    if(!fieldName.test(d.targetName))throw new Error('Research target name must be a normalized identifier.');

    const provenance=d.provenance;
    if(!provenance||typeof provenance.provider!=='string'||!/^[A-Za-z0-9._-]{1,64}$/.test(provenance.provider)||
      typeof provenance.instrumentId!=='string'||!provenance.instrumentId.trim()||provenance.instrumentId.length>160||
      typeof provenance.exchangeTimezone!=='string'||!provenance.exchangeTimezone.trim()||
      !['bar-open','bar-close','event-time'].includes(provenance.timestampConvention)||
      !Number.isSafeInteger(provenance.dataArrivalAtMs)||provenance.dataArrivalAtMs<0||
      typeof provenance.dataRevision!=='string'||!provenance.dataRevision.trim()||provenance.dataRevision.length>128||
      !Number.isSafeInteger(provenance.missingIntervals)||provenance.missingIntervals<0||provenance.missingIntervals>d.rows||
      !['verified','degraded','incomplete','unknown'].includes(provenance.qualityStatus)) {
      throw new Error('Research dataset provenance must identify its provider, instrument, timezone, timestamp convention, arrival time, revision and quality.');
    }
    try { new Intl.DateTimeFormat('en-US',{timeZone:provenance.exchangeTimezone}); }
    catch { throw new Error('Research dataset exchangeTimezone must be a valid IANA timezone.'); }
    const availability=provenance.historicalAvailability;
    if(!availability||!Number.isSafeInteger(availability.fromMs)||!Number.isSafeInteger(availability.toMs)||
      availability.fromMs<0||availability.fromMs>=availability.toMs) {
      throw new Error('Research dataset historical availability range is invalid.');
    }
    const temporal=d.pointInTime;
    if(!temporal||!fieldName.test(temporal.decisionTimestampColumn)||!fieldName.test(temporal.confirmedColumn)||
      !fieldName.test(temporal.phaseColumn)||temporal.availabilityRule!=='availableAt<=timestamp') {
      throw new Error('Research point-in-time schema must declare decision time, confirmation, phase and availableAt<=timestamp semantics.');
    }
    const availabilityNames=Object.keys(temporal.availabilityColumns??{}).sort();
    const features=[...d.featureNames].sort();
    if(availabilityNames.length!==features.length||availabilityNames.some((name,index)=>name!==features[index])) {
      throw new Error('Every research feature must have its own explicit availability timestamp column.');
    }
    const availabilityColumns=Object.values(temporal.availabilityColumns);
    if(availabilityColumns.some(name=>typeof name!=='string'||!fieldName.test(name))||
      new Set(availabilityColumns).size!==availabilityColumns.length) {
      throw new Error('Research feature availability columns must be valid and unique.');
    }
    if([temporal.decisionTimestampColumn,temporal.confirmedColumn,temporal.phaseColumn].some(name=>availabilityColumns.includes(name))) {
      throw new Error('Research control columns cannot be reused as feature availability columns.');
    }

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
