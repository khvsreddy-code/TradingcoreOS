import type { EngineCapabilities, ExecutionHandlers, ExecutionRequest, ExecutionSession, PreparedScript } from './services/core/chart/velaNativeChartKernel.ts';
import { executionBarRange, velaTimeRange, type ExecutionBarRange, type VelaTimeRange } from './architecture/crossPlaneContracts.ts';
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
import { normalizeCoreSpiritTimeframe } from './services/core/data/marketDataGraph.ts';
import { adaptCoreSpiritOutputsForVela, coreSpiritTimeToVelaMillis, normalizeVelaBarToCoreSpirit, normalizeVelaBarsToCoreSpirit, safeVelaNormalizationStart, type CoreSpiritVelaOhlcv } from './services/coreSpirit/velaOutputAdapter.ts';
import { CoreSpiritSceneDiff } from './services/core/chart/coreSpiritSceneDiff.ts';
import { buildCoreSpiritVelaIndicatorModel } from './services/core/chart/tcoVelaSemanticAdapter.ts';
import { isDisplayOnlyCoreSpiritProp, resolveCoreSpiritVelaMetadata } from './services/coreSpirit/coreSpiritVelaMetadata.ts';
import { LatestValueAsyncScheduler } from './services/coreSpirit/latestValueAsyncScheduler.ts';

type PreparedToken = {
  sourceId: string;
  source: string;
  ir: CoreSpiritIrProgram;
  artifact: CoreSpiritExecutableArtifact;
};

type VelaOhlcv = CoreSpiritVelaOhlcv;

function barTimeMillis(value: unknown): number {
  return coreSpiritTimeToVelaMillis(value);
}

