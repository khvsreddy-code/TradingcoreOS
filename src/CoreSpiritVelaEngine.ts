import type { EngineCapabilities, ExecutionHandlers, ExecutionRequest, ExecutionSession, PreparedScript } from './services/core/chart/velaNativeChartKernel.ts';
import type { InputValue } from './services/core/chart/velaNativeChartKernel.ts';
import { loadOrCompileCoreSpiritArtifact } from './services/coreSpirit/artifactCache.ts';
import { compileCoreSpiritArtifactOffThread } from './services/coreSpirit/coreSpiritCompilerClient.ts';
import { normalizeCoreSpiritSource as normalizeCoreSpirit } from './services/coreSpirit/syntax.ts';
import type { CoreSpiritIrProgram } from './services/coreSpirit/ir.ts';
import { runCoreSpiritArtifactInWorker } from './services/coreSpirit/chartRunner.ts';
import type { CoreSpiritExecutableArtifact } from './services/coreSpirit/artifact.ts';
import type { CoreSpiritGraphSnapshot } from './services/core/data/marketDataGraph.ts';
import type { CoreSpiritWorkerRuntimeOptions } from './services/coreSpirit/coreSpiritWorkerPool.ts';
import type { CoreSpiritObject } from './services/coreSpirit/types.ts';
import type { CoreSpiritMarketBar } from './services/coreSpirit/marketData.ts';
import { CoreSpiritSceneDiff } from './services/core/chart/coreSpiritSceneDiff.ts';
import { buildCoreSpiritVelaIndicatorModel } from './services/core/chart/tcoVelaSemanticAdapter.ts';
import { isDisplayOnlyCoreSpiritProp, resolveCoreSpiritVelaMetadata } from './services/coreSpirit/coreSpiritVelaMetadata.ts';

type DirtyRange = { from: number; to: number };

type PreparedToken = {
  sourceId: string;
  source: string;
  ir: CoreSpiritIrProgram;
  artifact: CoreSpiritExecutableArtifact;
};

type VelaOhlcv = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  timestamp?: string | number;
};

function barTimeMillis(value: unknown): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric >= 1e11 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeVelaBar(raw: VelaOhlcv, index: number): CoreSpiritMarketBar {
  const time = barTimeMillis(raw.time ?? raw.timestamp);
  const open = Number(raw.open);
  const high = Number(raw.high);
  const low = Number(raw.low);
  const close = Number(raw.close);
  const volume = raw.volume == null ? 0 : Number(raw.volume);
  if (!Number.isFinite(time) || time <= 0) throw new Error(`CoreSpirit Vela data adapter rejected bar ${index}: invalid epoch timestamp.`);
  for (const [name, value] of Object.entries({open,high,low,close,volume})) {
    if (!Number.isFinite(value)) throw new Error(`CoreSpirit Vela data adapter rejected bar ${index}: ${name} is not finite.`);
  }
  if (high < Math.max(open, close, low)) throw new Error(`CoreSpirit Vela data adapter rejected bar ${index}: high is below OHLC range.`);
  if (low > Math.min(open, close, high)) throw new Error(`CoreSpirit Vela data adapter rejected bar ${index}: low is above OHLC range.`);
  if (volume < 0) throw new Error(`CoreSpirit Vela data adapter rejected bar ${index}: volume is negative.`);
  return {timestamp:new Date(time).toISOString(),open,high,low,close,volume};
}

function normalizeVelaBars(rows: readonly VelaOhlcv[]): CoreSpiritMarketBar[] {
  const out=new Array<CoreSpiritMarketBar>(rows.length);
  let previous=0;
  for(let i=0;i<rows.length;i+=1){
    const row=normalizeVelaBar(rows[i]!,i);
    const time=barTimeMillis(row.timestamp);
    if(i>0&&time<previous) throw new Error(`CoreSpirit Vela data adapter rejected non-chronological bar sequence at index ${i}.`);
    previous=time;
    out[i]=row;
  }
  return out;
}

