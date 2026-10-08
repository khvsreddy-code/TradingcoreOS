import type { EngineCapabilities, ExecutionHandlers, ExecutionRequest, ExecutionSession, PreparedScript } from './services/core/chart/velaNativeChartKernel.ts';
import type { InputSchema, InputValue } from './services/core/chart/velaNativeChartKernel.ts';
import type { IndicatorMeta } from './services/core/chart/velaNativeChartKernel.ts';
import { bindCoreSpiritInputValues, parseCoreSpiritScriptDeclaration, type CoreSpiritDeclarationField, type CoreSpiritScriptDeclaration } from './services/coreSpirit/velaDeclarationSurface.ts';
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
  declaration: CoreSpiritScriptDeclaration;
  viewportDependent: boolean;
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
  const match = source.match(/\b(?:indicator|strategy|study|component)\s+["']([^"']+)["']/i);
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

function velaInputType(typeName: string | undefined, value: CoreSpiritDeclarationField['defval']): InputSchema['type'] {
  const type = String(typeName ?? '').toLowerCase();
  if (type === 'int') return 'int';
  if (type === 'float' || type === 'number') return 'float';
  if (type === 'boolean' || type === 'bool') return 'bool';
  if (type === 'color') return 'color';
  if (type === 'price') return 'price';
  if (type === 'time') return 'time';
  if (type === 'session') return 'session';
  if (type === 'timeframe') return 'timeframe';
  if (type === 'symbol') return 'symbol';
  if (type === 'text_area') return 'text_area';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  return 'string';
}

function toVelaSchema(fields: readonly CoreSpiritDeclarationField[]): InputSchema[] {
  return fields.map((field) => ({
    key: field.key,
    title: field.title ?? field.key,
    type: velaInputType(field.typeName, field.defval),
    defval: field.defval,
    ...(field.min != null ? { min: field.min } : {}),
    ...(field.max != null ? { max: field.max } : {}),
    ...(field.step != null ? { step: field.step } : {}),
    ...(field.options ? { options: field.options } : {}),
    ...(field.group ? { group: field.group } : {}),
    ...(field.inline ? { inline: field.inline } : {}),
    ...(field.tab ? { tab: field.tab } : {}),
    ...(field.tooltip ? { tooltip: field.tooltip } : {}),
  }));
}

function resolveSchemaValues(schema: readonly InputSchema[], supplied: Readonly<Record<string, InputValue>> | undefined): Record<string, InputValue> {
  const values: Record<string, InputValue> = {};
  for (const field of schema) {
    const candidate = supplied?.[field.key] ?? field.defval;
    if (field.type === 'int' || field.type === 'float' || field.type === 'price' || field.type === 'time') {
      const numeric = Number(candidate);
      if (!Number.isFinite(numeric)) throw new Error(`CoreSpirit setting "${field.key}" must be finite.`);
      const normalized = field.type === 'int' ? Math.trunc(numeric) : numeric;
      values[field.key] = Math.min(field.max ?? normalized, Math.max(field.min ?? normalized, normalized));
    } else if (field.type === 'bool') {
      if (typeof candidate !== 'boolean') throw new Error(`CoreSpirit setting "${field.key}" must be boolean.`);
      values[field.key] = candidate;
    } else {
      const value = String(candidate);
      if (field.options?.length && !field.options.includes(value)) throw new Error(`CoreSpirit setting "${field.key}" must be one of: ${field.options.join(', ')}.`);
      values[field.key] = value;
    }
  }
  return values;
}

function metaWithProps(base: IndicatorMeta, declaration: CoreSpiritScriptDeclaration, props: Readonly<Record<string, InputValue>>): IndicatorMeta {
  const title = typeof props.title === 'string' && props.title.trim() ? props.title : (base.title || declaration.name);
  const shorttitle = typeof props.shorttitle === 'string' && props.shorttitle.trim() ? props.shorttitle : undefined;
  const overlay = typeof props.overlay === 'boolean' ? props.overlay : base.overlay;
  const precisionValue = Number(props.precision);
  const precision = Number.isFinite(precisionValue) ? Math.max(0, Math.min(16, Math.trunc(precisionValue))) : base.precision;
  const format = typeof props.format === 'string' && props.format.trim() ? props.format : base.format;
  return { title, ...(shorttitle ? { shorttitle } : {}), overlay, ...(precision != null ? { precision } : {}), ...(format ? { format } : {}) };
}

