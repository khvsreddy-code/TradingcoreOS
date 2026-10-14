/**
 * Revisioned half-open range patches for canonical history and indicator output.
 * from/to are zero-based absolute-history indices for datasetRevision (never viewport offsets);
 * to is exclusive. Structural history changes increment datasetRevision. outputRevision is
 * monotonic within streamId. Empty replacement is a no-op; remove-range carries no values.
 */
export type RangePatchOperation = 'replace-range' | 'append' | 'prepend' | 'remove-range' | 'full-refresh';
export interface RangePatch<T> {
  streamId:string; datasetRevision:number; outputRevision:number;
  indexSpace:'absolute-history'; from:number; to:number;
  operation:RangePatchOperation; values:readonly T[];
}
export interface RangePatchStamp { streamId:string; datasetRevision:number; outputRevision:number; }
export interface RangePatchContext extends RangePatchStamp {
  /** Absolute-history half-open interval containing all changed values. */
  dirtyRange?:Readonly<{from:number;to:number}>;
  /** True only when the producer guarantees dirtyRange includes every affected output. */
  incrementalTrusted?:boolean;
  fullRefreshThreshold?:number;
}
const validRevision=(n:number):boolean=>Number.isSafeInteger(n)&&n>=0;
const validIndex=(n:number):boolean=>Number.isSafeInteger(n)&&n>=0;

function makePatch<T>(c:RangePatchContext,from:number,to:number,operation:RangePatchOperation,values:readonly T[]):RangePatch<T>{
 if(!c.streamId.trim())throw new TypeError('Range patch requires a non-empty streamId.');
 if(!validRevision(c.datasetRevision)||!validRevision(c.outputRevision))throw new RangeError('Patch revisions must be non-negative safe integers.');
 if(!validIndex(from)||!validIndex(to)||to<from)throw new RangeError('Patch bounds must be non-negative half-open indices.');
 if(operation==='replace-range'&&values.length!==to-from)throw new RangeError('replace-range values must exactly cover [from,to).');
 if(operation==='append'&&from+values.length!==to)throw new RangeError('append values must cover [from,to).');
 if(operation==='prepend'&&(from!==0||values.length!==to))throw new RangeError('prepend values must cover [0,to).');
 if(operation==='remove-range'&&(values.length!==0||from===to))throw new RangeError('remove-range requires empty values and a non-empty range.');
 if(operation==='full-refresh'&&(from!==0||to!==values.length))throw new RangeError('full-refresh must cover the complete resulting history.');
 return Object.freeze({streamId:c.streamId,datasetRevision:c.datasetRevision,outputRevision:c.outputRevision,indexSpace:'absolute-history' as const,from,to,operation,values:Object.freeze([...values])});
}

/** Scan only a trusted dirty interval; untrusted or structural changes use full refresh. */
export function createRangePatch<T>(previous:readonly T[],next:readonly T[],context:RangePatchContext,equals:(a:T,b:T)=>boolean=Object.is):RangePatch<T>{
 const dirty=context.dirtyRange;
 const trusted=context.incrementalTrusted===true&&dirty!=null&&validIndex(dirty.from)&&validIndex(dirty.to)
  &&dirty.to>=dirty.from&&dirty.to<=next.length&&previous.length===next.length;
 if(!trusted)return makePatch(context,0,next.length,'full-refresh',next);
 let from=dirty.from;while(from<dirty.to&&equals(previous[from]!,next[from]!))from++;
 if(from===dirty.to)return makePatch(context,dirty.from,dirty.from,'replace-range',[]);
 let to=dirty.to;while(to>from&&equals(previous[to-1]!,next[to-1]!))to--;
 const threshold=Math.min(1,Math.max(0.5,context.fullRefreshThreshold??0.8));
 if((to-from)/Math.max(1,next.length)>=threshold)return makePatch(context,0,next.length,'full-refresh',next);
 return makePatch(context,from,to,'replace-range',next.slice(from,to));
}

/** Explicit structural operation with caller-provided absolute-history coordinates. */
export function createStructuralRangePatch<T>(context:RangePatchContext,operation:'append'|'prepend'|'remove-range'|'full-refresh',from:number,to:number,values:readonly T[]=[]):RangePatch<T>{
 return makePatch(context,from,to,operation,values);
}

export function applyRangePatch<T>(current:T[],patch:RangePatch<T>):T[]{
 // Preserve retained storage and unaffected element identities for localized updates.
 switch(patch.operation){
  case'replace-range':
   if(patch.from>current.length||patch.to>current.length)throw new RangeError('replace-range is outside the retained series.');
   if(patch.to-patch.from===patch.values.length){for(let i=0;i<patch.values.length;i++)current[patch.from+i]=patch.values[i]!;}
   else current.splice(patch.from,patch.to-patch.from,...patch.values);
   break;
  case'append':
   if(patch.from!==current.length)throw new RangeError('append start must equal current series length.');
   for(const value of patch.values)current.push(value);break;
  case'prepend':for(let i=patch.values.length-1;i>=0;i--)current.unshift(patch.values[i]!);break;
  case'remove-range':
   if(patch.to>current.length)throw new RangeError('remove-range is outside the retained series.');
   current.splice(patch.from,patch.to-patch.from);break;
  case'full-refresh':current.length=0;for(const value of patch.values)current.push(value);break;
 }
 return current;
}

export class RangePatchRevisionGate{
 private readonly accepted=new Map<string,RangePatchStamp>();
 apply<T>(current:T[],patch:RangePatch<T>,currentDatasetRevision:number):{accepted:boolean;values:T[]}{
  if(!validRevision(currentDatasetRevision)||patch.indexSpace!=='absolute-history'||patch.datasetRevision!==currentDatasetRevision
   ||!validRevision(patch.datasetRevision)||!validRevision(patch.outputRevision)||!patch.streamId.trim())return {accepted:false,values:[...current]};
  const prev=this.accepted.get(patch.streamId);
  if(prev&&(patch.datasetRevision<prev.datasetRevision||patch.outputRevision<=prev.outputRevision))return {accepted:false,values:[...current]};
  const values=applyRangePatch(current,patch);
  this.accepted.set(patch.streamId,{streamId:patch.streamId,datasetRevision:patch.datasetRevision,outputRevision:patch.outputRevision});
  return {accepted:true,values};
 }
}
