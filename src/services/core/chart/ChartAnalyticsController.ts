import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import type { ISeriesApi } from './velaNativeChartKernel';
import type { ChartDataPlane } from '../../marketData/chartDataPlane';
import { chartComputeCoordinator } from '../../marketData/chartComputeCoordinator';
import { buildOIChartAnalytics, type OIChartAnalytics, type OIWallState } from '../../marketData/oiEngine';
import { tradingCoreRuntime } from '../runtime/TradingCoreRuntime';
import type { ChartStore } from './ChartStore';
import type { ChartLifecycle } from './chartLifecycle';
import type { NormalizedMarketTick } from '../../../types/market';
import type { ChartAnalytics } from '../../marketData/levelEngine';

type Ref<T>={current:T};

export type ChartAnalyticsControllerDeps={
  brokerId:string;
  instrumentKey:string;
  chartDatasetKey:string;
  chartDataPlane:ChartDataPlane;
  chartStore:ChartStore;
  dataRevisionRef:Ref<number>;
  candles:Ref<HistoricalCandle[]>;
  latestTick:Ref<NormalizedMarketTick|undefined>;
  candle:Ref<ISeriesApi<'Candlestick'>|null>;
  lifecycle:Ref<ChartLifecycle>;
  isOiVisible:()=>boolean;
  onAnalytics?:(analytics:ChartAnalytics)=>void;
  onOiAnalytics?:(analytics:OIChartAnalytics|null)=>void;
};