function lowerBoundBarTime(bars: readonly CoreSpiritMarketBar[], targetMs: number): number {
  let lo = 0, hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (barTimeMillis(bars[mid]?.timestamp) < targetMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBoundBarTime(bars: readonly CoreSpiritMarketBar[], targetMs: number): number {
  let lo = 0, hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (barTimeMillis(bars[mid]?.timestamp) <= targetMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}


function sameInputValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left as Record<string, unknown>).sort();
  const rightKeys = Object.keys(right as Record<string, unknown>).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every(key => sameInputValue(
    (left as Record<string, unknown>)[key],
    (right as Record<string, unknown>)[key],
  ));
}

function sameInputRecord(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  return sameInputValue(left, right);
}

function runtimeAffectingProps(values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !isDisplayOnlyCoreSpiritProp(key)));
}

function presentationProps(values: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([key]) => isDisplayOnlyCoreSpiritProp(key)));
}

function dependencyKey(symbol:string,timeframe:string):string {
  return `${symbol.toUpperCase()}|${timeframe.toLowerCase()}`;
}

export class CoreSpiritVelaEngine {
  readonly language = 'corespirit';

  readonly capabilities: EngineCapabilities = {
    streaming: true,
    visibleRange: true,
    inputs: true,
    props: true,
  };

  async prepare(source: string, instanceId: string): Promise<PreparedScript> {
    const normalized = normalizeCoreSpirit(source);
    const artifact = await loadOrCompileCoreSpiritArtifact(source, instanceId, {
      backend:'worker-vm',
      compileInWorker:(input, sourceId, options)=>compileCoreSpiritArtifactOffThread(input,sourceId,options),
    });
    const ir = artifact.ir;
    const metadata = resolveCoreSpiritVelaMetadata(source, ir);
    const token: PreparedToken = { sourceId: instanceId, source: normalized, ir, artifact };

    return {
      language: this.language,
      inputs: metadata.inputs,
      props: metadata.props,
      meta: metadata.meta,
      reactsToViewport: metadata.reactsToViewport,
      maxLookback: artifact.maxLookback,
      token,
    };
  }