function inferViewportDependency(source: string): boolean {
  return /@viewport\b|@visibleRange\b|chart\.(?:left|right)_visible_(?:bar_time|bar_index|time)|\b(?:viewport|visibleRange|visible_range|vpvr|volumeProfile)\s*\(/i.test(source);
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
    const declaration = parseCoreSpiritScriptDeclaration(source) ?? {
      kind: 'indicator' as const,
      name: titleFromSource(source),
      inputs: [],
      props: [],
    };
    const inputs = toVelaSchema(declaration.inputs);
    const props = toVelaSchema(declaration.props);
    const defaults = Object.fromEntries(declaration.inputs.map((field) => [field.key, field.defval])) as Record<string, InputValue>;
    const boundSource = bindCoreSpiritInputValues(normalized, declaration, defaults);
    const compiled = compileCoreSpirit(boundSource, instanceId);
    const error = compiled.diagnostics?.find(diagnostic => diagnostic.severity === 'error');
    if (!compiled.ir || error) throw new Error(error?.message || 'CoreSpirit compilation failed');

    const baseMeta: IndicatorMeta = { title: declaration.name || titleFromSource(source), overlay: true };
    const defaultProps = resolveSchemaValues(props, undefined);
    const meta = metaWithProps(baseMeta, declaration, defaultProps);
    const viewportDependent = inferViewportDependency(source);
    const token: PreparedToken = { sourceId: instanceId, source: normalized, declaration, viewportDependent, ir: compiled.ir };

    return {
      language: this.language,
      inputs,
      props,
      meta,
      reactsToViewport: viewportDependent,
      maxLookback: compiled.ir.maxLookback,
      token,
    };
  }

  execute(req: ExecutionRequest, handlers: ExecutionHandlers): ExecutionSession {
    const token = req.prepared.token as PreparedToken;
    const bars = normalizeVelaBars(req.bars as unknown as VelaOhlcv[]);
    let activeInputs = resolveSchemaValues(req.prepared.inputs, req.inputs);
    let activeProps = resolveSchemaValues(req.prepared.props ?? [], req.props);
    const baseMeta: IndicatorMeta = { title: token.declaration.name || titleFromSource(token.source), overlay: true };
    let activeMeta = metaWithProps(baseMeta, token.declaration, activeProps);
    let activeIr = activeIr;
    let visibleRange = req.visibleRange ?? null;
    const secondaryData = new Map<string, CoreSpiritMarketBar[]>();
    let secondaryRefreshPromise: Promise<void>|undefined;
    let secondaryLastRefreshAt=0;
    let secondaryDegraded=false;
    const secondaryFailed = new Set<string>();
    const secondaryWarnings:string[]=[];
    const dataDependencies = activeIr.tradingNativePlan?.dataDependencies ?? [];
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
      const limit=Math.min(50000,Math.max(5000,latestBars.length+activeIr.maxLookback+64));
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
    runtime.loadIr(activeIr);

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
      const model = buildCoreSpiritVelaIndicatorModel(
        token.sourceId,
        activeMeta,
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
        req.prepared.inputs,
        activeInputs,
        req.prepared.props ?? [],
        activeProps,
      );
      handlers.onModel(model);
    };

    const emitScenePatches = (outputs: CoreSpiritObject[], dirty: DirtyRange): void => {
      const patches = scene.apply(outputs, dirty);
      if (patches.length) handlers.onScenePatches?.(patches);
    };

    const runVisibleRange = (currentBars: readonly CoreSpiritMarketBar[], range: { left: number; right: number } | null): boolean => {
      if (stopped || !currentBars.length) return false;
      try {
        const left = range ? Math.min(range.left, range.right) : Number.NaN;
        const right = range ? Math.max(range.left, range.right) : Number.NaN;
        const visibleStart = Number.isFinite(left) ? lowerBoundBarTime(currentBars, left) : 0;
        const visibleEnd = Number.isFinite(right)
          ? Math.min(currentBars.length, Math.max(visibleStart + 1, upperBoundBarTime(currentBars, right)))
          : currentBars.length;
        const executionStart = Math.max(0, visibleStart - Math.max(0, Number(activeIr.maxLookback) || 0));
        const rows = currentBars.slice(executionStart, visibleEnd);
        if (!rows.length) return false;
        runtime.loadIr(activeIr);
        const result = safeOutputs(runtime.executeIr(activeIr, rows).outputs);
        scene.reset();
        scene.seed(result);
        firstSeriesTime = barTimeMillis(rows[0]?.timestamp);
        lastTime = latestTimeOf(currentBars);
        emitModel(Number.isFinite(left) && Number.isFinite(right) ? { from: left, to: right } : undefined);
        return true;
      } catch (error) {
        handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
        return false;
      }
    };

    const initialRun = (): void => {
      if (stopped) return;
      try {
        if (token.viewportDependent && visibleRange) {
          runVisibleRange(bars, visibleRange);
        } else {
          const initial = safeOutputs(runtime.executeIr(activeIr, bars).outputs);
          scene.seed(initial);
          firstSeriesTime = bars.length ? barTimeMillis(bars[0]?.timestamp) : Number.NaN;
          lastTime = bars.length ? barTimeMillis(bars.at(-1)?.timestamp) : Number.NaN;
          emitModel(Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime) ? { from: firstSeriesTime, to: lastTime } : undefined);
        }
        if (req.mode === 'static') handlers.onDone?.();
      } catch (error) {
        handlers.onError?.(error instanceof Error ? error.message === 'string' ? new Error(error.message) : (error instanceof Error ? error : new Error(String(error))) : new Error(String(error)));
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

      if (token.viewportDependent && visibleRange) {
        if (!visibleRangeContainsLatest(currentBars, visibleRange)) return;
        if (!runVisibleRange(currentBars, visibleRange)) return;
        liveStarted = true;
        return;
      }

      runtime.loadIr(activeIr);
      const historical = currentBars.slice(0, -1);
      scene.reset();
      if (historical.length) {
        const warm = safeOutputs(runtime.executeIr(activeIr, historical).outputs);
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
          warnings: secondaryWarnings.slice(-20).map(message => ({ message, method: 'secondary-data', bar: Math.max(0, bars.length - 1) })),
        };
      },
      stop() {
        stopped = true;
      },
      update(inputs: Record<string, InputValue>, props?: Record<string, InputValue>) {
        if (stopped) return;
        try {
          const nextInputs = resolveSchemaValues(req.prepared.inputs, { ...activeInputs, ...inputs });
          const nextProps = resolveSchemaValues(req.prepared.props ?? [], { ...activeProps, ...(props ?? {}) });
          const boundSource = bindCoreSpiritInputValues(token.source, token.declaration, nextInputs);
          const compiled = compileCoreSpirit(boundSource, token.sourceId);
          const error = compiled.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
          if (!compiled.ir || error) throw new Error(error?.message || 'CoreSpirit input/property update failed');
          activeInputs = nextInputs;
          activeProps = nextProps;
          activeMeta = metaWithProps(baseMeta, token.declaration, activeProps);
          activeIr = compiled.ir;
          runtime.loadIr(activeIr);
          const currentBars = req.getBars ? normalizeVelaBars(req.getBars() as unknown as VelaOhlcv[]) : bars;
          if (token.viewportDependent && visibleRange) {
            runVisibleRange(currentBars, visibleRange);
            liveStarted = req.mode === 'live' && visibleRangeContainsLatest(currentBars, visibleRange);
          } else {
            const result = safeOutputs(runtime.executeIr(activeIr, currentBars).outputs);
            scene.reset();
            scene.seed(result);
            firstSeriesTime = barTimeMillis(currentBars[0]?.timestamp);
            lastTime = barTimeMillis(currentBars.at(-1)?.timestamp);
            emitModel(Number.isFinite(firstSeriesTime) && Number.isFinite(lastTime) ? { from: firstSeriesTime, to: lastTime } : undefined);
            liveStarted = req.mode === 'live';
          }
        } catch (error) {
          handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      },
      setVisibleRange(range) {
        if (stopped) return;
        visibleRange = range;
        if (!token.viewportDependent) return;
        const currentBars = req.getBars ? normalizeVelaBars(req.getBars() as unknown as VelaOhlcv[]) : bars;
        if (!currentBars.length) return;
        runVisibleRange(currentBars, range);
        liveStarted = req.mode === 'live' && visibleRangeContainsLatest(currentBars, range);
      },
      notifyBars(reason, dirtyRange) {
        if (stopped) return;
        const currentBars = req.getBars ? normalizeVelaBars(req.getBars() as unknown as VelaOhlcv[]) : bars;
        if (!currentBars.length) return;

        if (reason === 'complete') {
          const runComplete = (): void => {
            runtime.loadIr(activeIr);
            const result = safeOutputs(runtime.executeIr(activeIr, currentBars).outputs);
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
          const maxLookback = Math.max(0, Number(activeIr.maxLookback) || 0);
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
            rangeRuntime.loadIr(activeIr);
            const rangeResult = safeOutputs(rangeRuntime.executeIr(activeIr, rangeBars).outputs);
            emitScenePatches(rangeResult, dirtyRange);
            return;
          }
        }

        if (token.viewportDependent && visibleRange && !visibleRangeContainsLatest(currentBars, visibleRange)) return;
        if (!liveStarted) rehydrateForLive();
        if (token.viewportDependent && !liveStarted) return;
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
