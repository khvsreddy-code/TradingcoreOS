import type { HistoricalCandle } from '../../../brokers/BrokerAdapter';
import { coreEventBus } from '../../../core/event/eventBus';
import { coreSpiritChartRegistry } from '../../../coreSpirit/chartRegistry';
import { CoreSpiritChartOutputController } from '../../../coreSpirit/chartOutputController';
import { runCoreSpiritInWorker } from '../../../coreSpirit/chartRunner';
import { compileCoreSpirit } from '../../../coreSpirit/coreSpiritCompilerLoader';
import type { IChartApi, ISeriesApi } from '../velaNativeChartKernel';
import { CoreSpiritStore } from '../../../coreSpirit/CoreSpiritStore';

type Ref<T>={current:T};

export type ChartCoreSpiritControllerDeps={
  chartId:string;
  chart:Ref<IChartApi|null>;
  candle:Ref<ISeriesApi<'Candlestick'>|null>;
  host:Ref<HTMLDivElement|null>;
  candles:Ref<HistoricalCandle[]>;
  coreSpiritOutput:Ref<CoreSpiritChartOutputController|null>;
  coreSpiritRunId:Ref<number>;
  resolvedInstrumentKey:string;
  timeframe:string;
  store:CoreSpiritStore;
  publishLifecycle:(state:'ready'|'loading'|'updating'|'error'|'recovering'|'disposed')=>void;
};

export function createChartCoreSpiritController(deps:ChartCoreSpiritControllerDeps){
  const {chartId,chart,candle,host,candles,coreSpiritOutput,coreSpiritRunId,resolvedInstrumentKey,timeframe,store,publishLifecycle}=deps;
  let datasetVersion=0;

  const ensureOutput=()=>{
    if(!chart.current||!host.current)return null;
    if(!coreSpiritOutput.current) coreSpiritOutput.current=new CoreSpiritChartOutputController(chart.current,candle.current||undefined,host.current);
    else { coreSpiritOutput.current.setHost(host.current); if(candle.current)coreSpiritOutput.current.setCandleSeries(candle.current); }
    return coreSpiritOutput.current;
  };

  const register=()=>{
    const unregister=coreSpiritChartRegistry.register({
      chartId,
      symbol:resolvedInstrumentKey,
      timeframe,
      getBars:()=>[...candles.current] as any,
      run:async(source:string,sourceId='coreSpirit-editor')=>{
        const runId=++coreSpiritRunId.current;
        const bars=[...candles.current];
        if(!bars.length)throw new Error('Chart has no candles yet; wait for the first history paint.');
        publishLifecycle('updating');
        try{
          datasetVersion += 1;
          const result=await runCoreSpiritInWorker(source,bars,sourceId,{contextKey:chartId,datasetVersion,dirtyRange:{from:0,to:bars.length}});
          if(runId!==coreSpiritRunId.current)return {barsProcessed:0,plotsEmitted:0,signalsEmitted:0,diagnostics:['stale CoreSpirit run ignored'],runId:`${sourceId}:${runId}`,outputs:[]};
          ensureOutput()?.reset();
          ensureOutput()?.applyObjects(result.outputs);
          coreEventBus.emit('market.calculation',{symbol:resolvedInstrumentKey,timeframe,mode:'bar',timestamp:Date.now(),barIndex:bars.length-1,isBarClose:true,values:{coreSpiritOutputs:result.outputs.length}});
          publishLifecycle('ready');
          return {barsProcessed:bars.length,plotsEmitted:result.outputs.filter(x=>x.kind==='series').length,signalsEmitted:result.outputs.filter(x=>x.kind==='signal').length,diagnostics:result.diagnostics,runId:`${sourceId}:${runId}`,outputs:result.outputs};
        }catch(error){
          publishLifecycle('error');
          throw error;
        }
      },
    });
    return unregister;
  };

  const open=()=>{store.setOpen(true);store.resetStatus();coreSpiritChartRegistry.activate(chartId);};
  const compile=async()=>{
    try{
      const result=await compileCoreSpirit(store.getSnapshot().source);
      const diagnostics=(result.diagnostics||[]).map((d:any)=>`${d.line?`Line ${d.line}: `:''}${d.message}`);
      const errors=(result.diagnostics||[]).filter((d:any)=>d.severity==='error');
      store.setDiagnostics(diagnostics);
      store.setStatus(errors.length?'Compile failed':'Compiled');
      return !errors.length;
    }catch(error){
      store.setDiagnostics([String((error as any)?.message||error)]);
      store.setStatus('Compile failed');
      return false;
    }
  };

  const deploy=async()=>{
    if(!(await compile()))return;
    try{
      store.persistSource();
      coreSpiritChartRegistry.activate(chartId);
      store.setStatus('Deploying…');
      const target=coreSpiritChartRegistry.getActive();
      if(!target)throw new Error('No active chart');
      const run=await target.run(store.getSnapshot().source,'chart-indicator');
      store.setStatus(`${run.barsProcessed.toLocaleString()} bars · ${run.plotsEmitted} plots · ${run.signalsEmitted} signals`);
      store.setDiagnostics(run.diagnostics);
      store.setOpen(false);
    }catch(error){
      store.setStatus('Deploy failed');
      store.setDiagnostics([String((error as any)?.message||error)]);
    }
  };

  const resetOutput=()=>ensureOutput()?.reset();
  const dispose=()=>{coreSpiritRunId.current+=1;coreSpiritOutput.current?.reset();};

  return {register,open,compile,deploy,ensureOutput,resetOutput,dispose};
}
