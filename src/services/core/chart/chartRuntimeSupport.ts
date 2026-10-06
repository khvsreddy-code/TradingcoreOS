import type { AutomationConfig } from '../../workspace/workspaceState';
import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import { getIndicatorDefaultPatch } from '../../coreSpirit/indicatorSettingsSchema';
import { normalizeCoreDrawings } from '../drawing/coreDrawing';
import type { CoreDrawing } from '../drawing/coreDrawing';
import { series, vwap, rsi, donchian, supertrend, indianKeyLevels, cpr, bollinger } from '../../marketData/indicatorEngine';

export const chartIntervals = {
  '1m':'1minute', '3m':'3minute', '5m':'5minute', '15m':'15minute',
  '30m':'30minute', '1H':'60minute', '1D':'day',
} as const;

export type PersistedChartState = {
  version: 2;
  timeframe: string;
  drawings: CoreDrawing[];
  showLevels?: boolean;
  showVolume?: boolean;
  showOI?: boolean;
  showDepth?: boolean;
};

export function canonicalInstrumentKey(brokerId: string, key: string): string {
  const value=String(key||'').trim();
  if(String(brokerId).toLowerCase()!=='fyers') return value;
  const n=value.toLowerCase().replace(/\s+/g,'');
  if(n==='nse_index|nifty50'||n==='nse_index|nifty50index'||n==='nifty'||n==='nifty50'||n==='nifty50index'||n.includes('nifty50-index')) return 'NSE:NIFTY50-INDEX';
  if(n==='nse_index|niftybank'||n==='nse_index|banknifty'||n==='banknifty'||n==='niftybank'||n.includes('niftybank-index')) return 'NSE:NIFTYBANK-INDEX';
  if(n==='nse_index|finnifty'||n==='nse_index|niftyfinancialservices'||n.includes('finnifty-index')) return 'NSE:FINNIFTY-INDEX';
  if(n==='nse_index|niftymidcapselect'||n==='nse_index|midcap'||n.includes('midcpnifty-index')) return 'NSE:MIDCPNIFTY-INDEX';
  if(n==='bse_index|sensex'||n==='sensex'||n.includes('sensex-index')) return 'BSE:SENSEX-INDEX';
  const pipe=value.match(/^(NSE|BSE|MCX)_(CM|FO|CD|COM)\|(.+)$/i);
  if(pipe){const exchange=pipe[1].toUpperCase(),segment=pipe[2].toUpperCase(),ticker=pipe[3];if(segment==='CM'&&!/-(EQ|BE|SM|ST)$/i.test(ticker))return `${exchange}:${ticker}-EQ`;return `${exchange}:${ticker}`;}
  if(!value.includes(':') && /^(?:NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY).*?(?:FUT|CE|PE)$/i.test(value)) return `NSE:${value}`;
  if(/^NSE:[A-Z0-9&._-]+$/i.test(value) && !/-[A-Z]+$/i.test(value)) return `${value}-EQ`;
  if(/^BSE:[A-Z0-9&._-]+$/i.test(value) && !/-[A-Z]+$/i.test(value)) return `${value}-EQ`;
  return value;
}

export function chartStateKey(brokerId:string,instrumentKey:string):string {
  return `tradingcore:chart-state:${brokerId}:${encodeURIComponent(instrumentKey)}`;
}

export function loadChartState(brokerId:string,instrumentKey:string):PersistedChartState{
  try{
    const raw=localStorage.getItem(chartStateKey(brokerId,instrumentKey));
    const x=raw?JSON.parse(raw):null;
    if(x&&typeof x==='object'){
      const drawings=normalizeCoreDrawings(x.drawings,'user');
      return {
        version:2,
        timeframe:typeof x.timeframe==='string'&&chartIntervals[x.timeframe as keyof typeof chartIntervals]?x.timeframe:'5m',
        drawings,
        showLevels:Boolean(x.showLevels),
        showVolume:Boolean(x.showVolume),
        showOI:Boolean(x.showOI),
        showDepth:Boolean(x.showDepth),
      };
    }
  }catch{}
  return{version:2,timeframe:'5m',drawings:[]};
}

