import type { HistoricalCandle } from '../../../brokers/BrokerAdapter';
import { PREDICTION_MODELS } from '../../../predictionEngine';
import { chartPredictionCoordinator } from '../../../marketData/chartPredictionCoordinator';
import { LineSeries, type IChartApi, type ISeriesApi, type Time } from '../velaNativeChartKernel';
import { CHART_TIMEFRAME_SECONDS } from '../../../marketData/chartDataPlane';

type Ref<T>={current:T};

export type ChartPredictionControllerDeps={
  chart:Ref<IChartApi|null>;
  candles:Ref<HistoricalCandle[]>;
  predictionLines:Ref<any[]>;
  predictionJob:Ref<number>;
  predictionModelIds:string[];
  chartDatasetKey:string;
  dataRevisionRef:Ref<number>;
  resolvedInstrumentKey:string;
  timeframe:string;
};

export function createChartPredictionController(deps:ChartPredictionControllerDeps){
  const {chart,candles,predictionLines,predictionJob}=deps;
  let predictionModelIds=deps.predictionModelIds;
  let chartDatasetKey=deps.chartDatasetKey;
  let resolvedInstrumentKey=deps.resolvedInstrumentKey;
  let timeframe=deps.timeframe;
  const seconds=CHART_TIMEFRAME_SECONDS;
  const renderPredictionOverlay=const renderPredictionOverlay=async(data:HistoricalCandle[])=>{
     if(!chart.current)return;
     const job=++predictionJob.current;
     // Clear means genuinely clear: never inject default models after the user
     // explicitly selected zero models. This also prevents stale series from
     // surviving an async production-model response.
     predictionLines.current.forEach(x=>{try{chart.current?.removeSeries(x)}catch{}});
     predictionLines.current=[];
     if(data.length<30 || predictionModelIds.length===0)return;
     const ids=predictionModelIds.slice(0,39);
     const last=data[data.length-1], lastTime=Math.floor(Date.parse(last.timestamp)/1000); const sec=seconds[timeframe]||300;
     const palette=['#38bdf8','#a78bfa','#f59e0b','#3b82f6','#ef4444','#ec4899','#2563eb','#f97316','#8b5cf6','#60a5fa','#06b6d4','#e879f9','#fb7185','#60a5fa','#60a5fa','#c084fc','#fbbf24','#60a5fa','#f472b6','#67e8f9','#fdba74','#93c5fd','#818cf8','#f0abfc','#60a5fa','#f87171','#93c5fd','#d8b4fe'];
     const styles=[0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0,2,1,0];
     const localId=(id:string)=>id==='production-xgboost-direction'?'xgb-direction':id==='production-lstm-sequence'?'lstm-sequence':id==='production-transformer'?'transformer-attention':id;
     let localFallback:Record<string,any>={};
     const plot=(production:Record<string,any>|null)=>{
       if(!chart.current||job!==predictionJob.current)return 0;
       predictionLines.current.forEach(x=>{try{chart.current?.removeSeries(x)}catch{}}); predictionLines.current=[];
       let plotted=0;
       for(const [idx,id] of ids.entries()){
         const model=PREDICTION_MODELS.find(m=>m.id===id); if(!model)continue;
         const remote=production?.[id] || (id==='production-xgboost-direction'?production?.xgboost:null) || (id==='production-lstm-sequence'?production?.lstm:null) || (id==='production-transformer'?production?.transformer:null);
         const source:any=remote&&remote.trained!==false&&remote.status!=='unavailable'?remote:localFallback[id];
         if(!source)continue;
         const predictedPrice=Number(source?.predicted_price ?? source?.predictedPrice ?? last.close);
         const expectedMove=Math.max(0,Number(source?.expected_move ?? source?.expectedMove ?? Math.abs(predictedPrice-last.close)));
         if(!Number.isFinite(predictedPrice)||!Number.isFinite(expectedMove))continue;
         const sign=predictedPrice>=last.close?1:-1; const totalMove=predictedPrice-last.close; const alg=model.algorithm;
         const shape = alg==='arima' ? [0,.18,.38,.57,.78,1] : alg==='sarima' ? [0,.12,.48,.30,.72,1] : alg==='ets' ? [0,.28,.50,.68,.84,1] : alg==='prophet' ? [0,.16,.36,.60,.82,1] : alg==='knn' ? [0,.34,.12,.55,.76,1] : alg==='svr' ? [0,.10,.27,.49,.72,1] : alg==='lstm'||alg==='bilstm'||alg==='lstm_gru' ? [0,.06,.20,.43,.70,1] : alg==='cnn_lstm' ? [0,.22,.08,.39,.67,1] : alg==='transformer'||alg==='tft' ? [0,.30,.18,.56,.78,1] : alg==='garch' ? [0,.18,.40,.62,.82,1] : alg==='sentiment_hybrid' ? [0,.14,.42,.66,.88,1] : alg==='conformal_ensemble'||alg==='quantile_forest' ? [0,.20,.40,.60,.80,1] : [0,.20,.40,.60,.80,1];
         const points=shape.map((q,j)=>({time:(lastTime+sec*j) as Time,value:last.close+totalMove*q+(j>0&&j<shape.length-1?sign*expectedMove*(0.035*Math.sin(j*1.7+idx)):0)}));
         const lineColor=palette[idx%palette.length];
         const mid=chart.current.addSeries(LineSeries,{color:lineColor,lineWidth:id==='ensemble-voting'?3:2,lineStyle:styles[idx%styles.length] as 0|1|2,priceLineVisible:false,lastValueVisible:true,title:`${model.name}${source?.model_version?` · v${source.model_version}`:''}`});
         mid.setData(points as any); predictionLines.current.push(mid);
         const upperBoundRaw=Number(source?.upper_bound ?? source?.upperBound ?? (last.close+expectedMove)); const lowerBoundRaw=Number(source?.lower_bound ?? source?.lowerBound ?? (last.close-expectedMove));
         const upperBound=Number.isFinite(upperBoundRaw)?upperBoundRaw:last.close+expectedMove; const lowerBound=Number.isFinite(lowerBoundRaw)?lowerBoundRaw:last.close-expectedMove;
         const upperPoints=points.map((pt,j)=>({time:pt.time,value:pt.value+(upperBound-last.close)*(j/Math.max(1,shape.length-1))}));
         const lowerPoints=points.map((pt,j)=>({time:pt.time,value:pt.value+(lowerBound-last.close)*(j/Math.max(1,shape.length-1))}));
         const upper=chart.current.addSeries(LineSeries,{color:lineColor+'66',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false}); upper.setData(upperPoints as any); predictionLines.current.push(upper);
         const lower=chart.current.addSeries(LineSeries,{color:lineColor+'66',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false}); lower.setData(lowerPoints as any); predictionLines.current.push(lower);
         plotted++;
       }
       if(plotted&&chart.current){try{chart.current.timeScale().applyOptions({rightOffset:8});}catch{}}
       return plotted;
     };
     // Render dataset-shared native fallbacks first; the hosted ML service can
     // replace them when a trained artifact is available, without leaving the
     // chart blank. Both compute and network work are deduplicated by dataset key.
     try{
       localFallback=await chartPredictionCoordinator.runLocal(chartDatasetKey,dataRevisionRef.current,data,resolvedInstrumentKey,timeframe,ids,localId);
       if(job!==predictionJob.current)return;
       plot(null);
     }catch{}
     const production=await chartPredictionCoordinator.runProduction(chartDatasetKey,dataRevisionRef.current,data,resolvedInstrumentKey,timeframe,ids);
     if(production&&job===predictionJob.current)plot(production);
   };;
  return {
    setInputs(next:{predictionModelIds:string[];chartDatasetKey:string;resolvedInstrumentKey:string;timeframe:string}){
      predictionModelIds=next.predictionModelIds;chartDatasetKey=next.chartDatasetKey;resolvedInstrumentKey=next.resolvedInstrumentKey;timeframe=next.timeframe;
    },
    renderPredictionOverlay,
    cancel(){predictionJob.current+=1;predictionLines.current.forEach(x=>{try{chart.current?.removeSeries(x)}catch{}});predictionLines.current=[];},
  };
}
