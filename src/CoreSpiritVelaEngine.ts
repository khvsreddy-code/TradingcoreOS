import type {
  EngineCapabilities,
  ExecutionHandlers,
  ExecutionRequest,
  ExecutionSession,
  InputValue,
  PreparedScript,
  IndicatorMeta,
  IndicatorModel,
  SeriesPoint,
  SeriesSpec,
} from './services/core/chart/velaChartFacade';
import { compileCoreSpirit, normalizeCoreSpirit } from './services/coreSpirit/coreSpiritPipeline';
import { CoreSpiritRuntime } from './services/coreSpirit/runtime';
import type { CoreSpiritObject } from './services/coreSpirit/types';
import type { CoreSpiritMarketBar } from './services/coreSpirit/marketData';

type DirtyRange = { from:number; to:number };

type PreparedToken = {
  sourceId: string;
  source: string;
  ir: NonNullable<ReturnType<typeof compileCoreSpirit>['ir']>;
};

const lineStyle = (value: unknown): 'solid' | 'dashed' | 'dotted' => {
  const n = Number(value);
  return n === 1 ? 'dashed' : n === 2 ? 'dotted' : 'solid';
};

function barTimeMillis(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 2e12 ? value : value * 1000;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function lowerBoundBarTime(bars: readonly CoreSpiritMarketBar[], targetMs: number): number {
  let lo = 0, hi = bars.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (barTimeMillis(bars[mid]?.timestamp) < targetMs) lo = mid + 1; else hi = mid; }
  return lo;
}
function upperBoundBarTime(bars: readonly CoreSpiritMarketBar[], targetMs: number): number {
  let lo = 0, hi = bars.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (barTimeMillis(bars[mid]?.timestamp) <= targetMs) lo = mid + 1; else hi = mid; }
  return lo;
}

function titleFromSource(source: string): string {
  const match = source.match(/\b(?:indicator|study|component)\s+["']([^"']+)["']/i);
  if (match?.[1]) return match[1].trim();
  return 'CoreSpirit';
}

function objectToSeries(
  sourceId: string,
  points: Map<string, SeriesPoint[]>,
  output: Extract<CoreSpiritObject, { kind: 'series' }>,
): void {
  const id = String(output.seriesId || output.name || `${sourceId}:series`);
  const existing = points.get(id) || [];
  const time = Number(output.time);
  const value = output.value == null ? null : Number(output.value);
  const point: SeriesPoint = { time: time as SeriesPoint['time'], value: Number.isFinite(Number(value)) ? value : null };
  if (!existing.length || time > Number(existing[existing.length - 1]!.time)) existing.push(point);
  else if (time === Number(existing[existing.length - 1]!.time)) existing[existing.length - 1] = point;
  else {
    let lo = 0, hi = existing.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (Number(existing[mid]!.time) < time) lo = mid + 1; else hi = mid; }
    if (lo < existing.length && Number(existing[lo]!.time) === time) existing[lo] = point;
    else existing.splice(lo, 0, point);
  }
  points.set(id, existing);
}