export function markerForAutomation(
  a: AutomationConfig,
  c: HistoricalCandle[],
): {time:number;position:'aboveBar'|'belowBar';color:string;shape:'arrowUp'|'arrowDown';text:string}|null {
  if(!a.enabled||a.mode==='Off'||c.length<3)return null;
  const last=c[c.length-1],prev=c[c.length-2],time=Math.floor(new Date(last.timestamp).getTime()/1000);
  if(a.kind==='VWAP_RECLAIM'){const w=vwap(c,'hlc3');if(w.length<2)return null;const pv=w[w.length-2].value,cv=w[w.length-1].value;if(prev.close<=pv&&last.close>cv)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'VWAP BUY'};if(prev.close>=pv&&last.close<cv)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'VWAP SELL'};}
  if(a.kind==='EMA_CROSS'){const fast=series(c,'EMA',{id:a.id,kind:'EMA',period:a.fast||9,enabled:true}),slow=series(c,'EMA',{id:a.id,kind:'EMA',period:a.slow||21,enabled:true});if(fast.length>1&&slow.length>1){const f0=fast[fast.length-2].value,s0=slow[slow.length-2].value,f1=fast[fast.length-1].value,s1=slow[slow.length-1].value;if(f0<=s0&&f1>s1)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'EMA BUY'};if(f0>=s0&&f1<s1)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'EMA SELL'};}}
  if(a.kind==='OPENING_RANGE'){const day=new Date(last.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}),today=c.filter(x=>new Date(x.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})===day),opening=today.slice(0,Math.max(1,Math.round(900/300)));if(opening.length&&today.length>opening.length){const hi=Math.max(...opening.map(x=>x.high)),lo=Math.min(...opening.map(x=>x.low));if(prev.close<=hi&&last.close>hi)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'OR BUY'};if(prev.close>=lo&&last.close<lo)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'OR SELL'};}}
  if(a.kind==='RSI_REVERSAL'){const pts=rsi(c,a.period||14);if(pts.length>=2){const r0=pts[pts.length-2].value,r1=pts[pts.length-1].value;if(r0<=30&&r1>30)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'RSI BUY'};if(r0>=70&&r1<70)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'RSI SELL'};}}
  if(a.kind==='DONCHIAN_BREAKOUT'){const ch=donchian(c,a.period||20);if(ch.length>=2){const p0=ch[ch.length-2],p1=ch[ch.length-1];if(prev.close<=p0.upper&&last.close>p1.upper)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'BREAKOUT BUY'};if(prev.close>=p0.lower&&last.close<p1.lower)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'BREAKOUT SELL'};}}
  if(a.kind==='SUPERTREND_FLIP'){const st=supertrend(c,a.period||10);if(st.length>=2){const p0=st[st.length-2],p1=st[st.length-1];if(p0.direction<0&&p1.direction>0)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'ST BUY'};if(p0.direction>0&&p1.direction<0)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'ST SELL'};}}
  if(a.kind==='PDH_PDL_SWEEP'){const lv=indianKeyLevels(c);const pdh=lv.find(x=>x.label==='PDH'),pdl=lv.find(x=>x.label==='PDL');if(pdh&&prev.high>pdh.price&&last.close<pdh.price)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'PDH SWEEP'};if(pdl&&prev.low<pdl.price&&last.close>pdl.price)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'PDL SWEEP'};}
  if(a.kind==='CPR_BREAKOUT'){const lv=cpr(c);const tc=lv.find(x=>x.label==='CPR TC'),bc=lv.find(x=>x.label==='CPR BC');if(tc&&prev.close<=tc.price&&last.close>tc.price)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'CPR BUY'};if(bc&&prev.close>=bc.price&&last.close<bc.price)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'CPR SELL'};}
  if(a.kind==='BOLLINGER_BREAKOUT'){const bb=bollinger(c,a.period||20,a.multiplier||2);if(bb.length>=2){const p0=bb[bb.length-2],p1=bb[bb.length-1];if(prev.close<=p0.upper&&last.close>p1.upper)return{time,position:'belowBar',color:'#3b82f6',shape:'arrowUp',text:'BB BUY'};if(prev.close>=p0.lower&&last.close<p1.lower)return{time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'BB SELL'};}}
  return null;
}