function secondaryRowsMatch(existing:readonly CoreSpiritMarketBar[]|undefined,rows:readonly VelaOhlcv[]):boolean{
  if(!existing||existing.length!==rows.length)return false;
  for(let i=0;i<rows.length;i+=1){
    const raw=rows[i]!;
    const old=existing[i]!;
    const timestamp=barTimeMillis(raw.time??raw.timestamp);
    if(timestamp!==barTimeMillis(old.timestamp) ||
      Number(raw.open)!==old.open || Number(raw.high)!==old.high ||
      Number(raw.low)!==old.low || Number(raw.close)!==old.close ||
      (raw.volume==null?0:Number(raw.volume))!==(old.volume??0))return false;
  }
  return true;
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
  return `${symbol.trim().toUpperCase()}|${normalizeCoreSpiritTimeframe(timeframe).toLowerCase()}`;
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
    const initialBarCount=req.bars.length;
    // With Vela's live accessor the initial bars argument is only a snapshot;
    // normalize the canonical getBars() data once instead of materializing the
    // same history twice on the UI thread.
    const bars = req.getBars ? [] : normalizeVelaBarsToCoreSpirit(req.bars as unknown as VelaOhlcv[]);
    const currentBarCount=():number=>{
      try{return req.getBars?.().length??bars.length;}catch{return initialBarCount;}
    };
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
        .filter(dep => !(
          (dep.symbol.trim().toUpperCase() === 'CURRENT' || dep.symbol.trim().toUpperCase() === req.market.symbol.trim().toUpperCase()) &&
          (normalizeCoreSpiritTimeframe(dep.timeframe) === 'chart' ||
            dependencyKey('timeframe',dep.timeframe) === dependencyKey('timeframe',req.market.timeframe))
        ))
        .map(dep => {
          // current is a symbol alias, not a statement that the dependency is
          // always the chart's primary timeframe. A current/15m request on a
          // 5m chart must fetch the selected symbol's 15m series explicitly.
          const symbol=dep.symbol.trim().toUpperCase()==='CURRENT'?req.market.symbol:dep.symbol;
          return [dependencyKey(symbol,dep.timeframe),{symbol,timeframe:dep.timeframe}] as const;
        }),
    ).values()];

    if(secondaryDependencies.length&&!req.fetchSeries){
      secondaryDegraded=true;
      for(const dependency of secondaryDependencies){
        secondaryFailed.add(dependencyKey(dependency.symbol,dependency.timeframe));
        secondaryWarnings.push(`Secondary market data provider unavailable for ${dependency.symbol} ${dependency.timeframe}`);
      }
    }

    const loadSecondaryData = async (force=false): Promise<void> => {
      if (stopped || !req.fetchSeries || !secondaryDependencies.length) return;
      const now=Date.now();
      if (!force && secondaryRefreshPromise) return secondaryRefreshPromise;
      if (!force && now-secondaryLastRefreshAt<1500) return;
      const requestVersion = ++secondaryRequestVersion;
      const latestBars = req.getBars ? normalizeVelaBarsToCoreSpirit(req.getBars() as unknown as VelaOhlcv[]) : bars;
      const endTime=latestBars.length?barTimeMillis(latestBars[latestBars.length-1]?.timestamp):undefined;
      const limit=Math.min(50000,Math.max(5000,latestBars.length+token.ir.maxLookback+64));
      const task=Promise.all(secondaryDependencies.map(async dep=>{
        const key=dependencyKey(dep.symbol,dep.timeframe);
        try{
          const rows=await req.fetchSeries!(dep.symbol,dep.timeframe,{to:Number.isFinite(endTime)?endTime:undefined,limit});
          // A slower request must never overwrite a newer symbol/timeframe snapshot.
          if (stopped || requestVersion !== secondaryRequestVersion) return;
          if(rows?.length){
            const existing=secondaryData.get(key);
            // Vela's cache-backed fetch can return the exact same 5k–50k candles
            // on consecutive refreshes. Avoid reallocating object bars and
            // retransferring identical graph columns when nothing changed.
            if(!secondaryRowsMatch(existing,rows as unknown as VelaOhlcv[])){
              secondaryData.set(key,normalizeVelaBarsToCoreSpirit(rows as unknown as VelaOhlcv[]));
              secondaryGraphDirty=true;
            }
            secondaryFailed.delete(key);
          }else{
            // Do not leave an old cross-symbol snapshot addressable after a
            // refresh reports no data. Signals/order intents are already gated,
            // and the new worker graph must not expose stale values either.
            if(secondaryData.delete(key))secondaryGraphDirty=true;
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
          if(secondaryData.delete(key))secondaryGraphDirty=true;
          secondaryFailed.add(key);
          if(req.mode==='live'){
            const warning=`Secondary market data refresh failed for ${dep.symbol} ${dep.timeframe}: ${error instanceof Error?error.message:String(error)}`;
            secondaryWarnings.push(warning);
            if(secondaryWarnings.length>100)secondaryWarnings.splice(0,secondaryWarnings.length-100);
            handlers.onWarning?.({
              message:warning,
              method:'secondary-data',bar:Math.max(0,latestBars.length-1)
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
    const workerDatasetVersions=new Map<string,number>();
    // Global canonical-data revision across main/history/viewport worker contexts.
    let canonicalDatasetRevision = 0;
    let canonicalDatasetFingerprint = '';
    let canonicalTailFingerprint = '';
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
      dirtyBarRange:ExecutionBarRange,
      visibleRange?:VelaTimeRange,
      suppressExternalEffectsForRun=false,
    )=>{
      const datasetVersion=(workerDatasetVersions.get(contextKey)??0)+1;
      workerDatasetVersions.set(contextKey,datasetVersion);
      const sourceDatasetRevision = canonicalDatasetRevision;
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
        dirtyRange:dirtyBarRange,
        baseSymbol:req.market.symbol,
        baseTimeframe:req.market.timeframe,
        graphSnapshot:makeSecondaryGraphSnapshot(),
        readOnly,
        suppressExternalEffectsForRun,
        runtimeOptions,
      }).then(result => {
        // One adapter owns the CoreSpirit(epoch-seconds) → Vela(epoch-milliseconds)
        // boundary. Validate plot timestamps against the exact input timeline before
        // the retained scene is mutated; a stale/misaligned point must never be rendered.
        const adapted = adaptCoreSpiritOutputsForVela(result.outputs, currentBars);
        for (const warning of adapted.warnings) {
          handlers.onWarning?.({ message: warning, method: 'output-alignment', bar: Math.max(0, currentBars.length - 1) });
        }
        return { ...result, outputs: adapted.outputs, datasetVersion, sourceDatasetRevision };
      });
    };

    const safeOutputs = (outputs: CoreSpiritObject[]): CoreSpiritObject[] =>
      secondaryDegraded
        ? outputs.filter(output => output.kind !== 'signal' && output.kind !== 'orderIntent')
        : outputs;

    const emitModel = (dirty?: VelaTimeRange): void => {
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

    const emitScenePatches = (outputs: CoreSpiritObject[], dirty: VelaTimeRange, datasetRevision?: number): void => {
      // Drop stale replies before mutating the retained diff state, not only at Vela's patch applier.
      if (datasetRevision !== undefined && datasetRevision < canonicalDatasetRevision) return;
      const patches = scene.apply(outputs, dirty, datasetRevision);
      if (patches.length) handlers.onScenePatches?.(patches);
    };

    const rememberWorkerState=(value:unknown):void=>{
      lastExecutionState=value&&typeof value==='object'?value as RuntimeSnapshot:undefined;
    };
    const barValueSignature=(bar:CoreSpiritMarketBar|undefined):string=>bar?JSON.stringify([
      bar.timestamp,bar.open,bar.high,bar.low,bar.close,bar.volume??0,
    ]):'empty';
    const tailDatasetFingerprint=(candidateBars:readonly CoreSpiritMarketBar[]):string=>[
      candidateBars.length,
      candidateBars.length?barTimeMillis(candidateBars[0]?.timestamp):'empty',
      barValueSignature(candidateBars.at(-1)),
    ].join('|');
    // Full history hashing is reserved for completion/backfill boundaries; ordinary live updates
    // only compare length, first timestamp, and the forming candle so the hot path stays bounded.
    const fullDatasetFingerprint=(candidateBars:readonly CoreSpiritMarketBar[]):string=>{
      let hash=2166136261;
      const mix=(value:unknown):void=>{
        const text=String(value??'');
        for(let i=0;i<text.length;i+=1){hash=Math.imul(hash^text.charCodeAt(i),16777619);}
        hash=Math.imul(hash^124,16777619);
      };
      for(const bar of candidateBars){
        mix(barTimeMillis(bar.timestamp));mix(bar.open);mix(bar.high);mix(bar.low);mix(bar.close);mix(bar.volume??0);
      }
      return `${candidateBars.length}:${hash>>>0}`;
    };

    const evaluateLiveSnapshot=async(startingBars:CoreSpiritMarketBar[],generation:number,suppressTailEffectsForRun=false)=>{
      let currentBars=startingBars;
      let baseline:Awaited<ReturnType<typeof executeInWorker>>|undefined;
      let tail:Awaited<ReturnType<typeof executeInWorker>>|undefined;
      for(let attempt=0;attempt<3;attempt+=1){
        const historical=currentBars.slice(0,-1);
        baseline=await executeInWorker(historical,mainContextKey,true,executionBarRange(0,historical.length));
        if(stopped||generation!==mainRunGeneration)return undefined;

        // If a new candle was appended while history was warming, warm again so
        // the newly confirmed candle is committed before evaluating the new tail.
        const newest=getCurrentBars();
        const sameHistoryBoundary=newest.length===currentBars.length&&
          newest.at(-2)?.timestamp===currentBars.at(-2)?.timestamp;
        if(!sameHistoryBoundary){currentBars=newest;continue;}
        currentBars=newest;
        if(!currentBars.length)return {currentBars,baseline,tail:undefined};

        let stableTail=false;
        let historyBoundaryChanged=false;
        let tailBars=currentBars;
        for(let tailAttempt=0;tailAttempt<4;tailAttempt+=1){
          tailBars=currentBars;
          tail=await executeInWorker(tailBars,mainContextKey,false,executionBarRange(
            Math.max(0,tailBars.length-1),tailBars.length,
          ),undefined,suppressTailEffectsForRun);
          if(stopped||generation!==mainRunGeneration)return undefined;
          const afterTail=getCurrentBars();
          if(afterTail.length!==tailBars.length||afterTail.at(-2)?.timestamp!==tailBars.at(-2)?.timestamp){
            // A new confirmed candle arrived while the tail ran. Warm that
            // newly confirmed history before retrying the forming bar.
            currentBars=afterTail;
            historyBoundaryChanged=true;
            break;
          }
          if(barValueSignature(afterTail.at(-1))!==barValueSignature(tailBars.at(-1))){
            // Same candle, newer OHLCV revision: re-run only that tail. Continue
            // checking after every asynchronous reply so we never commit a stale
            // single retry if another tick landed while it was executing.
            currentBars=afterTail;
            continue;
          }
          currentBars=afterTail;
          stableTail=true;
          break;
        }
        if(historyBoundaryChanged)continue;
        // Under a continuously updating feed the bar may change for every retry.
        // Return the newest completed *snapshot result* rather than repeatedly
        // replaying all history; the next tick will advance the forming candle.
        if(stableTail||tail)return {currentBars:tailBars,baseline,tail};
      }
      throw new Error('CoreSpirit chart history changed repeatedly during worker initialization; retry after the candle update settles.');
    };

    const initializeStatic = async(currentBars:CoreSpiritMarketBar[]):Promise<void>=>{
      if(stopped||historyInitialized||initializationInFlight)return;
      initializationInFlight=true;
      const generation=++mainRunGeneration;
      initializationOwnerGeneration=generation;
      try{
        const result=await executeInWorker(currentBars,mainContextKey,true,executionBarRange(0,currentBars.length));
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
        emitModel(Number.isFinite(firstSeriesTime)&&Number.isFinite(lastTime)?velaTimeRange(firstSeriesTime,lastTime):undefined);
        handlers.onDone?.();
      }catch(error){
        if(!stopped&&generation===mainRunGeneration)handlers.onError?.(error instanceof Error?error:new Error(String(error)));
      }finally{
        if(initializationOwnerGeneration===generation)initializationInFlight=false;
      }
    };

    const initializeLive = async(currentBars:CoreSpiritMarketBar[],suppressTailEffectsForRun=false):Promise<void>=>{
      if(stopped||liveStarted||initializationInFlight)return;
      if(!currentBars.length){historyInitialized=false;liveStarted=false;return;}
      initializationInFlight=true;
      const generation=++mainRunGeneration;
      initializationOwnerGeneration=generation;
      try{
        const execution=await evaluateLiveSnapshot(currentBars,generation,suppressTailEffectsForRun);
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
        if(Number.isFinite(latestTime))emitScenePatches(tailOutputs,velaTimeRange(latestTime,latestTime),execution.tail.sourceDatasetRevision);
        rememberWorkerState(execution.tail.state);
        firstSeriesTime=barTimeMillis(execution.currentBars[0]?.timestamp);
        lastTime=latestTime;
        historyInitialized=true;
        liveStarted=true;
        emitModel(Number.isFinite(firstSeriesTime)&&Number.isFinite(lastTime)?velaTimeRange(firstSeriesTime,lastTime):undefined);
      }catch(error){
        if(!stopped&&generation===mainRunGeneration)handlers.onError?.(error instanceof Error?error:new Error(String(error)));
      }finally{
        if(initializationOwnerGeneration===generation)initializationInFlight=false;
      }
    };

    const initializeFromBars = (currentBars:CoreSpiritMarketBar[],suppressCurrentBarEffects=false):void=>{
      if(stopped||historyInitialized||initializationInFlight)return;
      if(req.mode==='live')void initializeLive(currentBars,suppressCurrentBarEffects);
      else void initializeStatic(currentBars);
    };

    // Normalize closed candles once. Live notifications normally revise only
    // the forming candle; backfills explicitly request a full refresh. Return an
    // array snapshot so queued worker jobs never observe later cache mutations.
    const normalizedBarsCache:CoreSpiritMarketBar[]=[];
    let normalizedInputLength=-1;
    const getCurrentBars=(forceFullNormalization=false,isolateSnapshot=true):CoreSpiritMarketBar[]=>{
      if(!req.getBars)return bars;
      const rows=req.getBars() as unknown as readonly VelaOhlcv[];
      if(!Array.isArray(rows))return bars;
      const length=rows.length;
      // A same-length snapshot may be a forming-bar replacement, while a
      // longer snapshot may still be a historical prepend. Reuse the prefix only
      // when stable opening-time anchors prove the old absolute indices survived.
      const safeStart=safeVelaNormalizationStart(rows,normalizedBarsCache,normalizedInputLength,forceFullNormalization);
      const start=safeStart===null?0:safeStart;
      if(safeStart===null)normalizedBarsCache.length=0;
      else normalizedBarsCache.length=start;
      let previousTime=start>0?barTimeMillis(normalizedBarsCache[start-1]?.timestamp):Number.NEGATIVE_INFINITY;
      for(let i=start;i<length;i+=1){
        const row=normalizeVelaBarToCoreSpirit(rows[i]!,i);
        const time=barTimeMillis(row.timestamp);
        if(i>0&&time<=previousTime)throw new Error(`CoreSpirit Vela data adapter rejected duplicate or non-chronological bar sequence at index ${i}.`);
        previousTime=time;
        normalizedBarsCache.push(row);
      }
      normalizedInputLength=length;
      return isolateSnapshot ? Object.freeze(normalizedBarsCache.slice()) as CoreSpiritMarketBar[] : normalizedBarsCache;
    };

    type LiveTailWork = {
      generation: number;
      sessionGeneration: number;
      datasetRevision: number;
      tailSignature: string;
    };

    // One main-tail worker run at a time; intermediate candle snapshots are
    // superseded while that run is in flight. The data plane has already processed
    // each raw trade, so coalescing here only skips redundant snapshot evaluations.
    const liveTailScheduler = new LatestValueAsyncScheduler<LiveTailWork>(async (work) => {
      if (stopped || work.generation !== liveRunGeneration ||
          work.sessionGeneration !== mainRunGeneration ||
          work.datasetRevision !== canonicalDatasetRevision) return;
      try {
        // Snapshot the canonical tape only when this job actually starts. Queued
        // intermediate ticks carry no full-history array and therefore allocate no
        // throwaway bar snapshots while an earlier calculation is still running.
        const workerBars = getCurrentBars();
        const tail = workerBars.at(-1);
        if (!tail || barValueSignature(tail) !== work.tailSignature) return;
        const result = await executeInWorker(workerBars, mainContextKey, false, executionBarRange(
          Math.max(0, workerBars.length - 1), workerBars.length,
        ));
        if (stopped || work.generation !== liveRunGeneration ||
            work.sessionGeneration !== mainRunGeneration ||
            work.datasetRevision !== canonicalDatasetRevision) return;

        // Never commit a calculation whose input tail was superseded during the await.
        const currentTail = getCurrentBars().at(-1);
        if (!currentTail || barValueSignature(currentTail) !== work.tailSignature) return;

        const latestOutputs = safeOutputs(result.outputs);
        const latestTime = barTimeMillis(tail.timestamp);
        if (Number.isFinite(latestTime)) {
          emitScenePatches(latestOutputs, velaTimeRange(latestTime, latestTime), result.sourceDatasetRevision);
          lastTime = latestTime;
        }
        rememberWorkerState(result.state);
      } catch (error) {
        if (!stopped && work.generation === liveRunGeneration &&
            work.sessionGeneration === mainRunGeneration &&
            work.datasetRevision === canonicalDatasetRevision) {
          handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });

    const initialBars = getCurrentBars();
    canonicalDatasetFingerprint=fullDatasetFingerprint(initialBars);
    canonicalTailFingerprint=tailDatasetFingerprint(initialBars);
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
          phase: stopped ? 'idle' : initializationInFlight ? 'computing' : req.mode === 'live' ? 'streaming' : 'idle',
          barIndex: state?.barIndex ?? -1,
          meta: {
            title: currentMetadata.meta.title,
            overlay: currentMetadata.meta.overlay,
            precision: currentMetadata.meta.precision,
            shorttitle: currentMetadata.meta.shorttitle,
          },
          plots: Object.fromEntries([...snapshot.points.entries()].map(([key, values]) => [key, values])),
          variables: state?.locals ?? {},
          warnings: secondaryWarnings.slice(-20).map(message => ({ message, method: 'secondary-data', bar: Math.max(0, currentBarCount() - 1) })),
        };
      },
      stop() {
        stopped = true;
        liveTailScheduler.dispose();
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
            Number.isFinite(firstSeriesTime)&&Number.isFinite(lastTime)?velaTimeRange(firstSeriesTime,lastTime):undefined,
          );
          return;
        }

        const updateGeneration=++updateVersion;
        const executionGeneration=++mainRunGeneration;
        liveTailScheduler.clear();
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
            if(Number.isFinite(latestTime))emitScenePatches(outputs,velaTimeRange(latestTime,latestTime),execution.tail.sourceDatasetRevision);
            rememberWorkerState(execution.tail.state);
            firstSeriesTime=barTimeMillis(execution.currentBars[0]?.timestamp);
            lastTime=latestTime;
            liveStarted=true;
          }else{
            const result=await executeInWorker(currentBars,mainContextKey,true,executionBarRange(0,currentBars.length));
            if(stopped||updateGeneration!==updateVersion||executionGeneration!==mainRunGeneration)return;
            outputs=safeOutputs(result.outputs);
            scene.reset();
            scene.seed(outputs);
            rememberWorkerState(result.state);
            firstSeriesTime=barTimeMillis(currentBars[0]?.timestamp);
            lastTime=barTimeMillis(currentBars.at(-1)?.timestamp);
          }
          historyInitialized=true;
          emitModel(Number.isFinite(firstSeriesTime)&&Number.isFinite(lastTime)?velaTimeRange(firstSeriesTime,lastTime):undefined);
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
        void executeInWorker(rangeBars,rangeContextKey,true,executionBarRange(0,rangeBars.length),velaTimeRange(viewportFrom,viewportTo))
          .then(result=>{
            if(stopped||generation!==viewportRunGeneration||updateGeneration!==updateVersion)return;
            emitScenePatches(safeOutputs(result.outputs),velaTimeRange(viewportFrom,viewportTo),result.sourceDatasetRevision);
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
        const currentBars=getCurrentBars(reason==='backfill',false);
        if(reason==='backfill'||reason==='complete'){
          const snapshotFingerprint=fullDatasetFingerprint(currentBars);
          if(reason==='backfill'||snapshotFingerprint!==canonicalDatasetFingerprint)canonicalDatasetRevision+=1;
          canonicalDatasetFingerprint=snapshotFingerprint;
          canonicalTailFingerprint=tailDatasetFingerprint(currentBars);
        }else{
          const nextTailFingerprint=tailDatasetFingerprint(currentBars);
          if(nextTailFingerprint!==canonicalTailFingerprint)canonicalDatasetRevision+=1;
          canonicalTailFingerprint=nextTailFingerprint;
        }
        lastViewportComputationKey=undefined;

        if(reason==='backfill'){
          liveTailScheduler.clear();
          const wasHistoryInitialized=historyInitialized;
          // A history prepend can change the recursive state of every later bar.
          // Invalidate any in-flight main/viewport runs and rebuild from the canonical
          // full history; maxLookback is not a safe bound for EMA/RMA/RSI/VWAP state.
          if(wasHistoryInitialized){
            workerDatasetVersions.delete(mainContextKey);
            mainRunGeneration+=1;
            liveRunGeneration+=1;
            viewportRunGeneration+=1;
            historyInitialized=false;
            liveStarted=false;
            initializationInFlight=false;
          }
          // Before initial history completion, the normal "complete" event owns startup.
          // Otherwise initializeLive warms all confirmed history and reapplies the forming
          // candle in the same main context, then emits a full-range scene refresh.
          if(!wasHistoryInitialized||!currentBars.length)return;
          initializeFromBars(Object.freeze(currentBars.slice()) as CoreSpiritMarketBar[],true);
          return;
        }

        if(reason==='complete'){
          if(!historyInitialized&&currentBars.length){
            if(secondaryDependencies.length){
              void loadSecondaryData(true).then(()=>initializeFromBars(getCurrentBars()))
                .catch(error=>handlers.onError?.(error instanceof Error?error:new Error(String(error))));
            }else initializeFromBars(getCurrentBars());
          }
          return;
        }

        if(req.mode!=='live')return;
        if(!currentBars.length)return;
        // Initialization and semantic-input updates own the main runtime context.
        // They sample the latest candle after each worker await, so don't enqueue
        // a competing tick that could supersede their required history warm-up.
        if(initializationInFlight)return;
        if(!historyInitialized||!liveStarted){
          initializeFromBars(getCurrentBars());
          return;
        }
        if(secondaryDependencies.length)void loadSecondaryData();
        const latest=currentBars.at(-1);
        if(!latest)return;
        const generation=++liveRunGeneration;
        const sessionGeneration=mainRunGeneration;
        liveTailScheduler.enqueue({
          generation,
          sessionGeneration,
          datasetRevision: canonicalDatasetRevision,
          tailSignature: barValueSignature(latest),
        });
      },    };
  }
}

export default CoreSpiritVelaEngine;
