import type {CoreSpiritModuleResourceLimits} from './coreSpiritModuleSystem';
/** Host-owned per-invocation budget accounting. Call charge* at every host boundary. */
export type CoreSpiritResourceUsage=Readonly<{cpuBudgetMs:number;memoryBytes:number;outputBytes:number;collectionItems:number;recursionDepth:number;drawingObjects:number;historicalLookback:number;calls:number}>;
export class CoreSpiritExecutionGovernor {
 private cpuBudgetMs=0;private memoryBytes=0;private outputBytes=0;private collectionItems=0;private recursionDepth=0;private drawingObjects=0;private historicalLookback=0;private calls=0;
 private readonly startedAt:number;private readonly controller=new AbortController();private readonly timer:ReturnType<typeof setTimeout>;
 private disposed=false;
 readonly signal:AbortSignal;
 constructor(private readonly limits:CoreSpiritModuleResourceLimits, parentSignal?:AbortSignal, now:()=>number=()=>Date.now()){
  this.startedAt=now();this.signal=this.controller.signal;
  this.timer=setTimeout(()=>this.abort(new Error('CoreSpirit execution timeout exceeded.')),limits.timeoutMs);
  if(parentSignal){if(parentSignal.aborted)this.abort(parentSignal.reason);else parentSignal.addEventListener('abort',()=>this.abort(parentSignal.reason),{once:true});}
 }
 private ensureActive(){if(this.disposed)throw new Error('CoreSpirit execution governor is disposed.');if(this.signal.aborted)throw this.signal.reason instanceof Error?this.signal.reason:new Error('CoreSpirit execution cancelled.');}
 private charge(field:keyof CoreSpiritResourceUsage,amount:number,max:number,label:string){
  this.ensureActive();if(!Number.isSafeInteger(amount)||amount<0)throw new Error('Invalid resource charge for '+label+'.');
  const next=this[field]+amount;if(next>max)throw new Error('CoreSpirit '+label+' budget exceeded.');this[field]=next;
 }
 chargeCpu(milliseconds:number){this.charge('cpuBudgetMs',milliseconds,this.limits.cpuBudgetMs,'CPU');}
 chargeMemory(bytes:number){this.charge('memoryBytes',bytes,this.limits.memoryBudgetBytes,'memory');}
 chargeOutput(bytes:number){this.charge('outputBytes',bytes,this.limits.maxOutputBytes,'output size');}
 chargeCollection(items:number){this.charge('collectionItems',items,this.limits.maxCollectionSize,'collection size');}
 enterRecursion(){this.charge('recursionDepth',1,this.limits.maxRecursionDepth,'recursion depth');}
 leaveRecursion(){this.ensureActive();this.recursionDepth=Math.max(0,this.recursionDepth-1);}
 chargeDrawingObjects(count:number){this.charge('drawingObjects',count,this.limits.maxDrawingObjects,'drawing object');}
 chargeHistoricalLookback(bars:number){this.charge('historicalLookback',bars,this.limits.maxHistoricalLookback,'historical lookback');}
 chargeCall(count=1){this.charge('calls',count,this.limits.maxCalls,'host call');}
 abort(reason:unknown=new Error('CoreSpirit execution cancelled.')){if(!this.signal.aborted)this.controller.abort(reason);}
 snapshot():CoreSpiritResourceUsage{return Object.freeze({cpuBudgetMs:this.cpuBudgetMs,memoryBytes:this.memoryBytes,outputBytes:this.outputBytes,collectionItems:this.collectionItems,recursionDepth:this.recursionDepth,drawingObjects:this.drawingObjects,historicalLookback:this.historicalLookback,calls:this.calls});}
 elapsedMs(now:()=>number=()=>Date.now()){return Math.max(0,now()-this.startedAt);}
 dispose(){if(this.disposed)return;this.disposed=true;clearTimeout(this.timer);}
}
