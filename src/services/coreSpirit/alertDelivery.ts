/** Host-owned, durable, idempotent alert outbox. The VM never performs network delivery. */
export type CoreSpiritAlertFrequency='all'|'once-per-bar'|'once-per-bar-close';
export type CoreSpiritAlertEventType='alert'|'alertcondition';

/** Canonicalize Pine enum values before runtime frequency gating or outbox admission. */
export function normalizeCoreSpiritAlertFrequency(value:unknown):CoreSpiritAlertFrequency {
  const raw=String(value??'once-per-bar').trim().toLowerCase();
  const withoutPrefix=raw.startsWith('alert.freq_')?raw.slice('alert.freq_'.length):raw;
  const normalized=withoutPrefix.replaceAll('_','-');
  if(normalized==='all'||normalized==='once-per-bar'||normalized==='once-per-bar-close')return normalized;
  throw new Error(`Unsupported Pine alert frequency '${raw}'.`);
}
export type CoreSpiritAlertIdentity=Readonly<{
  programId:string;
  instrumentId:string;
  timeframe:string;
  barId:string;
  eventType:CoreSpiritAlertEventType;
  conditionId:string;
  revision:number;
}>;

/** Length-prefixed canonical identity; the tuple cannot collide through embedded separators. */
export function coreSpiritAlertEventId(identity:CoreSpiritAlertIdentity):string{
  const parts=[identity.programId,identity.instrumentId,identity.timeframe,identity.barId,
    identity.eventType,identity.conditionId,String(identity.revision)];
  return 'core-spirit-alert-v1|'+parts.map(value=>{const part=String(value);return part.length+':'+part;}).join('|');
}

export type CoreSpiritAlertEvent=Readonly<{
  id:string;
  scriptId:string;
  scriptRevision:string;
  programId:string;
  symbol:string;
  instrumentId:string;
  timeframe:string;
  barIndex:number;
  barTimestamp:number;
  barId:string;
  eventType:CoreSpiritAlertEventType;
  conditionId:string;
  conditionTitle?:string;
  revision:number;
  sourceSequence?:number;
  confirmed:boolean;
  replay:boolean;
  message:string;
  frequency:CoreSpiritAlertFrequency;
  createdAt:number;
}>;
export type CoreSpiritAlertOutboxRecord=Readonly<{
  key:string;
  event:CoreSpiritAlertEvent;
  status:'pending'|'delivering'|'delivered'|'failed';
  attempts:number;
  nextAttemptAt:number;
  leaseUntil?:number;
  lastError?:string;
}>;

/** claimPending atomically leases across workers and reclaims expired leases.
 * listRecent returns newest records first and enforces the supplied storage bound.
 */
export interface CoreSpiritAlertOutboxStore{
  putIfAbsent(record:CoreSpiritAlertOutboxRecord):Promise<boolean>;
  claimPending(now:number,limit:number,leaseMs:number):Promise<readonly CoreSpiritAlertOutboxRecord[]>;
  update(record:CoreSpiritAlertOutboxRecord):Promise<void>;
  listRecent(limit:number):Promise<readonly CoreSpiritAlertOutboxRecord[]>;
}
export type CoreSpiritAlertDelivery=(event:CoreSpiritAlertEvent,idempotencyKey:string)=>Promise<void>;

function tupleKey(parts:readonly string[]):string{
  return parts.map(value=>value.length+':'+value).join('|');
}
function outboxKey(event:CoreSpiritAlertEvent):string{
  const scope=[event.programId,event.instrumentId,event.timeframe,event.scriptRevision,event.eventType];
  if(event.frequency==='all'){
    if(!Number.isSafeInteger(event.sourceSequence)||Number(event.sourceSequence)<0)
      throw new Error('alert.freq_all requires a unique host-stamped event sequence.');
    return 'all|'+tupleKey([event.id,String(event.sourceSequence)]);
  }
  // alert() frequency is script-wide: two alert() call sites do not each get a separate
  // once-per-bar allowance. alertcondition() remains scoped to its declaration.
  const declarationScope=event.eventType==='alertcondition'?[...scope,event.conditionId]:scope;
  // Exclude revision so corrected/repeated updates to the same bar cannot refire it.
  return 'bar|'+tupleKey([...declarationScope,event.barId,event.frequency]);
}

