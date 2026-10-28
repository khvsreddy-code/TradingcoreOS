import type { HistoricalCandle } from '../../../brokers/BrokerAdapter';
import { coreEventBus } from '../../../core/event/eventBus';
import { coreSpiritChartRegistry } from '../../../coreSpirit/chartRegistry';
import { CoreSpiritChartOutputController } from '../../../coreSpirit/chartOutputController';
import { runCoreSpiritInWorker, runCoreSpiritArtifactInWorker } from '../../../coreSpirit/chartRunner';
import type { CoreSpiritExecutionDiagnostic } from '../../../coreSpirit/coreSpiritWorkerPool';
import { compileCoreSpiritSourceOffThread, type CoreSpiritOffThreadCompileResult } from '../../../coreSpirit/coreSpiritCompilerClient';
import type { CoreSpiritExecutableArtifact } from '../../../coreSpirit/artifact';
import { coreSpiritLifecycleDiagnostic, coreSpiritLifecycleStageForError, publishCoreSpiritLifecycle, validateCoreSpiritChartCapabilities, type CoreSpiritLifecycleStage } from '../../../coreSpirit/coreSpiritExecutionLifecycle';
import type { IChartApi, ISeriesApi } from '../velaNativeChartKernel';
import { CoreSpiritStore } from '../../../coreSpirit/CoreSpiritStore';
import { adaptCoreSpiritOutputsForVela, coreSpiritTimeToVelaMillis } from '../../../coreSpirit/velaOutputAdapter';

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
    let lifecycleStage:CoreSpiritLifecycleStage='executing-historical';
    publishLifecycle('updating');
    publishCoreSpiritLifecycle({stage:lifecycleStage,scriptId:sourceId,sourceHash:artifact?.abi?.sourceHash,artifactHash:artifact?.abi?.artifactHash,chartId,symbol:resolvedInstrumentKey,timeframe,message:'Executing against the active chart history.'});
    try{
      const runDatasetVersion=++datasetVersion;
      const options={contextKey:chartId,datasetVersion:runDatasetVersion,dirtyRange:{from:0,to:bars.length},baseSymbol:resolvedInstrumentKey,baseTimeframe:timeframe};
      const result=artifact
        ? await runCoreSpiritArtifactInWorker(artifact,bars,sourceId,options)
        : await runCoreSpiritInWorker(source,bars,sourceId,options);
      if(runId!==coreSpiritRunId.current){
        publishCoreSpiritLifecycle({stage:'stale',scriptId:sourceId,chartId,symbol:resolvedInstrumentKey,timeframe,message:'An obsolete worker run was ignored.'});
        return {barsProcessed:0,plotsEmitted:0,signalsEmitted:0,diagnostics:['stale CoreSpirit run ignored'],runId:sourceId+':'+runId,outputs:[]};
      }
      lifecycleStage='validating-outputs';
      publishCoreSpiritLifecycle({stage:lifecycleStage,scriptId:sourceId,sourceHash:artifact?.abi?.sourceHash,artifactHash:artifact?.abi?.artifactHash,chartId,symbol:resolvedInstrumentKey,timeframe,message:'Validating runtime diagnostics and chart-output alignment.'});
      const diagnosticDetails:CoreSpiritExecutionDiagnostic[]=result.diagnosticDetails ?? result.diagnostics.map(message=>({
        severity:'error' as const,code:'RUNTIME_DIAGNOSTIC_UNCLASSIFIED',message,
      }));
      const fatalDiagnostic=diagnosticDetails.find(diagnostic=>diagnostic.severity==='error');
      if(fatalDiagnostic){
        const failureStage:CoreSpiritLifecycleStage=fatalDiagnostic.code==='RUNTIME_OUTPUT_VALIDATION'?'output-rejected':'execution-failed';
        const diagnostic=coreSpiritLifecycleDiagnostic({code:fatalDiagnostic.code,message:fatalDiagnostic.message},failureStage,{previousOutputPreserved:true,outputId:fatalDiagnostic.outputKind});
        publishCoreSpiritLifecycle({stage:failureStage,scriptId:sourceId,sourceHash:artifact?.abi?.sourceHash,artifactHash:artifact?.abi?.artifactHash,chartId,symbol:resolvedInstrumentKey,timeframe,diagnostics:[diagnostic],previousOutputPreserved:true,message:diagnostic.message});
        throw new Error('CoreSpirit replacement rejected ['+fatalDiagnostic.code+(fatalDiagnostic.barIndex==null?'':' · bar '+fatalDiagnostic.barIndex)+']; existing chart output was preserved. '+fatalDiagnostic.message);
      }
      const adapted=adaptCoreSpiritOutputsForVela(result.outputs,bars);
      lifecycleStage='applying-chart-output';
      publishCoreSpiritLifecycle({stage:lifecycleStage,scriptId:sourceId,sourceHash:artifact?.abi?.sourceHash,artifactHash:artifact?.abi?.artifactHash,chartId,symbol:resolvedInstrumentKey,timeframe,message:'Applying the validated output snapshot to Vela.'});
      const output=ensureOutput();
      if(output){
        const applied=await output.scheduleObjects(adapted.outputs,{streamId:chartId,datasetRevision:runDatasetVersion,outputRevision:runId});
        if(runId!==coreSpiritRunId.current||!applied){
          publishCoreSpiritLifecycle({stage:'stale',scriptId:sourceId,chartId,symbol:resolvedInstrumentKey,timeframe,message:'An obsolete chart-output revision was ignored.'});
          return {barsProcessed:0,plotsEmitted:0,signalsEmitted:0,diagnostics:['stale CoreSpirit render revision ignored'],runId:sourceId+':'+runId,outputs:[]};
        }
      }
      if(runId!==coreSpiritRunId.current)return {barsProcessed:0,plotsEmitted:0,signalsEmitted:0,diagnostics:['stale CoreSpirit run ignored'],runId:sourceId+':'+runId,outputs:[]};
      coreEventBus.emit('market.calculation',{symbol:resolvedInstrumentKey,timeframe,mode:'bar',timestamp:coreSpiritTimeToVelaMillis(bars[bars.length-1]!.timestamp),barIndex:bars.length-1,isBarClose:true,values:{coreSpiritOutputs:result.outputs.length}});
      lifecycleStage='rendered';
      publishCoreSpiritLifecycle({stage:lifecycleStage,scriptId:sourceId,sourceHash:artifact?.abi?.sourceHash,artifactHash:artifact?.abi?.artifactHash,chartId,symbol:resolvedInstrumentKey,timeframe,outputRevision:runId,message:'Vela accepted the current validated output snapshot.'});
      publishLifecycle('ready');
      return {barsProcessed:bars.length,plotsEmitted:result.outputs.filter(x=>x.kind==='series').length,signalsEmitted:result.outputs.filter(x=>x.kind==='signal').length,diagnostics:result.diagnostics,diagnosticDetails,runId:sourceId+':'+runId,outputs:result.outputs};
    }catch(error){
      if(runId===coreSpiritRunId.current){
        const stage=coreSpiritLifecycleStageForError(error,lifecycleStage);
        const diagnostic=coreSpiritLifecycleDiagnostic(error,stage,{previousOutputPreserved:true});
        publishCoreSpiritLifecycle({stage,scriptId:sourceId,sourceHash:artifact?.abi?.sourceHash,artifactHash:artifact?.abi?.artifactHash,chartId,symbol:resolvedInstrumentKey,timeframe,diagnostics:[diagnostic],previousOutputPreserved:true,message:diagnostic.message});
        publishLifecycle('error');
      }else publishCoreSpiritLifecycle({stage:'stale',scriptId:sourceId,chartId,symbol:resolvedInstrumentKey,timeframe,message:'A superseded run failed after a newer revision took over.'});
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
    publishCoreSpiritLifecycle({stage:'compiling',scriptId:'chart-indicator',chartId,symbol:resolvedInstrumentKey,timeframe,message:'Compiling the immutable editor source snapshot.'});
    try{
      const compilerResult=await compileCoreSpiritSourceOffThread(source,generation,'chart-indicator',{layer:'script'});
      if(generation!==compileGeneration||store.getSnapshot().source!==source){
        publishCoreSpiritLifecycle({stage:'stale',scriptId:'chart-indicator',chartId,symbol:resolvedInstrumentKey,timeframe,message:'Compiler result belongs to a superseded editor source.'});
        return false;
      }
      publishCoreSpiritLifecycle({stage:'validating-capabilities',scriptId:'chart-indicator',chartId,symbol:resolvedInstrumentKey,timeframe,artifactHash:compilerResult.artifact?.abi?.artifactHash,message:'Checking required capabilities against the chart sandbox.'});
      const policyDiagnostics=validateCoreSpiritChartCapabilities(compilerResult.ir);
      const result:CoreSpiritOffThreadCompileResult={...compilerResult,diagnostics:[...(compilerResult.diagnostics||[]),...policyDiagnostics]};
      const diagnostics=(result.diagnostics||[]).map((d:any)=> (d.line?'Line '+d.line+': ':'')+(d.column?'Column '+d.column+': ':'')+d.message);
      const errors=(result.diagnostics||[]).filter((d:any)=>d.severity==='error');
      lastValidated={source,result};
      store.setDiagnostics(diagnostics);
      const compiledOk=errors.length===0&&Boolean(result.artifact&&result.ir);
      const capabilityDenied=(result.diagnostics||[]).some((d:any)=>d.code==='CHART_CAPABILITY_DENIED'||d.code==='CHART_SANDBOX_ARCHITECTURE');
      const stage:CoreSpiritLifecycleStage=compiledOk?'compiled':capabilityDenied?'capability-denied':'compile-failed';
      publishCoreSpiritLifecycle({stage,scriptId:'chart-indicator',chartId,symbol:resolvedInstrumentKey,timeframe,artifactHash:result.artifact?.abi?.artifactHash,message:compiledOk?'Compilation and chart capability validation passed.':'Compilation or chart capability validation failed.'});
      store.setStatus(compiledOk?'Compiled · capability validation passed':capabilityDenied?'Capability denied':'Compile failed');
      return compiledOk;
    }catch(error){
      if(generation!==compileGeneration)return false;
      const diagnostic=coreSpiritLifecycleDiagnostic(error,'compile-failed');
      store.setDiagnostics([diagnostic.code+': '+diagnostic.message]);
      store.setStatus('Compile failed');
      publishCoreSpiritLifecycle({stage:'compile-failed',scriptId:'chart-indicator',chartId,symbol:resolvedInstrumentKey,timeframe,diagnostics:[diagnostic],message:diagnostic.message});
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
      const fatalRunDiagnostic=run.diagnosticDetails?.find(diagnostic=>diagnostic.severity==='error');
      if(fatalRunDiagnostic) {
        store.setDiagnostics([
          ...run.diagnostics,
          `[${fatalRunDiagnostic.code}${fatalRunDiagnostic.barIndex==null?'':` · bar ${fatalRunDiagnostic.barIndex}`}]: ${fatalRunDiagnostic.message}`,
        ]);
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
