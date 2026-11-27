import type { IRExpression } from './ir';
import type { CoreSpiritExecutionContext, CoreSpiritIntrabar } from './types';
export type TimeframeRequest = Readonly<{symbol:string;timeframe:string;expression:IRExpression;gaps:'on'|'off';lookahead:'on'|'off';sourceContext:CoreSpiritExecutionContext;session?:string;currency?:string;modifiers?:Readonly<Record<string,string|number|boolean>>;calculationLimit?:number;expressionDependencies?:readonly string[];hostAvailability?:'available'|'delayed'|'stale'|'unavailable'}>;
export type RequestRepaintClassification='non-repainting-confirmed'|'realtime-developing'|'historical-lookahead-risk'|'host-data-limited'|'missing-or-gapped';
export function classifyRequestRepaint(input:{lookahead:'on'|'off';confirmed:boolean;realtime:boolean;available:boolean;gaps:'on'|'off'}):RequestRepaintClassification {
 if(!input.available)return 'host-data-limited';if(input.lookahead==='on'&&!input.realtime)return 'historical-lookahead-risk';if(!input.confirmed&&input.realtime)return 'realtime-developing';if(!input.confirmed)return 'missing-or-gapped';return 'non-repainting-confirmed';
}
export type MarketDataProvenance=Readonly<{provider:string;status:'live'|'delayed'|'stale'|'unavailable';receivedAt:number;sourceTimestamp:number;delayMs?:number;reason?:string}>;
export function classifyMarketDataFreshness(input:{provider:string;receivedAt:number;sourceTimestamp:number;now:number;liveMaxAgeMs:number;delayedAfterMs?:number}):MarketDataProvenance {
 const age=input.now-input.sourceTimestamp;if(!input.provider.trim()||![input.receivedAt,input.sourceTimestamp,input.now,input.liveMaxAgeMs].every(Number.isFinite)||input.liveMaxAgeMs<0||age<0)return {provider:input.provider||'unknown',status:'unavailable',receivedAt:input.receivedAt,sourceTimestamp:input.sourceTimestamp,reason:'invalid-or-future-source-timestamp'};
 if(age<=input.liveMaxAgeMs)return {provider:input.provider,status:'live',receivedAt:input.receivedAt,sourceTimestamp:input.sourceTimestamp,delayMs:age};
 if(input.delayedAfterMs!=null&&age<=input.delayedAfterMs)return {provider:input.provider,status:'delayed',receivedAt:input.receivedAt,sourceTimestamp:input.sourceTimestamp,delayMs:age};
 return {provider:input.provider,status:'stale',receivedAt:input.receivedAt,sourceTimestamp:input.sourceTimestamp,delayMs:age,reason:'source-age-exceeded-freshness-budget'};
}
export function coreSpiritTimeframeDurationMs(value:string):number {
 const raw=String(value??'').trim();if(/^\d+$/.test(raw))return Number(raw)*60_000;
 const m=/^(\d+)\s*(s|sec|second|m|min|minute|h|hr|hour|d|day|w|week)$/i.exec(raw);if(!m)return 0;
 const n=Number(m[1]),u=m[2]!.toLowerCase();if(['s','sec','second'].includes(u))return n*1_000;if(['m','min','minute'].includes(u))return n*60_000;if(['h','hr','hour'].includes(u))return n*3_600_000;if(['d','day'].includes(u))return n*86_400_000;return n*604_800_000;
}
export function coreSpiritIntrabarsForParent(rows:readonly CoreSpiritIntrabar[],parentOpen:number,parentTimeframe:string,maxIntrabars=16_384):CoreSpiritIntrabar[] {
 const duration=coreSpiritTimeframeDurationMs(parentTimeframe);if(!Number.isFinite(parentOpen)||duration<=0)return [];
 return rows.filter(row=>Number.isFinite(row.timestamp)&&row.timestamp>=parentOpen&&row.timestamp<parentOpen+duration).sort((a,b)=>a.timestamp-b.timestamp).slice(0,Math.max(0,maxIntrabars));
}
