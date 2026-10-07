import type { EngineCapabilities, ExecutionHandlers, ExecutionRequest, ExecutionSession, PreparedScript } from './services/core/chart/velaNativeChartKernel.ts';
import type { InputValue } from './services/core/chart/velaNativeChartKernel.ts';
import type { IndicatorMeta } from './services/core/chart/velaNativeChartKernel.ts';
import { compileCoreSpirit, normalizeCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime.ts';
import type { CoreSpiritObject } from './services/coreSpirit/types.ts';
import type { CoreSpiritMarketBar } from './services/coreSpirit/marketData.ts';
import type { CoreSpiritDataResolver, CoreSpiritDataResolutionContext, CoreSpiritDataRequest, CoreSpiritDataSnapshot } from './services/coreSpirit/types.ts';
import { CoreSpiritSceneDiff } from './services/core/chart/coreSpiritSceneDiff.ts';
import { buildCoreSpiritVelaIndicatorModel } from './services/core/chart/tcoVelaSemanticAdapter.ts';

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

function titleFromSource(source: string): string {
  const match = source.match(/\b(?:indicator|study|component)\s+["']([^"']+)["']/i);
  if (match?.[1]) return match[1].trim();
  return 'CoreSpirit';
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
    visibleRange: false,
    inputs: false,
    props: false,
  };

  async prepare(source: string, instanceId: string): Promise<PreparedScript> {
    const normalized = normalizeCoreSpirit(source);
    const compiled = compileCoreSpirit(source, instanceId);
    const error = compiled.diagnostics?.find(diagnostic => diagnostic.severity === 'error');
    if (!compiled.ir || error) throw new Error(error?.message || 'CoreSpirit compilation failed');

    const meta: IndicatorMeta = { title: titleFromSource(normalized), overlay: true };
    const token: PreparedToken = { sourceId: instanceId, source: normalized, ir: compiled.ir };

    return {
      language: this.language,
      inputs: [],
      props: [],
      meta,
      reactsToViewport: false,
      maxLookback: compiled.ir.maxLookback,
      token,
    };
  }

  execute(req: ExecutionRequest, handlers: ExecutionHandlers): ExecutionSession {
    const token = req.prepared.token as PreparedToken;
    const bars = normalizeVelaBars(req.bars as unknown as VelaOhlcv[]);
    const secondaryData = new Map<string, CoreSpiritMarketBar[]>();
    let secondaryRefreshPromise: Promise<void>|undefined;
    let secondaryLastRefreshAt=0;
    let secondaryDegraded=false;
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
      if (!req.fetchSeries || !secondaryDependencies.length) return;
      const now=Date.now();
      if (!force && secondaryRefreshPromise) return secondaryRefreshPromise;
      if (!force && now-secondaryLastRefreshAt<1500) return;
      const latestBars = req.getBars ? normalizeVelaBars(req.getBars() as unknown as VelaOhlcv[]) : bars;
      const endTime=latestBars.length?barTimeMillis(latestBars[latestBars.length-1]?.timestamp):undefined;
      const limit=Math.min(50000,Math.max(5000,latestBars.length+token.ir.maxLookback+64));
      const task=Promise.all(secondaryDependencies.map(async dep=>{
        const key=dependencyKey(dep.symbol,dep.timeframe);
        try{
          const rows=await req.fetchSeries!(dep.symbol,dep.timeframe,{to:Number.isFinite(endTime)?endTime:undefined,limit});
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
      })).then(()=>{
        secondaryLastRefreshAt=Date.now();
        secondaryDegraded=secondaryFailed.size>0;
      }).finally(()=>{secondaryRefreshPromise=undefined;});
      secondaryRefreshPromise=task;
      return task;
    };

    const runtime = new CoreSpiritRuntime({
      symbol: req.market.symbol,
      timeframe: req.market.timeframe,
      sourceId: token.sourceId,
      executionMode: req.mode === 'live' ? 'realtime' : 'historical',
      executionTarget: 'chart',
      executionTier: 'optimized',
      dataResolver,
    });
    runtime.loadIr(token.ir);

    const scene = new CoreSpiritSceneDiff(token.sourceId);
    let stopped = false;
    let liveStarted = false;
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
        req.prepared.meta,
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
      ));
    };

    const emitScenePatches = (outputs: CoreSpiritObject[], dirty: DirtyRange): void => {
      const patches = scene.apply(outputs, dirty);
      if (patches.length) handlers.onScenePatches?.(patches);
    };

    const initialRun = (): void => {
      if (stopped || req.historyState === 'backfill') return;
      try {
        const initial = safeOutputs(runtime.executeIr(token.ir, bars).outputs);
        scene.seed(initial);
        firstSeriesTime = bars.length ? barTimeMillis(bars[0]?.timestamp) : Number.NaN;
        lastTime = bars.length ? barTimeMillis(bars.at(-1)?.timestamp) : Number.NaN;
        emitModel(Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime) ? { from: firstSeriesTime, to: lastTime } : undefined);
        if (req.mode === 'static') handlers.onDone?.();
      } catch (error) {
        handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    };

    let secondaryReady = secondaryDependencies.length
      ? loadSecondaryData(true).then(() => true)
      : Promise.resolve(true);

    if (!secondaryDependencies.length) initialRun();
    else void secondaryReady.then(() => initialRun());

    const rehydrateForLive = (): void => {
      const currentBars = req.getBars ? normalizeVelaBars(req.getBars() as unknown as VelaOhlcv[]) : bars;
      if (!currentBars.length || liveStarted) return;

      runtime.loadIr(token.ir);
      const historical = currentBars.slice(0, -1);
      scene.reset();
      if (historical.length) {
        const warm = safeOutputs(runtime.executeIr(token.ir, historical).outputs);
        scene.seed(warm);
      }

      const latest = currentBars.at(-1);
      if (!latest) return;
      const result = safeOutputs(runtime.executeBar(latest).outputs);
      const latestTime = barTimeMillis(latest.timestamp);
      if (Number.isFinite(latestTime)) {
        emitScenePatches(result, { from: latestTime, to: latestTime });
        lastTime = latestTime;
      }
      liveStarted = true;
    };

    if (req.mode === 'live' && req.historyState !== 'backfill') {
      if (secondaryDependencies.length) void secondaryReady.then(() => { if (!liveStarted) rehydrateForLive(); });
      else rehydrateForLive();
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
            title: req.prepared.meta.title,
            overlay: req.prepared.meta.overlay,
            precision: req.prepared.meta.precision,
            shorttitle: req.prepared.meta.shorttitle,
          },
          plots: Object.fromEntries([...snapshot.points.entries()].map(([key, values]) => [key, values])),
          variables: state.locals,
          warnings: secondaryWarnings.slice(-20).map(message => ({ message, method: 'secondary-data', bar: Math.max(0, bars.length - 1) })),
        };
      },
      stop() {
        stopped = true;
      },
      update(_inputs: Record<string, InputValue>, _props?: Record<string, InputValue>) {
        if (stopped) return;
        const runUpdate = (): void => {
          const currentBars = req.getBars ? normalizeVelaBars(req.getBars() as unknown as VelaOhlcv[]) : bars;
          runtime.loadIr(token.ir);
          const result = safeOutputs(runtime.executeIr(token.ir, currentBars).outputs);
          scene.reset();
          scene.seed(result);
          firstSeriesTime = barTimeMillis(currentBars[0]?.timestamp);
          lastTime = barTimeMillis(currentBars.at(-1)?.timestamp);
          emitModel(Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime) ? { from: firstSeriesTime, to: lastTime } : undefined);
          liveStarted = req.mode === 'live';
        };
        if (secondaryDependencies.length && secondaryData.size < secondaryDependencies.length) void loadSecondaryData(true).then(runUpdate); else if (secondaryDependencies.length) void loadSecondaryData();
        else runUpdate();
      },
      setVisibleRange() {
        // CoreSpirit execution remains renderer-neutral and range-insensitive.
      },
      notifyBars(reason, dirtyRange) {
        if (stopped) return;
        const currentBars = req.getBars ? normalizeVelaBars(req.getBars() as unknown as VelaOhlcv[]) : bars;
        if (!currentBars.length) return;

        if (reason === 'complete') {
          const runComplete = (): void => {
            runtime.loadIr(token.ir);
            const result = safeOutputs(runtime.executeIr(token.ir, currentBars).outputs);
            scene.reset();
            scene.seed(result);
            firstSeriesTime = barTimeMillis(currentBars[0]?.timestamp);
            lastTime = barTimeMillis(currentBars.at(-1)?.timestamp);
            emitModel(Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime) ? { from: firstSeriesTime, to: lastTime } : undefined);
            liveStarted = req.mode === 'live';
          };
          if (secondaryDependencies.length) { void loadSecondaryData(true).then(runComplete); return; }
          runComplete();
          return;
        }

        if (reason === 'backfill' && dirtyRange && Number.isFinite(dirtyRange.from) && Number.isFinite(dirtyRange.to)) {
          const start = lowerBoundBarTime(currentBars, dirtyRange.from);
          const end = Math.min(currentBars.length, upperBoundBarTime(currentBars, dirtyRange.to));
          const maxLookback = Math.max(0, Number(token.ir.maxLookback) || 0);
          const executionStart = Math.max(0, start - maxLookback);
          const rangeBars = currentBars.slice(executionStart, end);
          if (rangeBars.length) {
            const rangeRuntime = new CoreSpiritRuntime({
              symbol: req.market.symbol,
              timeframe: req.market.timeframe,
              sourceId: token.sourceId,
              executionMode: req.mode === 'live' ? 'realtime' : 'historical',
              executionTarget: 'chart',
              executionTier: 'optimized',
              dataResolver,
            });
            rangeRuntime.loadIr(token.ir);
            const rangeResult = safeOutputs(rangeRuntime.executeIr(token.ir, rangeBars).outputs);
            emitScenePatches(rangeResult, dirtyRange);
            return;
          }
        }

        if (!liveStarted) rehydrateForLive();
        if (req.mode==='live' && secondaryDependencies.length) void loadSecondaryData();
        const latest = currentBars.at(-1);
        if (!latest) return;
        const latestTime = barTimeMillis(latest.timestamp);
        const result = safeOutputs(runtime.executeBar(latest).outputs);
        if (Number.isFinite(latestTime)) {
          emitScenePatches(result, { from: latestTime, to: latestTime });
          lastTime = latestTime;
        }
      },
    };
  }
}

export default CoreSpiritVelaEngine;
