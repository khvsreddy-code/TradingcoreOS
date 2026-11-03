export type RequestMetricContext = Readonly<{ requestId?: string; reason?: string; route?: string }>;
export type TradingCoreMetricSnapshot = Readonly<{requests:number;errors:number;rateLimited:number;durations:number[];byReason:Record<string,number>;byRoute:Record<string,{requests:number;errors:number;rateLimited:number}>;recent:ReadonlyArray<{requestId:string|null;reason:string;route:string;status:number;durationMs:number;at:string}>;}>;
const state={requests:0,errors:0,rateLimited:0,durations:[] as number[],byReason:new Map<string,number>(),byRoute:new Map<string,{requests:number;errors:number;rateLimited:number}>(),recent:[] as Array<{requestId:string|null;reason:string;route:string;status:number;durationMs:number;at:string}>};
export function recordRequest(status:number,durationMs:number,context:RequestMetricContext={}):void {
 const duration=Math.max(0,durationMs),reason=String(context.reason||'unspecified').slice(0,80),route=String(context.route||'unknown').slice(0,120);
 state.requests++;if(status>=500)state.errors++;if(status===429)state.rateLimited++;
 state.durations.push(duration);if(state.durations.length>512)state.durations.splice(0,state.durations.length-512);
 state.byReason.set(reason,(state.byReason.get(reason)||0)+1);
 const a=state.byRoute.get(route)||{requests:0,errors:0,rateLimited:0};a.requests++;if(status>=500)a.errors++;if(status===429)a.rateLimited++;state.byRoute.set(route,a);
 while(state.byRoute.size>128)state.byRoute.delete(state.byRoute.keys().next().value!);
 state.recent.push({requestId:context.requestId||null,reason,route,status,durationMs:duration,at:new Date().toISOString()});if(state.recent.length>100)state.recent.splice(0,state.recent.length-100);
}
export function getRequestMetrics():TradingCoreMetricSnapshot {
 return Object.freeze({requests:state.requests,errors:state.errors,rateLimited:state.rateLimited,durations:[...state.durations],byReason:Object.fromEntries(state.byReason),byRoute:Object.fromEntries([...state.byRoute].map(([k,v])=>[k,{...v}])),recent:state.recent.map(x=>({...x}))});
}