function makeModel(
  id: string,
  meta: IndicatorMeta,
  points: Map<string, SeriesPoint[]>,
  markers: Map<string, {
    time: number;
    position: 'aboveBar' | 'belowBar' | 'inBar';
    shape: string;
    color: string;
    text?: string;
  }>,
  priceLines: Array<{ id: string; paneId: string; price: number; color?: string; lineStyle?: 'solid' | 'dashed' | 'dotted'; width?: number; title?: string }>,
  anchorTime?: number,
  dirty?: DirtyRange,
): IndicatorModel {
  const series: SeriesSpec[] = [...points.entries()].map(([seriesId, seriesPoints], index) => ({
    id: `${id}:series:${seriesId}`,
    title: seriesId.includes(':') ? seriesId.split(':').pop() || 'CoreSpirit' : seriesId,
    paneId: 'price',
    kind: 'line',
    points: seriesPoints,
    style: {
      color: index === 0 ? '#9b8aff' : '#c4b5fd',
      width: 2,
      lineStyle: 'solid',
    },
    visible: true,
    overlay: true,
  }));

  const markerList = [...markers.values()].sort((a, b) => a.time - b.time);
  if (markerList.length) {
    series.push({
      id: `${id}:signals`,
      title: 'Signals',
      paneId: 'price',
      kind: 'markers',
      markers: markerList,
      visible: true,
      overlay: true,
    });
  }

  return {
    id,
    ...(dirty ? { dirty } : {}),
    title: meta.title,
    shorttitle: meta.shorttitle,
    overlay: true,
    paneHint: 'price',
    legend: true,
    anchorTime: anchorTime as IndicatorModel['anchorTime'],
    series,
    fills: [],
    backgrounds: [],
    priceLines,
    inputs: [],
    inputValues: {},
  };
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
    const compiled = compileCoreSpirit(normalized, instanceId);
    const error = compiled.diagnostics?.find(diagnostic => diagnostic.severity === 'error');
    if (!compiled.ir || error) {
      throw new Error(error?.message || 'CoreSpirit compilation failed');
    }
    const meta: IndicatorMeta = {
      title: titleFromSource(normalized),
      overlay: true,
    };
    const token: PreparedToken = {
      sourceId: instanceId,
      source: normalized,
      ir: compiled.ir,
    };
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
    const runtime = new CoreSpiritRuntime({
      symbol: req.market.symbol,
      timeframe: req.market.timeframe,
      sourceId: token.sourceId,
      executionMode: req.mode === 'live' ? 'realtime' : 'historical',
      executionTarget: 'chart',
    });
    runtime.loadIr(token.ir);

    const points = new Map<string, SeriesPoint[]>();
    const markers = new Map<string, {
      time: number;
      position: 'aboveBar' | 'belowBar' | 'inBar';
      shape: string;
      color: string;
      text?: string;
    }>();
    const priceLines: Array<{ id: string; paneId: string; price: number; color?: string; lineStyle?: 'solid' | 'dashed' | 'dotted'; width?: number; title?: string }> = [];
    let stopped = false;
    let liveStarted = false;
    let lastTime = Number.NaN;

    const collect = (objects: CoreSpiritObject[]) => {
      for (const output of objects) {
        if (output.kind === 'series') {
          objectToSeries(token.sourceId, points, output);
        } else if (output.kind === 'signal') {
          const time = Number(output.time);
          const key = `${output.type}:${time}`;
          markers.set(key, {
            time,
            position: output.metadata?.position === 'below' ? 'belowBar' : 'aboveBar',
            shape: output.metadata?.shape === 'arrowUp' ? 'arrowUp' : 'circle',
            color: String(output.metadata?.color || '#9b8aff'),
            text: String(output.type || 'SIGNAL'),
          });
        } else if (output.kind === 'hline') {
          const price = Number(output.price);
          if (!Number.isFinite(price)) continue;
          const existing = priceLines.find(line => line.id === output.id);
          const line = {
            id: output.id || `${token.sourceId}:hline:${price}`,
            paneId: 'price',
            price,
            color: output.style?.color,
            lineStyle: lineStyle(output.style?.lineStyle),
            width: output.style?.lineWidth,
            
          };
          if (existing) Object.assign(existing, line);
          else priceLines.push(line);
        }
      }
    };

    const collectRange = (objects: CoreSpiritObject[], dirty: DirtyRange) => {
      const rangedSeries = new Map<string, SeriesPoint[]>();
      const other: CoreSpiritObject[] = [];
      for (const output of objects) {
        if (output.kind !== 'series') { other.push(output); continue; }
        const id = String(output.seriesId || output.name || `${token.sourceId}:series`);
        const list = rangedSeries.get(id) || [];
        const time = Number(output.time);
        const value = output.value == null ? null : Number(output.value);
        if (Number.isFinite(time) && time >= dirty.from && time <= dirty.to) list.push({
          time: time as SeriesPoint['time'],
          value: Number.isFinite(value) ? value : null,
        });
        rangedSeries.set(id, list);
      }
      for (const [id, fresh] of rangedSeries) {
        const existing = points.get(id) || [];
        let from = 0, to = existing.length;
        if (existing.length) {
          let lo=0,hi=existing.length;
          while(lo<hi){const mid=(lo+hi)>>>1;if(Number(existing[mid]!.time)<dirty.from)lo=mid+1;else hi=mid;}
          from=lo; lo=0;hi=existing.length;
          while(lo<hi){const mid=(lo+hi)>>>1;if(Number(existing[mid]!.time)<=dirty.to)lo=mid+1;else hi=mid;}
          to=lo;
        }
        existing.splice(from, Math.max(0,to-from), ...fresh);
        points.set(id, existing);
      }
      if (other.length) for (const output of other) { if (output.kind !== 'signal') continue; const time=Number(output.time); if (Number.isFinite(time) && time>=dirty.from && time<=dirty.to) collect([output]); }
    };

    const emitModel = (dirty?: DirtyRange) => {
      let firstTime: number | undefined;
      for (const values of points.values()) {
        const value = values[0]?.time;
        if (value == null) continue;
        const time = Number(value);
        if (firstTime == null || time < firstTime) firstTime = time;
      }
      handlers.onModel(makeModel(req.prepared.token === token ? token.sourceId : 'corespirit', req.prepared.meta, points, markers, priceLines, firstTime, dirty));
    };

    try {
      const initial = runtime.executeIr(token.ir, bars);
      collect(initial.outputs);
      lastTime = bars.length ? barTimeMillis((bars[bars.length - 1] as unknown as { timestamp: string | number }).timestamp) : Number.NaN;
      const firstTime = bars.length ? barTimeMillis((bars[0] as unknown as { timestamp: string | number }).timestamp) : Number.NaN;
      const dirty = Number.isFinite(firstTime) && Number.isFinite(lastTime) ? { from: firstTime, to: lastTime } : undefined;
      emitModel(dirty);
      if (req.mode === 'static') handlers.onDone?.();
    } catch (error) {
      handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
    }

    const rehydrateForLive = () => {
      const currentBars = (req.getBars?.() || bars) as CoreSpiritMarketBar[];
      if (!currentBars.length) return;
      if (liveStarted) return;
      runtime.loadIr(token.ir);
      runtime.executeIr(token.ir, currentBars.slice(0, -1));
      const latest = currentBars.at(-1);
      if (!latest) return;
      const result = runtime.executeBar(latest);
      collect(result.outputs);
      liveStarted = true;
      lastTime = barTimeMillis(latest.timestamp);
      emitModel(Number.isFinite(lastTime) ? { from: lastTime, to: lastTime } : undefined);
    };

    if (req.mode === 'live') rehydrateForLive();

    return {
      async getContext() {
        const state = runtime.getState();
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
          plots: Object.fromEntries([...points.entries()].map(([key, values]) => [key, values])),
          variables: state.locals,
          warnings: [],
        };
      },
      stop() {
        stopped = true;
      },
      update(_inputs: Record<string, InputValue>, _props?: Record<string, InputValue>) {
        if (stopped) return;
        const currentBars = (req.getBars?.() || bars) as CoreSpiritMarketBar[];
        points.clear();
        markers.clear();
        priceLines.splice(0, priceLines.length);
        runtime.loadIr(token.ir);
        const result = runtime.executeIr(token.ir, currentBars);
        collect(result.outputs);
        const firstTime = barTimeMillis(currentBars[0]?.timestamp);
        const lastTime = barTimeMillis(currentBars.at(-1)?.timestamp);
        emitModel(Number.isFinite(firstTime) && Number.isFinite(lastTime) ? { from: firstTime, to: lastTime } : undefined);
      },
      setVisibleRange() {
        // CoreSpirit currently has renderer-neutral range-insensitive execution.
      },
      notifyBars(reason, dirtyRange) {
        if (stopped) return;
        const currentBars = (req.getBars?.() || bars) as CoreSpiritMarketBar[];
        if (!currentBars.length) return;
        if (reason === 'complete') {
          points.clear(); markers.clear(); priceLines.splice(0, priceLines.length); runtime.loadIr(token.ir);
          const result = runtime.executeIr(token.ir, currentBars); collect(result.outputs); liveStarted = req.mode === 'live';
          lastTime = barTimeMillis(currentBars.at(-1)?.timestamp); const firstTime = barTimeMillis(currentBars[0]?.timestamp);
          emitModel(Number.isFinite(firstTime) && Number.isFinite(lastTime) ? { from:firstTime, to:lastTime } : undefined); return;
        }
        if (reason === 'backfill' && dirtyRange && Number.isFinite(dirtyRange.from) && Number.isFinite(dirtyRange.to)) {
          const start = lowerBoundBarTime(currentBars, dirtyRange.from);
          const end = Math.min(currentBars.length, upperBoundBarTime(currentBars, dirtyRange.to));
          const maxLookback = Math.max(0, Number(token.ir.maxLookback) || 0);
          const executionStart = Math.max(0, start - maxLookback);
          const rangeBars = currentBars.slice(executionStart, end);
          if (rangeBars.length) {
            const rangeRuntime = new CoreSpiritRuntime({ symbol:req.market.symbol, timeframe:req.market.timeframe, sourceId:token.sourceId, executionMode:req.mode === 'live' ? 'realtime' : 'historical', executionTarget:'chart' });
            rangeRuntime.loadIr(token.ir); const rangeResult = rangeRuntime.executeIr(token.ir, rangeBars);
            // Do not clear retained output: merge only the exact dirty interval.
            collectRange(rangeResult.outputs, dirtyRange); emitModel(dirtyRange); return;
          }
        }
        if (!liveStarted) rehydrateForLive();
        const latest = currentBars.at(-1); if (!latest) return;
        const latestTime = barTimeMillis(latest.timestamp); const result = runtime.executeBar(latest); collect(result.outputs);
        lastTime = latestTime; emitModel(Number.isFinite(latestTime) ? { from:latestTime, to:latestTime } : undefined);
      },
    };
  }
}

export default CoreSpiritVelaEngine;
