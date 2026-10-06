import type { EngineCapabilities, ExecutionHandlers, ExecutionRequest, ExecutionSession, PreparedScript } from './services/core/chart/velaNativeChartKernel';
import type { InputValue } from './services/core/chart/velaNativeChartKernel';
import type { IndicatorMeta } from './services/core/chart/velaNativeChartKernel';
import { compileCoreSpirit, normalizeCoreSpirit } from './services/coreSpirit/coreSpiritPipeline';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime';
import type { CoreSpiritObject } from './services/coreSpirit/types';
import type { CoreSpiritMarketBar } from './services/coreSpirit/marketData';
import type { CoreSpiritDataResolver, CoreSpiritDataResolutionContext, CoreSpiritDataRequest, CoreSpiritDataSnapshot } from './services/coreSpirit/types';
import { CoreSpiritSceneDiff } from './services/core/chart/coreSpiritSceneDiff';
import { buildCoreSpiritVelaIndicatorModel } from './services/core/chart/tcoVelaSemanticAdapter';

type DirtyRange = { from: number; to: number };

type PreparedToken = {
  sourceId: string;
  source: string;
  ir: NonNullable<ReturnType<typeof compileCoreSpirit>['ir']>;
};

function barTimeMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 2e12 ? value : value * 1000;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
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
    const bars = req.bars as unknown as CoreSpiritMarketBar[];
    const secondaryData = new Map<string, CoreSpiritMarketBar[]>();
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
        const end=upperBoundMarketTime(rows,context.asOfTimestamp)-1;
        const target=end-Math.max(0,Math.floor(request.offset??0));
        const row=rows[target];
        if(!row)return null;
        const time=barTimeMillis(row.timestamp);
        return {
          value:Number((row as any)[request.field]),
          source:`vela.fetchSeries:${request.symbol}:${request.timeframe}`,
          symbol:request.symbol,
          timeframe:request.timeframe,
          timestamp:time,
          state:time===context.asOfTimestamp?'confirmed':'confirmed',
          revision:context.revision,
        };
      },
    };

    const loadSecondaryData = async (): Promise<void> => {
      if (!req.fetchSeries || !secondaryDependencies.length) return;
      const endTime = bars.length ? barTimeMillis(bars[bars.length-1]?.timestamp) : undefined;
      const limit = Math.min(50000, Math.max(5000, bars.length + token.ir.maxLookback + 64));
      await Promise.all(secondaryDependencies.map(async dep => {
        const key=dependencyKey(dep.symbol,dep.timeframe);
        if (secondaryData.has(key)) return;
        try {
          const rows=await req.fetchSeries!(dep.symbol,dep.timeframe,{ to:Number.isFinite(endTime) ? endTime : undefined, limit });
          if (rows?.length) secondaryData.set(key,rows as CoreSpiritMarketBar[]);
        } catch {}
      }));
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
      if (stopped) return;
      try {
        const initial = runtime.executeIr(token.ir, bars);
        scene.seed(initial.outputs);
        firstSeriesTime = bars.length ? barTimeMillis(bars[0]?.timestamp) : Number.NaN;
        lastTime = bars.length ? barTimeMillis(bars.at(-1)?.timestamp) : Number.NaN;
        emitModel(Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime) ? { from: firstSeriesTime, to: lastTime } : undefined);
        if (req.mode === 'static') handlers.onDone?.();
      } catch (error) {
        handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    };

    let secondaryReady = secondaryDependencies.length
      ? loadSecondaryData().then(() => true)
      : Promise.resolve(true);

    if (!secondaryDependencies.length) initialRun();
    else void secondaryReady.then(() => initialRun());

    const rehydrateForLive = (): void => {
      const currentBars = (req.getBars?.() || bars) as CoreSpiritMarketBar[];
      if (!currentBars.length || liveStarted) return;

      runtime.loadIr(token.ir);
      const historical = currentBars.slice(0, -1);
      scene.reset();
      if (historical.length) {
        const warm = runtime.executeIr(token.ir, historical);
        scene.seed(warm.outputs);
      }

      const latest = currentBars.at(-1);
      if (!latest) return;
      const result = runtime.executeBar(latest);
      const latestTime = barTimeMillis(latest.timestamp);
      if (Number.isFinite(latestTime)) {
        emitScenePatches(result.outputs, { from: latestTime, to: latestTime });
        lastTime = latestTime;
      }
      liveStarted = true;
    };

    if (req.mode === 'live') {
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
          warnings: [],
        };
      },
      stop() {
        stopped = true;
      },
      update(_inputs: Record<string, InputValue>, _props?: Record<string, InputValue>) {
        if (stopped) return;
        const runUpdate = (): void => {
          const currentBars = (req.getBars?.() || bars) as CoreSpiritMarketBar[];
          runtime.loadIr(token.ir);
          const result = runtime.executeIr(token.ir, currentBars);
          scene.reset();
          scene.seed(result.outputs);
          firstSeriesTime = barTimeMillis(currentBars[0]?.timestamp);
          lastTime = barTimeMillis(currentBars.at(-1)?.timestamp);
          emitModel(Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime) ? { from: firstSeriesTime, to: lastTime } : undefined);
          liveStarted = req.mode === 'live';
        };
        if (secondaryDependencies.length && secondaryData.size < secondaryDependencies.length) void loadSecondaryData().then(runUpdate);
        else runUpdate();
      },
      setVisibleRange() {
        // CoreSpirit execution remains renderer-neutral and range-insensitive.
      },
      notifyBars(reason, dirtyRange) {
        if (stopped) return;
        const currentBars = (req.getBars?.() || bars) as CoreSpiritMarketBar[];
        if (!currentBars.length) return;

        if (reason === 'complete') {
          const runComplete = (): void => {
            runtime.loadIr(token.ir);
            const result = runtime.executeIr(token.ir, currentBars);
            scene.reset();
            scene.seed(result.outputs);
            firstSeriesTime = barTimeMillis(currentBars[0]?.timestamp);
            lastTime = barTimeMillis(currentBars.at(-1)?.timestamp);
            emitModel(Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime) ? { from: firstSeriesTime, to: lastTime } : undefined);
            liveStarted = req.mode === 'live';
          };
          if (secondaryDependencies.length && secondaryData.size < secondaryDependencies.length) { void loadSecondaryData().then(runComplete); return; }
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
            const rangeResult = rangeRuntime.executeIr(token.ir, rangeBars);
            emitScenePatches(rangeResult.outputs, dirtyRange);
            return;
          }
        }

        if (!liveStarted) rehydrateForLive();
        const latest = currentBars.at(-1);
        if (!latest) return;
        const latestTime = barTimeMillis(latest.timestamp);
        const result = runtime.executeBar(latest);
        if (Number.isFinite(latestTime)) {
          emitScenePatches(result.outputs, { from: latestTime, to: latestTime });
          lastTime = latestTime;
        }
      },
    };
  }
}

export default CoreSpiritVelaEngine;
