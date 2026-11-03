/** Derivatives have independent identity, lifecycle, provenance and valuation contracts. */
export type OptionRight='CE'|'PE';
export type OptionInstrument=Readonly<{instrumentId:string;underlyingId:string;exchange:'NSE'|'BSE';expiry:string;strike:number;right:OptionRight;lotSize:number;tickSize:number;tradingSymbol:string;active:boolean;}>;
export type OptionQuoteSnapshot=Readonly<{instrumentId:string;ltp:number;bid?:number|null;ask?:number|null;volume?:number|null;openInterest?:number|null;previousOpenInterest?:number|null;impliedVolatility?:number|null;observedAt:string;source:string;}>;
export type OptionChainSnapshot=Readonly<{underlyingId:string;expiry:string;observedAt:string;source:string;contracts:readonly OptionInstrument[];quotes:readonly OptionQuoteSnapshot[];}>;
export type OptionGreeks=Readonly<{delta:number;gamma:number;theta:number;vega:number;rho?:number;model:'black-scholes'|'black-76'|'broker';riskFreeRate:number;dividendYield:number;volatility:number;underlyingPrice:number;optionPrice:number;timeToExpiryYears:number;dayCountConvention:'ACT/365'|'ACT/360';calculatedAt:string;}>;
export type OptionExpiryCalendar=Readonly<{exchange:'NSE'|'BSE';underlyingId:string;expiryDates:readonly string[];holidayCalendarVersion:string;observedAt:string;source:string;}>;
export type OptionHistoryCoverage=Readonly<{instrumentId:string;firstAvailableAt:string|null;lastAvailableAt:string|null;availableTimeframes:readonly string[];source:'fyers'|'investiny'|'broker'|'none';verifiedAt:string;complete:boolean;}>;
const isoDate=/^\d{4}-\d{2}-\d{2}$/;
const positive=(n:number)=>Number.isFinite(n)&&n>0;
export function assertOptionInstrument(v:OptionInstrument):void {
 if(!v.instrumentId.trim()||!v.underlyingId.trim()||!v.tradingSymbol.trim())throw new Error('Option contract identity is incomplete.');
 if(!isoDate.test(v.expiry)||Number.isNaN(Date.parse(v.expiry+'T00:00:00Z')))throw new Error('Option expiry must be an ISO exchange-local date.');
 if(!positive(v.strike)||!positive(v.lotSize)||!positive(v.tickSize))throw new Error('Option strike, lot size and tick size must be positive.');
 if(v.right!=='CE'&&v.right!=='PE')throw new Error('Option right must be CE or PE.');
}
export function assertOptionChainSnapshot(s:OptionChainSnapshot):void {
 if(!s.underlyingId.trim()||!isoDate.test(s.expiry))throw new Error('Option chain requires an underlying and valid expiry.');
 if(!Number.isFinite(Date.parse(s.observedAt)))throw new Error('Option chain requires a valid observation timestamp.');
 const ids=new Set<string>();
 for(const c of s.contracts){assertOptionInstrument(c);if(c.underlyingId!==s.underlyingId||c.expiry!==s.expiry)throw new Error('Option contract does not belong to the chain underlying and expiry.');if(ids.has(c.instrumentId))throw new Error('Option chain contains duplicate contract identities.');ids.add(c.instrumentId);}
 for(const q of s.quotes){if(!ids.has(q.instrumentId))throw new Error('Option quote references an unknown contract.');if(!Number.isFinite(q.ltp)||q.ltp<0||!Number.isFinite(Date.parse(q.observedAt)))throw new Error('Option quote contains invalid price or timestamp data.');}
}
export function isOptionSnapshotFresh(s:Pick<OptionChainSnapshot,'observedAt'>,now=Date.now(),maxAgeMs=15000):boolean {const t=Date.parse(s.observedAt);return Number.isFinite(t)&&t<=now+1000&&now-t<=Math.max(0,maxAgeMs);}

/** Coverage is explicit: an unsupported contract must not be presented as having history. */
export function assertOptionHistoryCoverage(value:OptionHistoryCoverage):void {
 if(!value.instrumentId.trim()||!Number.isFinite(Date.parse(value.verifiedAt)))throw new Error('Option history coverage requires an instrument identity and verification timestamp.');
 if(value.firstAvailableAt&&value.lastAvailableAt&&Date.parse(value.firstAvailableAt)>Date.parse(value.lastAvailableAt))throw new Error('Option history coverage range is inverted.');
 if(value.source==='none'&&(value.firstAvailableAt||value.lastAvailableAt||value.availableTimeframes.length))throw new Error('Unavailable option history cannot claim timestamps or timeframes.');
}
