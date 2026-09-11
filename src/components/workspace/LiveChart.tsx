import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { tradingCoreRuntime } from '../../services/runtime/TradingCoreRuntime';
import { NormalizedMarketTick } from '../../types/market';
import { HistoricalCandle } from '../../services/brokers/BrokerAdapter';
import { buildChartAnalytics, ChartAnalytics } from '../../services/marketData/levelEngine';
import { getIndicators, saveIndicators, getAutomations, AutomationConfig } from '../../services/workspace/workspaceState';
import { buildOIChartAnalytics, OIChartAnalytics } from '../../services/marketData/oiEngine';
import { Plus } from 'lucide-react';
import { IndicatorConfig, INDICATOR_LIBRARY, series, vwap, bollinger, rsi, macd, supertrend, keltner, donchian, stochastic, ichimoku, pivots, marketStructure, fairValueGaps, dynamicSupportResistance, liquiditySweeps, orderBlocks, indianKeyLevels, cpr, openingRange, swingLevels, gapLevels, previousDayLevels, previousPeriodLevels, gapZones, equalHighLow, liquidityPools, bosChoch, priceActionEvents, nr7, developingDayLevels, vwapDeviationBands, anchoredVwap, extendedCpr, periodPivots } from '../../services/marketData/indicatorEngine';

const intervals: Record<string,string> = {'1m':'1minute','3m':'3minute','5m':'5minute','15m':'15minute','30m':'30minute','1H':'60minute','1D':'day'};
const seconds: Record<string,number> = {'1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'1H':3600,'1D':86400};
type Props={instrumentKey:string;tick?:NormalizedMarketTick;onAnalytics?:(a:ChartAnalytics)=>void};
const colors:Record<string,string>={EMA:'#38bdf8',SMA:'#f59e0b',HMA:'#e879f9',VWAP:'#c084fc',ADX:'#22c55e',RSI:'#f59e0b',CCI:'#fb7185',OBV:'#60a5fa',MFI:'#a78bfa',ATR:'#22c55e'};
const oscillatorKinds=(x:IndicatorConfig[])=>x.some(i=>i.enabled&&['RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI'].includes(i.kind));

function markerForAutomation(a:AutomationConfig,c:HistoricalCandle[]):{time:number;position:'aboveBar'|'belowBar';color:string;shape:'arrowUp'|'arrowDown';text:string}|null{
 if(!a.enabled||a.mode==='Off'||c.length<3)return null; const last=c[c.length-1],prev=c[c.length-2],time=Math.floor(new Date(last.timestamp).getTime()/1000);
 if(a.kind==='VWAP_RECLAIM'){const w=vwap(c);if(w.length<2)return null;const pv=w[w.length-2].value,cv=w[w.length-1].value;if(prev.close<=pv&&last.close>cv)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'VWAP BUY'};if(prev.close>=pv&&last.close<cv)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'VWAP SELL'};}
 if(a.kind==='EMA_CROSS'){const fast=series(c,'EMA',{id:a.id,kind:'EMA',period:a.fast||9,enabled:true}),slow=series(c,'EMA',{id:a.id,kind:'EMA',period:a.slow||21,enabled:true});if(fast.length>1&&slow.length>1){const f0=fast[fast.length-2].value,s0=slow[slow.length-2].value,f1=fast[fast.length-1].value,s1=slow[slow.length-1].value;if(f0<=s0&&f1>s1)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'EMA BUY'};if(f0>=s0&&f1<s1)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'EMA SELL'};}}
 if(a.kind==='OPENING_RANGE'){const day=new Date(last.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'}),today=c.filter(x=>new Date(x.timestamp).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata'})===day),opening=today.slice(0,Math.max(1,Math.round(900/300)));if(opening.length&&today.length>opening.length){const hi=Math.max(...opening.map(x=>x.high)),lo=Math.min(...opening.map(x=>x.low));if(prev.close<=hi&&last.close>hi)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'OR BUY'};if(prev.close>=lo&&last.close<lo)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'OR SELL'};}}
 if(a.kind==='RSI_REVERSAL'){const pts=rsi(c,a.period||14);if(pts.length>=2){const r0=pts[pts.length-2].value,r1=pts[pts.length-1].value;if(r0<=30&&r1>30)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'RSI BUY'};if(r0>=70&&r1<70)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'RSI SELL'};}}
 if(a.kind==='DONCHIAN_BREAKOUT'){const ch=donchian(c,a.period||20);if(ch.length>=2){const prevCh=ch[ch.length-2],lastCh=ch[ch.length-1];if(prev.close<=prevCh.upper&&last.close>lastCh.upper)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'BREAKOUT BUY'};if(prev.close>=prevCh.lower&&last.close<lastCh.lower)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'BREAKOUT SELL'};}}
 if(a.kind==='SUPERTREND_FLIP'){const st=supertrend(c,a.period||10);if(st.length>=2){const p0=st[st.length-2],p1=st[st.length-1];if(p0.direction<0&&p1.direction>0)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'ST BUY'};if(p0.direction>0&&p1.direction<0)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'ST SELL'};}}
 if(a.kind==='PDH_PDL_SWEEP'){const lv=indianKeyLevels(c);const pdh=lv.find(x=>x.label==='PDH'),pdl=lv.find(x=>x.label==='PDL');if(pdh&&prev.high>pdh.price&&last.close<pdh.price)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'PDH SWEEP'};if(pdl&&prev.low<pdl.price&&last.close>pdl.price)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'PDL SWEEP'};}
 if(a.kind==='CPR_BREAKOUT'){const lv=cpr(c);const tc=lv.find(x=>x.label==='CPR TC'),bc=lv.find(x=>x.label==='CPR BC');if(tc&&prev.close<=tc.price&&last.close>tc.price)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'CPR BUY'};if(bc&&prev.close>=bc.price&&last.close<bc.price)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'CPR SELL'};}
 if(a.kind==='BOLLINGER_BREAKOUT'){const bb=bollinger(c,a.period||20,a.multiplier||2);if(bb.length>=2){const p0=bb[bb.length-2],p1=bb[bb.length-1];if(prev.close<=p0.upper&&last.close>p1.upper)return {time,position:'belowBar',color:'#22c55e',shape:'arrowUp',text:'BB BUY'};if(prev.close>=p0.lower&&last.close<p1.lower)return {time,position:'aboveBar',color:'#ef4444',shape:'arrowDown',text:'BB SELL'};}}
 return null;
}

