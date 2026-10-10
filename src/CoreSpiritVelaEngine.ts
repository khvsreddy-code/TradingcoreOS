import type { EngineCapabilities, ExecutionHandlers, ExecutionRequest, ExecutionSession, PreparedScript } from './services/core/chart/velaNativeChartKernel.ts';
import type { InputValue } from './services/core/chart/velaNativeChartKernel.ts';
import { compileCoreSpirit, normalizeCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';
import type { CoreSpiritObject } from './services/coreSpirit/types.ts';
import type { CoreSpiritMarketBar } from './services/coreSpirit/marketData.ts';
import type { CoreSpiritDataResolver, CoreSpiritDataResolutionContext, CoreSpiritDataRequest, CoreSpiritDataSnapshot } from './services/coreSpirit/types.ts';
import { CoreSpiritSceneDiff } from './services/core/chart/coreSpiritSceneDiff.ts';
import { buildCoreSpiritVelaIndicatorModel } from './services/core/chart/tcoVelaSemanticAdapter.ts';
import { resolveCoreSpiritVelaMetadata } from './services/coreSpirit/coreSpiritVelaMetadata.ts';

type DirtyRange = { from: number; to: number };

type PreparedToken = {
  sourceId: string;
  source: string;
  ir: NonNullable<ReturnType<typeof compileCoreSpirit>['ir']>;
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


function dependencyKey(symbol:string,timeframe:string):string {
  return `${symbol.toUpperCase()}|${timeframe.toLowerCase()}`;
}

function upperBoundMarketTime(bars:readonly CoreSpiritMarketBar[], targetMs:number):number {
  let lo=0,hi=bars.length;
  while(lo<hi){
    const mid=(lo+hi)>>>1;
    if(barTimeMillis(bars[mid]?.timestamp)<=targetMs)lo=mid+1;
    else hi=mid;
  }
  return lo;
}

function timeframeDurationMs(timeframe:string):number{
  const match=String(timeframe||'').trim().match(/^(\d+)([smhdw]?)$/i);
  if(!match)return 5*60_000;
  const count=Math.max(1,Number(match[1]));
  switch(String(match[2]||'m').toLowerCase()){
    case 's':return count*1_000;
    case 'h':return count*60*60_000;
    case 'd':return count*24*60*60_000;
    case 'w':return count*7*24*60*60_000;
    default:return count*60_000;
  }
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
    const compiled = compileCoreSpirit(source, instanceId);
    const error = compiled.diagnostics?.find(diagnostic => diagnostic.severity === 'error');
    if (!compiled.ir || error) throw new Error(error?.message || 'CoreSpirit compilation failed');

    const metadata = resolveCoreSpiritVelaMetadata(source, compiled.ir);
    const token: PreparedToken = { sourceId: instanceId, source: normalized, ir: compiled.ir };

    return {
      language: this.language,
      inputs: metadata.inputs,
      props: metadata.props,
      meta: metadata.meta,
      reactsToViewport: metadata.reactsToViewport,
      maxLookback: compiled.ir.maxLookback,
      token,
    };
  }

  execute(req: ExecutionRequest, handlers: ExecutionHandlers): ExecutionSession {
    const token = req.prepared.token as PreparedToken;
    const bars = normalizeVelaBars(req.bars as unknown as VelaOhlcv[]);
    const secondaryData = new Map<string, CoreSpiritMarketBar[]>();
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

    const dataResolver: CoreSpiritDataResolver = {
      requestAt: (request: CoreSpiritDataRequest, context: CoreSpiritDataResolutionContext): CoreSpiritDataSnapshot | null => {
        const key=dependencyKey(request.symbol,request.timeframe);
        const rows=secondaryData.get(key);
        if(!rows?.length)return null;
        const offset=Math.max(0,Math.floor(request.offset??0));
        const end=upperBoundMarketTime(rows,context.asOfTimestamp)-1;
        if(end<0)return null;
        const duration=timeframeDurationMs(request.timeframe);
        const isConfirmed=(candidate:CoreSpiritMarketBar)=>{
          const t=barTimeMillis(candidate.timestamp);
          return context.executionMode!=='realtime'||t+duration<=context.asOfTimestamp;
        };
        let target=end;
        if(context.alignment==='last-confirmed'){
          let cursor=end;
          while(cursor>=0&&!isConfirmed(rows[cursor]!))cursor-=1;
          if(cursor<0)return null;
          target=cursor-offset;
        }else if(context.alignment==='nearest-confirmed'){
          // "Nearest confirmed" is still causal: never look beyond asOfTimestamp.
          // In live/replay this naturally means the latest confirmed bar at or
          // before asOf; in historical mode it uses the same no-lookahead rule.
          let cursor=end;
          while(cursor>=0&&!isConfirmed(rows[cursor]!))cursor-=1;
          if(cursor<0)return null;
          target=cursor-offset;
        }else{
          target=end-offset;
        }
        const row=rows[target];
        if(!row)return null;
        const time=barTimeMillis(row.timestamp);
        const confirmed=isConfirmed(row);
        const distance=Math.abs(context.asOfTimestamp-time);
        const stale=context.maxStalenessMs!=null && distance>context.maxStalenessMs;
        if(stale)return null;
        if(context.alignment==='exact'&&time!==context.asOfTimestamp)return null;
        if(context.alignment==='developing'&&time>context.asOfTimestamp)return null;
        return {
          value:Number((row as any)[request.field]),
          source:`vela.fetchSeries:${request.symbol}:${request.timeframe}`,
          symbol:request.symbol,
          timeframe:request.timeframe,
          timestamp:time,
          state:confirmed?'confirmed':'developing',
          revision:context.revision,
        };
      },
    };

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

    let activeVisibleRange = req.visibleRange ? { left:Number(req.visibleRange.left), right:Number(req.visibleRange.right) } : undefined;

    const createRuntime = (): CoreSpiritRuntime => new CoreSpiritRuntime({
      symbol: req.market.symbol,
      timeframe: req.market.timeframe,
      sourceId: token.sourceId,
      executionMode: req.mode === 'live' ? 'realtime' : 'historical',
      executionTarget: 'chart',
      executionTier: 'optimized',
      dataResolver,
      visibleRange: activeVisibleRange ? { from:activeVisibleRange.left, to:activeVisibleRange.right } : undefined,
      inputValues: currentMetadata.inputValues,
      propValues: currentMetadata.propValues,
    });

    let runtime = createRuntime();
    runtime.loadIr(token.ir);

    const scene = new CoreSpiritSceneDiff(token.sourceId);
    let liveStarted = false;
    let historyInitialized = false;
    let firstSeriesTime = Number.NaN;
    let lastTime = Number.NaN;

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

    const initializeStatic = (currentBars: CoreSpiritMarketBar[]): void => {
      if (stopped || historyInitialized) return;
      const result = safeOutputs(runtime.executeIr(token.ir, currentBars).outputs);
      scene.reset();
      scene.seed(result);
      firstSeriesTime = currentBars.length ? barTimeMillis(currentBars[0]?.timestamp) : Number.NaN;
      lastTime = currentBars.length ? barTimeMillis(currentBars.at(-1)?.timestamp) : Number.NaN;
      historyInitialized = true;
      emitModel(
        Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime)
          ? { from:firstSeriesTime, to:lastTime }
          : undefined,
      );
      handlers.onDone?.();
    };

    const initializeLive = (currentBars: CoreSpiritMarketBar[]): void => {
      if (stopped || liveStarted) return;
      scene.reset();

      if (!currentBars.length) {
        historyInitialized = true;
        liveStarted = true;
        return;
      }

      const historical = currentBars.slice(0, -1);
      if (historical.length) {
        // One confirmed-history pass establishes the runtime's stable baseline.
        // The same runtime then evaluates the forming bar without rehydrating history.
        const warm = safeOutputs(runtime.executeIr(token.ir, historical).outputs);
        scene.seed(warm);
      }

      const latest = currentBars.at(-1);
      if (!latest) {
        historyInitialized = true;
        liveStarted = true;
        return;
      }

      const result = safeOutputs(runtime.executeBar(latest).outputs);
      const latestTime = barTimeMillis(latest.timestamp);
      firstSeriesTime = barTimeMillis(currentBars[0]?.timestamp);
      lastTime = latestTime;
      historyInitialized = true;
      liveStarted = true;

      if (Number.isFinite(latestTime)) emitScenePatches(result, { from:latestTime, to:latestTime });
      emitModel(
        Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime)
          ? { from:firstSeriesTime, to:lastTime }
          : undefined,
      );
    };

    const initializeFromBars = (currentBars: CoreSpiritMarketBar[]): void => {
      try {
        if (req.mode === 'live') initializeLive(currentBars);
        else initializeStatic(currentBars);
      } catch (error) {
        handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    };

    const getCurrentBars = (): CoreSpiritMarketBar[] =>
      req.getBars
        ? normalizeVelaBars(req.getBars() as unknown as VelaOhlcv[])
        : bars;

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
        const state = runtime.getState();
        const snapshot = scene.snapshot();
        return {
          language: 'corespirit',
          phase: req.mode === 'live' && !stopped ? 'streaming' : 'idle',
          barIndex: state.barIndex,
          meta: {
            title: currentMetadata.meta.title,
            overlay: currentMetadata.meta.overlay,
            precision: currentMetadata.meta.precision,
            shorttitle: currentMetadata.meta.shorttitle,
          },
          plots: Object.fromEntries([...snapshot.points.entries()].map(([key, values]) => [key, values])),
          variables: state.locals,
          warnings: secondaryWarnings.slice(-20).map(message => ({ message, method: 'secondary-data', bar: Math.max(0, bars.length - 1) })),
        };
      },
      stop() {
        stopped = true;
        secondaryRequestVersion += 1;
        updateVersion += 1;
        secondaryRefreshPromise = undefined;
      },
      update(inputs: Record<string, InputValue>, props?: Record<string, InputValue>) {
        if (stopped) return;
        const updateGeneration = ++updateVersion;
        currentMetadata = resolveCoreSpiritVelaMetadata(token.source, token.ir, { inputs, props });

        const runUpdate = (): void => {
          if (stopped || updateGeneration !== updateVersion) return;
          const currentBars = getCurrentBars();
          runtime = createRuntime();
          runtime.loadIr(token.ir);
          scene.reset();

          if (req.mode === 'live') {
            const historical = currentBars.slice(0, -1);
            if (historical.length) scene.seed(safeOutputs(runtime.executeIr(token.ir, historical).outputs));

            const latest = currentBars.at(-1);
            if (latest) {
              const latestResult = safeOutputs(runtime.executeBar(latest).outputs);
              const latestTime = barTimeMillis(latest.timestamp);
              if (Number.isFinite(latestTime)) emitScenePatches(latestResult, { from:latestTime, to:latestTime });
              lastTime = latestTime;
            }

            firstSeriesTime = currentBars.length ? barTimeMillis(currentBars[0]?.timestamp) : Number.NaN;
            historyInitialized = true;
            liveStarted = true;
          } else {
            const result = safeOutputs(runtime.executeIr(token.ir, currentBars).outputs);
            scene.seed(result);
            firstSeriesTime = barTimeMillis(currentBars[0]?.timestamp);
            lastTime = barTimeMillis(currentBars.at(-1)?.timestamp);
            historyInitialized = true;
          }

          emitModel(
            Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime)
              ? { from:firstSeriesTime, to:lastTime }
              : undefined,
          );
        };

        if (secondaryDependencies.length) {
          void loadSecondaryData(true)
            .then(runUpdate)
            .catch(error => handlers.onError?.(error instanceof Error ? error : new Error(String(error))));
        } else {
          try { runUpdate(); }
          catch (error) { handlers.onError?.(error instanceof Error ? error : new Error(String(error))); }
        }
      },
      setVisibleRange(range) {
        if (stopped || !currentMetadata.reactsToViewport) return;
        const left = Number(range.left);
        const right = Number(range.right);
        if (!Number.isFinite(left) || !Number.isFinite(right)) return;
        const viewportFrom = Math.min(left, right);
        const viewportTo = Math.max(left, right);
        activeVisibleRange = { left:viewportFrom, right:viewportTo };
        const currentBars = req.getBars ? normalizeVelaBars(req.getBars() as unknown as VelaOhlcv[]) : bars;
        if (!currentBars.length) return;
        const start = lowerBoundBarTime(currentBars, viewportFrom);
        const end = Math.min(currentBars.length, upperBoundBarTime(currentBars, viewportTo));
        const maxLookback = Math.max(0, Number(token.ir.maxLookback) || 0);
        const executionStart = Math.max(0, start - maxLookback);
        const rangeBars = currentBars.slice(executionStart, end);
        if (!rangeBars.length) return;

        const rangeRuntime = createRuntime();
        rangeRuntime.loadIr(token.ir);
        const rangeResult = safeOutputs(rangeRuntime.executeIr(token.ir, rangeBars).outputs);
        emitScenePatches(rangeResult, { from: viewportFrom, to: viewportTo });
      },
      notifyBars(reason, dirtyRange) {
        if (stopped) return;
        const currentBars = getCurrentBars();
        if (!currentBars.length) return;

        if (reason === 'backfill') {
          // Older pages may arrive while Vela is still building the initial dataset.
          // Do not execute partial history; wait for the single complete snapshot.
          if (!historyInitialized) return;

          if (dirtyRange && Number.isFinite(dirtyRange.from) && Number.isFinite(dirtyRange.to)) {
            const start = lowerBoundBarTime(currentBars, dirtyRange.from);
            const end = Math.min(currentBars.length, upperBoundBarTime(currentBars, dirtyRange.to));
            const maxLookback = Math.max(0, Number(token.ir.maxLookback) || 0);
            const executionStart = Math.max(0, start - maxLookback);
            const rangeBars = currentBars.slice(executionStart, end);
            if (rangeBars.length) {
              const rangeRuntime = createRuntime();
              rangeRuntime.loadIr(token.ir);
              const rangeResult = safeOutputs(rangeRuntime.executeIr(token.ir, rangeBars).outputs);
              emitScenePatches(rangeResult, dirtyRange);
            }
          }
          return;
        }

        if (reason === 'complete') {
          if (!historyInitialized) {
            if (secondaryDependencies.length) {
              void loadSecondaryData(true)
                .then(() => initializeFromBars(getCurrentBars()))
                .catch(error => handlers.onError?.(error instanceof Error ? error : new Error(String(error))));
            } else {
              initializeFromBars(currentBars);
            }
          }
          return;
        }

        if (!historyInitialized || req.mode !== 'live') return;
        if (secondaryDependencies.length) void loadSecondaryData();

        const latest = currentBars.at(-1);
        if (!latest) return;

        const latestTime = barTimeMillis(latest.timestamp);
        try {
          const result = safeOutputs(runtime.executeBar(latest).outputs);
          if (Number.isFinite(latestTime)) {
            emitScenePatches(result, { from:latestTime, to:latestTime });
            lastTime = latestTime;
          }
        } catch (error) {
          handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      },
    };
  }
}

export default CoreSpiritVelaEngine;