  execute(req: ExecutionRequest, handlers: ExecutionHandlers): ExecutionSession {
    const token = req.prepared.token as PreparedToken;
    const bars = normalizeVelaBars(req.bars as unknown as VelaOhlcv[]);
    const secondaryData = new Map<string, CoreSpiritMarketBar[]>();
    let secondaryGraphRevision=0;
    let secondaryGraphDirty=false;
    let cachedSecondaryGraphSnapshot:CoreSpiritGraphSnapshot|undefined;
    let secondaryRefreshPromise: Promise<void>|undefined;
    // Forced refreshes may overlap. Only the newest generation is allowed to
    // mutate the shared secondary-data snapshot used by live execution.
    let secondaryRequestVersion = 0;
    let secondaryLastRefreshAt=0;
    let secondaryDegraded=false;
    let stopped = false;
    // Keep async settings updates latest-wins too: older update callbacks must
    // not rebuild the runtime or emit a scene after a newer update takes over.
    let updateVersion = 0;
    const secondaryFailed = new Set<string>();
    const secondaryWarnings:string[]=[];
    const dataDependencies = token.ir.tradingNativePlan?.dataDependencies ?? [];
    const secondaryDependencies = [...new Map(
      dataDependencies
        .filter(dep => dep.symbol !== 'current' && !(dep.symbol === req.market.symbol && (dep.timeframe === 'chart' || dep.timeframe === req.market.timeframe)))
        .map(dep => [dependencyKey(dep.symbol, dep.timeframe), { symbol: dep.symbol, timeframe: dep.timeframe }]),
    ).values()];

    const loadSecondaryData = async (force=false): Promise<void> => {
      if (stopped || !req.fetchSeries || !secondaryDependencies.length) return;
      const now=Date.now();
      if (!force && secondaryRefreshPromise) return secondaryRefreshPromise;
      if (!force && now-secondaryLastRefreshAt<1500) return;
      const requestVersion = ++secondaryRequestVersion;
      const latestBars = req.getBars ? normalizeVelaBars(req.getBars() as unknown as VelaOhlcv[]) : bars;
      const endTime=latestBars.length?barTimeMillis(latestBars[latestBars.length-1]?.timestamp):undefined;
      const limit=Math.min(50000,Math.max(5000,latestBars.length+token.ir.maxLookback+64));
      const task=Promise.all(secondaryDependencies.map(async dep=>{
        const key=dependencyKey(dep.symbol,dep.timeframe);
        try{
          const rows=await req.fetchSeries!(dep.symbol,dep.timeframe,{to:Number.isFinite(endTime)?endTime:undefined,limit});
          // A slower request must never overwrite a newer symbol/timeframe snapshot.
          if (stopped || requestVersion !== secondaryRequestVersion) return;
          if(rows?.length){
            secondaryData.set(key,normalizeVelaBars(rows as unknown as VelaOhlcv[]));
            secondaryGraphDirty=true;
            secondaryFailed.delete(key);
          }else{
            secondaryFailed.add(key);
            secondaryDegraded = true;
            if(req.mode==='live'){
              const warning=`Secondary market data unavailable for ${dep.symbol} ${dep.timeframe}`;
              secondaryWarnings.push(warning);
              if(secondaryWarnings.length>100)secondaryWarnings.splice(0,secondaryWarnings.length-100);
              handlers.onWarning?.({message:warning,method:'secondary-data',bar:Math.max(0,latestBars.length-1)});
            }
          }
        }catch(error){
          if (stopped || requestVersion !== secondaryRequestVersion) return;
          secondaryFailed.add(key);
          if(req.mode==='live'){
            const warning=`Secondary market data refresh failed for ${dep.symbol} ${dep.timeframe}: ${error instanceof Error?error.message:String(error)}`;
            secondaryWarnings.push(warning);
            if(secondaryWarnings.length>100)secondaryWarnings.splice(0,secondaryWarnings.length-100);
            handlers.onWarning?.({
              message:warning,
              method:'secondary-data',bar:Math.max(0,bars.length-1)
            });
          }
        }
      })).then(async ()=>{
        if (stopped) return;
        if (requestVersion !== secondaryRequestVersion) {
          // Keep a superseded caller (for example startup) from proceeding with a
          // partially populated cache while the latest forced refresh is still running.
          await secondaryRefreshPromise;
          return;
        }
        secondaryLastRefreshAt=Date.now();
        secondaryDegraded=secondaryFailed.size>0;
        if(secondaryGraphDirty){secondaryGraphRevision+=1;cachedSecondaryGraphSnapshot=undefined;secondaryGraphDirty=false;}
      }).finally(()=>{
        // An older task's finally must not clear the current task's in-flight handle.
        if (requestVersion === secondaryRequestVersion) secondaryRefreshPromise=undefined;
      });
      secondaryRefreshPromise=task;
      return task;
    };

    let currentMetadata = resolveCoreSpiritVelaMetadata(token.source, token.ir, {
      inputs: req.inputs,
      props: req.props,
    });

    const scene = new CoreSpiritSceneDiff(token.sourceId);
    const mainContextKey=`vela:${token.sourceId}:${req.market.symbol}:${req.market.timeframe}:main`;
    const rangeContextKey=`${mainContextKey}:range`;
    const backfillContextKey=`${mainContextKey}:backfill`;
    const workerDatasetVersions=new Map<string,number>();
    type RuntimeSnapshot={barIndex?:number;locals?:Record<string,unknown>};
    let lastExecutionState:RuntimeSnapshot|undefined;
    let liveStarted = false;
    let historyInitialized = false;
    let initializationInFlight=false;
    let initializationOwnerGeneration=0;
    let mainRunGeneration=0;
    let liveRunGeneration=0;
    let viewportRunGeneration=0;
    let firstSeriesTime = Number.NaN;
    let lastTime = Number.NaN;
    let lastViewportComputationKey: string | undefined;

    const makeSecondaryGraphSnapshot=():CoreSpiritGraphSnapshot|undefined=>{
      if(!secondaryDependencies.length)return undefined;
      if(cachedSecondaryGraphSnapshot?.revision===secondaryGraphRevision)return cachedSecondaryGraphSnapshot;
      cachedSecondaryGraphSnapshot={
        version:1,
        revision:secondaryGraphRevision,
        nodes:secondaryDependencies.map(dep=>{
          const rows=secondaryData.get(dependencyKey(dep.symbol,dep.timeframe))??[];
          return {
            id:`vela-secondary:${dependencyKey(dep.symbol,dep.timeframe)}`,
            symbol:dep.symbol,
            timeframe:dep.timeframe,
            revision:secondaryGraphRevision,
            time:Float64Array.from(rows,row=>Math.floor(barTimeMillis(row.timestamp)/1000)),
            open:Float64Array.from(rows,row=>row.open),
            high:Float64Array.from(rows,row=>row.high),
            low:Float64Array.from(rows,row=>row.low),
            close:Float64Array.from(rows,row=>row.close),
            volume:Float64Array.from(rows,row=>row.volume??0),
          };
        }),
      };
      return cachedSecondaryGraphSnapshot;
    };

    const executeInWorker=async(
      currentBars:CoreSpiritMarketBar[],
      contextKey:string,
      readOnly:boolean,
      dirtyRange:DirtyRange,
      visibleRange?:{from:number;to:number},
    )=>{
      const datasetVersion=(workerDatasetVersions.get(contextKey)??0)+1;
      workerDatasetVersions.set(contextKey,datasetVersion);
      const runtimeOptions:CoreSpiritWorkerRuntimeOptions={
        symbol:req.market.symbol,
        timeframe:req.market.timeframe,
        executionMode:req.mode==='live'?'realtime':'historical',
        executionTarget:'chart',
        layer:'script',
        executionTier:'optimized',
        inputValues:currentMetadata.inputValues,
        propValues:currentMetadata.propValues,
        visibleRange,
      };
      return runCoreSpiritArtifactInWorker(token.artifact,currentBars,token.sourceId,{
        contextKey,
        datasetVersion,
        dirtyRange,
        baseSymbol:req.market.symbol,
        baseTimeframe:req.market.timeframe,
        graphSnapshot:makeSecondaryGraphSnapshot(),
        readOnly,
        runtimeOptions,
      });
    };

    const safeOutputs = (outputs: CoreSpiritObject[]): CoreSpiritObject[] =>
      secondaryDegraded
        ? outputs.filter(output => output.kind !== 'signal' && output.kind !== 'orderIntent')
        : outputs;

    const emitModel = (dirty?: DirtyRange): void => {
      const snapshot = scene.snapshot();
      handlers.onModel(buildCoreSpiritVelaIndicatorModel(
        token.sourceId,
        currentMetadata.meta,
        snapshot.points,
        snapshot.markers.map(marker => ({
          time: Number(marker.time),
          position: marker.position,
          shape: marker.shape,
          color: marker.color,
          text: marker.text,
        })),
        snapshot.priceLines,
        snapshot.rectBatches,
        Number.isFinite(firstSeriesTime) ? firstSeriesTime : undefined,
        dirty,
        currentMetadata.inputs,
        currentMetadata.inputValues,
        currentMetadata.props,
        currentMetadata.propValues,
      ));
    };

    const emitScenePatches = (outputs: CoreSpiritObject[], dirty: DirtyRange): void => {
      const patches = scene.apply(outputs, dirty);
      if (patches.length) handlers.onScenePatches?.(patches);
    };

    const rememberWorkerState=(value:unknown):void=>{
      lastExecutionState=value&&typeof value==='object'?value as RuntimeSnapshot:undefined;
    };
    const barValueSignature=(bar:CoreSpiritMarketBar|undefined):string=>bar?JSON.stringify([
      bar.timestamp,bar.open,bar.high,bar.low,bar.close,bar.volume??0,
    ]):'empty';

    const evaluateLiveSnapshot=async(startingBars:CoreSpiritMarketBar[],generation:number)=>{
      let currentBars=startingBars;
      let baseline:Awaited<ReturnType<typeof executeInWorker>>|undefined;
      let tail:Awaited<ReturnType<typeof executeInWorker>>|undefined;
      for(let attempt=0;attempt<3;attempt+=1){
        const historical=currentBars.slice(0,-1);
        baseline=await executeInWorker(historical,mainContextKey,true,{from:0,to:historical.length});
        if(stopped||generation!==mainRunGeneration)return undefined;

        // If a new candle was appended while history was warming, warm again so
        // the newly confirmed candle is committed before evaluating the new tail.
        const newest=getCurrentBars();
        const sameHistoryBoundary=newest.length===currentBars.length&&
          newest.at(-2)?.timestamp===currentBars.at(-2)?.timestamp;
        if(!sameHistoryBoundary){currentBars=newest;continue;}
        currentBars=newest;
        if(!currentBars.length)return {currentBars,baseline,tail:undefined};

        tail=await executeInWorker(currentBars,mainContextKey,false,{
          from:Math.max(0,currentBars.length-1),to:currentBars.length,
        });
        if(stopped||generation!==mainRunGeneration)return undefined;
        const afterTail=getCurrentBars();
        if(afterTail.length!==currentBars.length||afterTail.at(-2)?.timestamp!==currentBars.at(-2)?.timestamp){
          currentBars=afterTail;
          continue;
        }
        if(barValueSignature(afterTail.at(-1))!==barValueSignature(currentBars.at(-1))){
          // Only the developing candle changed during the worker run. Re-submit
          // its newest snapshot without re-warming confirmed history.
          currentBars=afterTail;
          tail=await executeInWorker(currentBars,mainContextKey,false,{
            from:Math.max(0,currentBars.length-1),to:currentBars.length,
          });
          if(stopped||generation!==mainRunGeneration)return undefined;
        }else{
          currentBars=afterTail;
        }
        return {currentBars,baseline,tail};
      }
      throw new Error('CoreSpirit chart history changed repeatedly during worker initialization; retry after the candle update settles.');
    };

    const initializeStatic = async(currentBars:CoreSpiritMarketBar[]):Promise<void>=>{
      if(stopped||historyInitialized||initializationInFlight)return;
      initializationInFlight=true;
      const generation=++mainRunGeneration;
      initializationOwnerGeneration=generation;
      try{
        const result=await executeInWorker(currentBars,mainContextKey,true,{from:0,to:currentBars.length});
        if(stopped||generation!==mainRunGeneration)return;
        const outputs=safeOutputs(result.outputs);
        viewportRunGeneration+=1;
        lastViewportComputationKey=undefined;
        scene.reset();
        scene.seed(outputs);
        rememberWorkerState(result.state);
        firstSeriesTime=currentBars.length?barTimeMillis(currentBars[0]?.timestamp):Number.NaN;
        lastTime=currentBars.length?barTimeMillis(currentBars.at(-1)?.timestamp):Number.NaN;
        historyInitialized=true;
        emitModel(Number.isFinite(firstSeriesTime)&&Number.isFinite(lastTime)?{from:firstSeriesTime,to:lastTime}:undefined);
        handlers.onDone?.();
      }catch(error){
        if(!stopped&&generation===mainRunGeneration)handlers.onError?.(error instanceof Error?error:new Error(String(error)));
      }finally{
        if(initializationOwnerGeneration===generation)initializationInFlight=false;
      }
    };

    const initializeLive = async(currentBars:CoreSpiritMarketBar[]):Promise<void>=>{
      if(stopped||liveStarted||initializationInFlight)return;
      if(!currentBars.length){historyInitialized=false;liveStarted=false;return;}
      initializationInFlight=true;
      const generation=++mainRunGeneration;
      initializationOwnerGeneration=generation;
      try{
        const execution=await evaluateLiveSnapshot(currentBars,generation);
        if(!execution||stopped||generation!==mainRunGeneration)return;
        if(!execution.currentBars.length||!execution.tail){historyInitialized=false;liveStarted=false;return;}
        const warmOutputs=safeOutputs(execution.baseline.outputs);
        const tailOutputs=safeOutputs(execution.tail.outputs);
        // Commit visuals only after both the confirmed-history baseline and the
        // forming-bar run succeeded; a worker failure leaves the current scene intact.
        viewportRunGeneration+=1;
        lastViewportComputationKey=undefined;
        scene.reset();
        scene.seed(warmOutputs);
        const latest=execution.currentBars.at(-1)!;
        const latestTime=barTimeMillis(latest.timestamp);
        if(Number.isFinite(latestTime))emitScenePatches(tailOutputs,{from:latestTime,to:latestTime});
        rememberWorkerState(execution.tail.state);
        firstSeriesTime=barTimeMillis(execution.currentBars[0]?.timestamp);
        lastTime=latestTime;
        historyInitialized=true;
        liveStarted=true;
        emitModel(Number.isFinite(firstSeriesTime)&&Number.isFinite(lastTime)?{from:firstSeriesTime,to:lastTime}:undefined);
      }catch(error){
        if(!stopped&&generation===mainRunGeneration)handlers.onError?.(error instanceof Error?error:new Error(String(error)));
      }finally{
        if(initializationOwnerGeneration===generation)initializationInFlight=false;
      }
    };

    const initializeFromBars = (currentBars:CoreSpiritMarketBar[]):void=>{
      if(stopped||historyInitialized||initializationInFlight)return;
      if(req.mode==='live')void initializeLive(currentBars);
      else void initializeStatic(currentBars);
    };

    // Normalize closed candles once. Live notifications normally revise only
    // the forming candle; backfills explicitly request a full refresh. Return an
    // array snapshot so queued worker jobs never observe later cache mutations.
    const normalizedBarsCache:CoreSpiritMarketBar[]=[];
    let normalizedInputLength=-1;
    const getCurrentBars=(forceFullNormalization=false):CoreSpiritMarketBar[]=>{
      if(!req.getBars)return bars;
      const rows=req.getBars() as unknown as readonly VelaOhlcv[];
      if(!Array.isArray(rows))return bars;
      const length=rows.length;
      let start=0;
      if(forceFullNormalization||normalizedInputLength<0||length<normalizedInputLength||normalizedBarsCache.length!==normalizedInputLength){
        normalizedBarsCache.length=0;
      }else if(length===normalizedInputLength){
        start=Math.max(0,length-1);
        normalizedBarsCache.length=start;
      }else{
        // The previous forming candle is now confirmed; normalize it again and
        // append only the new rows rather than rebuilding all history objects.
        start=Math.max(0,normalizedInputLength-1);
        normalizedBarsCache.length=start;
      }
      for(let i=start;i<length;i+=1)normalizedBarsCache.push(normalizeVelaBar(rows[i]!,i));
      normalizedInputLength=length;
      return normalizedBarsCache.slice();
    };

    const initialBars = getCurrentBars();
    const initialUpdateVersion = updateVersion;
    let secondaryReady = secondaryDependencies.length
      ? loadSecondaryData(true).then(() => true)
      : Promise.resolve(true);

    if (req.mode !== 'live' || req.historyState !== 'backfill') {
      if (!secondaryDependencies.length) {
        initializeFromBars(initialBars);
      } else {
        void secondaryReady.then(() => {
          if (!stopped && initialUpdateVersion === updateVersion) initializeFromBars(getCurrentBars());
        });
      }
    }

    return {
      async getContext() {
        const state = lastExecutionState;
        const snapshot = scene.snapshot();
        return {
          language: 'corespirit',
          phase: req.mode === 'live' && !stopped ? 'streaming' : 'idle',
          barIndex: state?.barIndex ?? -1,
          meta: {
            title: currentMetadata.meta.title,
            overlay: currentMetadata.meta.overlay,
            precision: currentMetadata.meta.precision,
            shorttitle: currentMetadata.meta.shorttitle,
          },
          plots: Object.fromEntries([...snapshot.points.entries()].map(([key, values]) => [key, values])),
          variables: state?.locals ?? {},
          warnings: secondaryWarnings.slice(-20).map(message => ({ message, method: 'secondary-data', bar: Math.max(0, bars.length - 1) })),
        };
      },
      stop() {
        stopped = true;
        secondaryRequestVersion += 1;
        updateVersion += 1;
        mainRunGeneration += 1;
        liveRunGeneration += 1;
        viewportRunGeneration += 1;
        initializationInFlight=false;
        secondaryRefreshPromise = undefined;
      },
      update(inputs: Record<string, InputValue>, props?: Record<string, InputValue>) {
        if(stopped)return;
        const previousMetadata=currentMetadata;
        const nextMetadata=resolveCoreSpiritVelaMetadata(token.source,token.ir,{inputs,props});
        const inputsUnchanged=sameInputRecord(previousMetadata.inputValues,nextMetadata.inputValues);
        const runtimePropsUnchanged=sameInputRecord(
          runtimeAffectingProps(previousMetadata.propValues),runtimeAffectingProps(nextMetadata.propValues),
        );

        // Presentation-only edits must not reset the worker's VM or replay history.
        if(inputsUnchanged&&runtimePropsUnchanged){
          const presentationChanged=!sameInputValue(previousMetadata.meta,nextMetadata.meta)||
            !sameInputRecord(presentationProps(previousMetadata.propValues),presentationProps(nextMetadata.propValues));
          currentMetadata=nextMetadata;
          if(presentationChanged&&historyInitialized)emitModel(
            Number.isFinite(firstSeriesTime)&&Number.isFinite(lastTime)?{from:firstSeriesTime,to:lastTime}:undefined,
          );
          return;
        }

        const updateGeneration=++updateVersion;
        const executionGeneration=++mainRunGeneration;
        liveRunGeneration+=1;
        viewportRunGeneration+=1;
        initializationInFlight=true;
        initializationOwnerGeneration=executionGeneration;
        lastViewportComputationKey=undefined;
        currentMetadata=nextMetadata;

        const runUpdate=async()=>{
          if(stopped||updateGeneration!==updateVersion||executionGeneration!==mainRunGeneration)return;
          if(secondaryDependencies.length)await loadSecondaryData(true);
          if(stopped||updateGeneration!==updateVersion||executionGeneration!==mainRunGeneration)return;
          const currentBars=getCurrentBars();
          if(!currentBars.length)return;

          let outputs:CoreSpiritObject[];
          if(req.mode==='live'){
            const execution=await evaluateLiveSnapshot(currentBars,executionGeneration);
            if(!execution||stopped||updateGeneration!==updateVersion||executionGeneration!==mainRunGeneration)return;
            if(!execution.currentBars.length||!execution.tail)return;
            scene.reset();
            scene.seed(safeOutputs(execution.baseline.outputs));
            const latest=execution.currentBars.at(-1)!;
            const latestTime=barTimeMillis(latest.timestamp);
            outputs=safeOutputs(execution.tail.outputs);
            if(Number.isFinite(latestTime))emitScenePatches(outputs,{from:latestTime,to:latestTime});
            rememberWorkerState(execution.tail.state);
            firstSeriesTime=barTimeMillis(execution.currentBars[0]?.timestamp);
            lastTime=latestTime;
            liveStarted=true;
          }else{
            const result=await executeInWorker(currentBars,mainContextKey,true,{from:0,to:currentBars.length});
            if(stopped||updateGeneration!==updateVersion||executionGeneration!==mainRunGeneration)return;
            outputs=safeOutputs(result.outputs);
            scene.reset();
            scene.seed(outputs);
            rememberWorkerState(result.state);
            firstSeriesTime=barTimeMillis(currentBars[0]?.timestamp);
            lastTime=barTimeMillis(currentBars.at(-1)?.timestamp);
          }
          historyInitialized=true;
          emitModel(Number.isFinite(firstSeriesTime)&&Number.isFinite(lastTime)?{from:firstSeriesTime,to:lastTime}:undefined);
        };

        void runUpdate().catch(error=>{
          if(!stopped&&updateGeneration===updateVersion&&executionGeneration===mainRunGeneration)
            handlers.onError?.(error instanceof Error?error:new Error(String(error)));
        }).finally(()=>{
          if(initializationOwnerGeneration===executionGeneration)initializationInFlight=false;
        });
      },
      setVisibleRange(range) {
        if(stopped||!currentMetadata.reactsToViewport)return;
        const left=Number(range.left),right=Number(range.right);
        if(!Number.isFinite(left)||!Number.isFinite(right))return;
        const viewportFrom=Math.min(left,right);
        const viewportTo=Math.max(left,right);
        const currentBars=getCurrentBars();
        if(!currentBars.length)return;
        const viewportKey=[viewportFrom,viewportTo,currentBars.length,
          barTimeMillis(currentBars[0]?.timestamp),barTimeMillis(currentBars.at(-1)?.timestamp),updateVersion].join('|');
        if(viewportKey===lastViewportComputationKey)return;
        const start=lowerBoundBarTime(currentBars,viewportFrom);
        const end=Math.min(currentBars.length,upperBoundBarTime(currentBars,viewportTo));
        const maxLookback=Math.max(0,Number(token.ir.maxLookback)||0);
        const executionStart=Math.max(0,start-maxLookback);
        const rangeBars=currentBars.slice(executionStart,end);
        if(!rangeBars.length)return;
        const generation=++viewportRunGeneration;
        const updateGeneration=updateVersion;
        // Reserve the cache key before scheduling the async worker so repeated
        // identical pan/zoom notifications cannot queue duplicate history runs.
        lastViewportComputationKey=viewportKey;
        void executeInWorker(rangeBars,rangeContextKey,true,{from:0,to:rangeBars.length},{from:viewportFrom,to:viewportTo})
          .then(result=>{
            if(stopped||generation!==viewportRunGeneration||updateGeneration!==updateVersion)return;
            emitScenePatches(safeOutputs(result.outputs),{from:viewportFrom,to:viewportTo});
          })
          .catch(error=>{
            if(!stopped&&generation===viewportRunGeneration&&updateGeneration===updateVersion){
              lastViewportComputationKey=undefined;
              handlers.onError?.(error instanceof Error?error:new Error(String(error)));
            }
          });
      },
      notifyBars(reason,dirtyRange) {
        if(stopped)return;
        lastViewportComputationKey=undefined;
        const currentBars=getCurrentBars(reason==='backfill');

        if(reason==='backfill'){
          // Vela may backfill older pages before the initial complete snapshot.
          if(!historyInitialized||!currentBars.length||!dirtyRange||!Number.isFinite(dirtyRange.from)||!Number.isFinite(dirtyRange.to))return;
          const start=lowerBoundBarTime(currentBars,dirtyRange.from);
          const end=Math.min(currentBars.length,upperBoundBarTime(currentBars,dirtyRange.to));
          const maxLookback=Math.max(0,Number(token.ir.maxLookback)||0);
          const executionStart=Math.max(0,start-maxLookback);
          const rangeBars=currentBars.slice(executionStart,end);
          if(!rangeBars.length)return;
          const generation=++viewportRunGeneration;
          const updateGeneration=updateVersion;
          void executeInWorker(rangeBars,backfillContextKey,true,{from:0,to:rangeBars.length},{from:dirtyRange.from,to:dirtyRange.to})
            .then(result=>{
              if(stopped||generation!==viewportRunGeneration||updateGeneration!==updateVersion)return;
              emitScenePatches(safeOutputs(result.outputs),dirtyRange);
            })
            .catch(error=>{
              if(!stopped&&generation===viewportRunGeneration&&updateGeneration===updateVersion)
                handlers.onError?.(error instanceof Error?error:new Error(String(error)));
            });
          return;
        }

        if(reason==='complete'){
          if(!historyInitialized&&currentBars.length){
            if(secondaryDependencies.length){
              void loadSecondaryData(true).then(()=>initializeFromBars(getCurrentBars()))
                .catch(error=>handlers.onError?.(error instanceof Error?error:new Error(String(error))));
            }else initializeFromBars(currentBars);
          }
          return;
        }

        if(req.mode!=='live')return;
        if(!currentBars.length)return;
        if(!historyInitialized||!liveStarted){
          initializeFromBars(currentBars);
          return;
        }
        if(secondaryDependencies.length)void loadSecondaryData();
        const latest=currentBars.at(-1);
        if(!latest)return;
        const latestTime=barTimeMillis(latest.timestamp);
        const generation=++liveRunGeneration;
        const sessionGeneration=mainRunGeneration;
        void executeInWorker(currentBars,mainContextKey,false,{
          from:Math.max(0,currentBars.length-1),to:currentBars.length,
        }).then(result=>{
          if(stopped||generation!==liveRunGeneration||sessionGeneration!==mainRunGeneration)return;
          const latestOutputs=safeOutputs(result.outputs);
          if(Number.isFinite(latestTime)){
            emitScenePatches(latestOutputs,{from:latestTime,to:latestTime});
            lastTime=latestTime;
          }
          rememberWorkerState(result.state);
        }).catch(error=>{
          if(!stopped&&generation===liveRunGeneration&&sessionGeneration===mainRunGeneration)
            handlers.onError?.(error instanceof Error?error:new Error(String(error)));
        });
      },    };
  }
}

export default CoreSpiritVelaEngine;
