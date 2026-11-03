export type MarketDataHealthState = 'live' | 'delayed' | 'stale' | 'disconnected' | 'unknown';
export type CandlePhase = 'historical' | 'forming' | 'confirmed' | 'corrected' | 'unknown';
export type MarketDataSource = 'fyers' | 'investiny' | 'yahoo' | 'paper' | 'replay' | 'backtest' | 'simulator' | 'unknown';
export type MarketDataHealthInput = Readonly<{source?:string|null;lastUpdateAt?:number|string|null;receivedAt?:number|string|null;providerConnected?:boolean;expectedIntervalMs?:number;now?:number;candlePhase?:CandlePhase;}>;
export type MarketDataHealth = Readonly<{state:MarketDataHealthState;label:'LIVE'|'DELAYED'|'STALE'|'DISCONNECTED'|'UNKNOWN';source:MarketDataSource;lastUpdateAt:number|null;ageMs:number|null;providerConnected:boolean|null;candlePhase:CandlePhase;isTradableFreshness:boolean;reason:string;}>;
function timestamp(value:number|string|null|undefined):number|null {
 if(typeof value==='number'&&Number.isFinite(value)) return value<1e12?value*1000:value;
 if(typeof value==='string'&&value.trim()){const n=Number(value);if(Number.isFinite(n))return n<1e12?n*1000:n;const p=Date.parse(value);return Number.isFinite(p)?p:null;}return null;
}
function normalizeSource(value?:string|null):MarketDataSource {const s=String(value||'').toLowerCase();return ['fyers','investiny','yahoo','paper','replay','backtest','simulator'].includes(s)?s as MarketDataSource:'unknown';}
/** A connected socket is not proof of fresh prices; fallback/history is never LIVE. */
export function classifyMarketDataHealth(input:MarketDataHealthInput):MarketDataHealth {
 const source=normalizeSource(input.source),lastUpdateAt=timestamp(input.lastUpdateAt)??timestamp(input.receivedAt);
 const now=Number.isFinite(input.now)?Number(input.now):Date.now(),ageMs=lastUpdateAt==null?null:Math.max(0,now-lastUpdateAt);
 const expected=Math.max(1000,Number(input.expectedIntervalMs)||5000),connected=typeof input.providerConnected==='boolean'?input.providerConnected:null,phase=input.candlePhase||'unknown';
 let state:MarketDataHealthState='unknown',reason='No provider timestamp is available.';
 if(connected===false){state='disconnected';reason='The market-data provider is disconnected.';}
 else if(lastUpdateAt==null){state='unknown';}
 else if(ageMs!>expected*3){state='stale';reason='The latest provider update exceeded the freshness threshold.';}
 else if(source!=='fyers'||connected!==true){state='delayed';reason=source==='investiny'||source==='yahoo'?'The chart is using a historical or fallback data source.':'A live provider connection has not been confirmed.';}
 else {state='live';reason='Recent updates are arriving from the connected live provider.';}
 const labels:Record<MarketDataHealthState,MarketDataHealth['label']>={live:'LIVE',delayed:'DELAYED',stale:'STALE',disconnected:'DISCONNECTED',unknown:'UNKNOWN'};
 return Object.freeze({state,label:labels[state],source,lastUpdateAt,ageMs,providerConnected:connected,candlePhase:phase,isTradableFreshness:state==='live',reason});
}
