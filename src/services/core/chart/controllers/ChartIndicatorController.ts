import type { HistoricalCandle } from '../../../brokers/BrokerAdapter';
import type { IndicatorConfig } from '../../../marketData/indicatorEngine';
import {
  advancedIndicatorModel, anchoredVwap, bosChoch, cpr, classicPivots, developingDayLevels,
  dynamicSupportResistance, equalHighLow, extendedCpr, fairValueGaps, gapLevels, gapZones,
  ichimoku, indianKeyLevels, liquidityPools, liquiditySweeps, marketStructure, macd, nr7,
  openingRange, orderBlocks, periodPivots, pivots, priceActionEvents, previousDayLevels,
  previousPeriodLevels, rsi, series, stochastic, supertrend, tradingCoreVPriceAction,
  vwapDeviationBands,
} from '../../../marketData/indicatorEngine';
import type { ChartDataPlane } from '../../../marketData/chartDataPlane';
import { chartComputeCoordinator } from '../../../marketData/chartComputeCoordinator';
import { isIncrementalIndicatorSupported } from '../../../marketData/incrementalIndicatorEngine';
import { resolveIndicatorAppearance } from '../../../coreSpirit/indicatorAppearance';
import { getCurrentTheme, getThemePalette } from '../../../../theme/theme';
import { buildIndicatorComputationSignature, buildIndicatorAppearanceSnapshot } from '../../../coreSpirit/indicatorSettingsSchema';
import { ColorType, LineSeries, HistogramSeries, createVelaNativeChart, createSeriesMarkers, type IChartApi, type ISeriesApi, type Time } from './velaNativeChartKernel';
import type { ChartLifecycle } from './chartLifecycle';
import type { ChartUpdateScheduler } from './chartUpdateScheduler';

type Ref<T> = { current: T };

