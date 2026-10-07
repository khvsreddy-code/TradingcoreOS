import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import type { DrawingTool } from '../../../components/workspace/drawingTypes';
import type { IChartApi, ISeriesApi } from './velaNativeChartKernel';
import type { ChartLifecycle } from './chartLifecycle';
import type { ChartStore } from './ChartStore';

type Ref<T>={current:T};

export type ChartInteractionControllerDeps={
  chart:Ref<IChartApi|null>;
  candle:Ref<ISeriesApi<'Candlestick'>|null>;
  host:Ref<HTMLDivElement|null>;
  candles:Ref<HistoricalCandle[]>;
  chartStore:ChartStore;
  lifecycle:ChartLifecycle;
  generation:number;
  indicatorController:any;
  dataController:{loadOlderHistory:(visibleBars?:number)=>Promise<unknown>};
  timeframe:string;
  chartIndex?:number;
  resolvedInstrumentKey:string;
  previousLogicalRange:Ref<{from:number;to:number}|null>;
  drawingToolRef:Ref<DrawingTool>;
  setDrawingTool?:(tool:DrawingTool)=>void;
  rendererController:{resize:(width:number,height:number)=>void};
  crosshairVisible:boolean;
  onDebugBar?:(detail:unknown)=>void;
  shouldLoadOlderHistory:(range:{from:number;to:number},length:number,timeframe:string)=>boolean;
};

export function createChartInteractionController(deps:ChartInteractionControllerDeps){
  let ignoreRangeEvents=3;

  const onVisibleLogicalRangeChange=(range:any)=>{
    if(!range)return;
    const normalized={from:Number(range.from),to:Number(range.to)};
    deps.chartStore.setVisibleRange(normalized);
    deps.indicatorController.applyIndicatorAppearanceOnly();
    deps.indicatorController.requestIndicatorWorker(deps.candles.current,normalized,'snapshot','replace');
    if(ignoreRangeEvents>0){ignoreRangeEvents-=1;deps.previousLogicalRange.current=normalized;return;}
    const previous=deps.previousLogicalRange.current;
    const movingBackward=!!previous&&normalized.from<previous.from-2;
    deps.previousLogicalRange.current=normalized;
    const visibleBars=Math.max(1,Math.abs(normalized.to-normalized.from));
    if(deps.chartStore.getSnapshot().historyReady&&movingBackward&&deps.shouldLoadOlderHistory(normalized,deps.candles.current.length,deps.timeframe)){
      void deps.dataController.loadOlderHistory(Math.min(deps.candles.current.length,visibleBars));
    }
  };

  const onChartClick=(param:any)=>{
    if(deps.drawingToolRef.current!=='none')return;
    if(!param?.point||!deps.candle.current)return;
    const timeScale=deps.chart.current?.timeScale() as any;
    const rawTime=timeScale?.coordinateToTime?.(param.point.x);
    const rawPrice=(deps.candle.current as any)?.coordinateToPrice?.(param.point.y);
    if(rawTime==null||rawPrice==null||!Number.isFinite(Number(rawPrice)))return;
    deps.onDebugBar?.({chartIndex:deps.chartIndex,symbol:deps.resolvedInstrumentKey,timeframe:deps.timeframe,barIndex:-1,time:Number(rawTime),price:Number(rawPrice)});
  };

  const resizeObserver=typeof ResizeObserver!=='undefined'&&deps.host.current
    ? new ResizeObserver(()=>{
        if(!deps.lifecycle.isCurrent(deps.generation))return;
        try{
          const r=deps.host.current!.getBoundingClientRect();
          deps.rendererController.resize(r.width,r.height);
        }catch{}
      })
    : undefined;

  const attach=()=>{
    const chart=deps.chart.current;
    const host=deps.host.current;
    if(!chart||!host)return ()=>undefined;
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange);
    chart.subscribeClick(onChartClick);
    resizeObserver?.observe(host);
    return ()=>{
      try{chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleLogicalRangeChange)}catch{}
      try{chart.unsubscribeClick(onChartClick)}catch{}
      resizeObserver?.disconnect();
    };
  };

  return {attach,onVisibleLogicalRangeChange};
}