const line=(chart:IChartApi,color:string,width=1)=>chart.addSeries(LineSeries,{color,lineWidth:width,priceLineVisible:false,lastValueVisible:true});

export function LiveChart({instrumentKey,tick,onAnalytics}:Props){
 const host=useRef<HTMLDivElement>(null),oscHost=useRef<HTMLDivElement>(null); const chart=useRef<IChartApi>(); const oscChart=useRef<IChartApi>(); const candle=useRef<ISeriesApi<'Candlestick'>>(); const volume=useRef<ISeriesApi<'Histogram'>>(); const indicatorSeries=useRef<ISeriesApi<'Line'>[]>([]); const oscSeries=useRef<ISeriesApi<'Line'>[]>([]); const candles=useRef<HistoricalCandle[]>([]);
 const analyticsWorker=useRef<Worker>(); const indicatorWorker=useRef<Worker>(); const analyticsJob=useRef(0); const indicatorJob=useRef(0); const workerSeriesMap=useRef(new Map<string, Array<ISeriesApi<'Line'>|ISeriesApi<'Histogram'>>>());
 const [timeframe,setTimeframe]=useState('5m'),[showLevels,setShowLevels]=useState(false),[showVolume,setShowVolume]=useState(false),[showOI,setShowOI]=useState(false),[showIndicatorMenu,setShowIndicatorMenu]=useState(false),[indicators,setIndicators]=useState<IndicatorConfig[]>(getIndicators),[automations,setAutomations]=useState<AutomationConfig[]>(getAutomations),[error,setError]=useState(''); const analytics=useRef<ChartAnalytics|null>(null); const oiAnalytics=useRef<OIChartAnalytics|null>(null); const oiChainRef=useRef<{signature:string;chain:any}>(); const oiLines=useRef<any[]>([]); const analyticsTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{const a=(e:Event)=>setIndicators((e as CustomEvent<IndicatorConfig[]>).detail||getIndicators());const b=(e:Event)=>setAutomations((e as CustomEvent<AutomationConfig[]>).detail||getAutomations());window.addEventListener('tradingcore:indicators',a);window.addEventListener('tradingcore:automations',b);return()=>{window.removeEventListener('tradingcore:indicators',a);window.removeEventListener('tradingcore:automations',b)}},[]);
 const requestIndicatorWorker=(data:HistoricalCandle[])=>{
   const worker=indicatorWorker.current; if(!worker)return;
   const id=++indicatorJob.current;
   worker.postMessage({id,candles:data,configs:indicators});
 };
 const renderWorkerIndicators=(results:any[])=>{
   if(!chart.current)return;
   const active=indicators.filter(x=>x.enabled);
   if(oscillatorKinds(active)&&oscHost.current&&!oscChart.current)oscChart.current=createChart(oscHost.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#090c12'},textColor:'#64748b',fontFamily:'JetBrains Mono, monospace',fontSize:9},grid:{vertLines:{color:'#141824'},horzLines:{color:'#141824'}},rightPriceScale:{borderColor:'#252b3a'},timeScale:{visible:false}});
   const getSeries=(key:string,target:IChartApi,kind:'line'|'histogram',color:string,width=1)=>{
     const existing=workerSeriesMap.current.get(key);
     if(existing?.[0])return existing[0];
     const created=kind==='histogram'?target.addSeries(HistogramSeries,{color,priceFormat:{type:'price'},priceScaleId:'right'}):line(target,color,width);
     workerSeriesMap.current.set(key,[created as any]); return created as any;
   };
   const getGroup=(id:string,count:number,target:IChartApi,colorsFor:string[],width=1)=>{
     let group=workerSeriesMap.current.get(id);
     if(group?.length===count)return group;
     group=colorsFor.slice(0,count).map(color=>line(target,color,width)); workerSeriesMap.current.set(id,group); return group;
   };
   for(const result of results){
     const cfg=active.find(x=>x.id===result.id); if(!cfg||!result.data?.length)continue;
     const targetOsc=['RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI'].includes(result.kind);
     const target=targetOsc?oscChart.current:chart.current; if(!target)continue;
     if(result.kind==='MACD'){const [s1,s2,h]=(()=>{let g=workerSeriesMap.current.get(result.id);if(!g||g.length!==3){g=[line(target,'#38bdf8',1),line(target,'#c084fc',1),target.addSeries(HistogramSeries,{priceFormat:{type:'price'},priceScaleId:'right'}) as any];workerSeriesMap.current.set(result.id,g);}return g as any[];})();s1.setData(result.data.map((x:any)=>({time:x.time as Time,value:x.macd})));s2.setData(result.data.map((x:any)=>({time:x.time as Time,value:x.signal})));h.setData(result.data.map((x:any)=>({time:x.time as Time,value:x.histogram,color:x.histogram>=0?'#10b98155':'#ef444455'})) as any);continue;}
     if(result.kind==='Stochastic'){const g=getGroup(result.id,2,target,['#38bdf8','#f59e0b'],1);g[0].setData(result.data.map((x:any)=>({time:x.time as Time,value:x.k})));g[1].setData(result.data.map((x:any)=>({time:x.time as Time,value:x.d})));continue;}
     if(result.kind==='Bollinger Bands'||result.kind==='Keltner Channels'||result.kind==='Donchian Channels'){const colorsFor=result.kind==='Donchian Channels'?['#22d3ee','#64748b','#22d3ee']:result.kind==='Keltner Channels'?['#34d399','#94a3b8','#34d399']:['#60a5fa','#64748b','#60a5fa'];const g=getGroup(result.id,3,target,colorsFor,1);for(let i=0;i<3;i++){const key=['upper','middle','lower'][i];g[i].setData(result.data.map((x:any)=>({time:x.time as Time,value:x[key]})));}continue;}
     if(result.kind==='Supertrend'){const g=getGroup(result.id,2,target,['#22c55e','#ef4444'],2);g[0].setData(result.data.filter((x:any)=>x.direction===1).map((x:any)=>({time:x.time as Time,value:x.value})));g[1].setData(result.data.filter((x:any)=>x.direction===-1).map((x:any)=>({time:x.time as Time,value:x.value})));continue;}
     if(result.kind==='Ichimoku Cloud'){const g=getGroup(result.id,4,target,['#38bdf8','#f59e0b','#22c55e','#ef4444'],1);for(let i=0;i<4;i++){const key=['tenkan','kijun','spanA','spanB'][i];g[i].setData(result.data.map((x:any)=>({time:x.time as Time,value:x[key]})));}continue;}
     const s=getSeries(result.id,target,'line',colors[result.kind]||'#94a3b8',2);s.setData(result.data as any);
   }
 };
 useEffect(()=>{
   const aw=new Worker(new URL('../../services/marketData/chartAnalytics.worker.ts',import.meta.url),{type:'module'});
   const iw=new Worker(new URL('../../services/marketData/indicator.worker.ts',import.meta.url),{type:'module'});
   analyticsWorker.current=aw; indicatorWorker.current=iw;
   aw.onmessage=(e:MessageEvent<any>)=>{if(e.data?.id!==analyticsJob.current||!e.data?.analytics)return;analytics.current=e.data.analytics;onAnalytics?.(e.data.analytics);window.dispatchEvent(new CustomEvent('tradingcore:chart-analytics',{detail:e.data.analytics}));};
   iw.onmessage=(e:MessageEvent<any>)=>{if(e.data?.id!==indicatorJob.current||!e.data?.results||!chart.current)return;renderWorkerIndicators(e.data.results);};
   return()=>{aw.terminate();iw.terminate();analyticsWorker.current=undefined;indicatorWorker.current=undefined;};
 },[]);
 const renderStudies=(data:HistoricalCandle[])=>{
   indicatorSeries.current.forEach(s=>{try{chart.current?.removeSeries(s)}catch{}});indicatorSeries.current=[];oscSeries.current.forEach(s=>{try{oscChart.current?.removeSeries(s as any)}catch{}});oscSeries.current=[];
   workerSeriesMap.current.forEach(group=>group.forEach(s=>{try{chart.current?.removeSeries(s as any)}catch{} try{oscChart.current?.removeSeries(s as any)}catch{}})); workerSeriesMap.current.clear();
   const active=indicators.filter(x=>x.enabled); const needsOsc=oscillatorKinds(active);
   if(needsOsc&&oscHost.current&&!oscChart.current)oscChart.current=createChart(oscHost.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#090c12'},textColor:'#64748b',fontFamily:'JetBrains Mono, monospace',fontSize:9},grid:{vertLines:{color:'#141824'},horzLines:{color:'#141824'}},rightPriceScale:{borderColor:'#252b3a'},timeScale:{visible:false}});
   if(!needsOsc&&oscChart.current){try{oscChart.current.remove()}catch{}oscChart.current=undefined;}
   for(const cfg of active){
     if(!chart.current)continue;
     if(['EMA','SMA','HMA','ATR','RSI','ADX','CCI','OBV','MFI','VWAP','Bollinger Bands','Keltner Channels','Donchian Channels','Supertrend','Ichimoku Cloud'].includes(cfg.kind))continue;
     if(cfg.kind==='Market Structure'){const ms=marketStructure(data,cfg.period||3);const latest=ms.slice(-6);for(const x of latest){const s=chart.current.addSeries(LineSeries,{color:x.type.includes('H')?'#ef4444':'#22c55e',lineWidth:1,priceLineVisible:true,lastValueVisible:false});s.setData([{time:x.time as Time,value:x.price},{time:Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time,value:x.price}] as any);indicatorSeries.current.push(s);}continue;}
     if(cfg.kind==='Fair Value Gaps'){const zones=fairValueGaps(data);for(const z of zones.slice(-8)){for(const price of [z.upper,z.lower]){const s=chart.current.addSeries(LineSeries,{color:z.kind==='bullish'?'#22c55e66':'#ef444466',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false});const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;s.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);indicatorSeries.current.push(s);}}continue;}
     if(cfg.kind==='Dynamic Support/Resistance'){const levels=dynamicSupportResistance(data,cfg.period||5).slice(-10);const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const x of levels){const s=chart.current.addSeries(LineSeries,{color:x.side==='support'?'#22c55e':'#ef4444',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false});s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);indicatorSeries.current.push(s);}continue;}
     if(cfg.kind==='Liquidity Sweeps'){const sweeps=liquiditySweeps(data,cfg.period||5).slice(-12);for(const x of sweeps){const s=chart.current.addSeries(LineSeries,{color:x.side==='sell-side'?'#22c55e':'#f59e0b',lineWidth:2,priceLineVisible:false,lastValueVisible:false});const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);indicatorSeries.current.push(s);}continue;}
     if(cfg.kind==='Order Blocks'){const zones=orderBlocks(data,cfg.period||5).slice(-8);const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const z of zones){for(const price of [z.upper,z.lower]){const s=chart.current.addSeries(LineSeries,{color:z.kind==='bullish'?'#38bdf8':'#fb7185',lineWidth:1,lineStyle:1,priceLineVisible:false,lastValueVisible:false});s.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);indicatorSeries.current.push(s);}}continue;}
     if(cfg.kind==='CPR' || cfg.kind==='Key Levels' || cfg.kind==='Opening Range' || cfg.kind==='Weekly Levels' || cfg.kind==='Swing Levels' || cfg.kind==='Gap Levels'){
       const levels=cfg.kind==='CPR'?cpr(data):cfg.kind==='Key Levels'?indianKeyLevels(data):cfg.kind==='Opening Range'?openingRange(data,cfg.period||15):cfg.kind==='Swing Levels'?swingLevels(data,cfg.period||3):gapLevels(data);
       const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const x of levels){const s=chart.current.addSeries(LineSeries,{color:x.side==='support'?'#22c55e':x.side==='resistance'?'#ef4444':'#60a5fa',lineWidth:x.label.includes('CPR')?2:1,lineStyle: x.label.includes('GAP')?1:2,priceLineVisible:false,lastValueVisible:true});s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);indicatorSeries.current.push(s);}
       continue;
     }
     if(['Previous Day Levels','Previous Week Levels','Previous Month Levels','Opening Range Pro','Developing Day High/Low','Equal Highs/Lows','Liquidity Pools','CPR R1-R5 / S1-S5','Camarilla Pivots','Fibonacci Pivots','Weekly Pivots','Monthly Pivots'].includes(cfg.kind)){
       let levels:any[]=[];
       if(cfg.kind==='Previous Day Levels') levels=previousDayLevels(data);
       else if(cfg.kind==='Previous Week Levels') levels=previousPeriodLevels(data,'week');
       else if(cfg.kind==='Previous Month Levels') levels=previousPeriodLevels(data,'month');
       else if(cfg.kind==='Opening Range Pro') levels=openingRange(data,cfg.period||30);
       else if(cfg.kind==='Developing Day High/Low') levels=developingDayLevels(data);
       else if(cfg.kind==='Equal Highs/Lows') levels=equalHighLow(data,cfg.period||3);
       else if(cfg.kind==='Liquidity Pools') levels=liquidityPools(data,cfg.period||5);
       else if(cfg.kind==='CPR R1-R5 / S1-S5') levels=extendedCpr(data);
       else if(cfg.kind==='Camarilla Pivots') { const x=periodPivots(data,'week','classic'); levels=x.map((v:any)=>({...v,label:`CAM ${v.label}`})); }
       else if(cfg.kind==='Fibonacci Pivots') levels=periodPivots(data,'week','fib');
       else if(cfg.kind==='Weekly Pivots') levels=periodPivots(data,'week','classic');
       else if(cfg.kind==='Monthly Pivots') levels=periodPivots(data,'month','classic');
       const start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const x of levels){const ss=chart.current.addSeries(LineSeries,{color:x.side==='support'?'#22c55e':x.side==='resistance'?'#ef4444':'#60a5fa',lineWidth:x.label==='P'||x.label==='TC'||x.label==='BC'?2:1,lineStyle:2,priceLineVisible:false,lastValueVisible:true});ss.setData([{time:(x.time||start) as Time,value:x.price},{time:end,value:x.price}] as any);indicatorSeries.current.push(ss);} continue;
     }
     if(cfg.kind==='Gap Zones'){
       const zones=gapZones(data); const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const z of zones){for(const price of [z.upper,z.lower]){const ss=chart.current.addSeries(LineSeries,{color:z.kind==='bullish'?'#22c55e99':'#ef444499',lineWidth:2,lineStyle:1,priceLineVisible:false,lastValueVisible:false});ss.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);indicatorSeries.current.push(ss);}}
       continue;
     }
     if(['BOS / CHOCH','Breakout / Retest','Failed Breakout','Rejection Candles','Inside Bar Breakout','Engulfing Patterns','Pin Bars','NR7 Volatility Contraction'].includes(cfg.kind)){
       const ev=priceActionEvents(data); const structure=cfg.kind==='BOS / CHOCH'?bosChoch(data,cfg.period||3):[]; const all:any[]=cfg.kind==='BOS / CHOCH'?structure:ev.filter(x=>{if(cfg.kind==='Rejection Candles')return x.label.startsWith('REJECTION');if(cfg.kind==='Inside Bar Breakout')return x.label.startsWith('INSIDE');if(cfg.kind==='Engulfing Patterns')return x.label.startsWith('ENGULF');if(cfg.kind==='Pin Bars')return x.label.startsWith('PIN');return false;});
       if(cfg.kind==='NR7 Volatility Contraction') all=nr7(data);
       if(cfg.kind==='Breakout / Retest' || cfg.kind==='Failed Breakout'){const sw=dynamicSupportResistance(data,cfg.period||5);for(let i=1;i<data.length;i++){const prev=data[i-1],cur=data[i],t=Math.floor(new Date(cur.timestamp).getTime()/1000);for(const lv of sw.slice(-12)){if(prev.close<=lv.price&&cur.close>lv.price)all.push({time:t,price:lv.price,label:'BREAK ↑',side:'bullish'});if(prev.close>=lv.price&&cur.close<lv.price)all.push({time:t,price:lv.price,label:'BREAK ↓',side:'bearish'});if(cfg.kind==='Failed Breakout'){if(prev.high>lv.price&&prev.close<lv.price&&cur.close<lv.price)all.push({time:t,price:lv.price,label:'FAILED ↓',side:'bearish'});if(prev.low<lv.price&&prev.close>lv.price&&cur.close>lv.price)all.push({time:t,price:lv.price,label:'FAILED ↑',side:'bullish'});}}}}
       const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const x of all.slice(-30)){const ss=chart.current.addSeries(LineSeries,{color:x.side==='bullish'?'#22c55e':'#ef4444',lineWidth:2,lineStyle:0,priceLineVisible:false,lastValueVisible:false});ss.setData([{time:x.time as Time,value:x.price},{time:Math.min(Number(x.time)+1,Number(end)) as Time,value:x.price}] as any);indicatorSeries.current.push(ss);}
       continue;
     }
     if(cfg.kind==='FVG + Mitigation' || cfg.kind==='Order Blocks + Mitigation'){
       const zones=cfg.kind==='FVG + Mitigation'?fairValueGaps(data):orderBlocks(data,cfg.period||5); const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
       for(const z of zones.slice(-10)){let mitigated=false;const zi=data.findIndex(x=>Math.floor(new Date(x.timestamp).getTime()/1000)===z.time);for(let i=Math.max(0,zi);i<data.length;i++){if(data[i].low<=z.upper&&data[i].high>=z.lower){mitigated=true;break;}}const alpha=mitigated?'44':'99';for(const price of [z.upper,z.lower]){const ss=chart.current.addSeries(LineSeries,{color:z.kind==='bullish'?`#22c55e${alpha}`:`#ef4444${alpha}`,lineWidth:mitigated?1:2,lineStyle:mitigated?2:0,priceLineVisible:false,lastValueVisible:false});ss.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);indicatorSeries.current.push(ss);}} continue;
     }
     if(cfg.kind==='VWAP Deviation Bands'){
       const bands=vwapDeviationBands(data,cfg.multiplier||1);for(const key of ['middle','upper','lower'] as const){const ss=line(chart.current,key==='middle'?'#c084fc':'#a78bfa',key==='middle'?2:1);ss.setData(bands.map(x=>({time:x.time as Time,value:x[key]})) as any);indicatorSeries.current.push(ss);}continue;
     }
     if(cfg.kind==='Anchored VWAP'){const ss=line(chart.current,'#f97316',2);ss.setData(anchoredVwap(data,cfg.period||5) as any);indicatorSeries.current.push(ss);continue;}
     if(cfg.kind==='Pivot Points'){const pv=pivots(data),start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const x of pv){const s=chart.current.addSeries(LineSeries,{color:'#f59e0b',lineWidth:1,lineStyle:2,priceLineVisible:true,lastValueVisible:true});s.setData([{time:start,value:x.value},{time:end,value:x.value}] as any);indicatorSeries.current.push(s);}continue;}
   }
 };
 const renderOI=(oi:OIChartAnalytics|null)=>{
   oiLines.current.forEach(x=>{try{candle.current?.removePriceLine(x)}catch{}}); oiLines.current=[];
   if(!showOI||!oi||!candle.current)return;
   const fmtOi=(n:number)=>n>=1000000?`${(n/1000000).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(0)}K`:Math.round(n).toString();
   for(const level of oi.levels.slice(0,6)){
     const color=level.side==='resistance'?'#ef4444':'#22c55e';
     const faded=level.state==='MITIGATED';
     oiLines.current.push(candle.current.createPriceLine({
       price:level.strike, color:faded?`${color}44`:color, lineWidth:faded?1:level.width, lineStyle:faded?2:level.state==='TESTING'?1:0,
       axisLabelVisible:true,lastValueVisible:true,
       title:`${level.label} · ${fmtOi(level.oi)} · Δ ${level.deltaOi>=0?'+':''}${fmtOi(Math.abs(level.deltaOi))}${level.distanceStrikes?` · ${level.distanceStrikes} str`:''}`,
     }));
   }
   if(oi.maxPain)oiLines.current.push(candle.current.createPriceLine({price:oi.maxPain,color:'#f59e0b',lineWidth:2,lineStyle:2,axisLabelVisible:true,title:'MAX PAIN'}));
   if(oi.flip)oiLines.current.push(candle.current.createPriceLine({price:oi.flip.strike,color:'#a78bfa',lineWidth:2,lineStyle:1,axisLabelVisible:true,title:`OI FLIP · ${oi.flip.direction==='PUT_DOMINANT'?'PUT':'CALL'}`}));
 };
 const refreshOI=async()=>{
   try{
     const chain=await tradingCoreRuntime.getOptionChain(instrumentKey);
     const currentSpot=tick?.ltp||chain.spot||candles.current[candles.current.length-1]?.close||0;
     const signature=(chain.contracts||[]).map((c:any)=>`${c.strike}:${c.call?.oi||0}:${c.call?.previousOi||0}:${c.put?.oi||0}:${c.put?.previousOi||0}`).join('|');
     if(oiChainRef.current?.signature===signature&&oiAnalytics.current){
       const spotOnly={...oiAnalytics.current,spot:Number(currentSpot)||oiAnalytics.current.spot,updatedAt:new Date().toISOString()};
       oiAnalytics.current=spotOnly; renderOI(spotOnly); return;
     }
     oiChainRef.current={signature,chain};
     const oi=buildOIChartAnalytics(chain,currentSpot,analytics.current?.atr||0);
     oiAnalytics.current=oi; renderOI(oi); window.dispatchEvent(new CustomEvent('tradingcore:oi-analytics',{detail:oi}));
   }catch{ /* OI is optional; price chart remains live if the broker has no chain. */ }
 };
 const publish=(data:HistoricalCandle[],spot:number,immediate=false)=>{
   const run=()=>{
     analyticsTimer.current=null;
     const worker=analyticsWorker.current;
     if(worker){const id=++analyticsJob.current;worker.postMessage({id,candles:data,spot});}
     else {const a=buildChartAnalytics(data,spot);analytics.current=a;onAnalytics?.(a);window.dispatchEvent(new CustomEvent('tradingcore:chart-analytics',{detail:a}));}
   };
   if(immediate){if(analyticsTimer.current){clearTimeout(analyticsTimer.current);analyticsTimer.current=null;}run();return;}
   if(analyticsTimer.current)return;
   analyticsTimer.current=setTimeout(run,200);
 };
 useEffect(()=>{if(!host.current)return;let dead=false;setError('');const c=createChart(host.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:'#0b0e15'},textColor:'#8c93a6',fontFamily:'JetBrains Mono, monospace',fontSize:10},grid:{vertLines:{color:'#171b27'},horzLines:{color:'#171b27'}},crosshair:{mode:0},rightPriceScale:{borderColor:'#252b3a',scaleMargins:{top:.08,bottom:.2}},timeScale:{borderColor:'#252b3a',timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:8,minBarSpacing:3},watermark:{visible:true,fontSize:28,horzAlign:'center',vertAlign:'center',color:'#ffffff08',text:'TRADINGCORE'}});chart.current=c;candle.current=c.addSeries(CandlestickSeries,{upColor:'#10b981',downColor:'#ef4444',borderUpColor:'#10b981',borderDownColor:'#ef4444',wickUpColor:'#10b981',wickDownColor:'#ef4444'});volume.current=c.addSeries(HistogramSeries,{priceFormat:{type:'volume'},priceScaleId:'volume'});volume.current.priceScale().applyOptions({scaleMargins:{top:.84,bottom:0}});
 tradingCoreRuntime.getHistoricalData(instrumentKey,intervals[timeframe]).then(data=>{if(dead||!data.length)throw new Error('No historical candles available');data=data.slice().sort((a,b)=>new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime());data=data.slice(-25000);candles.current=data;candle.current!.setData(data.map(x=>({time:Math.floor(new Date(x.timestamp).getTime()/1000) as Time,open:x.open,high:x.high,low:x.low,close:x.close})));volume.current!.setData(data.map(x=>({time:Math.floor(new Date(x.timestamp).getTime()/1000) as Time,value:x.volume||0,color:x.close>=x.open?'#10b98155':'#ef444455'})) as any);renderStudies(data);requestIndicatorWorker(data);publish(data,tick?.ltp||data[data.length-1].close,true);c.timeScale().fitContent();}).catch(e=>{if(!dead)setError(e?.message||'Historical candles unavailable')});return()=>{dead=true;if(analyticsTimer.current){clearTimeout(analyticsTimer.current);analyticsTimer.current=null;}try{c.remove()}catch{}try{oscChart.current?.remove()}catch{}workerSeriesMap.current.clear();chart.current=undefined;oscChart.current=undefined;candle.current=undefined;volume.current=undefined;indicatorSeries.current=[];oscSeries.current=[]}},[instrumentKey,timeframe]);
 useEffect(()=>{if(candles.current.length&&chart.current){renderStudies(candles.current);requestIndicatorWorker(candles.current);}},[indicators.map(x=>`${x.id}:${x.enabled}:${x.period}:${x.fast}:${x.slow}:${x.signal}:${x.multiplier}:${x.smooth}`).join('|')]);
 useEffect(()=>{if(!tick?.ltp||!candle.current)return;const p=Number(tick.ltp),sec=seconds[timeframe]||300,ts=Math.floor((new Date(tick.lastTradeTimestamp||tick.receivedAt).getTime()||Date.now())/1000),bucket=Math.floor(ts/sec)*sec;let b=candles.current[candles.current.length-1];const bucketChanged=!b||Math.floor(new Date(b.timestamp).getTime()/1000)!==bucket;if(bucketChanged){b={timestamp:new Date(bucket*1000).toISOString(),open:b?.close??p,high:p,low:p,close:p,volume:Number(tick.volume||0)};candles.current=[...candles.current,b]}else{b.high=Math.max(b.high,p);b.low=Math.min(b.low,p);b.close=p;if(tick.volume)b.volume=Number(tick.volume)};candle.current.update({time:bucket as Time,open:b.open,high:b.high,low:b.low,close:b.close});volume.current?.update({time:bucket as Time,value:b.volume||0,color:b.close>=b.open?'#10b98155':'#ef444455'} as any);if(bucketChanged)requestIndicatorWorker(candles.current);publish(candles.current,p);},[tick,timeframe]);
 useEffect(()=>{if(!candle.current||!showLevels||!analytics.current)return;const lines=[...analytics.current.support.slice(0,3),...analytics.current.resistance.slice(0,3)].map(x=>candle.current!.createPriceLine({price:x.price,color:x.side==='support'?'#22c55e':'#ef4444',lineWidth:1,lineStyle:0,axisLabelVisible:true,title:x.side==='support'?'S':'R'}));return()=>lines.forEach(x=>candle.current?.removePriceLine(x));},[showLevels,tick?.ltp]);
 useEffect(()=>{renderOI(oiAnalytics.current);},[showOI]);
 useEffect(()=>{let dead=false; refreshOI(); const id=window.setInterval(()=>{if(!dead)refreshOI();},5000); return()=>{dead=true;window.clearInterval(id);oiLines.current.forEach(x=>{try{candle.current?.removePriceLine(x)}catch{}});oiLines.current=[]};},[instrumentKey]);
 useEffect(()=>{if(oiAnalytics.current&&tick?.ltp){const current=oiAnalytics.current; const spot=Number(tick.ltp); const tolerance=Math.max(analytics.current?.atr||0,1)*.18; const walls=current.walls.map(w=>({...w,state:w.side==='PUT'?(spot<w.strike-tolerance?'MITIGATED':Math.abs(spot-w.strike)<=tolerance?'TESTING':'ACTIVE'):(spot>w.strike+tolerance?'MITIGATED':Math.abs(spot-w.strike)<=tolerance?'TESTING':'ACTIVE')})); const levels=current.levels.map(l=>({...l,state:l.side==='support'?(spot<l.strike-tolerance?'MITIGATED':Math.abs(spot-l.strike)<=tolerance?'TESTING':'ACTIVE'):(spot>l.strike+tolerance?'MITIGATED':Math.abs(spot-l.strike)<=tolerance?'TESTING':'ACTIVE')})); const changed=walls.some((w,i)=>w.state!==current.walls[i]?.state)||levels.some((l,i)=>l.state!==current.levels[i]?.state); const refreshed={...current,spot,walls,levels}; oiAnalytics.current=refreshed; if(changed)renderOI(refreshed);}},[tick?.ltp]);
 useEffect(()=>{volume.current?.applyOptions({visible:showVolume});},[showVolume]);
 const addIndicatorFromChart=(kind:IndicatorConfig['kind'])=>{
   const lib=INDICATOR_LIBRARY.find(x=>x.kind===kind); if(!lib)return;
   const next=[...indicators,{id:`${kind.toLowerCase().replace(/\W/g,'-')}-${Date.now()}`,kind,enabled:true,...lib.defaults}];
   setIndicators(next); saveIndicators(next); setShowIndicatorMenu(false);
 };
 const automationSignals=automations.map(a=>({automation:a,signal:markerForAutomation(a,candles.current)})).filter(x=>x.signal) as any[]; const automationLines=useRef<any[]>([]);
 useEffect(()=>{if(!candle.current)return;automationLines.current.forEach(x=>{try{candle.current?.removePriceLine(x)}catch{}});automationLines.current=[];automationSignals.forEach(({automation,signal}:any)=>{const line=candle.current!.createPriceLine({price:candles.current[candles.current.length-1]?.close||0,color:signal.color,lineWidth:2,lineStyle:2,axisLabelVisible:true,title:`AUTO · ${automation.name}`});automationLines.current.push(line);});return()=>{automationLines.current.forEach(x=>{try{candle.current?.removePriceLine(x)}catch{}});automationLines.current=[]}},[automations,tick?.ltp]);
 return <div className="flex min-h-0 flex-1 flex-col"><div className="flex flex-wrap items-center gap-1.5 border-b border-[#222636] pb-2 mb-2"><span className="text-[9px] uppercase tracking-widest text-[#64748b] mr-1">Chart</span>{Object.keys(intervals).map(v=><button key={v} onClick={()=>setTimeframe(v)} className={`px-2 py-1 rounded border text-[10px] font-mono ${timeframe===v?'border-[#10b981]/60 bg-[#10b981]/10 text-[#10b981]':'border-[#222636] text-[#8c93a6]'}`}>{v}</button>)}<span className="mx-1 h-4 w-px bg-[#222636]"/><button onClick={()=>setShowIndicatorMenu(x=>!x)} className="toolbar-pill">Studies {indicators.filter(x=>x.enabled).length}</button><button onClick={()=>setShowLevels(x=>!x)} className={`toolbar-pill ${showLevels?'toolbar-pill-active':''}`}>Levels</button><button onClick={()=>setShowOI(x=>!x)} className={`toolbar-pill ${showOI?'toolbar-pill-active':''}`}>OI</button><div className="relative"><button onClick={()=>setShowIndicatorMenu(x=>!x)} className="toolbar-pill inline-flex items-center gap-1"><Plus className="h-3 w-3"/> Indicator</button>{showIndicatorMenu&&<div className="absolute left-0 top-8 z-50 w-[280px] max-h-[360px] overflow-y-auto rounded-xl border border-[#2a3040] bg-[#0b0e15] p-2 shadow-2xl"><div className="px-2 pb-2 text-[9px] uppercase tracking-widest text-[#64748b]">Add directly to chart</div><div className="grid grid-cols-2 gap-1">{INDICATOR_LIBRARY.map(lib=><button key={lib.kind} onClick={()=>addIndicatorFromChart(lib.kind)} className="rounded-md border border-[#222636] px-2 py-1.5 text-left text-[9px] text-[#cbd5e1] hover:border-[#10b981]/40 hover:bg-[#10b981]/5"><span className="font-semibold">{lib.kind}</span><span className="block text-[8px] text-[#64748b]">{lib.overlay?'Overlay':'Pane'}</span></button>)}</div></div>}</div><button onClick={()=>setShowVolume(x=>!x)} className={`toolbar-pill ${showVolume?'toolbar-pill-active-blue':''}`}>Volume</button><span className="ml-auto text-[9px] font-mono text-[#64748b]">{indicators.filter(x=>x.enabled).length} studies · {automations.filter(x=>x.enabled).length} automations</span></div><div className="flex items-center justify-between px-1 pb-2 text-[10px] font-mono"><span className="text-[#64748b]">Normalized broker candles · native indicator engine</span><span className="text-[#10b981]">● LIVE ENGINE</span>{showOI&&oiAnalytics.current&&<span className="ml-2 text-[#a78bfa]">OI · PCR {oiAnalytics.current.pcr.toFixed(2)} · FLIP {oiAnalytics.current.flip?.strike??'—'}</span>}</div>{error?<div className="flex-1 min-h-[360px] items-center justify-center flex rounded-xl border border-[#ef4444]/20 bg-[#0c0e15] text-xs text-[#ef4444]">{error}</div>:<><div ref={host} className="min-h-[430px] flex-1 rounded-xl overflow-hidden border border-[#222636]"/>{oscillatorKinds(indicators)&&<div ref={oscHost} className="mt-2 h-32 rounded-xl overflow-hidden border border-[#222636]"/>}</>}</div>;
}
