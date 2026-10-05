import type { HistoricalCandle } from './types';
import { CoreEventBus, coreEventBus } from '../core/event/eventBus';
import { CoreSpiritObject, CoreSpiritProgram, CoreSpiritValue } from './types';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import type { CoreSpiritExecutionTarget } from './executionTarget';
import { CoreSpiritUiRuntime, type CoreSpiritUiEvent, type CoreSpiritUiState, type CoreSpiritUiAction } from './uiRuntime';
import { CoreSpiritVisualAppRuntime, type CoreSpiritVisualAppState, type CoreSpiritVisualAppManifest } from './visualApp';
import { type CoreSpiritDeclarativeVisualState, type CoreSpiritDeclarativeVisualSpec, replaceDeclarativeVisual, buildCoreSpiritSceneFromDeclarativeVisuals } from './declarativeVisual';
import type { CoreSpiritScene, CoreSpiritSceneIdentity } from './visualScene';
import { coreSpiritAboveBar, coreSpiritAtBar, coreSpiritBelowBar, coreSpiritChartArea, coreSpiritPanelArea, coreSpiritPlacement, coreSpiritPoint, coreSpiritTimePricePoint, type CoreSpiritVisualArea, type CoreSpiritCoordinateSpace, type CoreSpiritVisualPoint } from './visualCoordinates';
import { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { CoreSpiritCompiler } from './compiler';
import { createCoreSpiritExecutionContext, createCoreSpiritExecutionFrame } from './executionContext';
import type { CoreSpiritExecutionContext, CoreSpiritExecutionMode, CoreSpiritDataResolver, CoreSpiritTick, CoreSpiritFootprint, CoreSpiritIntrabar, CoreSpiritDataRequest, CoreSpiritDataSnapshot, CoreSpiritDataResolutionContext } from './types';
import type { CoreSpiritWorkspaceSlot, CoreSpiritWorkspaceWidgetKind } from './visualApp';
import type { CoreSpiritChartAreaKind } from './visualCoordinates';
import type { CoreSpiritSurfaceDeclaration } from './languageConcepts';
import { ATRState, RSIState, VWAPSessionState } from './statefulIndicatorKernel';
import { createCoreSpiritOrderIntent, normalizeCoreSpiritOrderDirection, normalizeCoreSpiritOrderSizing } from './orderIntent';
import { planCoreSpiritSeriesFusion, type CoreSpiritSeriesFusionPlan } from './seriesFusion';
import { CoreSpiritFusedSeriesCursor, type CoreSpiritSeriesOperationName } from './seriesVector';
import { CoreSpiritExecutionVM } from './executionVM';
import type { CoreSpiritExecutionVMHost } from './executionVM';
import { CoreSpiritOptimizedExecutionVM } from './optimizedExecutionVM';
import type { CoreSpiritValueStore } from './executionValueStore';
import type { CoreSpiritExecutionTier } from './executionTier';
import { CoreSpiritStateStore } from './stateStore';
import { CoreSpiritOutputCollector } from './outputCollector';
import { CoreSpiritEventRouter } from './eventRouter';
import { CoreSpiritCapabilityHost } from './capabilityHost';
import { CoreSpiritDebugHost } from './debugHost';
import { CoreSpiritSeriesRegistry, type CoreSpiritSeriesId } from './seriesRegistry';
import { CoreSpiritProfiler, type CoreSpiritProfilerOptions, type CoreSpiritProfilerSnapshot } from './profiler';

export type CoreSpiritModelOutputResolver = (input: { modelName:string; field:string; binding?: { kind:string; locator:string } }) => unknown;
export type CoreSpiritRuntimeOptions = {
  symbol?: string; timeframe?: string; sourceId?: string; maxStepsPerBar?: number;
  timezone?: string; stateHistoryLimit?: number; maxOutputsPerBar?: number; maxHistoryBars?: number; executionMode?: CoreSpiritExecutionMode; runId?: string; abortSignal?: AbortSignal; dataResolver?: CoreSpiritDataResolver; executionPolicy?: CoreSpiritExecutionContext['policy'];
  layer?: CoreSpiritProgramLayer; executionTarget?: CoreSpiritExecutionTarget; reactiveExecution?: boolean; executionTier?: CoreSpiritExecutionTier;
  modelOutputResolver?: CoreSpiritModelOutputResolver; eventResolver?: (eventName:string) => boolean | unknown;\n  profiler?: CoreSpiritProfilerOptions;
};
export type CoreSpiritRuntimeState = {
  barIndex: number; time: number; locals: Record<string, unknown>; seriesState: Record<string, number[]>; localSeries: Record<string, Array<number | boolean | string | null>>; barState: { index:number; time:number; isFirst:boolean; isLast:boolean; isRealtime:boolean; isConfirmed:boolean; revision:number; symbol:string; timeframe:string; mode:CoreSpiritExecutionMode };
  workspaceState: { ui: CoreSpiritUiState; app: CoreSpiritVisualAppState; visuals: CoreSpiritDeclarativeVisualState };
};
export type CoreSpiritExecutionResult = { outputs: CoreSpiritObject[]; state: CoreSpiritRuntimeState; diagnostics: string[] };

/** Stateful, chronological CoreSpirit executor. No DOM, network or broker APIs are exposed here. */
export class CoreSpiritRuntime {
  private readonly dataResolver?: CoreSpiritDataResolver;
  private readonly compiler = new CoreSpiritCompiler();
  private readonly options: { symbol:string; timeframe:string; sourceId:string; maxStepsPerBar:number; timezone:string; stateHistoryLimit:number };
  private readonly bus: CoreEventBus;
  private readonly timezone: string;
  private readonly abortSignal?: AbortSignal;
  private stateHistoryLimit: number;
  private readonly maxOutputsPerBar: number;
  private readonly maxHistoryBars: number;
  private readonly executionContext: CoreSpiritExecutionContext;
  private state: CoreSpiritRuntimeState = { barIndex: -1, time: 0, locals: {}, seriesState: {}, localSeries: {}, barState: { index:-1, time:0, isFirst:true, isLast:false, isRealtime:false, isConfirmed:true, revision:0, symbol:'', timeframe:'unknown', mode:'historical' }, workspaceState: { ui:{version:1,revision:0,panels:[]}, app:null, visuals:{version:1,revision:0,specs:[]} } };
  private compiledIr?: CoreSpiritIrProgram;
  private loadedProgramId?: string;
  private history: HistoricalCandle[] = [];
  private crossState: Record<string, { a: number; b: number }> = {};
  private currentBarSnapshot?: { historyLength:number };
  private realtime = false;
  private lastBarWasRealtime = false;
  private plotOrdinal = 0;
  private indicatorMemo = new Map<string, unknown>();
  private outputCount = 0;
  private dataMemo = new Map<string, unknown>();
  private readonly uiRuntime = new CoreSpiritUiRuntime();
  private readonly appRuntime = new CoreSpiritVisualAppRuntime();
  private declarativeVisualState: CoreSpiritDeclarativeVisualState = { version:1, revision:0, specs:[] };
  private readonly reactiveExecution: boolean;
  private reactiveRevision = 0;
  private reactiveRecomputed = 0;
  private reactiveReused = 0;
  private reactiveEffects = 0;
  private realtimeLifecycle: 'idle'|'evaluating'|'committed' = 'idle';
  private readonly modelOutputResolver?: CoreSpiritModelOutputResolver;
  private readonly eventResolver?: (eventName:string)=>boolean|unknown;
  private readonly executionTarget: CoreSpiritExecutionTarget = 'chart';
  private readonly layer: CoreSpiritProgramLayer = 'script';
  private realtimeRevision = 0;
  private realtimeEventTransactionId?: string;
  private loadedSurface?: CoreSpiritProgram['surface'];
  private seriesFusionPlan?: CoreSpiritSeriesFusionPlan;
  private readonly fusedStageByInstruction = new Map<number, { groupId: string; stageIndex: number }>();
  private readonly fusedCursors = new Map<string, CoreSpiritFusedSeriesCursor>();
  /** O(1) plan lookup for fused instruction execution. */
  private readonly fusedGroupById = new Map<string, CoreSpiritSeriesFusionPlan['groups'][number]>();
  /** One bounded snapshot per active forming-bar group; never history-sized. */
  private readonly fusedCursorSnapshots = new Map<string, CoreSpiritFusedSeriesCursor>();
  /** Direct stateful built-ins that are not absorbed into a fusion group. */
  private readonly directKernelCursors = new Map<string, CoreSpiritFusedSeriesCursor>();
  private readonly directKernelSnapshots = new Map<string, CoreSpiritFusedSeriesCursor>();
  private readonly rsiKernels = new Map<string, RSIState>();
  private readonly atrKernels = new Map<string, ATRState>();
  private readonly vwapKernels = new Map<string, VWAPSessionState>();
  private readonly rsiKernelSnapshots = new Map<string, RSIState>();
  private readonly atrKernelSnapshots = new Map<string, ATRState>();
  private readonly vwapKernelSnapshots = new Map<string, VWAPSessionState>();
  private realtimeTransactionId?: string;
  private readonly executionVm = new CoreSpiritExecutionVM();
  private readonly optimizedExecutionVm = new CoreSpiritOptimizedExecutionVM();
  private readonly executionTier: Exclude<CoreSpiritExecutionTier, 'auto'>;
  private readonly stateStore = new CoreSpiritStateStore();
  /** Numeric IDs are stable for one loaded runtime/program. Names are resolved only during lowering. */
  private readonly seriesRegistry: CoreSpiritSeriesRegistry = this.stateStore.series;
  private readonly outputCollector: CoreSpiritOutputCollector;
  private readonly eventRouter: CoreSpiritEventRouter;
  private readonly capabilityHost: CoreSpiritCapabilityHost;
  private readonly debugHost = new CoreSpiritDebugHost();
  private readonly profiler: CoreSpiritProfiler;

  constructor(options: CoreSpiritRuntimeOptions = {}, bus: CoreEventBus = coreEventBus) {
    this.dataResolver = options.dataResolver;
    this.profiler = new CoreSpiritProfiler(options.profiler);
    this.modelOutputResolver = options.modelOutputResolver;
    this.eventResolver = options.eventResolver;
    this.executionTarget = options.executionTarget || 'chart';
    this.executionTier = options.executionTier === 'reference' ? 'reference' : 'optimized';
    this.layer = options.layer || 'script';
    this.reactiveExecution = options.reactiveExecution !== false;
    this.options = { symbol: options.symbol || '', timeframe: options.timeframe || 'unknown', sourceId: options.sourceId || 'coreSpirit', maxStepsPerBar: Math.max(100, options.maxStepsPerBar || 10000), timezone: options.timezone || 'Asia/Kolkata', stateHistoryLimit: Math.max(512, Math.floor(options.stateHistoryLimit || 2048)) };
    this.timezone = this.options.timezone;
    this.abortSignal = options.abortSignal;
    this.stateHistoryLimit = this.options.stateHistoryLimit;
    this.maxOutputsPerBar = Math.max(100, Math.floor(options.maxOutputsPerBar || 10000));
    this.maxHistoryBars = Math.max(2048, Math.floor(options.maxHistoryBars || 60000));
    this.executionContext = createCoreSpiritExecutionContext({ mode: options.executionMode || 'historical', symbol: this.options.symbol, timeframe: this.options.timeframe, timezone: this.timezone, runId: options.runId, policy: options.executionPolicy });
    this.bus = bus;
    this.outputCollector = new CoreSpiritOutputCollector(this.maxOutputsPerBar);
    this.eventRouter = new CoreSpiritEventRouter(this.bus);
    this.capabilityHost = new CoreSpiritCapabilityHost(
      this.executionTarget,
      this.dataResolver,
      (input) => this.modelOutputResolver?.({
        modelName: input.modelName,
        field: input.field,
        binding: input.binding as { kind:string; locator:string } | undefined,
      }) ?? null,
      this.eventResolver,
    );
  }

  reset(): void {
    this.uiRuntime.reset();
    this.appRuntime.reset();
    this.declarativeVisualState = { version:1, revision:0, specs:[] };
    this.reactiveRevision = 0; this.reactiveRecomputed = 0; this.reactiveReused = 0; this.reactiveEffects = 0;
    this.realtimeRevision = 0; this.eventRouter.rollbackTransaction(); this.realtimeEventTransactionId = undefined; this.debugHost.reset(); this.realtimeLifecycle='idle';
    this.state = { barIndex: -1, time: 0, locals: {}, seriesState: this.seriesRegistry.createNumericCompatibilityView(), localSeries: this.seriesRegistry.createValueCompatibilityView(), barState: { index:-1, time:0, isFirst:true, isLast:false, isRealtime:false, isConfirmed:true, revision:0, symbol:this.options.symbol, timeframe:this.options.timeframe, mode:this.executionContext.mode }, workspaceState: this.workspaceSnapshot() };
    this.history = []; this.crossState = {};
    this.seriesRegistry.reset();
    this.stateStore.bind(this.crossState);
    this.currentBarSnapshot = undefined; this.plotOrdinal = 0; this.indicatorMemo.clear(); this.dataMemo.clear(); this.outputCount = 0; this.lastBarWasRealtime = false;
    this.stateStore.commitRealtimeTransaction();
    this.eventRouter.rollbackTransaction();
    this.realtimeTransactionId = undefined;
    this.rsiKernels.clear(); this.atrKernels.clear(); this.vwapKernels.clear();
    this.rsiKernelSnapshots.clear(); this.atrKernelSnapshots.clear(); this.vwapKernelSnapshots.clear();
    this.resetFusedSeriesCursors();
  }
  getState(options: { clone?: boolean } = {}): CoreSpiritRuntimeState {
    this.state.workspaceState=this.workspaceSnapshot();
    if (options.clone === false) {
      return { ...this.state, workspaceState:this.state.workspaceState, locals:this.state.locals, seriesState:this.state.seriesState, localSeries:this.state.localSeries };
    }
    return { ...this.state, workspaceState:this.workspaceSnapshot(), locals:{...this.state.locals}, seriesState:this.seriesRegistry.snapshotNumericObject(), localSeries:this.seriesRegistry.snapshotValueObject() };
  }

  loadProgram(program: CoreSpiritProgram): CoreSpiritIrProgram {
    const compiled = this.profiler.measureCompile(() => this.compiler.compile(program.ast, program.id || this.options.sourceId, { layer:this.layer, surface:program.surface }));
    const errors = compiled.diagnostics.filter(d => d.severity === 'error');
    if (!compiled.ir || errors.length) throw new Error(errors.map(d => d.message).join('; ') || 'CoreSpirit compilation failed');
    this.compiledIr = compiled.ir; this.loadedProgramId = program.id; this.loadedSurface = program.surface;
    this.installSeriesFusion(compiled.ir);
    // State retention must always cover the program's declared lookback plus a safety margin.
    if (compiled.ir.maxLookback + 32 > this.stateHistoryLimit) this.stateHistoryLimit = Math.min(this.maxHistoryBars, compiled.ir.maxLookback + 32);
    this.reset();
    this.prepareSeriesBindings(compiled.ir);
    this.optimizedExecutionVm.prepare(compiled.ir.entry.instructions, this.seriesRegistry, compiled.ir.specializedPlan);
    return compiled.ir;
  }

  execute(program: CoreSpiritProgram, bars: HistoricalCandle[]): CoreSpiritObject[] {
    this.loadProgram(program);
    return this.executeIr(this.compiledIr!, bars).outputs;
  }

  executeBar(bar: HistoricalCandle): CoreSpiritExecutionResult {
    this.throwIfAborted();
    if (!this.compiledIr) throw new Error('CoreSpirit program is not loaded');
    this.profiler.beginBar('realtime', this.compiledIr.entry.instructions.length);
    const diagnostics: string[] = [];
    this.outputCollector.beginBar(true);
    const outputs = this.outputCollector.values();
    const normalized = { ...bar };
    const last = this.history[this.history.length - 1];
    const sameBucket = !!last && this.toEpoch(last.timestamp) === this.toEpoch(normalized.timestamp);
    const dirtyPlan = sameBucket && this.dirtyGraph
      ? this.dirtyGraph.planTail(dirtySourcesForBar({ open:Number(last!.open), high:Number(last!.high), low:Number(last!.low), close:Number(last!.close), volume:Number(last!.volume) }, { open:Number(normalized.open), high:Number(normalized.high), low:Number(normalized.low), close:Number(normalized.close), volume:Number(normalized.volume) }), this.history.length - 1)
      : this.dirtyGraph?.planFull(this.history.length);
    this.lastDirtyPlan = dirtyPlan;

    // A realtime bar may be evaluated many times. Roll back the previous
    // unconfirmed evaluation so stateful functions commit exactly once.
    if (!sameBucket && this.currentBarSnapshot && this.lastBarWasRealtime) this.confirmRealtimeBar();

    if (sameBucket && this.currentBarSnapshot) {
      this.realtimeRevision += 1;
      if (this.reactiveExecution) { this.reactiveRevision += 1; this.reactiveRecomputed += 1; this.reactiveEffects += 1; this.reactiveReused += 1; }
      this.stateStore.rollbackRealtimeTransaction();
      this.eventRouter.rollbackTransaction(this.realtimeEventTransactionId);
      this.stateStore.beginRealtimeTransaction();
      this.realtimeEventTransactionId = `${this.options.sourceId}:${this.history.length}:${this.realtimeRevision}`;
      this.eventRouter.beginTransaction(this.realtimeEventTransactionId);
      for (const [groupId, snapshot] of this.fusedCursorSnapshots) {
        const cursor = this.fusedCursors.get(groupId);
        if (cursor) cursor.copyFrom(snapshot);
      }
      for (const [key, snapshot] of this.directKernelSnapshots) {
        const cursor = this.directKernelCursors.get(key);
        if (cursor) cursor.copyFrom(snapshot);
      }
      for (const [key, snapshot] of this.rsiKernelSnapshots) this.rsiKernels.get(key)?.copyFrom(snapshot);
      for (const [key, snapshot] of this.atrKernelSnapshots) this.atrKernels.get(key)?.copyFrom(snapshot);
      for (const [key, snapshot] of this.vwapKernelSnapshots) this.vwapKernels.get(key)?.copyFrom(snapshot);
      this.history[this.history.length - 1] = normalized;
      this.columnarHistory.replaceLast(normalized);
    } else {
      this.realtimeRevision = 0;
      if (this.reactiveExecution) { this.reactiveRevision += 1; this.reactiveRecomputed += 1; this.reactiveEffects += 1; }
      this.currentBarSnapshot = { historyLength: this.history.length };
      this.stateStore.beginRealtimeTransaction();
      this.realtimeEventTransactionId = `${this.options.sourceId}:${this.history.length}:${this.realtimeRevision}`;
      this.eventRouter.beginTransaction(this.realtimeEventTransactionId);
      for (const [groupId, cursor] of this.fusedCursors) {
        const snapshot = this.fusedCursorSnapshots.get(groupId);
        if (snapshot) snapshot.copyFrom(cursor);
        else this.fusedCursorSnapshots.set(groupId, cursor.clone());
      }
      for (const [key, cursor] of this.directKernelCursors) {
        const snapshot = this.directKernelSnapshots.get(key);
        if (snapshot) snapshot.copyFrom(cursor);
        else this.directKernelSnapshots.set(key, cursor.clone());
      }
      for (const [key, cursor] of this.rsiKernels) {
        const snapshot = this.rsiKernelSnapshots.get(key);
        if (snapshot) snapshot.copyFrom(cursor); else this.rsiKernelSnapshots.set(key, cursor.clone());
      }
      for (const [key, cursor] of this.atrKernels) {
        const snapshot = this.atrKernelSnapshots.get(key);
        if (snapshot) snapshot.copyFrom(cursor); else this.atrKernelSnapshots.set(key, cursor.clone());
      }
      for (const [key, cursor] of this.vwapKernels) {
        const snapshot = this.vwapKernelSnapshots.get(key);
        if (snapshot) snapshot.copyFrom(cursor); else this.vwapKernelSnapshots.set(key, cursor.clone());
      }
      this.history.push(normalized);
      this.columnarHistory.append(normalized);
      if (this.history.length > this.maxHistoryBars) this.history.splice(0, this.history.length - this.maxHistoryBars);
    }
    const barIndex = this.history.length - 1;
    this.state.barIndex = barIndex;
    this.state.time = this.toEpoch(normalized.timestamp);
    this.state.locals = {};
    this.plotOrdinal = 0;
    this.indicatorMemo.clear();
    this.outputCount = 0;
    this.validateBar(normalized);
    this.state.barState = { index:barIndex, time:this.state.time, isFirst:barIndex===0, isLast:false, isRealtime:true, isConfirmed:false, revision:this.realtimeRevision, symbol:this.options.symbol, timeframe:this.options.timeframe, mode:this.executionContext.mode };
    this.executionContext.frame = createCoreSpiritExecutionFrame({ timestamp:this.state.time*1000, barIndex, symbol:this.options.symbol, timeframe:this.options.timeframe, timezone:this.timezone, mode:this.executionContext.mode, isRealtime:true, isConfirmed:false, isNewBar:this.realtimeRevision===0, revision:this.realtimeRevision, isFirst:barIndex===0, isLast:false });
    this.executionContext.session = this.executionContext.frame.session;
    this.lastBarWasRealtime = true;
    if (sameBucket && dirtyPlan) {
      this.realtimeDirtyInstructions.clear();
      for (const instruction of dirtyPlan.instructions) this.realtimeDirtyInstructions.add(instruction);
      for (const instruction of this.dirtyGraph?.statefulInstructions ?? []) this.realtimeDirtyInstructions.add(instruction);
    }
    try { this.executeBlock(this.compiledIr.entry.instructions, normalized, this.history, barIndex, this.outputCollector, diagnostics, { reuseValues: sameBucket && this.executionTier === 'optimized', dirtyInstructions: sameBucket ? this.realtimeDirtyInstructions : undefined }); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); diagnostics.push(`bar ${barIndex}: ${message}`); this.debugHost.record({ kind:'execution-error', barIndex, message }); }
    return { outputs, state: this.getState({ clone:false }), diagnostics };
  }

  /** Execute a host-supplied tick against the current realtime bar. The VM remains socket-free. */
  executeTick(tick: CoreSpiritTick, baseBar: HistoricalCandle, historicalTick = false): CoreSpiritExecutionResult {
    const price = Number(tick.price);
    if (!Number.isFinite(price)) throw new Error('invalid realtime tick price');
    const bar: HistoricalCandle = {
      timestamp: new Date(Number(tick.timestamp)).toISOString(),
      open: Number(baseBar.open),
      high: Math.max(Number(baseBar.high), price),
      low: Math.min(Number(baseBar.low), price),
      close: price,
      volume: Math.max(0, Number(baseBar.volume || 0) + Number(tick.volume || 0)),
    };
    const result = this.executeBar(bar);
    this.state.barState = { ...this.state.barState, isRealtime: !historicalTick, isConfirmed: historicalTick };
    return result;
  }

  /**
   * Execute a sequence of host-supplied historical ticks against one bar.
   * This is deliberately separate from realtime sockets: replay/backtest hosts
   * can feed exact tick sequences through the same VM semantics.
   */
  executeHistoricalTicks(ticks: CoreSpiritTick[], baseBar: HistoricalCandle): CoreSpiritExecutionResult[] {
    const results: CoreSpiritExecutionResult[] = [];
    let workingBar = { ...baseBar };
    for (const tick of ticks) {
      this.throwIfAborted();
      results.push(this.executeTick(tick, workingBar, true));
      const price=Number(tick.price);
      workingBar={
        ...workingBar,
        timestamp:new Date(Number(tick.timestamp)).toISOString(),
        high:Math.max(Number(workingBar.high),price),
        low:Math.min(Number(workingBar.low),price),
        close:price,
        volume:Math.max(0,Number(workingBar.volume||0)+Number(tick.volume||0)),
      };
    }
    return results;
  }

  /** Commit the current realtime bar as historical/confirmed state. */
  confirmRealtimeBar(): void {
    if (this.state.barIndex < 0) return;
    this.realtimeLifecycle = 'committed';
    this.state.barState = { ...this.state.barState!, isRealtime:false, isConfirmed:true, isLast:true };
    this.executionContext.frame = createCoreSpiritExecutionFrame({ timestamp:this.state.time*1000, barIndex:this.state.barIndex, symbol:this.options.symbol, timeframe:this.options.timeframe, timezone:this.timezone, mode:this.executionContext.mode, isRealtime:false, isConfirmed:true, isNewBar:false, revision:this.state.barState.revision, isFirst:this.state.barState.isFirst, isLast:true });
    this.executionContext.session = this.executionContext.frame.session;
    this.committedSeriesState = cloneNumberMap(this.state.seriesState);
    this.committedLocalSeries = cloneValueMap(this.state.localSeries);
    this.committedCrossState = cloneCrossMap(this.crossState);
    if (this.realtimeEventTransactionId) this.eventRouter.commitTransaction(this.realtimeEventTransactionId);
    this.realtimeEventTransactionId = undefined;
    this.stateStore.commitRealtimeTransaction();
    if (this.realtimeTransactionId) this.eventRouter.commitTransaction(this.realtimeTransactionId);
    this.realtimeTransactionId = undefined;
    this.currentBarSnapshot = undefined;
    this.fusedCursorSnapshots.clear();
    this.directKernelSnapshots.clear();
    this.rsiKernelSnapshots.clear(); this.atrKernelSnapshots.clear(); this.vwapKernelSnapshots.clear();
    this.lastBarWasRealtime = false;
  }

  commitRealtimeBar(): void { this.confirmRealtimeBar(); }

  rollbackRealtimeBar(): void {
    if (!this.currentBarSnapshot) return;
    this.stateStore.rollbackRealtimeTransaction();
    this.eventRouter.rollbackTransaction(this.realtimeEventTransactionId);
    this.realtimeEventTransactionId = undefined;
    for (const [groupId, snapshot] of this.fusedCursorSnapshots) {
      this.fusedCursors.set(groupId, snapshot.clone());
    }
    this.history=this.history.slice(0,this.currentBarSnapshot.historyLength);
    this.state.barIndex=this.history.length-1;
    this.state.time=this.history.length?this.toEpoch(this.history.at(-1)!.timestamp):0;
    this.realtimeRevision=0;
    this.state.barState={ index:this.state.barIndex,time:this.state.time,isFirst:this.state.barIndex===0,isLast:false,isRealtime:false,isConfirmed:true,revision:0,symbol:this.options.symbol,timeframe:this.options.timeframe,mode:this.executionContext.mode };
    if(this.state.barIndex>=0){ this.executionContext.frame=createCoreSpiritExecutionFrame({timestamp:this.state.time*1000,barIndex:this.state.barIndex,symbol:this.options.symbol,timeframe:this.options.timeframe,timezone:this.timezone,mode:this.executionContext.mode,isRealtime:false,isConfirmed:true,isNewBar:true,revision:0,isFirst:this.state.barIndex===0,isLast:false}); this.executionContext.session=this.executionContext.frame.session; }
    this.currentBarSnapshot=undefined;
    this.fusedCursorSnapshots.clear();
    this.directKernelSnapshots.clear();
    this.rsiKernelSnapshots.clear(); this.atrKernelSnapshots.clear(); this.vwapKernelSnapshots.clear();
    this.lastBarWasRealtime=false;
    this.realtimeLifecycle='idle';
    this.lastDirtyPlan=undefined;
    this.reactiveRecomputed=0; this.reactiveReused=0; this.reactiveEffects=0;
  }

  getRealtimeLifecycle(): 'idle'|'evaluating'|'committed' { return this.realtimeLifecycle; }

  getExecutionFrame() {
    const b=this.state.barState;
    return { timestamp:b.time*1000,barIndex:b.index,index:b.index,time:b.time,symbol:b.symbol,timeframe:b.timeframe,timezone:this.timezone,session:this.executionContext.session!,mode:b.mode,isRealtime:b.isRealtime,isConfirmed:b.isConfirmed,isNewBar:b.revision===0,revision:b.revision,isFirst:b.isFirst,isLast:b.isLast };
  }

  getReactiveExecutionStats() { return { revision:this.reactiveRevision,recomputed:this.reactiveRecomputed,reused:this.reactiveReused,effects:this.reactiveEffects }; }
  getUiState(): CoreSpiritUiState { return this.uiRuntime.snapshot(); }
  dispatchUiEvent(event: CoreSpiritUiEvent): CoreSpiritUiAction | undefined { return this.uiRuntime.dispatch(event); }
  getWorkspaceState() { return this.workspaceSnapshot(); }
  getDeclarativeVisualScene(identity: CoreSpiritSceneIdentity, revision = this.declarativeVisualState.revision): CoreSpiritScene { return buildCoreSpiritSceneFromDeclarativeVisuals(identity,this.declarativeVisualState.specs,this.options.sourceId,revision); }
  getDebugTrace() { return this.debugHost.snapshot(); }

  executeIr(ir: CoreSpiritIrProgram, bars: HistoricalCandle[]): CoreSpiritExecutionResult {
    const diagnostics: string[] = [];
    this.outputCollector.beginBar(true);
    const outputs = this.outputCollector.values();
    this.compiledIr = ir; this.installSeriesFusion(ir); this.reset(); this.prepareSeriesBindings(ir); this.optimizedExecutionVm.prepare(ir.entry.instructions, this.seriesRegistry, ir.specializedPlan);
    for (let i = 0; i < bars.length; i++) {
      this.throwIfAborted();
      this.profiler.beginBar('historical', ir.entry.instructions.length);
      this.plotOrdinal = 0;
      this.indicatorMemo.clear();
      this.outputCollector.beginBar();
      this.outputCount = 0;
      const bar = bars[i];
      this.validateBar(bar); this.state.barIndex = i; this.state.time = this.toEpoch(bar.timestamp); this.state.locals = {};
      this.state.barState = { index:i, time:this.state.time, isFirst:i===0, isLast:i===bars.length-1, isRealtime:false, isConfirmed:true, revision:0, symbol:this.options.symbol, timeframe:this.options.timeframe, mode:this.executionContext.mode };
      this.executionContext.frame=createCoreSpiritExecutionFrame({timestamp:this.state.time*1000,barIndex:i,symbol:this.options.symbol,timeframe:this.options.timeframe,timezone:this.timezone,mode:this.executionContext.mode,isRealtime:false,isConfirmed:true,isNewBar:true,revision:0,isFirst:i===0,isLast:i===bars.length-1});
      this.executionContext.session=this.executionContext.frame.session;
      this.history.push(bar);
      if (this.history.length > this.maxHistoryBars) this.history.splice(0, this.history.length - this.maxHistoryBars);
      try { this.executeBlock(ir.entry.instructions, bar, this.history, i, this.outputCollector, diagnostics); }
      catch (error) { const message = error instanceof Error ? error.message : String(error); diagnostics.push(`bar ${i}: ${message}`); this.debugHost.record({ kind:'execution-error', barIndex:i, message }); }
      finally { this.profiler.endBar(); }
    }
    return { outputs, state: this.getState(), diagnostics };
  }

  getProfilerSnapshot(): CoreSpiritProfilerSnapshot { return this.profiler.snapshot(); }
  resetProfiler(): void { this.profiler.reset(); }
  getExecutionContext(): CoreSpiritExecutionContext { return { ...this.executionContext }; }
  getLoadedProgramId(): string | undefined { return this.loadedProgramId; }
  getLoadedIr(): CoreSpiritIrProgram | undefined { return this.compiledIr; }
  getExecutionTier(): Exclude<CoreSpiritExecutionTier, 'auto'> { return this.executionTier; }
  getLastDirtyPlan(): CoreSpiritDirtyExecutionPlan | undefined { return this.lastDirtyPlan; }
  getTradingNativePlan() { return this.compiledIr?.tradingNativePlan; }
  loadIr(ir: CoreSpiritIrProgram): void {
    this.compiledIr = ir;
    this.loadedProgramId = ir.sourceId;
    this.prepareSeriesBindings(ir);
    this.optimizedExecutionVm.prepare(ir.entry.instructions, this.seriesRegistry);
    this.installSeriesFusion(ir);
    this.stateHistoryLimit = Math.min(this.maxHistoryBars, Math.max(this.stateHistoryLimit, ir.maxLookback + 32));
  }

  exportCheckpoint() {
    return {
      state: this.getState(),
      history: (this as any).history.map((x:any)=>({ ...x })),
      crossState: cloneCrossMap((this as any).crossState),
      committedSeriesState: this.seriesRegistry.snapshotNumericObject(),
      committedLocalSeries: this.seriesRegistry.snapshotValueObject(),
      committedCrossState: cloneCrossMap(this.crossState),
    };
  }

  restoreCheckpoint(checkpoint: { state: CoreSpiritRuntimeState; history:any[]; crossState:Record<string,{a:number;b:number}>; committedSeriesState:Record<string,number[]>; committedLocalSeries:Record<string,Array<number|boolean|string|null>>; committedCrossState:Record<string,{a:number;b:number}> }): boolean {
    try {
      this.seriesRegistry.reset();
      this.seriesRegistry.restoreNumericObject(checkpoint.state.seriesState);
      this.seriesRegistry.restoreValueObject(checkpoint.state.localSeries);
      this.state = { ...checkpoint.state, locals:{...checkpoint.state.locals}, seriesState:this.seriesRegistry.createNumericCompatibilityView(), localSeries:this.seriesRegistry.createValueCompatibilityView() };
      this.crossState = cloneCrossMap(checkpoint.crossState);
      this.stateStore.bind(this.crossState);
      (this as any).history = checkpoint.history.map((x:any)=>({ ...x })).slice(-this.maxHistoryBars);
      this.columnarHistory.replaceRows((this as any).history);
      return true;
    } catch { return false; }
  }

  private prepareSeriesBindings(ir: CoreSpiritIrProgram): void {
    const names = new Set<string>();
    for (const name of ir.locals) names.add(name);
    for (const instruction of ir.entry.instructions) {
      if (instruction.op === 'setLocal' && instruction.series !== false) names.add(instruction.name);
      if (instruction.op === 'index' && instruction.seriesName) names.add(instruction.seriesName);
    }
    this.seriesRegistry.prepare([...names]);
  }

  private installSeriesFusion(ir: CoreSpiritIrProgram): void {
    const plan = ir.executionPlan?.seriesFusion ?? planCoreSpiritSeriesFusion(ir);
    this.seriesFusionPlan = plan;
    this.fusedStageByInstruction.clear();
    for (const group of plan.groups) {
      for (let stageIndex = 0; stageIndex < group.instructions.length; stageIndex += 1) {
        this.fusedStageByInstruction.set(group.instructions[stageIndex]!, { groupId: group.id, stageIndex });
      }
    }
    this.resetFusedSeriesCursors();
  }

  private resetFusedSeriesCursors(): void {
    this.fusedCursors.clear();
    this.fusedGroupById.clear();
    this.fusedCursorSnapshots.clear();
    this.directKernelCursors.clear();
    this.directKernelSnapshots.clear();
    if (!this.seriesFusionPlan) return;
    for (const group of this.seriesFusionPlan.groups) {
      this.fusedGroupById.set(group.id, group);
      this.fusedCursors.set(group.id, new CoreSpiritFusedSeriesCursor(group.operations));
    }
  }

  private fusedStageValues(instructionIndex: number, values: CoreSpiritValueStore, barIndex: number, instructions: CoreSpiritIrInstruction[]): boolean {
    const binding = this.fusedStageByInstruction.get(instructionIndex);
    if (!binding || !this.seriesFusionPlan) return false;
    const group = this.fusedGroupById.get(binding.groupId);
    if (!group) return false;
    if (binding.stageIndex !== 0) return true;
    const first = instructions[instructionIndex];
    if (!first || first.op !== 'call') return false;
    const sourceRaw = values.get(first.args[0]!);
    if (sourceRaw == null) return false;
    const source = Number(sourceRaw);
    if (!Number.isFinite(source)) {
      const cursor = this.fusedCursors.get(group.id);
      if (!cursor) return false;
      const outputValues = cursor.update(Number.NaN, barIndex);
      for (let i = 0; i < group.instructions.length; i += 1) {
        const stageInstruction = instructions[group.instructions[i]!];
        if (stageInstruction?.op === 'call') values.set(stageInstruction.dest, outputValues[i]!);
      }
      return true;
    }
    const cursor = this.fusedCursors.get(group.id);
    if (!cursor) return false;
    const outputValues = cursor.update(source, barIndex);
    for (let i = 0; i < group.instructions.length; i += 1) {
      const stageInstruction = instructions[group.instructions[i]!];
      if (stageInstruction?.op === 'call') values.set(stageInstruction.dest, outputValues[i]!);
    }
    return true;
  }

  private executeBlock(
    instructions: CoreSpiritIrInstruction[],
    bar: HistoricalCandle,
    bars: HistoricalCandle[],
    barIndex: number,
    outputs: CoreSpiritOutputCollector,
    diagnostics: string[],
    executionOptions: { reuseValues?: boolean; dirtyInstructions?: ReadonlySet<number> } = {},
  ): void {
    this.prefetchTradingNativeData(barIndex);
    const host: CoreSpiritExecutionVMHost = {
      maxStepsPerBar: this.options.maxStepsPerBar,
      throwIfAborted: () => this.throwIfAborted(),
      loadSeries: (name, offset) => this.loadSeries(name, offset, bar, bars, barIndex),
      moveLocal: (source) => this.state.locals[source],
      setLocal: (name, value, series) => {
        this.state.locals[name] = value;
        if (series) this.pushLocalState(this.seriesRegistry.idFor(name), value as CoreSpiritValue);
      },
      setLocalBySeriesId: (id, name, value) => {
        this.state.locals[name] = value;
        this.pushLocalState(id, value as CoreSpiritValue);
      },
      unary: (operator, value) => this.unary(operator, value),
      binary: (operator, left, right) => this.binary(operator, left, right),
      tryFused: (pc, values, ir, index) => {
        const fusion = this.fusedStageByInstruction.get(pc);
        return !!fusion && (fusion.stageIndex > 0 || this.fusedStageValues(pc, values, index, ir));
      },
      call: (instruction, args) => this.call(instruction.callId || instruction.dest, instruction.name, args, bar, bars, barIndex, instruction.seriesArgs || []),
      loadIndexed: (instruction, index, values) => instruction.seriesName
        ? this.loadIndexedValue(instruction.seriesName, index, bar, bars, barIndex)
        : (index > barIndex ? null : values.get(instruction.target) as CoreSpiritValue),
      loadIndexedSeriesById: (id, index) => this.seriesRegistry.getValueAt(id, index),
      truthy: (value) => this.truthy(value),
      emit: (instruction, values, output) => this.emitIntent(instruction.kind, instruction.args.slice(1).map((name) => values.get(name)), bar, barIndex, output, diagnostics, instruction.outputId),
      profileInstruction: this.profiler.hooks(),
    };
    if (this.executionTier === 'reference') this.executionVm.run(instructions, barIndex, host, outputs);
    else this.optimizedExecutionVm.run(instructions, barIndex, host, outputs, { ...executionOptions, seriesRegistry:this.seriesRegistry, specializedPlan:this.compiledIr?.specializedPlan });
  }

  private prefetchTradingNativeData(barIndex:number): void {
    const plan=this.compiledIr?.tradingNativePlan;
    const batchResolver=this.dataResolver?.requestBatch;
    if(!plan?.dataDependencies.length || !batchResolver) return;
    const requests:CoreSpiritDataRequest[]=[];
    const requestKeys=new Set<string>();
    for(const dependency of plan.dataDependencies){
      if(!dependency.batchable) continue;
      const symbol=dependency.symbol==='current'?this.options.symbol:dependency.symbol;
      const timeframe=dependency.timeframe==='chart'?this.options.timeframe:dependency.timeframe;
      for(const field of dependency.fields){
        if(!['open','high','low','close','volume','time'].includes(field)) continue;
        const requestKey=`${symbol}:${timeframe}:${field}`;
        if(requestKeys.has(requestKey)) continue;
        requestKeys.add(requestKey);
        requests.push({symbol,timeframe,field:field as CoreSpiritDataRequest['field'],offset:0});
      }
    }
    if(!requests.length) return;
    const value=batchResolver(requests);
    if(value && typeof (value as any).then==='function') return;
    const snapshots=value as CoreSpiritDataSnapshot[];
    if(snapshots.length!==requests.length) return;
    for(let i=0;i<requests.length;i+=1){
      const request=requests[i]!;
      const snapshot=snapshots[i]!;
      if(snapshot?.timestamp!=null && Number(snapshot.timestamp)>this.state.time) continue;
      const key=`request:${barIndex}:${request.symbol}:${request.timeframe}:${request.field}:0`;
      this.dataMemo.set(key,snapshot?.value ?? null);
    }
  }

  private loadSeries(name:string, offset:number, bar:HistoricalCandle, bars:HistoricalCandle[], barIndex:number):number|null {
    if (!Number.isInteger(offset) || offset < 0) throw new Error(`future indexing is not allowed for ${name}[${offset}]`);
    if (offset > barIndex) return null;
    const sourceIndex = barIndex - offset;
    const columnar = this.columnarHistory.valueAt(name, sourceIndex);
    if (columnar != null) return columnar;
    const source = bars[sourceIndex]; if (!source) return null;
    const value = name === 'time' ? this.toEpoch(source.timestamp) : Number((source as any)[name]);
    return Number.isFinite(value) ? value : null;
  }

  private eventActive(eventName:string): boolean {
    const normalized=eventName.trim().toLowerCase();
    if(normalized==='bar' || normalized==='bar.close' || normalized==='bar.closes') return true;
    if(normalized==='tick') return this.state.barState.isRealtime;
    const resolved=this.eventResolver?.(eventName);
    if(typeof resolved === 'boolean') return resolved;
    return Boolean(resolved);
  }

  private call(callKey:string,name:string,args:unknown[],bar:HistoricalCandle,bars:HistoricalCandle[],index:number,seriesArgs:string[]):unknown {
    const series = seriesArgs[0] || 'close'; const length = Math.max(1,Math.floor(Number(args[1] ?? 14)));
    const memoKey = `${name}|${series}|${length}|${index}|${args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(',')}`;
    if (this.indicatorMemo.has(memoKey)) return this.indicatorMemo.get(memoKey);
    const finish = (value: unknown) => { this.indicatorMemo.set(memoKey, value); return value; };
    this.capabilityHost.assert(name);
    if(name==='meta') {
      const out:Record<string,unknown>={};
      for(let i=0;i+1<args.length;i+=2) out[String(args[i])]=args[i+1];
      return finish(out);
    }
    if(name==='event') { const value=String(args[0]??''); return finish(this.eventActive(value)); }
    if(name==='__bar_phase') {
      const phase=String(args[0]??'');
      const barState=this.state.barState;
      if(phase==='confirmed') return finish(Boolean(barState.isConfirmed));
      if(phase==='developing') return finish(Boolean(barState.isRealtime && !barState.isConfirmed));
      if(phase==='realtime') return finish(Boolean(barState.isRealtime));
      if(phase==='historical') return finish(!barState.isRealtime);
      if(phase==='forecast') return finish(false);
      return finish(false);
    }
    if(name==='__model_get') {
      const rawRef=args[0]; const field=String(args[1]??'');
      const modelName=rawRef && typeof rawRef==='object' && '__coreSpiritModelRef' in (rawRef as Record<string,unknown>)
        ? String((rawRef as Record<string,unknown>).modelName ?? '')
        : String(rawRef ?? '').replace(/^model:/,'');
      const declaration=this.loadedSurface?.declarations.find(item=>item.kind==='model' && item.name===modelName);
      const binding=declaration?.kind==='model' ? declaration.binding : undefined;
      return finish(this.capabilityHost.resolveModel({modelName,field,binding}));
    }
    if(name==='model') return finish({ __coreSpiritModelRef:true, modelName:String(args[0]??'') });
    if(name==='market') return finish({ kind:'market', symbol:String(args[0]??this.executionContext.symbol), timeframe:this.executionContext.timeframe });
    if(name==='timeframe') return finish({ kind:'timeframe', timeframe:String(args[0]??this.executionContext.timeframe) });
    if(name==='__market_timeframe') {
      const ref=args[0] as Record<string, unknown> | null | undefined;
      const timeframe=String(args[1] ?? this.executionContext.timeframe);
      const symbol=ref?.kind === 'market'
        ? String(ref.symbol ?? this.executionContext.symbol)
        : this.executionContext.symbol;
      return finish({ kind:'market', symbol, timeframe });
    }
    if(name==='ui.panel') return finish(this.uiRuntime.panel(String(args[0]??'panel'),String(args[0]??'Panel')));
    if(name==='ui.panel.number') return finish(this.uiRuntime.number(args[0],String(args[1]??''),args[2],typeof args[3]==='string'?args[3]:undefined));
    if(name==='ui.panel.button') return finish(this.uiRuntime.button(args[0],String(args[1]??''),typeof args[2]==='string'?args[2]:undefined));
    if(name==='ui.panel.toggle') return finish(this.uiRuntime.toggle(args[0],String(args[1]??''),args[2],typeof args[3]==='string'?args[3]:undefined));
    if(name==='ui.panel.slider') return finish(this.uiRuntime.slider(args[0],String(args[1]??''),args[2],args[3],args[4],typeof args[5]==='string'?args[5]:undefined));
    if(name==='app.create') return finish(this.appRuntime.create(String(args[0]??'Trading App'),String(args[1]??'main') as CoreSpiritWorkspaceSlot));
    if(name==='app.chart') return finish(this.appRuntime.chart(String(args[0]??'main'),String(args[1]??'main') as CoreSpiritWorkspaceSlot,args[2]==null?undefined:String(args[2])));
    if(name==='app.panel') return finish(this.appRuntime.panel(String(args[0]??'main') as CoreSpiritWorkspaceSlot,String(args[1]??'custom') as CoreSpiritWorkspaceWidgetKind,args[2]==null?undefined:String(args[2]),args[3]==null?undefined:String(args[3]),args[4]==null?undefined:String(args[4])));
    if(name==='app.overlay') return finish(this.appRuntime.overlay(String(args[0]??'custom') as CoreSpiritWorkspaceWidgetKind | 'custom',args[1]==null?undefined:String(args[1]),args[2]==null?undefined:String(args[2])));
    if(name==='app.targets') { this.appRuntime.targets(...args.map(x=>String(x)).filter(x=>x) as CoreSpiritExecutionTarget[]); return finish(`app:${this.options.sourceId}`); }
    if(name==='app.require') { this.appRuntime.requireFeature(String(args[0]??'')); return finish(null); }
    if(name==='app.bind') { this.appRuntime.bind(String(args[0]??''),String(args[1]??''),args[2]==null?undefined:String(args[2])); return finish(null); }
    if(name==='visual.line' || name==='visual.liquidityZone' || name==='visual.zone') {
      const isLiquidity=name==='visual.liquidityZone'; const id=String(args[0]??`${name}:${index}`);
      const properties=isLiquidity ? {top:Number(args[2]),bottom:Number(args[1]),strength:Number(args[3]),side:String(args[4]??'right'),...(typeof args[5]==='object'&&args[5]?args[5] as Record<string,unknown>:{ })} : { ...(name==='visual.line'?{startTime:Number(args[1]),startPrice:Number(args[2]),endTime:Number(args[3]),endPrice:Number(args[4])}:{top:Number(args[2]??args[1]),bottom:Number(args[3]??args[1]),left:Number(args[1]??0),right:Number(args[2]??0)}), ...(typeof args.at(-1)==='object'&&args.at(-1)?args.at(-1) as Record<string,unknown>:{ })};
      this.declarativeVisualState=replaceDeclarativeVisual(this.declarativeVisualState,{id,kind:isLiquidity?'liquidity_zone':name==='visual.line'?'line':'zone',properties,metadata:properties as any});
      return finish(`visual:${id}`);
    }
    if(name==='visual.area') { const area=String(args[0]??'price'); return finish({__coreSpiritVisualRef:'area',kind:'chart',area,id:area}); }
    if(name==='panel') { const title=String(args[0]??'Panel'); return finish({__coreSpiritVisualRef:'area',kind:'panel',id:title,title}); }
    if(name==='point') { const x=Number(args[0]), y=Number(args[1]), space=String(args[2]??'time'); return finish({__coreSpiritVisualRef:'point',kind:'point',x,y,space}); }
    if(name==='above_bar' || name==='below_bar' || name==='at_bar') { return finish({__coreSpiritVisualRef:'relative-position',kind:name==='above_bar'?'aboveBar':name==='below_bar'?'belowBar':'atBar',offset:Number(args[0]??0)}); }
    if(name==='bar_index') return finish(index);
    if (name==='nz') { const value=Number(args[0]); return finish(Number.isFinite(value) ? value : Number(args[1] ?? 0)); }
    if (name==='isNa') return finish(args[0] == null || (typeof args[0] === 'number' && !Number.isFinite(args[0])));
    if (name==='max') return finish(Math.max(Number(args[0]), Number(args[1])));
    if (name==='min') return finish(Math.min(Number(args[0]), Number(args[1])));
    if (name==='abs') return finish(Math.abs(Number(args[0])));
    if (name==='toNumber'||name==='toPrice'||name==='toVolume'||name==='toTime'||name==='toDuration'||name==='toCurrency') return finish(Number(args[0]));
    if (name==='sqrt') return finish(Math.sqrt(Number(args[0])));
    if (name==='pow') return finish(Math.pow(Number(args[0]), Number(args[1])));
    if (name==='crossover'||name==='crossunder') {
      const a=Number(args[0]), b=Number(args[1]);
      const previous=this.crossState[callKey];
      this.stateStore.setCross(callKey,{a,b});
      if(!Number.isFinite(a)||!Number.isFinite(b)||!previous) return finish(false);
      return finish(name==='crossover' ? previous.a <= previous.b && a > b : previous.a >= previous.b && a < b);
    }
    const statefulSeriesNames = new Set(['sma','mean','sum','highest','lowest','stdev','variance','wma','median','zscore','normalize','persistence','ema','rma','change','pctchange']);
    if (statefulSeriesNames.has(name)) {
      const current = Number(args[0]);
      if (!Number.isFinite(current)) return finish(null);
      const operation = { name: name as CoreSpiritSeriesOperationName, length };
      const key = 'direct:' + name + ':' + series + ':' + length;
      let cursor = this.directKernelCursors.get(key);
      if (!cursor) {
        cursor = new CoreSpiritFusedSeriesCursor([operation]);
        this.directKernelCursors.set(key, cursor);
      }
      const result = cursor.update(current, index)[0];
      return finish(Number.isFinite(result) ? result : null);
    }
    if(name==='rsi') {
      const current = Number(args[0]); if (!Number.isFinite(current)) return finish(null);
      const key = 'rsi:' + series + ':' + length;
      let kernel = this.rsiKernels.get(key); if (!kernel) { kernel = new RSIState(length); this.rsiKernels.set(key, kernel); }
      const mode: 'append'|'replace' = this.lastBarWasRealtime && this.realtimeRevision > 0 ? 'replace' : 'append';
      return finish(kernel.update(current, mode));
    }
    if(name==='atr') {
      const key = 'atr:' + length;
      let kernel = this.atrKernels.get(key); if (!kernel) { kernel = new ATRState(length); this.atrKernels.set(key, kernel); }
      const mode: 'append'|'replace' = this.lastBarWasRealtime && this.realtimeRevision > 0 ? 'replace' : 'append';
      return finish(kernel.update(Number(bar.high), Number(bar.low), Number(bar.close), mode));
    }
    if(name==='vwap') {
      const key = 'vwap:session';
      let kernel = this.vwapKernels.get(key); if (!kernel) { kernel = new VWAPSessionState(); this.vwapKernels.set(key, kernel); }
      const price = (Number(bar.high) + Number(bar.low) + Number(bar.close)) / 3;
      const mode: 'append'|'replace' = this.lastBarWasRealtime && this.realtimeRevision > 0 ? 'replace' : 'append';
      return finish(kernel.update(bar.timestamp, price, Number(bar.volume) || 0, Number(bar.close), mode));
    }
    if(name==='__member_get') {
      const ref=args[0]; const member=String(args[1]??'');
      if (ref && typeof ref === 'object') {
        const r=ref as Record<string, unknown>;
        const kind=String(r.kind ?? '');
        if (kind==='market' || kind==='timeframe') {
          const symbol=kind==='market' ? String(r.symbol ?? this.executionContext.symbol) : this.executionContext.symbol;
          const timeframe=kind==='timeframe' ? String(r.timeframe ?? this.executionContext.timeframe) : this.executionContext.timeframe;
          const field=member as CoreSpiritDataRequest['field'];
          if(field==='trade') return finish(this.dataResolver?.trade?.(symbol,timeframe) ?? null);
          if(field==='orderbook') return finish(this.dataResolver?.orderbook?.(symbol,timeframe) ?? null);
          if(field==='footprint') return finish(this.dataResolver?.footprint?.(symbol,timeframe) ?? null);
          if(field==='volumeProfile') return finish(this.dataResolver?.volumeProfile?.(symbol,timeframe) ?? null);
          if(['open','high','low','close','volume','time'].includes(field)) {
            const req={symbol,timeframe,field,offset:0};
            const memoKey=`request:${index}:${symbol}:${timeframe}:${field}:0`;
            if(this.dataMemo.has(memoKey)) return finish(this.dataMemo.get(memoKey));
            const ctx: CoreSpiritDataResolutionContext={asOfTimestamp:this.toEpoch(bar.timestamp),baseSymbol:this.executionContext.symbol,baseTimeframe:this.executionContext.timeframe,executionMode:this.executionContext.mode,revision:this.state.barState.revision,alignment:'last-confirmed'};
            const resolver=this.dataResolver;
            const value=resolver?.requestAt ? resolver.requestAt(req,ctx) : resolver?.request?.(req);
            if(value && typeof (value as any).then==='function') return finish(null);
            const resolved=(value as any)?.value ?? null;
            this.dataMemo.set(memoKey,resolved);
            return finish(resolved);
          }
        }
      }
      return finish(null);
    }
    if(name==='request') {
      const symbol=String(args[0] ?? this.executionContext.symbol), timeframe=String(args[1] ?? this.executionContext.timeframe), field=String(args[2] ?? 'close') as any, offset=Math.max(0,Math.floor(Number(args[3] ?? 0)));
      const resolver=this.dataResolver?.request;
      if(!resolver) return finish(null);
      const key=`request:${index}:${symbol}:${timeframe}:${field}:${offset}`;
      if (this.dataMemo.has(key)) return finish(this.dataMemo.get(key));
      const value=resolver({symbol,timeframe,field,offset});
      // Synchronous resolvers are intentionally supported in the VM; async hosts must prefetch into a snapshot.
      if(value && typeof (value as any).then==='function') return finish(null);
      const resolved=(value as any)?.value ?? null; this.dataMemo.set(key,resolved); return finish(resolved);
    }
    if(name==='lowerTf') {
      const timeframe=String(args[0] ?? ''), field=String(args[1] ?? 'close') as any;
      const resolver=this.dataResolver?.lowerTimeframe; if(resolver){
        const key=`ltf:${index}:${timeframe}:${field}`; if(this.dataMemo.has(key)) return finish(this.dataMemo.get(key));
        const values=resolver(timeframe,field); if(values && typeof (values as any).then==='function') return finish(null);
        const latest=(values as number[]).length ? Number((values as number[]).at(-1)) : null; this.dataMemo.set(key,latest); return finish(latest);
      }
      const intrabarsResolver=this.dataResolver?.intrabars; if(!intrabarsResolver) return finish(null);
      const rows=intrabarsResolver(timeframe); if(rows && typeof (rows as any).then==='function') return finish(null);
      const resolvedRows=rows as CoreSpiritIntrabar[]; const latest=resolvedRows?.at(-1) as any; return finish(latest?.[field] ?? null);
    }
    if(name==='scan.emit') {
      const score=Number(args[0]??0); const label=String(args[1]??''); const metadata=typeof args[2]==='object' && args[2] ? args[2] as Record<string,unknown> : {};
      return finish({ __coreSpiritScanRef:true, score:Number.isFinite(score)?score:0, label, metadata });
    }
    if(name==='depthImbalance') return finish(this.dataResolver?.depthImbalance?.() ?? null);
    const footprint=this.dataResolver?.footprint?.();
    if(name==='footprintDelta') return finish(footprint?.delta ?? null);
    if(name==='footprintBuy') return finish(footprint?.buyVolume ?? null);
    if(name==='footprintSell') return finish(footprint?.sellVolume ?? null);
    if(name==='footprintPoc') return finish(footprint?.poc ?? null);
    if(name==='footprintVah') return finish(footprint?.vah ?? null);
    if(name==='footprintVal') return finish(footprint?.val ?? null);
    if(name==='footprintRows') return finish(footprint?.rows?.length ?? 0);
    return finish(args[0] ?? null);
  }

  private loadIndexedValue(name:string,index:number,bar:HistoricalCandle,bars:HistoricalCandle[],barIndex:number):number|null|CoreSpiritValue {
    if (!Number.isInteger(index) || index < 0) throw new Error(`future indexing is not allowed for ${name}[${index}]`);
    if (index > barIndex) return null;
    if (['open','high','low','close','volume','time'].includes(name)) return this.loadSeries(name,index,bar,bars,barIndex);
    const id = this.seriesRegistry.existingId(name);
    return id >= 0 ? this.seriesRegistry.getValueAt(id, index) : null;
  }

  private sessionDay(timestamp:string):string { const d=new Date(timestamp); return new Intl.DateTimeFormat('en-CA',{timeZone:this.timezone}).format(d); }
  private emitIntent(kind:Extract<CoreSpiritIrInstruction,{op:'emit'}>['kind'],args:unknown[],bar:HistoricalCandle,barIndex:number,outputs:CoreSpiritOutputCollector,diagnostics:string[],outputId?:string):void {
    const time=this.toEpoch(bar.timestamp);
    this.outputCount += 1;
    const finite = (v:unknown) => Number.isFinite(Number(v));
    const num = (v:unknown) => Number(v);
    const color = (v:unknown, fallback:string) => typeof v === 'string' && v ? v : fallback;
    try {
      if(kind==='show'){
        const visualKind=String(args[0]??'');
        const metadataArg=(typeof args.at(-1)==='object' && args.at(-1) && !('__coreSpiritVisualRef' in (args.at(-1) as Record<string,unknown>))) ? args.at(-1) as Record<string,unknown> : undefined;
        const idBase=`${outputId || 'show'}:${barIndex}`;
        const areaFrom=(value:unknown) => {
          if(value && typeof value==='object' && '__coreSpiritVisualRef' in (value as Record<string,unknown>)) return value as Record<string,unknown>;
          return { __coreSpiritVisualRef:'area', kind:'chart', area:'price', id:'price' };
        };
        const placement=(areaValue:unknown, space:CoreSpiritCoordinateSpace='time')=>{
          const areaRef=areaFrom(areaValue);
          const k=String(areaRef.kind??'chart');
          const area=k==='panel'
            ? coreSpiritPanelArea(String(areaRef.title??areaRef.id??'Panel'))
            : coreSpiritChartArea(String(areaRef.area??'price') as CoreSpiritChartAreaKind,String(areaRef.id??areaRef.area??'price'));
          return coreSpiritPlacement(area,space);
        };
        const pointFrom=(value:unknown):CoreSpiritVisualPoint|null=>{
          if(!value || typeof value!=='object') return null;
          const r=value as Record<string,unknown>;
          if(r.__coreSpiritVisualRef==='point') {
            const x=Number(r.x), y=Number(r.y), space=String(r.space??'time') as CoreSpiritCoordinateSpace;
            if(Number.isFinite(x)&&Number.isFinite(y)) return coreSpiritPoint(x,y,space);
          }
          return null;
        };
        const metadata={source:this.options.sourceId,barIndex,...(metadataArg??{})};
        if(visualKind==='series'){
          const value=args[1]==null?null:Number(args[1]); const area=args[2];
          if(value==null || Number.isFinite(value)) outputs.push({kind:'series',time,value:value==null?null:value,seriesId:`${this.options.sourceId}:show:${idBase}`,style:{lastValueVisible:true},visual:placement(area,'time'),metadata});
        } else if(visualKind==='line'){
          const role=String(args[1]??'line'); const from=pointFrom(args[2]); const to=pointFrom(args[3]); const area=args[4];
          if(from&&to) outputs.push({kind:'line',id:`${this.options.sourceId}:show-line:${idBase}`,start:{time:from.x,price:from.y},end:{time:to.x,price:to.y},visual:placement(area,from.space),geometry:{kind:'line',from,to},style:{color:'#f59e0b',lineWidth:2},metadata:{semanticRole:role,...metadata}});
        } else if(visualKind==='box'){
          const from=pointFrom(args[1]); const to=pointFrom(args[2]); const area=args[3];
          if(from&&to) outputs.push({kind:'box',id:`${this.options.sourceId}:show-box:${idBase}`,left:from.x,right:to.x,top:Math.max(from.y,to.y),bottom:Math.min(from.y,to.y),visual:placement(area,from.space),geometry:{kind:'box',from,to},style:{color:'#3b82f6',fillColor:'#3b82f6',fillOpacity:0.12},metadata});
        } else if(visualKind==='zone'){
          const top=num(args[1]), bottom=num(args[2]); const area=args[3]; const domain=String(args[4]??'time')==='viewport'?'viewport':'time';
          if(Number.isFinite(top)&&Number.isFinite(bottom)) outputs.push({kind:'zone',id:`${this.options.sourceId}:show-zone:${idBase}`,left:domain==='viewport'?0:time,right:domain==='viewport'?Number.POSITIVE_INFINITY:time,top,bottom,state:'active',domain,visual:placement(area,'price'),style:{color:'#38bdf8',fillColor:'#38bdf8',fillOpacity:0.12},metadata:{domain,...metadata}});
        } else if(visualKind==='signal'){
          const type=String(args[1]??'signal'); const rel=args[2]; const area=args[3]; const relative = rel && typeof rel==='object' && String((rel as Record<string,unknown>).kind).toLowerCase().includes('above') ? coreSpiritAboveBar(Number((rel as Record<string,unknown>).offset??0)) : rel && typeof rel==='object' && String((rel as Record<string,unknown>).kind).toLowerCase().includes('below') ? coreSpiritBelowBar(Number((rel as Record<string,unknown>).offset??0)) : coreSpiritAtBar(Number(rel && typeof rel==='object' ? (rel as Record<string,unknown>).offset ?? 0 : 0));
          const price=relative.kind==='belowBar'?bar.low:bar.high;
          outputs.push({kind:'label',id:`${this.options.sourceId}:show-signal:${idBase}:${type}`,time,price,text:type,position:relative.kind==='belowBar'?'below':'above',relativePosition:relative,visual:placement(area,'time'),style:{background:'#2563eb',color:'#ffffff',fontSize:12,shape:'pill'},metadata:{semanticRole:'signal',type,...metadata}});
        } else if(visualKind==='model'){
          const ref=args[1]; const modelName=ref&&typeof ref==='object'?String((ref as Record<string,unknown>).modelName??'model'):String(ref??'model');
          const modelValue=this.modelOutputResolver?.({modelName,field:'*',binding:(()=>{const d=this.loadedSurface?.declarations.find((item): item is Extract<CoreSpiritSurfaceDeclaration,{kind:'model'}> => item.kind==='model'&&item.name===modelName);return d?.binding;})()}) ?? null;
          outputs.push({kind:'customVisual',id:`${this.options.sourceId}:show-model:${idBase}:${modelName}`,time,geometry:{kind:'point',point:coreSpiritTimePricePoint(time,Number.isFinite(Number(modelValue))?Number(modelValue):Number(bar.close))},visual:placement({kind:'chart',area:'price',id:'price'},'time'),metadata:{semanticRole:'model',model:modelName,value:typeof modelValue==='object'?JSON.stringify(modelValue):modelValue,...metadata}});
        }
      }
      if(kind==='plot'){
        const value=args[0] == null ? null : Number(args[0]);
        const seriesId=outputId ? `${this.options.sourceId}:${outputId}` : `${this.options.sourceId}:plot:${this.plotOrdinal++}`;
        const style={color:typeof args[1]==='string'?args[1]:undefined,lineWidth:Number.isFinite(Number(args[2]))?Math.max(1,Math.min(5,Number(args[2]))):2,lineStyle:Number.isFinite(Number(args[3]))?Number(args[3]):0,title:typeof args[4]==='string'?args[4]:undefined,priceLineVisible:false,lastValueVisible:true};
        outputs.push({kind:'series',time,value:value !== null && Number.isFinite(value)?value:null,seriesId,style});
      }
      else if(kind==='marker'){
        const price=Number(args[1]??args[0]);
        if(Number.isFinite(price)) outputs.push({kind:'marker',id:`${this.options.sourceId}:marker:${barIndex}:${outputId||'marker'}`,time:Number(args[0])||time,price,metadata:{source:this.options.sourceId,barIndex}});
      }
      else if(kind==='label'||kind==='labelAt'){
        const isAt=kind==='labelAt'; const price=Number(isAt?args[0]:(String(args[1]??'above')==='below'?bar.low:bar.high));
        const text=String(isAt?args[1]:args[0]??''); const position=String(isAt?args[2]??'price':args[1]??'above') as any;
        const background=String(isAt?args[3]??'#2563eb':args[2]??'#2563eb'); const textColor=String(isAt?args[4]??'#ffffff':args[3]??'#ffffff');
        const fontSize=Number(isAt?args[5]??12:args[4]??12); const shape=String(isAt?args[6]??'pill':args[5]??'pill') as any;
        const fontWeight=String(isAt?args[7]??'600':args[6]??'600'); const fontStyle=String(isAt?args[8]??'normal':args[7]??'normal') as any;
        if(Number.isFinite(price)&&text) outputs.push({kind:'label',id:`${this.options.sourceId}:label:${barIndex}:${outputId||text}`,time,price,text,position,style:{background,color:textColor,fontSize,shape,fontWeight,fontStyle},metadata:{source:this.options.sourceId,barIndex}});
      }
      else if(kind==='line'){
        const a={time:num(args[0])||time,price:num(args[1])},b={time:num(args[2])||time,price:num(args[3])};
        if(Number.isFinite(a.price)&&Number.isFinite(b.price)) { const md=(typeof args.at(-1)==='object'&&args.at(-1))?(args.at(-1) as Record<string,unknown>):{}; outputs.push({kind:'line',id:`${this.options.sourceId}:line:${outputId||'line'}:${barIndex}`,start:a,end:b,style:{source:this.options.sourceId,color:color(args[4],'#f59e0b'),lineWidth:Math.max(1,Math.min(6,num(args[5])||1))},metadata:{source:this.options.sourceId,barIndex,...md}}); }
      }
      else if(kind==='zone'){
        const left=num(args[0])||time,right=num(args[1])||time,top=num(args[2]),bottom=num(args[3]);
        if([left,right,top,bottom].every(Number.isFinite)) outputs.push({kind:'zone',id:`${this.options.sourceId}:zone:${outputId||'zone'}:${barIndex}`,left,right,top,bottom,state:'active',style:{color:color(args[4],'#38bdf8'),fillColor:color(args[5],color(args[4],'#38bdf8')),fillOpacity:Number.isFinite(Number(args[6]))?Math.max(0,Math.min(1,num(args[6]))):0.12,pattern:(typeof args[7]==='string'?args[7]:'solid') as any}});
      }
      else if(kind==='box'){
        const left=num(args[0])||time,right=num(args[1])||time,top=num(args[2]),bottom=num(args[3]);
        if([left,right,top,bottom].every(Number.isFinite)) outputs.push({kind:'box',id:`${this.options.sourceId}:box:${outputId||'box'}:${barIndex}`,left,right,top,bottom,style:{fillColor:color(args[4],'#2563eb'),color:color(args[5],'#2563eb'),fillOpacity:Number.isFinite(Number(args[6]))?Math.max(0,Math.min(1,num(args[6]))):0.16,pattern:(typeof args[7]==='string'?args[7]:'solid') as any}});
      }
      else if(kind==='band'||kind==='fill'||kind==='gradient'){
        const top=num(args[0]),bottom=num(args[1]);
        if(finite(top)&&finite(bottom)){
          const c1=color(args[2],kind==='gradient'?'#38bdf8':'#2563eb');
          const c2=kind==='gradient'?color(args[3],'#8b5cf6'):c1;
          const opacity=Number.isFinite(Number(kind==='gradient'?args[4]:args[3]))?Math.max(0,Math.min(1,num(kind==='gradient'?args[4]:args[3]))):0.16;
          outputs.push({kind:'band',id:`${this.options.sourceId}:band:${outputId||'band'}:${barIndex}`,time,top,bottom,style:{fillColor:c1,fillColor2:c2,color:c1,fillOpacity:opacity,opacity}});
        }
      }
      else if(kind==='arrow'){
        const a={time:num(args[0])||time,price:num(args[1])},b={time:num(args[2])||time,price:num(args[3])};
        if([a.time,a.price,b.time,b.price].every(Number.isFinite)) outputs.push({kind:'arrow',id:`${this.options.sourceId}:arrow:${outputId||'arrow'}:${barIndex}`,start:a,end:b,style:{color:color(args[4],'#f59e0b'),lineWidth:Number.isFinite(Number(args[5]))?Math.max(1,Math.min(8,num(args[5]))):2}});
      }
      else if(kind==='shape'||kind==='heatmap'){
        const price=num(args[0]),shape=kind==='heatmap'?'square':String(args[1]||'circle') as any;
        if(finite(price)){ const intensity=kind==='heatmap'?Math.max(0,Math.min(1,Math.abs(num(args[1])))):1; outputs.push({kind:'shape',id:`${this.options.sourceId}:shape:${outputId||'shape'}:${barIndex}`,time,price,shape,style:{color:color(kind==='heatmap'?args[2]:args[2],'#f59e0b'),fillColor:color(args[2],'#f59e0b'),opacity:kind==='heatmap'?Math.max(.08,intensity):1,size:Number.isFinite(Number(kind==='heatmap'?args[3]:args[3]))?Math.max(4,Math.min(40,num(args[3])||10)):10,text:typeof args[4]==='string'?args[4]:undefined}}); }
      }
      else if(kind==='polyline'){
        const points: {time:number;price:number}[]=[]; let i=0;
        while(i+1<args.length && typeof args[i] !== 'string' && Number.isFinite(num(args[i])) && Number.isFinite(num(args[i+1])) && points.length<8){ points.push({time:num(args[i]),price:num(args[i+1])}); i+=2; }
        const stroke=color(args[i],'#38bdf8'); const width=Number.isFinite(num(args[i+1]))?Math.max(1,Math.min(8,num(args[i+1]))):2;
        if(points.length>=2) outputs.push({kind:'polyline',id:`${this.options.sourceId}:polyline:${outputId||'polyline'}:${barIndex}`,points,style:{color:stroke,lineWidth:width,pattern:(typeof args[i+2]==='string'?args[i+2]:'solid') as any}});
      }
      else if(kind==='hline'){
        const price=num(args[0]); if(Number.isFinite(price)) outputs.push({kind:'hline',id:`${this.options.sourceId}:hline:${outputId||'hline'}:${barIndex}`,price,style:{color:color(args[1],'#64748b'),lineWidth:Number.isFinite(num(args[2]))?Math.max(1,Math.min(6,num(args[2]))):1,lineStyle:Number.isFinite(num(args[3]))?num(args[3]):0}});
      }
      else if(kind==='bg' || kind==='barcolor'){
        const c=color(args[0],'#2563eb'), opacity=Number.isFinite(num(args[1]))?Math.max(0,Math.min(1,num(args[1]))):0.12;
        outputs.push({kind:kind==='bg'?'background':'barcolor',id:`${this.options.sourceId}:${kind}:${barIndex}`,time,color:c,opacity,metadata:{barIndex,source:this.options.sourceId}} as any);
      }
      else if(kind==='table'){
        const position=String(args[0]||'topRight') as any, row=Math.max(0,Math.floor(num(args[1]))), column=Math.max(0,Math.floor(num(args[2]))), text=String(args[3]??'');
        outputs.push({kind:'table',id:`${this.options.sourceId}:table:${position}:${row}:${column}:${outputId||'table'}:${barIndex}`,position,row,column,text,style:{background:color(args[4],'rgba(15,23,42,.88)'),color:color(args[5],'#fff'),fontSize:Number.isFinite(num(args[6]))?Math.max(8,Math.min(32,num(args[6]))):12},metadata:{source:this.options.sourceId}});
      }
      else if(kind==='scanCandidate'){
        const score=Number(args[0]??0); const label=typeof args[1]==='string'?args[1]:undefined; const metadata=typeof args[2]==='object'&&args[2] ? args[2] as Record<string,unknown> : {};
        outputs.push({kind:'scanCandidate',id:`${this.options.sourceId}:scan:${barIndex}:${outputId||label||'candidate'}`,time,score:Number.isFinite(score)?score:0,label,metadata:{source:this.options.sourceId,barIndex,...metadata}});
      }
      else if(kind==='event'){
        const name=String(args[0]??'event');
        const event={kind:'event' as const,id:`${this.options.sourceId}:event:${barIndex}:${outputId||name}`,time,name,metadata:{source:this.options.sourceId,barIndex}};
        outputs.push(event);
        this.eventRouter.scriptEvent({scriptId:this.options.sourceId,time,name,metadata:{barIndex}});
      }
      else if(kind==='orderIntent'){
        const side=normalizeCoreSpiritOrderDirection(String(args[0]??'long'));
        const sizing=normalizeCoreSpiritOrderSizing(String(args[1]??'quantity'),Number(args[2]));
        const intent=createCoreSpiritOrderIntent({
          side: side==='flat' ? 'exit' : side,
          sizing,
          stop:Number.isFinite(Number(args[3]))?Number(args[3]):null,
          target:Number.isFinite(Number(args[4]))?Number(args[4]):null,
        },{id:`${this.options.sourceId}:order:${barIndex}:${outputId||'orderIntent'}`,time,sourceId:this.options.sourceId,barIndex,mode:this.executionContext.mode,runId:this.executionContext.runId});
        outputs.push(intent);
        this.eventRouter.executionIntent(this.options.sourceId,intent);
      }
      else if(kind==='buy' || kind==='sell'){
        const quantity=Number(args[0]);
        if(!Number.isFinite(quantity) || quantity<=0) throw new Error(`${kind} requires a positive quantity`);
        const intent=createCoreSpiritOrderIntent({
          side:kind==='buy'?'long':'short',
          sizing:{kind:'quantity',value:quantity},
          tag:typeof args[1]==='string'?args[1]:undefined,
        },{id:`${this.options.sourceId}:order:${barIndex}:${outputId||kind}`,time,sourceId:this.options.sourceId,barIndex,mode:this.executionContext.mode,runId:this.executionContext.runId});
        outputs.push(intent);
        this.eventRouter.executionIntent(this.options.sourceId,intent);
      }
      else if(kind==='signal'){
        const type=String(args[0]??'signal'); outputs.push({kind:'signal',time,type,metadata:{source:this.options.sourceId,barIndex}});
        this.eventRouter.scriptSignal({scriptId:this.options.sourceId,time,type,metadata:{barIndex}});
      }
      else if(kind==='entry') {
        const condition=Boolean(args[0]); if(!condition) return;
        const side=String(args[1]??'long').toLowerCase();
        const normalizedSide=(side==='short'?'short':side==='flat'?'flat':'long') as 'long'|'short'|'flat';
        const confidence=Math.max(0,Math.min(1,Number(args[2]??0.5)));
        const stop=Number.isFinite(Number(args[3]))?Number(args[3]):null;
        const target=Number.isFinite(Number(args[4]))?Number(args[4]):null;
        const tag=typeof args[5]==='string'?args[5]:undefined;
        const id=`${this.options.sourceId}:entry:${barIndex}:${tag||normalizedSide}`;
        const intent={kind:'orderIntent' as const,id,time,side:normalizedSide,confidence,stop,target,tag,metadata:{source:this.options.sourceId,barIndex,mode:this.executionContext.mode}};
        outputs.push(intent);
        this.eventRouter.executionIntent(this.options.sourceId,intent);
      }
      else if(kind==='exit') {
        const condition=Boolean(args[0]); if(!condition) return;
        const tag=typeof args[1]==='string'?args[1]:undefined;
        const intent={kind:'orderIntent' as const,id:`${this.options.sourceId}:exit:${barIndex}:${tag||'exit'}`,time,side:'flat' as const,confidence:1,stop:null,target:null,tag,metadata:{source:this.options.sourceId,barIndex,exit:true,mode:this.executionContext.mode}};
        outputs.push(intent);
        this.eventRouter.executionIntent(this.options.sourceId,intent);
      }
      else if(kind==='alert') this.eventRouter.scriptAlert({scriptId:this.options.sourceId,time,payload:{args,barIndex}});
      else if(kind==='webhook') this.eventRouter.scriptWebhook({scriptId:this.options.sourceId,time,endpoint:typeof args[0]==='string'?args[0]:undefined,payload:{args:typeof args[0]==='string'?args.slice(1):args,barIndex}});
    } catch(error) { diagnostics.push(`output ${kind} at bar ${barIndex}: ${error instanceof Error?error.message:String(error)}`); }
  }
  private pushState(key:string,value:number|string):void { this.stateStore.pushSeries(this.seriesRegistry.idFor(key),Number(value),this.stateHistoryLimit); }
  private pushLocalState(id:CoreSpiritSeriesId,value:CoreSpiritValue):void { this.stateStore.pushLocal(id,value,this.stateHistoryLimit); }
  private unary(operator:string,value:unknown):unknown { if(operator==='!')return !this.truthy(value);if(operator==='+')return Number(value);return -Number(value); }
  private binary(operator:string,left:unknown,right:unknown):unknown { if(['+','-','*','/','%','<','<=','>','>='].includes(operator)&&(left==null||right==null))return null;switch(operator){case'+':return Number(left)+Number(right);case'-':return Number(left)-Number(right);case'*':return Number(left)*Number(right);case'/':return Number(right)===0?null:Number(left)/Number(right);case'%':return Number(left)%Number(right);case'==':return left===right;case'!=':return left!==right;case'<':return Number(left)<Number(right);case'<=':return Number(left)<=Number(right);case'>':return Number(left)>Number(right);case'>=':return Number(left)>=Number(right);case'and':return this.truthy(left)&&this.truthy(right);case'or':return this.truthy(left)||this.truthy(right);default:return null;} }
  private truthy(value:unknown):boolean{return Boolean(value);}
  private validateBar(bar: HistoricalCandle): void {
    const values = [bar.open, bar.high, bar.low, bar.close, bar.volume];
    if (!values.every(v => Number.isFinite(Number(v)))) throw new Error('CoreSpirit received a non-finite OHLCV bar');
    if (Number(bar.high) < Number(bar.low)) throw new Error('CoreSpirit received an invalid bar: high < low');
    const t = this.toEpoch(bar.timestamp);
    if (!Number.isFinite(t) || t <= 0) throw new Error('CoreSpirit received an invalid bar timestamp');
    const last = this.history[this.history.length - 1];
    if (last && t < this.toEpoch(last.timestamp)) throw new Error('CoreSpirit bars must be chronological');
  }

  private workspaceSnapshot() { return { ui:this.uiRuntime.snapshot(), app:this.appRuntime.snapshot(), visuals:this.declarativeVisualState }; }

  private throwIfAborted(): void { if (this.abortSignal?.aborted) throw new DOMException('CoreSpirit execution aborted', 'AbortError'); }
  private toEpoch(timestamp:string):number{const n=Number(timestamp);if(Number.isFinite(n))return n>1e12?Math.floor(n/1000):n;const parsed=Date.parse(timestamp);return Number.isFinite(parsed)?Math.floor(parsed/1000):0;}
}
export const coreSpiritRuntime = new CoreSpiritRuntime();

function cloneNumberMap(input:Record<string,number[]>):Record<string,number[]>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,[...v]])); }
function cloneValueMap<T=any>(input:Record<string,T[]>):Record<string,T[]>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,[...v]])) as Record<string,T[]>; }
function cloneCrossMap(input:Record<string,{a:number;b:number}>):Record<string,{a:number;b:number}>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,{...v}])); }
