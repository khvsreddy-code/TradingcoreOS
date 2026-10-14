/**
 * Revisioned half-open range patches shared by market-data and indicator-output consumers.
 * from/to are zero-based absolute-history indices for datasetRevision, never viewport offsets;
 * to is exclusive. Structural history changes increment datasetRevision. outputRevision is
 * monotonic within streamId. Empty replace-range is a no-op; remove-range carries no values.
 */
export type RangePatchOperation = 'replace-range' | 'append' | 'prepend' | 'remove-range' | 'full-refresh';
export interface RangePatch<T> {
  streamId:string; datasetRevision:number; outputRevision:number;
  indexSpace:'absolute-history'; from:number; to:number;
  operation:RangePatchOperation; values:readonly T[];
}
export interface RangePatchStamp { streamId:string; datasetRevision:number; outputRevision:number; }
export interface RangePatchContext extends RangePatchStamp { fullRefreshThreshold?:number; }
const validRevision=(n:number):boolean=>Number.isSafeInteger(n)&&n>=0;
const validIndex=(n:number):boolean=>Number.isSafeInteger(n)&&n>=0;
const equalAt=<T>(a:readonly T[],b:readonly T[],i:number,eq:(x:T,y:T)=>boolean)=>i<a.length&&i<b.length&&eq(a[i]!,b[i]!);

function makePatch<T>(c:RangePatchContext,from:number,to:number,operation:RangePatchOperation,values:readonly T[]):RangePatch<T>{
 if(!c.streamId.trim())throw new TypeError('Range patch requires a non-empty streamId.');
 if(!validRevision(c.datasetRevision)||!validRevision(c.outputRevision))throw new RangeError('Range patch revisions must be non-negative safe integers.');
 if(!validIndex(from)||!validIndex(to)||to<from)throw new RangeError('Range patch must use non-negative half-open index bounds.');
 if(operation==='replace-range'&&values.length!==to-from)throw new RangeError('replace-range values must exactly cover [from,to).');
 if(operation==='append'&&from+values.length!==to)throw new RangeError('append values must cover [from,to).');
 if(operation==='prepend'&&(from!==0||values.length!==to))throw new RangeError('prepend values must cover [0,to).');
 if(operation==='remove-range'&&(values.length!==0||from===to))throw new RangeError('remove-range requires empty values and a non-empty range.');
 if(operation==='full-refresh'&&(from!==0||to!==values.length))throw new RangeError('full-refresh must cover the complete resulting history.');
 return Object.freeze({...c,indexSpace:'absolute-history' as const,from,to,operation,values:Object.freeze([...values])});
}

/** Build the smallest safe changed span; untrusted structural edits explicitly use full-refresh. */
export function createRangePatch<T>(previous:readonly T[],next:readonly T[],context:RangePatchContext,equals:(a:T,b:T)=>boolean=Object.is):RangePatch<T>{
 const threshold=Math.min(1,Math.max(0.5,context.fullRefreshThreshold??0.8));
 if(previous.length===next.length){
  let from=0;while(from<next.length&&equalAt(previous,next,from,equals))from++;
  if(from===next.length)return makePatch(context,from,from,'replace-range',[]);
  let end=next.length;while(end>from&&equalAt(previous,next,end-1,equals))end--;
  if((end-from)/Math.max(1,next.length)>=threshold)return makePatch(context,0,next.length,'full-refresh',next);
  return makePatch(context,from,end,'replace-range',next.slice(from,end));
 }
 if(next.length>previous.length){
  const added=next.length-previous.length;
  if(previous.every((v,i)=>equals(v,next[i]!)))return makePatch(context,previous.length,next.length,'append',next.slice(previous.length));
  if(previous.every((v,i)=>equals(v,next[i+added]!)))return makePatch(context,0,added,'prepend',next.slice(0,added));
 }else{
  if(next.every((v,i)=>equals(v,previous[i]!)))return makePatch(context,next.length,previous.length,'remove-range',[]);
  if(next.length===0)return makePatch(context,0,previous.length,'remove-range',[]);
 }
 return makePatch(context,0,next.length,'full-refresh',next);
}

export function applyRangePatch<T>(current:readonly T[],patch:RangePatch<T>):T[]{
 const next=[...current];
 switch(patch.operation){
  case'replace-range':
   if(patch.from>next.length||patch.to>next.length)throw new RangeError('replace-range is outside retained series.');
   next.splice(patch.from,patch.to-patch.from,...patch.values);break;
  case'append':
   if(patch.from!==next.length)throw new RangeError('append start must equal current series length.');
   next.push(...patch.values);break;
  case'prepend':next.splice(0,0,...patch.values);break;
  case'remove-range':
   if(patch.to>next.length)throw new RangeError('remove-range is outside retained series.');
   next.splice(patch.from,patch.to-patch.from);break;
  case'full-refresh':return [...patch.values];
 }
 return next;
}

export class RangePatchRevisionGate{
 private readonly accepted=new Map<string,RangePatchStamp>();
 apply<T>(current:readonly T[],patch:RangePatch<T>,currentDatasetRevision:number):{accepted:boolean;values:T[]}{
  if(!validRevision(currentDatasetRevision)||patch.indexSpace!=='absolute-history'||patch.datasetRevision!==currentDatasetRevision
    ||!validRevision(patch.datasetRevision)||!validRevision(patch.outputRevision)||!patch.streamId.trim())
   return {accepted:false,values:[...current]};
  const prev=this.accepted.get(patch.streamId);
  if(prev&&(patch.datasetRevision<prev.datasetRevision||patch.outputRevision<=prev.outputRevision))
   return {accepted:false,values:[...current]};
  const values=applyRangePatch(current,patch);
  this.accepted.set(patch.streamId,{streamId:patch.streamId,datasetRevision:patch.datasetRevision,outputRevision:patch.outputRevision});
  return {accepted:true,values};
 }
}