export class CoreSpiritAlertRuntime{
  constructor(private readonly store:CoreSpiritAlertOutboxStore,private readonly deliver:CoreSpiritAlertDelivery,
    private readonly maxAttempts=5,private readonly baseRetryMs=1000,private readonly leaseMs=30_000){
    if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>20||!Number.isFinite(baseRetryMs)||baseRetryMs<100||
       !Number.isSafeInteger(leaseMs)||leaseMs<1000||leaseMs>300_000)throw new Error('Alert retry/lease policy is invalid.');
  }

  async enqueue(input:CoreSpiritAlertEvent):Promise<boolean>{
    if(!input||!input.id||!input.scriptId||!input.scriptRevision||!input.programId||!input.symbol||!input.instrumentId||
       !input.timeframe||!input.barId||!input.conditionId||!['alert','alertcondition'].includes(input.eventType)||
       !Number.isSafeInteger(input.barIndex)||input.barIndex<0||!Number.isFinite(input.barTimestamp)||
       !Number.isSafeInteger(input.revision)||input.revision<0||typeof input.message!=='string'||!Number.isFinite(input.createdAt)){
      throw new Error('Alert event identity or payload is invalid.');
    }
    const identity:CoreSpiritAlertIdentity={programId:input.programId,instrumentId:input.instrumentId,timeframe:input.timeframe,
      barId:input.barId,eventType:input.eventType,conditionId:input.conditionId,revision:input.revision};
    if(input.id!==coreSpiritAlertEventId(identity))throw new Error('Alert event ID does not match its deterministic identity tuple.');
    if(!['all','once-per-bar','once-per-bar-close'].includes(input.frequency))throw new Error('Unsupported Pine alert frequency.');
    if(input.eventType==='alertcondition'&&input.frequency!=='once-per-bar-close')
      throw new Error('alertcondition events are indicator declarations and trigger only at bar close.');
    if(input.replay)return false;
    if(input.frequency==='once-per-bar-close'&&!input.confirmed)return false;
    const key=outboxKey(input);
    return this.store.putIfAbsent(Object.freeze({key,event:Object.freeze({...input}),status:'pending',attempts:0,nextAttemptAt:input.createdAt}));
  }

  /** Durable event history, including pending, delivered and failed delivery states. */
  async history(limit=100):Promise<readonly CoreSpiritAlertOutboxRecord[]>{
    if(!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new Error('Alert history limit must be from 1 to 1,000.');
    return this.store.listRecent(limit);
  }

  async flush(now=Date.now(),limit=100):Promise<Readonly<{delivered:number;retried:number;failed:number}>>{
    if(!Number.isFinite(now)||!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new Error('Alert flush bounds are invalid.');
    const records=await this.store.claimPending(now,limit,this.leaseMs);let delivered=0,retried=0,failed=0;
    for(const record of records){
      if(record.status!=='delivering')continue;
      try{
        await this.deliver(record.event,record.key);
        await this.store.update(Object.freeze({...record,status:'delivered',leaseUntil:undefined,lastError:undefined}));
        delivered++;
      }catch(error){
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
export type CoreSpiritAlertHostContext=Readonly<{
  scriptRevision:string;
  symbol:string;
  timeframe:string;
  executionMode:'historical'|'realtime'|'replay'|'backtest'|'historicalTick';
  createdAt:number;
  /** Host-stamped bar revision, never supplied by the script. */
  revision?:number;
}>;

/** Convert one separately typed Pine trigger/declaration into its durable outbox identity. */
export function coreSpiritAlertFromRuntimeEvent(event:CoreSpiritRuntimeAlertEvent,context:CoreSpiritAlertHostContext):CoreSpiritAlertEvent{
  const payload=event.payload??{},execution=(payload.execution&&typeof payload.execution==='object'?payload.execution:{}) as Record<string,unknown>;
  const barIndex=Number(payload.barIndex);
  if(!Number.isSafeInteger(barIndex)||barIndex<0)throw new Error('Runtime alert is missing its canonical bar index.');
  const eventType=payload.eventType==='alertcondition'?'alertcondition':payload.eventType==='alert'||payload.eventType===undefined?'alert':undefined;
  if(!eventType)throw new Error('Runtime alert event type is invalid.');
  let frequency=normalizeCoreSpiritAlertFrequency(payload.frequency??'once-per-bar');
  if(eventType==='alertcondition')frequency='once-per-bar-close';
  if(!event.scriptId||!context.scriptRevision||!context.symbol||!context.timeframe||!Number.isFinite(event.time)||
     !Number.isFinite(context.createdAt))throw new Error('Runtime alert identity and timestamp are required.');
  const sourceSequence=event.sequence;
  if(frequency==='all'&&(!Number.isSafeInteger(sourceSequence)||Number(sourceSequence)<0))
    throw new Error('alert.freq_all requires a unique host-stamped event sequence.');
  const args=Array.isArray(payload.args)?payload.args:[];
  const message=String(payload.message??payload.conditionMessage??payload.title??args[0]??'');
  const conditionId=String(payload.conditionId??payload.callsiteId??(eventType+':default'));
  const revision=context.revision??Number(payload.revision??0);
  if(!conditionId.trim()||!Number.isSafeInteger(revision)||revision<0)throw new Error('Alert condition identity or host revision is invalid.');
  const programId=event.scriptId,instrumentId=context.symbol,barId=String(Math.trunc(event.time));
  const identity:CoreSpiritAlertIdentity={programId,instrumentId,timeframe:context.timeframe,barId,eventType,conditionId,revision};
  const id=coreSpiritAlertEventId(identity);
  return Object.freeze({
    id,scriptId:event.scriptId,scriptRevision:context.scriptRevision,programId,symbol:context.symbol,instrumentId,
    timeframe:context.timeframe,barIndex,barTimestamp:event.time,barId,eventType,conditionId,
    ...(typeof payload.title==='string'?{conditionTitle:payload.title}:{}),revision,
    ...(sourceSequence!==undefined?{sourceSequence}:{}),
    confirmed:execution.isConfirmed===true||execution.barPhase==='confirmed'||execution.barPhase==='historical',
    replay:context.executionMode!=='realtime',message,frequency,createdAt:context.createdAt,
  });
}
