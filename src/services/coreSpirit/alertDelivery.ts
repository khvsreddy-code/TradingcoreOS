/** Host-owned, durable, idempotent alert outbox. The VM never performs network delivery. */
export type CoreSpiritAlertFrequency='all'|'once-per-bar'|'once-per-bar-close'|'once';
export type CoreSpiritAlertEvent=Readonly<{id:string;scriptId:string;scriptRevision:string;symbol:string;timeframe:string;barIndex:number;barTimestamp:number;confirmed:boolean;replay:boolean;message:string;frequency:CoreSpiritAlertFrequency;createdAt:number}>;
export type CoreSpiritAlertOutboxRecord=Readonly<{key:string;event:CoreSpiritAlertEvent;status:'pending'|'delivering'|'delivered'|'failed';attempts:number;nextAttemptAt:number;leaseUntil?:number;lastError?:string}>;
/** claimPending must atomically lease records across all workers/processes and reclaim expired leases. */
export interface CoreSpiritAlertOutboxStore{
  putIfAbsent(record:CoreSpiritAlertOutboxRecord):Promise<boolean>;
  claimPending(now:number,limit:number,leaseMs:number):Promise<readonly CoreSpiritAlertOutboxRecord[]>;
  update(record:CoreSpiritAlertOutboxRecord):Promise<void>;
}
export type CoreSpiritAlertDelivery=(event:CoreSpiritAlertEvent,idempotencyKey:string)=>Promise<void>;
export class CoreSpiritAlertRuntime{
  constructor(private readonly store:CoreSpiritAlertOutboxStore,private readonly deliver:CoreSpiritAlertDelivery,
    private readonly maxAttempts=5,private readonly baseRetryMs=1000,private readonly leaseMs=30_000){
    if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>20||!Number.isFinite(baseRetryMs)||baseRetryMs<100||
       !Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>300_000)throw new Error('Alert retry/lease policy is invalid.');
  }
  async enqueue(input:CoreSpiritAlertEvent):Promise<boolean>{
    if(!input.id||!input.scriptId||!input.scriptRevision||!input.symbol||!input.timeframe||!Number.isSafeInteger(input.barIndex)||
       input.barIndex<0||!Number.isFinite(input.barTimestamp)||!input.message.trim()||!Number.isFinite(input.createdAt))throw new Error('Alert event identity or payload is invalid.');
    if(input.replay)return false;
    if(input.frequency==='once-per-bar-close'&&!input.confirmed)return false;
    const key=input.frequency==='all'?input.id:[input.scriptId,input.scriptRevision,input.symbol,input.timeframe,
      input.frequency==='once'?'once':String(input.barIndex),input.frequency].join(':');
    return this.store.putIfAbsent(Object.freeze({key,event:Object.freeze({...input}),status:'pending',attempts:0,nextAttemptAt:input.createdAt}));
  }
  async flush(now=Date.now(),limit=100):Promise<Readonly<{delivered:number;retried:number;failed:number}>>{
    if(!Number.isFinite(now)||!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new Error('Alert flush bounds are invalid.');
    const records=await this.store.claimPending(now,limit,this.leaseMs);let delivered=0,retried=0,failed=0;
    for(const record of records){
      if(record.status!=='delivering')continue;
      try{await this.deliver(record.event,record.key);await this.store.update(Object.freeze({...record,status:'delivered',leaseUntil:undefined,lastError:undefined}));delivered++;}
      catch(error){
        const attempts=record.attempts+1,terminal=attempts>=this.maxAttempts;
        const updated=Object.freeze({...record,status:terminal?'failed' as const:'pending' as const,attempts,leaseUntil:undefined,
          nextAttemptAt:now+this.baseRetryMs*Math.min(64,2**(attempts-1)),lastError:String(error).slice(0,500)});
        await this.store.update(updated);if(terminal)failed++;else retried++;
      }
    }
    return Object.freeze({delivered,retried,failed});
  }
}

export type CoreSpiritRuntimeAlertEvent=Readonly<{scriptId:string;time:number;payload:Readonly<Record<string,unknown>>;sequence?:number}>;
export type CoreSpiritAlertHostContext=Readonly<{scriptRevision:string;symbol:string;timeframe:string;executionMode:'historical'|'realtime'|'replay'|'backtest'|'historicalTick';createdAt:number}>;
/** Convert the VM's buffered script.alert event into a durable outbox envelope. */
export function coreSpiritAlertFromRuntimeEvent(event:CoreSpiritRuntimeAlertEvent,context:CoreSpiritAlertHostContext):CoreSpiritAlertEvent{
  const payload=event.payload??{},execution=(payload.execution&&typeof payload.execution==='object'?payload.execution:{}) as Record<string,unknown>;
  const barIndex=Number(payload.barIndex);
  if(!Number.isSafeInteger(barIndex)||barIndex<0)throw new Error('Runtime alert is missing its canonical bar index.');
  const rawFrequency=String(payload.frequency??'once-per-bar').toLowerCase().replace(/^alert\\.freq_/,'').replaceAll('_','-');
  const frequency:CoreSpiritAlertFrequency=rawFrequency==='all'?'all'
    :rawFrequency==='once'?'once'
    :rawFrequency==='once-per-bar-close'?'once-per-bar-close'
    :rawFrequency==='once-per-bar'?'once-per-bar'
    :(()=>{throw new Error("Unsupported alert frequency '"+rawFrequency+"'.");})();
  const args=Array.isArray(payload.args)?payload.args:[];
  const message=String(payload.message??payload.title??args[0]??'');
  const id=[event.scriptId,context.scriptRevision,context.symbol,context.timeframe,barIndex,event.sequence??message].join(':');
  return Object.freeze({id,scriptId:event.scriptId,scriptRevision:context.scriptRevision,symbol:context.symbol,timeframe:context.timeframe,
    barIndex,barTimestamp:event.time,confirmed:execution.isConfirmed===true||execution.barPhase==='confirmed'||execution.barPhase==='historical',
    replay:context.executionMode!=='realtime',message,frequency,createdAt:context.createdAt});
}
