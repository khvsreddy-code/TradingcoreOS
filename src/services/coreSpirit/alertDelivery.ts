/** Host-owned, idempotent alert outbox. No network side effects occur in the CoreSpirit VM. */
export type CoreSpiritAlertFrequency='all'|'once-per-bar'|'once-per-bar-close'|'once';
export type CoreSpiritAlertEvent=Readonly<{id:string;scriptId:string;scriptRevision:string;symbol:string;timeframe:string;barIndex:number;barTimestamp:number;confirmed:boolean;replay:boolean;message:string;frequency:CoreSpiritAlertFrequency;createdAt:number}>;
export type CoreSpiritAlertOutboxRecord=Readonly<{key:string;event:CoreSpiritAlertEvent;status:'pending'|'delivered'|'failed';attempts:number;nextAttemptAt:number;lastError?:string}>;
export interface CoreSpiritAlertOutboxStore{putIfAbsent(record:CoreSpiritAlertOutboxRecord):Promise<boolean>;listPending(now:number,limit:number):Promise<readonly CoreSpiritAlertOutboxRecord[]>;update(record:CoreSpiritAlertOutboxRecord):Promise<void>;}
export type CoreSpiritAlertDelivery=(event:CoreSpiritAlertEvent,idempotencyKey:string)=>Promise<void>;
export class CoreSpiritAlertRuntime{
  constructor(private readonly store:CoreSpiritAlertOutboxStore,private readonly deliver:CoreSpiritAlertDelivery,private readonly maxAttempts=5,private readonly baseRetryMs=1000){
    if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>20||!Number.isFinite(baseRetryMs)||baseRetryMs<100)throw new Error('Alert retry policy is invalid.');
  }
  async enqueue(input:CoreSpiritAlertEvent):Promise<boolean>{
    if(!input.id||!input.scriptId||!input.scriptRevision||!input.symbol||!input.timeframe||!Number.isSafeInteger(input.barIndex)||input.barIndex<0||!Number.isFinite(input.barTimestamp)||!input.message.trim())throw new Error('Alert event identity or payload is invalid.');
    if(input.replay)return false;
    if(input.frequency==='once-per-bar-close'&&!input.confirmed)return false;
    const key=input.frequency==='all'?input.id:[input.scriptId,input.scriptRevision,input.symbol,input.timeframe,
      input.frequency==='once'?'once':String(input.barIndex),input.frequency].join(':');
    return this.store.putIfAbsent(Object.freeze({key,event:Object.freeze({...input}),status:'pending',attempts:0,nextAttemptAt:input.createdAt}));
  }
  async flush(now=Date.now(),limit=100):Promise<Readonly<{delivered:number;retried:number;failed:number}>>{
    if(!Number.isFinite(now)||!Number.isSafeInteger(limit)||limit<1||limit>1000)throw new Error('Alert flush bounds are invalid.');
    const records=await this.store.listPending(now,limit);let delivered=0,retried=0,failed=0;
    for(const record of records){
      try{await this.deliver(record.event,record.key);await this.store.update(Object.freeze({...record,status:'delivered'}));delivered++;}
      catch(error){
        const attempts=record.attempts+1,terminal=attempts>=this.maxAttempts;
        const updated=Object.freeze({...record,status:terminal?'failed' as const:'pending' as const,attempts,
          nextAttemptAt:now+this.baseRetryMs*Math.min(64,2**(attempts-1)),lastError:String(error).slice(0,500)});
        await this.store.update(updated);if(terminal)failed++;else retried++;
      }
    }
    return Object.freeze({delivered,retried,failed});
  }
}
