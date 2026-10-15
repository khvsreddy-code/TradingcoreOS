import type { HistoricalCandle } from '../../../brokers/BrokerAdapter';
import { coreEventBus } from '../../../core/event/eventBus';
import { coreSpiritChartRegistry } from '../../../coreSpirit/chartRegistry';
import { CoreSpiritChartOutputController } from '../../../coreSpirit/chartOutputController';
import { runCoreSpiritInWorker, runCoreSpiritArtifactInWorker } from '../../../coreSpirit/chartRunner';
import { compileCoreSpiritSourceOffThread, type CoreSpiritOffThreadCompileResult } from '../../../coreSpirit/coreSpiritCompilerClient';
import type { CoreSpiritExecutableArtifact } from '../../../coreSpirit/artifact';
import { createCoreSpiritSandbox, validateCoreScriptCapabilitiesAgainstSandbox, validateCoreSpiritSandboxArchitecture } from '../../../coreSpirit/capabilitySandbox';
import type { IChartApi, ISeriesApi } from '../velaNativeChartKernel';
import { CoreSpiritStore } from '../../../coreSpirit/CoreSpiritStore';
import { adaptCoreSpiritOutputsForVela, coreSpiritTimeToVelaMillis } from '../../../coreSpirit/velaOutputAdapter';

type Ref<T>={current:T};