const intervals = { '1m':'1minute', '3m':'3minute', '5m':'5minute', '15m':'15minute', '30m':'30minute', '1H':'60minute', '1D':'day' } as const;
const colors: Record<string,string> = { EMA:'#38bdf8', SMA:'#f59e0b', HMA:'#e879f9', VWAP:'#c084fc', ADX:'#3b82f6', RSI:'#f59e0b', CCI:'#fb7185', OBV:'#60a5fa', MFI:'#a78bfa', ATR:'#3b82f6' };
const oscillatorKinds=(x:IndicatorConfig[])=>x.some(i=>i.enabled&&['RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI','Delta Sigma Heatmap','Neural Weight Oscillator','Trend Pressure','Trinity','Volatility Shock Half Life Monitor'].includes(i.kind));
const safeLinePoints=(rows:any[],valueKey='value')=>(Array.isArray(rows)?rows:[]).map((x:any)=>({time:x?.time as Time,value:Number.isFinite(Number(x?.[valueKey]))?Number(x?.[valueKey]):null})).filter((x:any)=>x.time!=null&&x.value!=null);
const safeNamedPoints=safeLinePoints;
const colorWithOpacity=(color:string|undefined,opacity:number|undefined,fallback:string)=>{const raw=String(color||fallback).trim();const alpha=Math.max(.15,Math.min(1,Number(opacity??1)));if(!/^#[0-9a-f]{6}$/i.test(raw)||alpha>=.999)return raw;return raw+Math.round(alpha*255).toString(16).padStart(2,'0');};
const line=(chart:IChartApi,color:string,width=1,lineStyle:0|1|2=0)=>chart.addSeries(LineSeries,{color,lineWidth:width,lineStyle,priceLineVisible:false,lastValueVisible:true});

const LEVEL_APPEARANCE_KINDS=new Set(['Dynamic Support/Resistance','CPR','Key Levels','Opening Range','Swing Levels','Gap Levels','Previous Day Levels','Previous Week Levels','Previous Month Levels','Opening Range Pro','Developing Day High/Low','Equal Highs/Lows','Liquidity Pools','CPR R1-R5 / S1-S5','Camarilla Pivots','Fibonacci Pivots','Weekly Pivots','Monthly Pivots']);

export type ChartIndicatorControllerDeps = {
  chart: Ref<IChartApi|null>;
  oscChart: Ref<IChartApi|null>;
  oscHost: Ref<HTMLDivElement|null>;
  candle: Ref<ISeriesApi<'Candlestick'>|null>;
  oscSeries: Ref<ISeriesApi<'Line'>[]>;
  candles: Ref<HistoricalCandle[]>;
  visibleLogicalRangeRef: Ref<{from:number;to:number}|null>;
  chartDataPlane: ChartDataPlane;
  chartDatasetKey: string;
  dataRevisionRef: Ref<number>;
  indicatorRequestSeq: Ref<number>;
  lifecycle: ChartLifecycle;
  chartUpdateScheduler: ChartUpdateScheduler;
  indicators: IndicatorConfig[];
  timeframe: string;
};

export function createChartIndicatorController(deps: ChartIndicatorControllerDeps){
  const { chart, oscChart, oscHost, candles, visibleLogicalRangeRef, chartDataPlane, chartDatasetKey, dataRevisionRef, indicatorRequestSeq, lifecycle, chartUpdateScheduler, candle, oscSeries } = deps;
  let indicators = deps.indicators;
  let timeframe = deps.timeframe;
  const indicatorSeries: Ref<ISeriesApi<'Line'>[]> = {current:[]};
  const indicatorSeriesMap = new Map<string, ISeriesApi<'Line'>[]>();
  const markerDataByIndicator = new Map<string, any[]>();
  const indicatorFillMap = new Map<string, any[]>();
  const workerSeriesMap = new Map<string, Array<ISeriesApi<'Line'>|ISeriesApi<'Histogram'>>>();
  let visibleBarsHint = 0;

  const registerIndicatorSeries=(indicatorId:string,s:ISeriesApi<'Line'>)=>{indicatorSeries.current.push(s);const group=indicatorSeriesMap.get(indicatorId)||[];group.push(s);indicatorSeriesMap.set(indicatorId,group);return s;};
  const appearanceVisibleBars=()=>{const r=visibleLogicalRangeRef.current;return r?Math.max(1,Math.abs(Number(r.to)-Number(r.from))):candles.current.length;};
  const clearChartMarkers=()=>{try{markerPlugin?.setMarkers([]);}catch{}};
  let markerPlugin:any=null;
  const setChartMarkers=(markers:any[])=>{if(!candle.current)return;try{if(!markerPlugin)markerPlugin=createSeriesMarkers(candle.current,[]);markerPlugin.setMarkers(markers.slice(-100));}catch{}};

  const renderWorkerIndicators=(results:any[])=>{
     if(!chart.current)return;
     const active=indicators.filter(x=>x.enabled);
     if(oscillatorKinds(active)&&oscHost.current&&!oscChart.current){const p=getThemePalette(getCurrentTheme());oscChart.current=createVelaNativeChart(oscHost.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:p.surface2},textColor:p.muted,fontFamily:'JetBrains Mono, monospace',fontSize:9},grid:{vertLines:{color:p.grid},horzLines:{color:p.grid}},rightPriceScale:{borderColor:p.axis},timeScale:{visible:false}})};
     const getSeries=(key:string,target:IChartApi,kind:'line'|'histogram',color:string,width=1,style:0|1|2=0)=>{
       const existing=workerSeriesMap.get(key);
       if(existing?.[0]){try{(existing[0] as any).applyOptions({color,lineWidth:width,lineStyle:style});}catch{}return existing[0];}
       const created=kind==='histogram'?target.addSeries(HistogramSeries,{color,priceFormat:{type:'price'},priceScaleId:'right'}):line(target,color,width,style);
       workerSeriesMap.set(key,[created as any]); return created as any;
     };
     const getGroup=(id:string,count:number,target:IChartApi,colorsFor:string[],width=1,style:0|1|2=0)=>{
       let group=workerSeriesMap.get(id);
       if(group?.length===count){group.forEach((g,i)=>{try{(g as any).applyOptions({color:colorsFor[i],lineWidth:width,lineStyle:style});}catch{}});return group;}
       group=colorsFor.slice(0,count).map(color=>line(target,color,width,style)); workerSeriesMap.set(id,group); return group;
     };
     const updateOrSet=(seriesApi:any,points:any[],incremental:boolean)=>{if(!seriesApi||!points.length)return; if(incremental)seriesApi.update(points[points.length-1] as any); else seriesApi.setData(points as any);};
     const updateWhitespace=(seriesApi:any,time:any)=>{try{seriesApi.update({time} as any);}catch{}};
     const advancedOscillatorKinds=new Set(['Trend Pressure','Neural Weight Oscillator','Trinity']);
     for(const result of results){
       const cfg=active.find(x=>x.id===result.id); if(!cfg||!result.data?.length)continue;
       const incremental=result.incremental===true&&result.incrementalMode==='update'; const opacity=cfg.display?.opacity; const primary=colorWithOpacity(cfg.color,opacity,colors[result.kind]||'#94a3b8'); const signalColor=colorWithOpacity(cfg.signalColor,opacity,'#c084fc'); const upperColor=colorWithOpacity(cfg.upperColor,opacity,primary); const lowerColor=colorWithOpacity(cfg.lowerColor,opacity,primary);
       const targetOsc=['RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI',...advancedOscillatorKinds].includes(result.kind);
       const target=targetOsc?oscChart.current:chart.current; if(!target)continue;
       if(result.kind==='MACD'){const [s1,s2,h]=(()=>{const c1=primary||'#38bdf8',c2=signalColor,w=cfg.lineWidth||1,ls=cfg.lineStyle||0;let g=workerSeriesMap.get(result.id);if(!g||g.length!==3){g=[line(target,c1,w,ls),line(target,c2,w,ls),target.addSeries(HistogramSeries,{priceFormat:{type:'price'},priceScaleId:'right'}) as any];workerSeriesMap.set(result.id,g);}else{try{(g[0] as any).applyOptions({color:c1,lineWidth:w,lineStyle:ls});(g[1] as any).applyOptions({color:c2,lineWidth:w,lineStyle:ls});}catch{}}return g as any[];})();const rows=Array.isArray(result.data)?result.data:[];const macdPts=safeNamedPoints(rows,'macd');const signalPts=safeNamedPoints(rows,'signal');const histPts=rows.map((x:any)=>({time:x?.time as Time,value:finiteNumber(x?.histogram),color:Number(x?.histogram)>=0?colorWithOpacity(cfg.color,Math.min(1,(opacity??1)*.35),'#3b82f6'):colorWithOpacity(cfg.signalColor,Math.min(1,(opacity??1)*.35),'#ef4444')})).filter((x:any)=>x.time!=null&&x.value!=null);updateOrSet(s1,macdPts,incremental);updateOrSet(s2,signalPts,incremental);updateOrSet(h,histPts,incremental);continue;}
       if(result.kind==='Stochastic'){const g=getGroup(result.id,2,target,[primary||'#38bdf8',signalColor||'#f59e0b'],cfg.lineWidth||1,cfg.lineStyle||0);updateOrSet(g[0],safeNamedPoints(result.data,'k'),incremental);updateOrSet(g[1],safeNamedPoints(result.data,'d'),incremental);continue;}
       if(result.kind==='Bollinger Bands'||result.kind==='Keltner Channels'||result.kind==='Donchian Channels'){const colorsFor=[upperColor,colorWithOpacity(cfg.signalColor,opacity,'#64748b'),lowerColor];const g=getGroup(result.id,3,target,colorsFor,cfg.lineWidth||1,cfg.lineStyle||0);for(let i=0;i<3;i++){const key=['upper','middle','lower'][i];updateOrSet(g[i],safeNamedPoints(result.data,key),incremental);}try{indicatorFillMap.set(cfg.id,[chart.current?.addFillBetweenSeries(g[0] as any,g[2] as any,{id:`indicator-fill:${cfg.id}`,enabled:false})].filter(Boolean));}catch{}continue;}
       if(result.kind==='Supertrend'){const g=getGroup(result.id,2,target,[primary||'#3b82f6',signalColor||'#ef4444'],cfg.lineWidth||2,cfg.lineStyle||0);if(incremental){const point=result.data[result.data.length-1];const t=point?.time as Time;if(point?.direction===1){g[0].update({time:t,value:finiteNumber(point.value)} as any);updateWhitespace(g[1],t);}else{updateWhitespace(g[0],t);g[1].update({time:t,value:finiteNumber(point.value)} as any);} }else{g[0].setData(safeLinePoints(result.data,'value').filter((x:any,i:number)=>Array.isArray(result.data)&&result.data[i]?.direction===1) as any);g[1].setData(safeLinePoints(result.data,'value').filter((x:any,i:number)=>Array.isArray(result.data)&&result.data[i]?.direction===-1) as any);}continue;}
       if(result.kind==='Ichimoku Cloud'){const g=getGroup(result.id,4,target,[primary||'#38bdf8',signalColor||'#f59e0b',upperColor||'#3b82f6',lowerColor||'#ef4444'],cfg.lineWidth||1,cfg.lineStyle||0);for(let i=0;i<4;i++){const key=['tenkan','kijun','spanA','spanB'][i];updateOrSet(g[i],safeNamedPoints(result.data,key),incremental);}try{indicatorFillMap.set(cfg.id,[chart.current?.addFillBetweenSeries(g[2] as any,g[3] as any,{id:`indicator-fill:${cfg.id}`,enabled:false})].filter(Boolean));}catch{}continue;}
       if(result.kind==='Trend Target Ribbon'){const g=getGroup(result.id,5,target,[primary,'#a78bfa',signalColor,'#3b82f6','#e879f9'],cfg.lineWidth||1,cfg.lineStyle||0);for(let i=0;i<5;i++){const key=['fast','mid','slow','Target+','Target-'][i];updateOrSet(g[i],safeNamedPoints(result.data,key),incremental);}continue;}
       const s=getSeries(result.id,target,'line',primary,cfg.lineWidth||2,cfg.lineStyle||0);updateOrSet(s,safeLinePoints(result.data,'value'),incremental);
     }
   };
  const applyIndicatorAppearanceOnly=()=>{
     if(!chart.current)return;
     const visibleBars=appearanceVisibleBars();
     for(const cfg of indicators){
       const appearance=resolveIndicatorAppearance(cfg as Record<string,unknown>,{timeframe,visibleBars});
       const options={color:appearance.line.color,lineWidth:appearance.line.width,lineStyle:appearance.line.style==='solid'?0:appearance.line.style==='dashed'?1:2,opacity:appearance.line.opacity,gradient:appearance.line.gradient,gradientColor:appearance.line.gradientColor,glow:appearance.line.glow,glowStrength:appearance.line.glowStrength,visible:appearance.visible,lastValueVisible:cfg.display?.showValues!==false};
       const group=indicatorSeriesMap.get(cfg.id)||[];
       const isLevelIndicator=LEVEL_APPEARANCE_KINDS.has(String(cfg.kind));
       for(const series of group){try{(series as any).applyOptions(options); if(isLevelIndicator){(series as any).applyOptions({visible:appearance.visible&&appearance.levels.enabled,lineWidth:appearance.levels.width,lineStyle:appearance.levels.style==='solid'?0:appearance.levels.style==='dashed'?1:2,lastValueVisible:appearance.levels.label&&appearance.levels.labelPlacement==='axis'});}}catch{}}
       const worker=workerSeriesMap.get(cfg.id)||[];
       for(const series of worker){try{(series as any).applyOptions({...options, ...(isLevelIndicator?{visible:appearance.visible&&appearance.levels.enabled}: {})});}catch{}}
     }
     for(const cfg of indicators){
       const appearance=resolveIndicatorAppearance(cfg as Record<string,unknown>,{timeframe,visibleBars});
       const targetPaneId=appearance.pane.mode==='separate'?`tco-indicator-pane:${cfg.id}`:undefined;
       const group=indicatorSeriesMap.get(cfg.id)||[];
       for(const series of group){try{(series as any).setPaneAppearance(appearance.pane,targetPaneId);}catch{}}
       const fills=indicatorFillMap.get(cfg.id)||[];
       for(const handle of fills){try{handle.setOptions({enabled:appearance.visible&&appearance.fill.enabled,upperColor:appearance.fill.upperColor,lowerColor:appearance.fill.lowerColor,opacity:appearance.fill.opacity,gradient:appearance.fill.gradient,conditional:appearance.fill.conditional,bullishColor:appearance.fill.bullishColor,bearishColor:appearance.fill.bearishColor});}catch{}}
     }
     const markerStyles:any[]=[];
     for(const [indicatorId,rawMarkers] of markerDataByIndicator){
       const cfg=indicators.find(x=>x.id===indicatorId); if(!cfg)continue;
       const a=resolveIndicatorAppearance(cfg as Record<string,unknown>,{timeframe,visibleBars});
       if(!a.marker.enabled||!a.visible)continue;
       const size=a.marker.size<=4?'tiny':a.marker.size<=6?'small':a.marker.size<=10?'normal':a.marker.size<=14?'large':'huge';
       for(const marker of rawMarkers.slice(-100)) markerStyles.push({...marker,position:a.marker.position,color:a.marker.color,shape:a.marker.shape,text:a.marker.text||marker.text,size,textSize:a.marker.textSize,offset:a.marker.offset});
     }
     setChartMarkers(markerStyles);
   };
  const renderStudies=(data:HistoricalCandle[], preserveWorkerSeries=false)=>{
     clearChartMarkers();
  
     indicatorSeries.current.forEach(s=>{try{chart.current?.removeSeries(s)}catch{}});indicatorSeries.current=[];indicatorSeriesMap.clear();markerDataByIndicator.clear();indicatorFillMap.forEach(handles=>handles.forEach(h=>{try{h.remove()}catch{}}));indicatorFillMap.clear();oscSeries.current.forEach(s=>{try{oscChart.current?.removeSeries(s as any)}catch{}});oscSeries.current=[];
     if(!preserveWorkerSeries){workerSeriesMap.forEach(group=>group.forEach(s=>{try{chart.current?.removeSeries(s as any)}catch{} try{oscChart.current?.removeSeries(s as any)}catch{}})); workerSeriesMap.clear();}
     const active=indicators.filter(x=>x.enabled); const needsOsc=oscillatorKinds(active); const chartMarkers:any[]=[];
     if(needsOsc&&oscHost.current&&!oscChart.current){const p=getThemePalette(getCurrentTheme());oscChart.current=createVelaNativeChart(oscHost.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:p.surface2},textColor:p.muted,fontFamily:'JetBrains Mono, monospace',fontSize:9},grid:{vertLines:{color:p.grid},horzLines:{color:p.grid}},rightPriceScale:{borderColor:p.axis},timeScale:{visible:false}})};
     if(!needsOsc&&oscChart.current){try{oscChart.current.remove()}catch{}oscChart.current=null;}
     for(const cfg of active){
       if(!chart.current)continue;
       if(['EMA','SMA','HMA','ATR','RSI','ADX','CCI','OBV','MFI','VWAP','Bollinger Bands','Keltner Channels','Donchian Channels','Supertrend','Ichimoku Cloud'].includes(cfg.kind))continue;
       if(cfg.kind==='Market Structure'){const ms=marketStructure(data,cfg.period||3);const latest=ms.slice(-6);for(const x of latest){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.type.includes('H')?'#ef4444':'#3b82f6'),lineWidth:Math.max(1,Math.min(6,cfg.lineWidth||1)),lineStyle:cfg.lineStyle||0,priceLineVisible:true,lastValueVisible:false});s.setData([{time:x.time as Time,value:x.price},{time:Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time,value:x.price}] as any);registerIndicatorSeries(cfg.id,s);}continue;}
       if(cfg.kind==='Fair Value Gaps'){const zones=fairValueGaps(data);for(const z of zones.slice(-8)){for(const price of [z.upper,z.lower]){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(z.kind==='bullish'?'#3b82f666':'#ef444466'),lineWidth:Math.max(1,Math.min(6,cfg.lineWidth||1)),lineStyle:cfg.lineStyle??2,priceLineVisible:false,lastValueVisible:false});const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;s.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);registerIndicatorSeries(cfg.id,s);}}continue;}
       if(cfg.kind==='Dynamic Support/Resistance'){const levels=dynamicSupportResistance(data,cfg.period||5).slice(-10);const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const x of levels){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='support'?'#3b82f6':'#ef4444'),lineWidth:Math.max(1,Math.min(6,cfg.lineWidth||1)),lineStyle:cfg.lineStyle??2,priceLineVisible:false,lastValueVisible:false});s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);registerIndicatorSeries(cfg.id,s);}continue;}
       if(cfg.kind==='Liquidity Sweeps'){const sweeps=liquiditySweeps(data,cfg.period||5).slice(-12);for(const x of sweeps){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='sell-side'?'#3b82f6':'#f59e0b'),lineWidth:Math.max(1,Math.min(6,cfg.lineWidth||2)),lineStyle:cfg.lineStyle??0,priceLineVisible:false,lastValueVisible:false});const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);registerIndicatorSeries(cfg.id,s);}continue;}
       if(cfg.kind==='Order Blocks'){const zones=orderBlocks(data,cfg.period||5).slice(-8);const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const z of zones){for(const price of [z.upper,z.lower]){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(z.kind==='bullish'?'#38bdf8':'#fb7185'),lineWidth:Math.max(1,Math.min(6,cfg.lineWidth||1)),lineStyle:cfg.lineStyle??1,priceLineVisible:false,lastValueVisible:false});s.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);registerIndicatorSeries(cfg.id,s);}}continue;}
       if(cfg.kind==='CPR' || cfg.kind==='Key Levels' || cfg.kind==='Opening Range' || cfg.kind==='Weekly Levels' || cfg.kind==='Swing Levels' || cfg.kind==='Gap Levels'){
         const levels=cfg.kind==='CPR'?cpr(data):cfg.kind==='Key Levels'?indianKeyLevels(data):cfg.kind==='Opening Range'?openingRange(data,cfg.period||15):cfg.kind==='Swing Levels'?swingLevels(data,cfg.period||3):gapLevels(data);
         const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
         for(const x of levels){const s=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='support'?'#3b82f6':x.side==='resistance'?'#ef4444':'#60a5fa'),lineWidth:x.label.includes('CPR')?2:1,lineStyle: x.label.includes('GAP')?1:2,priceLineVisible:false,lastValueVisible:true});s.setData([{time:x.time as Time,value:x.price},{time:end,value:x.price}] as any);registerIndicatorSeries(cfg.id,s);}
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
         for(const x of levels){const ss=chart.current.addSeries(LineSeries,{color:cfg.color||(x.side==='support'?'#3b82f6':x.side==='resistance'?'#ef4444':'#60a5fa'),lineWidth:x.label==='P'||x.label==='TC'||x.label==='BC'?2:1,lineStyle:2,priceLineVisible:false,lastValueVisible:true});ss.setData([{time:(x.time||start) as Time,value:x.price},{time:end,value:x.price}] as any);registerIndicatorSeries(cfg.id,ss);} continue;
       }
       if(cfg.kind==='Gap Zones'){
         const zones=gapZones(data); const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
         for(const z of zones){for(const price of [z.upper,z.lower]){const ss=chart.current.addSeries(LineSeries,{color:z.kind==='bullish'?'#3b82f699':'#ef444499',lineWidth:2,lineStyle:1,priceLineVisible:false,lastValueVisible:false});ss.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);registerIndicatorSeries(cfg.id,ss);}}
         continue;
       }
       if(['BOS / CHOCH','Breakout / Retest','Failed Breakout','Rejection Candles','Inside Bar Breakout','Engulfing Patterns','Pin Bars','NR7 Volatility Contraction'].includes(cfg.kind)){
         const ev=priceActionEvents(data); const structure=cfg.kind==='BOS / CHOCH'?bosChoch(data,cfg.period||3):[]; let all:any[]=cfg.kind==='BOS / CHOCH'?structure:ev.filter(x=>{if(cfg.kind==='Rejection Candles')return x.label.startsWith('REJECTION');if(cfg.kind==='Inside Bar Breakout')return x.label.startsWith('INSIDE');if(cfg.kind==='Engulfing Patterns')return x.label.startsWith('ENGULF');if(cfg.kind==='Pin Bars')return x.label.startsWith('PIN');return false;});
         if(cfg.kind==='NR7 Volatility Contraction') all=nr7(data);
         if(cfg.kind==='Breakout / Retest' || cfg.kind==='Failed Breakout'){const sw=dynamicSupportResistance(data,cfg.period||5);for(let i=1;i<data.length;i++){const prev=data[i-1],cur=data[i],t=Math.floor(new Date(cur.timestamp).getTime()/1000);for(const lv of sw.slice(-12)){if(prev.close<=lv.price&&cur.close>lv.price)all.push({time:t,price:lv.price,label:'BREAK ↑',side:'bullish'});if(prev.close>=lv.price&&cur.close<lv.price)all.push({time:t,price:lv.price,label:'BREAK ↓',side:'bearish'});if(cfg.kind==='Failed Breakout'){if(prev.high>lv.price&&prev.close<lv.price&&cur.close<lv.price)all.push({time:t,price:lv.price,label:'FAILED ↓',side:'bearish'});if(prev.low<lv.price&&prev.close>lv.price&&cur.close>lv.price)all.push({time:t,price:lv.price,label:'FAILED ↑',side:'bullish'});}}}}
         const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
         for(const x of all.slice(-30)){ chartMarkers.push({indicatorId:cfg.id,time:x.time as Time,position:x.side==='bullish'?'belowBar':'aboveBar',color:cfg.color||(x.side==='bullish'?'#3b82f6':'#ef4444'),shape:x.side==='bullish'?'arrowUp':'arrowDown',text:x.label}); }
         continue;
       }
       if(cfg.kind==='FVG + Mitigation' || cfg.kind==='Order Blocks + Mitigation'){
         const zones=cfg.kind==='FVG + Mitigation'?fairValueGaps(data):orderBlocks(data,cfg.period||5); const end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
         for(const z of zones.slice(-10)){let mitigated=false;const zi=data.findIndex(x=>Math.floor(new Date(x.timestamp).getTime()/1000)===z.time);for(let i=Math.max(0,zi);i<data.length;i++){if(data[i].low<=z.upper&&data[i].high>=z.lower){mitigated=true;break;}}const alpha=mitigated?'44':'99';for(const price of [z.upper,z.lower]){const ss=chart.current.addSeries(LineSeries,{color:cfg.color||`#94a3b8${alpha}`,lineWidth:mitigated?1:2,lineStyle:mitigated?2:0,priceLineVisible:false,lastValueVisible:false});ss.setData([{time:z.time as Time,value:price},{time:end,value:price}] as any);registerIndicatorSeries(cfg.id,ss);}} continue;
       }
       if(cfg.kind==='VWAP Deviation Bands'){
         const bands=vwapDeviationBands(data,cfg.multiplier||1,cfg.source||'hlc3');for(const key of ['middle','upper','lower'] as const){const ss=line(chart.current,key==='middle'?(cfg.color||'#c084fc'):(key==='upper'?(cfg.upperColor||cfg.color||'#a78bfa'):(cfg.lowerColor||cfg.color||'#a78bfa')),key==='middle'?(cfg.lineWidth||2):Math.max(1,(cfg.lineWidth||2)-1),cfg.lineStyle||0);ss.setData(bands.map(x=>({time:x.time as Time,value:x[key]})) as any);registerIndicatorSeries(cfg.id,ss);}continue;
       }
       if(cfg.kind==='Anchored VWAP'){const ss=line(chart.current,cfg.color||'#f97316',cfg.lineWidth||2,cfg.lineStyle||0);ss.setData(anchoredVwap(data,cfg.period||5,cfg.source||'hlc3') as any);registerIndicatorSeries(cfg.id,ss);continue;}
       if(['Adaptive Ehlers','ATR Percentile Bands','CVD Profiles','Delta Sigma Heatmap','Dual Phase Reversal','Fractional EMA Kalman Filter','Harmonic Lab','HTF 3 Candle System','HTF Volume Spike & Imbalance Projection','Initial Balance Auction Intelligence','LTF Volume Microburst Bubbles','Market Structure Dashboard','Neural Weight Oscillator','OrderBlock AI','Pivot Consolidation Zone','Stoploss Cascades','Trend Pressure','Trend Target Ribbon','Trinity','Volatility Shock Half Life Monitor','Volume Delta Footprint','Wyckoff'].includes(cfg.kind)){
         const result=advancedIndicatorModel(data,cfg.kind,cfg);
         const lineColors=[cfg.color||'#38bdf8',cfg.upperColor||'#a78bfa',cfg.lowerColor||'#f59e0b','#3b82f6','#e879f9'];
         Object.entries(result.lines).forEach(([name,pts],idx)=>{
           const ss=line(chart.current,lineColors[idx%lineColors.length],cfg.lineWidth||2,cfg.lineStyle||0);
           ss.applyOptions({title:`${cfg.kind} · ${name}`}); ss.setData(pts.map(x=>({time:x.time as Time,value:x.value})) as any); registerIndicatorSeries(cfg.id,ss);
         });
         const start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
         for(const z of result.zones.slice(-20)){
           const col=z.side==='bull'?'#3b82f6':z.side==='bear'?'#ef4444':'#60a5fa';
           const outline=[{time:Math.max(Number(z.startTime),Number(start)) as Time,value:z.lower},{time:end,value:z.lower},{time:end,value:z.upper},{time:Math.max(Number(z.startTime),Number(start)) as Time,value:z.upper},{time:Math.max(Number(z.startTime),Number(start)) as Time,value:z.lower}];
           const ss=line(chart.current,`${col}99`,1,1); ss.setData(outline as any); registerIndicatorSeries(cfg.id,ss);
         }
         for(const m of result.markers.slice(-40)){
           chartMarkers.push({indicatorId:cfg.id,time:m.time as Time,position:m.side==='bull'?'belowBar':'aboveBar',color:m.side==='bull'?'#3b82f6':m.side==='bear'?'#ef4444':'#f59e0b',shape:m.side==='bull'?'arrowUp':m.side==='bear'?'arrowDown':'circle',text:`${cfg.kind} · ${m.label}`});
         }
         continue;
       }
       if(cfg.kind==='TradingCore V Price Action'){
         const result=tradingCoreVPriceAction(data,cfg.period||5,cfg.multiplier||2,cfg.lookback||200);
         const start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;
         for(const x of result.levels.slice(0,12)){
           const col=x.side==='support'?'#3b82f6':x.side==='resistance'?'#ef4444':'#60a5fa';
           const ss=chart.current.addSeries(LineSeries,{color:cfg.color||col,lineWidth:x.score>=.8?2:1,lineStyle:x.score>=.8?0:2,priceLineVisible:false,lastValueVisible:true,title:`${x.label} · ${Math.round(x.score*100)}%`});
           ss.setData([{time:start,value:x.price},{time:end,value:x.price}] as any);registerIndicatorSeries(cfg.id,ss);
         }
         for(const z of result.zones){
           const col=z.kind==='Demand'?'#3b82f6':'#ef4444';
           const st=Math.max(Number(z.startTime),Number(start));
           const outline=[{time:st as Time,value:z.lower},{time:end,value:z.lower},{time:end,value:z.upper},{time:st as Time,value:z.upper},{time:st as Time,value:z.lower}];
           const ss=chart.current.addSeries(LineSeries,{color:cfg.color||col,lineWidth:z.score>=.8?2:1,lineStyle:z.mitigated?2:1,priceLineVisible:false,lastValueVisible:false,title:`${z.kind} · ${Math.round(z.score*100)}%`});
           ss.setData(outline as any);registerIndicatorSeries(cfg.id,ss);
         }
         continue;
       }
       if(cfg.kind==='Pivot Points'){const pv=classicPivots(data).length?classicPivots(data):pivots(data),start=Math.floor(new Date(data[0].timestamp).getTime()/1000) as Time,end=Math.floor(new Date(data[data.length-1].timestamp).getTime()/1000) as Time;for(const x of pv){const s=chart.current.addSeries(LineSeries,{color:cfg.color||'#f59e0b',lineWidth:cfg.lineWidth||1,lineStyle:cfg.lineStyle??2,priceLineVisible:true,lastValueVisible:true});s.setData([{time:start,value:x.value},{time:end,value:x.value}] as any);registerIndicatorSeries(cfg.id,s);}continue;}
     }
     const markerGroups=new Map<string,any[]>(); for(const marker of chartMarkers){const id=String(marker.indicatorId||'');if(!id)continue;const arr=markerGroups.get(id)||[];arr.push(marker);markerGroups.set(id,arr);} markerDataByIndicator.current=markerGroups; setChartMarkers(chartMarkers.map(({indicatorId:_id,...marker})=>marker)); applyIndicatorAppearanceOnly();
   };

  const requestIndicatorWorker=(data:HistoricalCandle[], range=visibleLogicalRangeRef.current, mode:'snapshot'|'incremental'='snapshot', operation:'replace'|'append'='replace')=>{
     const requestSeq=++indicatorRequestSeq.current;
     const revision=dataRevisionRef.current;
     const market=chartDataPlane.readCanonical();
     const incrementalKey=`${chartDatasetKey}|${chartId.current}`;
     void chartComputeCoordinator.runIndicators(chartDatasetKey,revision,market,indicators,{mode,operation,incrementalKey,range},data).then(results=>{
       if(requestSeq!==indicatorRequestSeq.current||!lifecycle.current.isAlive()||revision!==dataRevisionRef.current||data!==candles.current||!chart.current)return;
       chartUpdateScheduler.current.scheduleLatest('shared-worker-indicators',()=>{try{renderWorkerIndicators(results);}catch(indicatorError){console.warn('[TradingCore] Shared indicator render skipped invalid data:',indicatorError);}});
     });
   };

  return {
    setInputs(next:{indicators:IndicatorConfig[];timeframe:string}){
      indicators=next.indicators; timeframe=next.timeframe;
    },
    getIndicatorSeries(){return indicatorSeries.current;},
    getMaps(){return {indicatorSeriesMap,markerDataByIndicator,indicatorFillMap,workerSeriesMap};},
    clear(){
      indicatorSeries.current.forEach(series=>{try{chart.current?.removeSeries(series)}catch{}});
      workerSeriesMap.forEach(group=>group.forEach(series=>{try{chart.current?.removeSeries(series as any)}catch{};try{oscChart.current?.removeSeries(series as any)}catch{}}));
      indicatorFillMap.forEach(handles=>handles.forEach(handle=>{try{handle.remove()}catch{}}));
      indicatorSeries.current=[];indicatorSeriesMap.clear();markerDataByIndicator.clear();indicatorFillMap.clear();workerSeriesMap.clear();oscSeries.current=[];
      try{markerPlugin?.setMarkers([]);markerPlugin?.detach?.();}catch{} markerPlugin=null;
    },
    requestIndicatorWorker,
    renderWorkerIndicators,
    renderStudies,
    applyIndicatorAppearanceOnly,
    appearanceVisibleBars,
  };
}