export function createChartAnalyticsController(deps:ChartAnalyticsControllerDeps){
  let analytics:ChartAnalytics|null=null;
  let oiAnalytics:OIChartAnalytics|null=null;
  let analyticsTimer:ReturnType<typeof setTimeout>|null=null;
  let analyticsUiTimer:ReturnType<typeof setTimeout>|null=null;
  let oiUiTimer:ReturnType<typeof setTimeout>|null=null;

  const publishAnalytics=(data:HistoricalCandle[],spot:number,immediate=false)=>{
    const revision=deps.dataRevisionRef.current;
    const run=()=>{
      analyticsTimer=null;
      void chartComputeCoordinator.runAnalytics(
        deps.chartDatasetKey,
        revision,
        deps.chartDataPlane.readCanonical(),
        spot,
        data,
      ).then(result=>{
        if(revision!==deps.dataRevisionRef.current||data!==deps.candles.current||!deps.lifecycle.current.isAlive())return;
        analytics=result;
        deps.chartStore.setAnalytics(result);
        if(analyticsUiTimer==null){
          analyticsUiTimer=setTimeout(()=>{
            analyticsUiTimer=null;
            deps.onAnalytics?.(analytics);
          },250);
        }
      }).catch(()=>undefined);
    };
    if(immediate){
      if(analyticsTimer){clearTimeout(analyticsTimer);analyticsTimer=null;}
      run();
      return;
    }
    if(analyticsTimer)return;
    analyticsTimer=setTimeout(run,200);
  };

  const renderOI=(oi:OIChartAnalytics|null)=>{
    oiAnalytics=oi;
    deps.chartStore.setOiAnalytics(oi);
    if(oiUiTimer==null){
      oiUiTimer=setTimeout(()=>{
        oiUiTimer=null;
        deps.onOiAnalytics?.(oiAnalytics);
      },250);
    }
    const candle=deps.candle.current;
    if(!candle)return;
    try{for(const line of ((candle as any)._tcoOiLines||[]))candle.removePriceLine(line);}catch{}
    if(!deps.isOiVisible()||!oi)return;
    const fmtOi=(n:number)=>n>=1000000?`${(n/1000000).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(0)}K`:Math.round(n).toString();
    const lines:any[]=[];
    for(const level of oi.levels.slice(0,6)){
      const color=level.side==='resistance'?'#ef4444':'#3b82f6';
      const faded=level.state==='MITIGATED';
      lines.push(candle.createPriceLine({
        price:level.strike,
        color:faded?`${color}44`:color,
        lineWidth:faded?1:level.width,
        lineStyle:faded?2:level.state==='TESTING'?1:0,
        axisLabelVisible:true,
        lastValueVisible:true,
        title:`${level.label} · ${fmtOi(level.oi)} · Δ ${level.deltaOi>=0?'+':''}${fmtOi(Math.abs(level.deltaOi))}${level.distanceStrikes?` · ${level.distanceStrikes} str`:''}`,
      }));
    }
    if(oi.maxPain)lines.push(candle.createPriceLine({price:oi.maxPain,color:'#f59e0b',lineWidth:2,lineStyle:2,axisLabelVisible:true,title:'MAX PAIN'}));
    if(oi.flip)lines.push(candle.createPriceLine({price:oi.flip.strike,color:'#a78bfa',lineWidth:2,lineStyle:1,axisLabelVisible:true,title:`OI FLIP · ${oi.flip.direction==='PUT_DOMINANT'?'PUT':'CALL'}`}));
    try{(candle as any)._tcoOiLines=lines;}catch{}
  };

  const refreshOI=async()=>{
    if(!deps.isOiVisible())return;
    try{
      const chain=await tradingCoreRuntime.getOptionChain(deps.instrumentKey);
      const spot=Number(deps.latestTick.current?.ltp)||Number(chain.spot)||Number(deps.candles.current[deps.candles.current.length-1]?.close)||0;
      const signature=(chain.contracts||[]).map((c:any)=>`${c.strike}:${c.call?.oi||0}:${c.call?.previousOi||0}:${c.put?.oi||0}:${c.put?.previousOi||0}`).join('|');
      const current=oiAnalytics;
      if(current && (current as any)._signature===signature){renderOI({...current,spot,updatedAt:new Date().toISOString()});return;}
      const next=buildOIChartAnalytics(chain,spot,analytics?.atr||0) as OIChartAnalytics;
      (next as any)._signature=signature;
      renderOI(next);
      window.dispatchEvent(new CustomEvent('tradingcore:oi-analytics',{detail:next}));
    }catch{}
  };

  const updateOiSpot=(spot:number)=>{
    const current=oiAnalytics;
    if(!current)return;
    const tolerance=Math.max(analytics?.atr||0,1)*.18;
    const walls=current.walls.map(w=>({
      ...w,
      state:(w.side==='PUT'
        ? (spot<w.strike-tolerance?'MITIGATED':Math.abs(spot-w.strike)<=tolerance?'TESTING':'ACTIVE')
        : (spot>w.strike+tolerance?'MITIGATED':Math.abs(spot-w.strike)<=tolerance?'TESTING':'ACTIVE')) as OIWallState,
    }));
    const levels=current.levels.map(l=>({
      ...l,
      state:(l.side==='support'
        ? (spot<l.strike-tolerance?'MITIGATED':Math.abs(spot-l.strike)<=tolerance?'TESTING':'ACTIVE')
        : (spot>l.strike+tolerance?'MITIGATED':Math.abs(spot-l.strike)<=tolerance?'TESTING':'ACTIVE')) as OIWallState,
    }));
    const changed=walls.some((w,i)=>w.state!==current.walls[i]?.state)||levels.some((l,i)=>l.state!==current.levels[i]?.state);
    const next={...current,spot,walls,levels};
    oiAnalytics=next;
    if(changed)renderOI(next);
  };

  const getAnalytics=()=>analytics;
  const getOiAnalytics=()=>oiAnalytics;
  const dispose=()=>{
    if(analyticsTimer)clearTimeout(analyticsTimer);
    if(analyticsUiTimer)clearTimeout(analyticsUiTimer);
    if(oiUiTimer)clearTimeout(oiUiTimer);
    analyticsTimer=analyticsUiTimer=oiUiTimer=null;
  };

  return {publishAnalytics,renderOI,refreshOI,updateOiSpot,getAnalytics,getOiAnalytics,dispose};
}