function isFatalCoreSpiritDiagnostic(message:string):boolean {
  return /\b(?:error|failed|failure|invalid|denied|exception|unsupported|unknown (?:identifier|function|variable)|not found)\b/i.test(message);
}

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
  let compileGeneration=0;
  let lastValidated:{source:string;result:CoreSpiritOffThreadCompileResult}|undefined;

  const ensureOutput=()=>{
    if(!chart.current||!host.current)return null;
    if(!coreSpiritOutput.current) coreSpiritOutput.current=new CoreSpiritChartOutputController(chart.current,candle.current||undefined,host.current);
    else { coreSpiritOutput.current.setHost(host.current); if(candle.current)coreSpiritOutput.current.setCandleSeries(candle.current); }
    return coreSpiritOutput.current;
  };

  const executeCode=async(source:string,sourceId='coreSpirit-editor',artifact?:CoreSpiritExecutableArtifact)=>{
    const runId=++coreSpiritRunId.current;
    const bars=[...candles.current];
    if(!bars.length)throw new Error('Chart has no candles yet; wait for the first history paint.');
    publishLifecycle('updating');
    try{
      const runDatasetVersion=++datasetVersion;
      const options={contextKey:chartId,datasetVersion:runDatasetVersion,dirtyRange:{from:0,to:bars.length},baseSymbol:resolvedInstrumentKey,baseTimeframe:timeframe};
      const result=artifact
        ? await runCoreSpiritArtifactInWorker(artifact,bars,sourceId,options)
        : await runCoreSpiritInWorker(source,bars,sourceId,options);
      if(runId!==coreSpiritRunId.current)return {barsProcessed:0,plotsEmitted:0,signalsEmitted:0,diagnostics:['stale CoreSpirit run ignored'],runId:`${sourceId}:${runId}`,outputs:[]};
      // A resolved worker promise can still carry runtime diagnostics. Do not
      // commit partial output when the replacement failed semantically/runtime-wise.
      const fatalDiagnostic=result.diagnostics.find(isFatalCoreSpiritDiagnostic);
      if(fatalDiagnostic)throw new Error(`CoreSpirit replacement failed; existing chart output was preserved. ${fatalDiagnostic}`);
      // Validate timestamps and translate into Vela's millisecond scene contract
      // before touching visible state. A bad series timestamp preserves the old scene.
      const adapted=adaptCoreSpiritOutputsForVela(result.outputs,bars);
      const output=ensureOutput();
      if(output){
        const applied=await output.scheduleObjects(adapted.outputs,{streamId:chartId,datasetRevision:runDatasetVersion,outputRevision:runId});
        if(runId!==coreSpiritRunId.current||!applied)return {barsProcessed:0,plotsEmitted:0,signalsEmitted:0,diagnostics:['stale CoreSpirit render revision ignored'],runId:`${sourceId}:${runId}`,outputs:[]};
      }
      if(runId!==coreSpiritRunId.current)return {barsProcessed:0,plotsEmitted:0,signalsEmitted:0,diagnostics:['stale CoreSpirit run ignored'],runId:`${sourceId}:${runId}`,outputs:[]};
      coreEventBus.emit('market.calculation',{symbol:resolvedInstrumentKey,timeframe,mode:'bar',timestamp:coreSpiritTimeToVelaMillis(bars[bars.length-1]!.timestamp),barIndex:bars.length-1,isBarClose:true,values:{coreSpiritOutputs:result.outputs.length}});
      publishLifecycle('ready');
      return {barsProcessed:bars.length,plotsEmitted:result.outputs.filter(x=>x.kind==='series').length,signalsEmitted:result.outputs.filter(x=>x.kind==='signal').length,diagnostics:result.diagnostics,runId:`${sourceId}:${runId}`,outputs:result.outputs};
    }catch(error){
      // A superseded worker snapshot is expected during rapid edits/ticks. Never
      // let an obsolete run flip the current chart lifecycle to an error state.
      if(runId===coreSpiritRunId.current)publishLifecycle('error');
      throw error;
    }
  };

  const register=()=>{
    const unregister=coreSpiritChartRegistry.register({
      chartId,
      symbol:resolvedInstrumentKey,
      timeframe,
      getBars:()=>candles.current as any,
      run:(source,sourceId='coreSpirit-editor')=>executeCode(source,sourceId),
      updateCode:(source,artifact,sourceId='coreSpirit-editor')=>executeCode(source,sourceId,artifact),
    });
    return unregister;
  };

  const open=()=>{store.setOpen(true);store.resetStatus();coreSpiritChartRegistry.activate(chartId);};
  const compile=async()=>{
    const source=store.getSnapshot().source;
    const generation=++compileGeneration;
    store.setStatus('Compiling in worker…');
    try{
      const compilerResult=await compileCoreSpiritSourceOffThread(source,generation,'chart-indicator');
      if(generation!==compileGeneration||store.getSnapshot().source!==source)return false;
      const sandbox=createCoreSpiritSandbox({layer:'script',target:'chart'});
      const policyDiagnostics=[
        ...validateCoreSpiritSandboxArchitecture().map(message=>({severity:'error' as const,message,code:'CHART_SANDBOX_ARCHITECTURE'})),
        ...(compilerResult.ir?validateCoreScriptCapabilitiesAgainstSandbox(sandbox,compilerResult.ir.requiredCapabilities??[]):[]).map(message=>({severity:'error' as const,message,code:'CHART_CAPABILITY_DENIED'})),
      ];
      const result:CoreSpiritOffThreadCompileResult={
        ...compilerResult,
        diagnostics:[...(compilerResult.diagnostics||[]),...policyDiagnostics],
      };
      const diagnostics=(result.diagnostics||[]).map((d:any)=>`${d.line?`Line ${d.line}: `:''}${d.message}`);
      const errors=(result.diagnostics||[]).filter((d:any)=>d.severity==='error');
      lastValidated={source,result};
      store.setDiagnostics(diagnostics);
      store.setStatus(errors.length||!result.artifact?'Compile failed':'Compiled');
      return !errors.length&&Boolean(result.artifact);
    }catch(error){
      if(generation!==compileGeneration)return false;
      store.setDiagnostics([String((error as any)?.message||error)]);
      store.setStatus('Compile failed');
      return false;
    }
  };

  const deploy=async()=>{
    const source=store.getSnapshot().source;
    const cached=lastValidated?.source===source&&lastValidated.result.artifact&&
      !lastValidated.result.diagnostics.some(d=>d.severity==='error')?lastValidated:undefined;
    if(!cached&&!(await compile()))return;
    const validated=lastValidated;
    if(!validated||validated.source!==source||!validated.result.artifact)return;
    try{
      store.persistSource();
      coreSpiritChartRegistry.activate(chartId);
      store.setStatus('Deploying…');
      const target=coreSpiritChartRegistry.getActive();
      if(!target)throw new Error('No active chart');
      const run=target.updateCode
        ? await target.updateCode(source,validated.result.artifact,'chart-indicator')
        : await target.run(source,'chart-indicator');
      if(run.diagnostics.some(d=>/failed|invalid|denied/i.test(d))) {
        store.setDiagnostics(run.diagnostics);
        store.setStatus('Deploy needs attention');
        return;
      }
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
