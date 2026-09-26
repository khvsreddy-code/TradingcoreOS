import type { CoreSpiritMarketBar } from './marketData';
import { CoreEventBus, coreEventBus } from '../core/event/eventBus';
import { CoreSpiritObject, CoreSpiritProgram, CoreSpiritValue } from './types';
import { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { CoreSpiritCompiler } from './compiler';
import { createCoreSpiritExecutionContext, createCoreSpiritExecutionFrame } from './executionContext';
import { CoreSpiritSeriesEngine } from './seriesEngine';
import type { CoreSpiritExecutionContext, CoreSpiritExecutionMode, CoreSpiritDataResolver, CoreSpiritTick, CoreSpiritFootprint, CoreSpiritIntrabar, CoreSpiritDataRequest, CoreSpiritDataSnapshot, CoreSpiritBarState, CoreSpiritDataResolutionContext, CoreSpiritDataAlignment } from './types';
import { sma as kernelSma, highest as kernelHighest, lowest as kernelLowest, emaStep, trueRange, rsiFromAverages } from './indicatorKernel';
import { calculateNativeIndicator, calculateNativeAtr } from './indicatorEngine';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import type { DebuggerIrStep, DebuggerValue } from './debuggerContract';
import { CoreSpiritUiRuntime, type CoreSpiritUiEvent, type CoreSpiritUiState, type CoreSpiritUiAction } from './uiRuntime';
import { CoreSpiritWorkspaceRuntime, type CoreSpiritWorkspaceState } from './workspaceRuntime';
import type { CoreSpiritExecutionTarget } from './executionTarget';
import type { CoreSpiritGraphNode } from './semanticGraph';
import { CoreSpiritReactiveEngine } from './reactiveEngine';
import { CORE_SPIRIT_EXECUTION_TARGET_PROFILES } from './executionTarget';

export type CoreSpiritRuntimeOptions = {
  symbol?: string; timeframe?: string; sourceId?: string; maxStepsPerBar?: number; executionTarget?: CoreSpiritExecutionTarget;
  timezone?: string; stateHistoryLimit?: number; maxOutputsPerBar?: number; maxHistoryBars?: number; executionMode?: CoreSpiritExecutionMode; runId?: string; abortSignal?: AbortSignal; debugTrace?: boolean; dataResolver?: CoreSpiritDataResolver; executionPolicy?: CoreSpiritExecutionContext['policy']; layer?: CoreSpiritProgramLayer; reactiveExecution?: boolean;
};
export type CoreSpiritRuntimeState = {
  barIndex: number; time: number; locals: Record<string, unknown>; seriesState: Record<string, number[]>; localSeries: Record<string, Array<number | boolean | string | null>>; barState: CoreSpiritBarState; uiState: CoreSpiritUiState; workspaceState: CoreSpiritWorkspaceState;
};
export type CoreSpiritExecutionResult = { outputs: CoreSpiritObject[]; state: CoreSpiritRuntimeState; diagnostics: string[] };

/** Stateful, chronological CoreSpirit executor. No DOM, network or broker APIs are exposed here. */
export class CoreSpiritRuntime {
  private readonly dataResolver?: CoreSpiritDataResolver;
  private readonly compiler = new CoreSpiritCompiler();
  private readonly options: { symbol:string; timeframe:string; sourceId:string; maxStepsPerBar:number; timezone:string; stateHistoryLimit:number; layer:CoreSpiritProgramLayer; executionTarget:CoreSpiritExecutionTarget };
  private readonly executionTarget: CoreSpiritExecutionTarget;
  private readonly bus: CoreEventBus;
  private readonly timezone: string;
  private readonly abortSignal?: AbortSignal;
  private stateHistoryLimit: number;
  private readonly maxOutputsPerBar: number;
  private readonly maxHistoryBars: number;
  private readonly executionContext: CoreSpiritExecutionContext;
  private readonly seriesEngine = new CoreSpiritSeriesEngine();
  private readonly uiRuntime = new CoreSpiritUiRuntime();
  private readonly workspaceRuntime = new CoreSpiritWorkspaceRuntime();
  private executionRevision = 0;
  private state: CoreSpiritRuntimeState = { barIndex: -1, time: 0, locals: {}, seriesState: {}, localSeries: {}, uiState: { version:1, revision:0, panels:[] }, workspaceState: { visuals:{ version:1, revision:0, specs:[] }, app:null }, barState: { index:-1, time:0, barIndex:-1, timestamp:0, symbol:'', timeframe:'unknown', timezone:'Asia/Kolkata', session:{id:'',marketDate:'',isOpen:false,phase:'unknown'}, mode:'historical', revision:0, isNewBar:true, isFirst:true, isLast:false, isRealtime:false, isConfirmed:true } };
  private compiledIr?: CoreSpiritIrProgram;
  private loadedProgramId?: string;
  private history: CoreSpiritMarketBar[] = [];
  private crossState: Record<string, { a: number; b: number }> = {};
  private committedSeriesState: Record<string, number[]> = {};
  private committedLocalSeries: Record<string, Array<number | boolean | string | null>> = {};
  private committedCrossState: Record<string, { a:number; b:number }> = {};
  private currentBarSnapshot?: { seriesState: Record<string, number[]>; localSeries: Record<string, Array<number | boolean | string | null>>; crossState: Record<string, {a:number;b:number}>; uiState: CoreSpiritUiState; workspaceState: CoreSpiritWorkspaceState; historyLength:number; bar: CoreSpiritMarketBar };
  private realtime = false;
  private lastBarWasRealtime = false;
  private plotOrdinal = 0;
  private indicatorMemo = new Map<string, unknown>();
  private outputCount = 0;
  private dataMemo = new Map<string, unknown>();
  private realtimeLifecycle: 'idle' | 'evaluating' | 'committed' = 'idle';
  private readonly debugTraceEnabled: boolean;
  private readonly reactiveExecutionEnabled: boolean;
  private readonly reactiveEngine = new CoreSpiritReactiveEngine();
  private debugBarTraces = new Map<number, DebuggerIrStep[]>();

  constructor(options: CoreSpiritRuntimeOptions = {}, bus: CoreEventBus = coreEventBus) {
    this.dataResolver = options.dataResolver;
    const executionMode = options.executionMode || 'historical';
    const inferredTarget: CoreSpiritExecutionTarget = options.layer === 'automation' ? 'automation' : executionMode === 'realtime' ? 'chart' : executionMode === 'replay' ? 'replay' : executionMode === 'backtest' ? 'backtest' : 'chart';
    this.executionTarget = options.executionTarget || inferredTarget;
    this.debugTraceEnabled = Boolean(options.debugTrace);
    this.reactiveExecutionEnabled = options.reactiveExecution !== false;
    this.options = { symbol: options.symbol || '', timeframe: options.timeframe || 'unknown', sourceId: options.sourceId || 'coreSpirit', maxStepsPerBar: Math.max(100, options.maxStepsPerBar || 10000), timezone: options.timezone || 'Asia/Kolkata', stateHistoryLimit: Math.max(512, Math.floor(options.stateHistoryLimit || 2048)), layer: options.layer || 'script', executionTarget: this.executionTarget };
    this.timezone = this.options.timezone;
    this.abortSignal = options.abortSignal;
    this.stateHistoryLimit = this.options.stateHistoryLimit;
    this.maxOutputsPerBar = Math.max(100, Math.floor(options.maxOutputsPerBar || 10000));
    this.maxHistoryBars = Math.max(2048, Math.floor(options.maxHistoryBars || 60000));
    this.executionContext = createCoreSpiritExecutionContext({ mode: options.executionMode || 'historical', symbol: this.options.symbol, timeframe: this.options.timeframe, timezone: this.timezone, runId: options.runId, policy: options.executionPolicy });
    this.bus = bus;
  }

  getExecutionTarget(): CoreSpiritExecutionTarget { return this.executionTarget; }

  private requireTargetCapability(capability: string): void {
    if (!CORE_SPIRIT_EXECUTION_TARGET_PROFILES[this.executionTarget].capabilities.includes(capability as never)) {
      throw new Error(`execution target '${this.executionTarget}' does not allow capability '${String(capability)}'`);
    }
  }

  reset(): void {
    this.seriesEngine.reset(); this.uiRuntime.reset(); this.workspaceRuntime.reset(); this.executionRevision = 0;
    this.state = { barIndex: -1, time: 0, locals: {}, seriesState: {}, localSeries: {}, uiState: this.uiRuntime.snapshot(), workspaceState: this.workspaceRuntime.snapshot(), barState: { index:-1, time:0, barIndex:-1, timestamp:0, symbol:'', timeframe:'unknown', timezone:'Asia/Kolkata', session:{id:'',marketDate:'',isOpen:false,phase:'unknown'}, mode:'historical', revision:0, isNewBar:true, isFirst:true, isLast:false, isRealtime:false, isConfirmed:true } };
    this.history = []; this.crossState = {}; this.committedSeriesState = {}; this.committedLocalSeries = {}; this.committedCrossState = {};
    this.debugBarTraces.clear();
    this.reactiveEngine.setPlan(this.compiledIr?.graphs?.reactive);
    this.currentBarSnapshot = undefined; this.realtimeLifecycle = 'idle'; this.plotOrdinal = 0; this.indicatorMemo.clear(); this.dataMemo.clear(); this.lastRuntimeCallRefs.clear(); this.outputCount = 0;
  }
  getState(): CoreSpiritRuntimeState { this.state.uiState = this.uiRuntime.snapshot(); this.state.workspaceState = this.workspaceRuntime.snapshot(); return { ...this.state, locals: { ...this.state.locals }, seriesState: Object.fromEntries(Object.entries(this.state.seriesState).map(([k,v]) => [k,[...v]])), localSeries: Object.fromEntries(Object.entries(this.state.localSeries).map(([k,v]) => [k,[...v]])), uiState: this.uiRuntime.snapshot(), workspaceState: this.workspaceRuntime.snapshot() }; }
  getUiState(): CoreSpiritUiState { return this.uiRuntime.snapshot(); }
  getWorkspaceState(): CoreSpiritWorkspaceState { return this.workspaceRuntime.snapshot(); }
  getReactiveExecutionStats() { return this.reactiveEngine.getStats(); }
  getDeclarativeVisualScene(identity: import('./visualScene').CoreSpiritSceneIdentity, revision?: number) { return this.workspaceRuntime.buildScene(identity, this.options.sourceId, revision); }
  dispatchUiEvent(event: CoreSpiritUiEvent): CoreSpiritUiAction | undefined { return this.uiRuntime.dispatch(event); }

  loadProgram(program: CoreSpiritProgram): CoreSpiritIrProgram {
    const compiled = this.compiler.compile(program.ast, program.id || this.options.sourceId, { layer: this.options.layer });
    const errors = compiled.diagnostics.filter(d => d.severity === 'error');
    if (!compiled.ir || errors.length) throw new Error(errors.map(d => d.message).join('; ') || 'CoreSpirit compilation failed');
    this.compiledIr = compiled.ir; this.loadedProgramId = program.id;
    // State retention must always cover the program's declared lookback plus a safety margin.
    if (compiled.ir.maxLookback + 32 > this.stateHistoryLimit) this.stateHistoryLimit = Math.min(this.maxHistoryBars, compiled.ir.maxLookback + 32);
    this.reset();
    return compiled.ir;
  }

  execute(program: CoreSpiritProgram, bars: CoreSpiritMarketBar[]): CoreSpiritObject[] {
    this.loadProgram(program);
    return this.executeIr(this.compiledIr!, bars).outputs;
  }

  executeBar(bar: CoreSpiritMarketBar): CoreSpiritExecutionResult {
    this.throwIfAborted();
    if (!this.compiledIr) throw new Error('CoreSpirit program is not loaded');
    const outputs: CoreSpiritObject[] = [], diagnostics: string[] = [];
    const normalized = { ...bar };
    const incomingTimestamp = this.toEpoch(normalized.timestamp);
    const last = this.history[this.history.length - 1];
    const sameBucket = !!last && this.toEpoch(last.timestamp) === this.toEpoch(normalized.timestamp);
    const changedInputs = sameBucket ? diffBarInputs(last!, normalized) : ['open','high','low','close','volume','time','bar_index'];

    // A realtime bar may be evaluated many times. Roll back the previous
    // unconfirmed evaluation so stateful functions commit exactly once.
    if (!sameBucket && this.currentBarSnapshot && this.lastBarWasRealtime) this.confirmRealtimeBar();

    if (sameBucket && this.currentBarSnapshot) {
      this.state.seriesState = cloneNumberMap(this.currentBarSnapshot.seriesState);
      this.state.localSeries = cloneValueMap(this.currentBarSnapshot.localSeries);
      this.crossState = cloneCrossMap(this.currentBarSnapshot.crossState);
      this.uiRuntime.restore(this.currentBarSnapshot.uiState);
      this.workspaceRuntime.restore(this.currentBarSnapshot.workspaceState);
      this.history[this.history.length - 1] = normalized;
    } else {
      this.currentBarSnapshot = {
        seriesState: cloneNumberMap(this.state.seriesState),
        localSeries: cloneValueMap(this.state.localSeries),
        crossState: cloneCrossMap(this.crossState),
        uiState: this.uiRuntime.snapshot(),
        workspaceState: this.workspaceRuntime.snapshot(),
        historyLength: this.history.length, bar: { ...normalized },
      };
      this.history.push(normalized);
      if (this.history.length > this.maxHistoryBars) this.history.splice(0, this.history.length - this.maxHistoryBars);
    }
    const barIndex = this.history.length - 1;
    this.executionRevision = sameBucket ? this.executionRevision + 1 : 0;
    this.seriesEngine.setBars(this.history);
    this.seriesEngine.beginBar(barIndex, normalized, false, this.executionRevision);
    this.state.barIndex = barIndex;
    this.state.time = this.toEpoch(normalized.timestamp);
    this.state.locals = {};
    this.plotOrdinal = 0;
    this.indicatorMemo.clear();
    this.outputCount = 0;
    this.validateBar(normalized);
    this.state.barState = { ...createCoreSpiritExecutionFrame({ timestamp:incomingTimestamp, barIndex, symbol:this.options.symbol, timeframe:this.options.timeframe, timezone:this.timezone, mode:'realtime', isRealtime:true, isConfirmed:false, isNewBar:!sameBucket, revision:this.executionRevision, isFirst:barIndex===0, isLast:false }) };
    this.executionContext.frame = this.state.barState; this.executionContext.session = this.state.barState.session;
    this.lastBarWasRealtime = true;
    this.realtimeLifecycle = 'evaluating';
    this.reactiveEngine.beginRevision(changedInputs, !sameBucket);
    try { this.executeBlock(this.compiledIr.entry.instructions, normalized, this.history, barIndex, outputs, diagnostics); }
    catch (error) { diagnostics.push(`bar ${barIndex}: ${error instanceof Error ? error.message : String(error)}`); }
    return { outputs, state: this.getState(), diagnostics };
  }

  /** Execute a host-supplied tick against the current realtime bar. The VM remains socket-free. */
  executeTick(tick: CoreSpiritTick, baseBar: CoreSpiritMarketBar, historicalTick = false): CoreSpiritExecutionResult {
    const price = Number(tick.price);
    if (!Number.isFinite(price)) throw new Error('invalid realtime tick price');
    const bar: CoreSpiritMarketBar = {
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
  executeHistoricalTicks(ticks: CoreSpiritTick[], baseBar: CoreSpiritMarketBar): CoreSpiritExecutionResult[] {
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

  beginRealtimeEvaluation(): void { if (this.state.barIndex >= 0) { this.realtimeLifecycle='evaluating'; this.lastBarWasRealtime=true; } }

  commitRealtimeBar(): void {
    if (this.state.barIndex < 0 || !this.lastBarWasRealtime) return;
    this.state.barState={...this.state.barState,isRealtime:false,isConfirmed:true,isLast:true};
    this.committedSeriesState=cloneNumberMap(this.state.seriesState);
    this.committedLocalSeries=cloneValueMap(this.state.localSeries);
    this.committedCrossState=cloneCrossMap(this.crossState);
    this.currentBarSnapshot=undefined; this.lastBarWasRealtime=false; this.realtimeLifecycle='committed';
  }

  confirmRealtimeBar(): void { this.commitRealtimeBar(); }

  rollbackRealtimeBar(): void {
    const snapshot=this.currentBarSnapshot; if(!snapshot || !this.lastBarWasRealtime)return;
    this.state.seriesState=cloneNumberMap(snapshot.seriesState);
    this.state.localSeries=cloneValueMap(snapshot.localSeries);
    this.crossState=cloneCrossMap(snapshot.crossState);
    this.uiRuntime.restore(snapshot.uiState);
    this.history=this.history.slice(0,snapshot.historyLength); this.seriesEngine.setBars(this.history);
    this.state.locals={}; this.currentBarSnapshot=undefined; this.lastBarWasRealtime=false; this.realtimeLifecycle='idle';
    this.reactiveEngine.reset();
    this.reactiveEngine.setPlan(this.compiledIr?.graphs?.reactive);
    const last=this.history.at(-1);
    if(last){ const index=this.history.length-1; this.state.barIndex=index; this.state.time=this.toEpoch(last.timestamp); this.seriesEngine.beginBar(index,last,true,0); this.state.barState={...createCoreSpiritExecutionFrame({timestamp:this.toEpoch(last.timestamp),barIndex:index,symbol:this.options.symbol,timeframe:this.options.timeframe,timezone:this.timezone,mode:'historical',isRealtime:false,isConfirmed:true,isNewBar:false,revision:0,isFirst:index===0,isLast:true})}; }
  }

  getRealtimeLifecycle(): 'idle'|'evaluating'|'committed' { return this.realtimeLifecycle; }

  executeIr(ir: CoreSpiritIrProgram, bars: CoreSpiritMarketBar[]): CoreSpiritExecutionResult {
    const outputs: CoreSpiritObject[] = [], diagnostics: string[] = [];
    this.compiledIr = ir; this.reset();
    this.seriesEngine.reset(bars);
    for (let i = 0; i < bars.length; i++) {
      this.throwIfAborted();
      this.plotOrdinal = 0;
      this.indicatorMemo.clear();
      this.outputCount = 0;
      const bar = bars[i];
      this.validateBar(bar); this.state.barIndex = i; this.state.time = this.toEpoch(bar.timestamp); this.state.locals = {};
      this.executionRevision = 0; this.seriesEngine.beginBar(i, bar, true, this.executionRevision);
      this.reactiveEngine.beginRevision(['open','high','low','close','volume','time','bar_index'], true);
      this.state.barState = { ...createCoreSpiritExecutionFrame({ timestamp:this.state.time, barIndex:i, symbol:this.options.symbol, timeframe:this.options.timeframe, timezone:this.timezone, mode:this.executionContext.mode, isRealtime:false, isConfirmed:true, isNewBar:true, revision:this.executionRevision, isFirst:i===0, isLast:i===bars.length-1 }) };
      this.executionContext.frame = this.state.barState; this.executionContext.session = this.state.barState.session;
      this.history.push(bar);
      if (this.history.length > this.maxHistoryBars) this.history.splice(0, this.history.length - this.maxHistoryBars);
      try { this.executeBlock(ir.entry.instructions, bar, this.history, i, outputs, diagnostics); }
      catch (error) { diagnostics.push(`bar ${i}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return { outputs, state: this.getState(), diagnostics };
  }

  getDebugTrace(barIndex: number): readonly DebuggerIrStep[] { return [...(this.debugBarTraces.get(barIndex) || [])].map(step => ({ ...step, args: [...step.args] })); }
  isDebugTraceEnabled(): boolean { return this.debugTraceEnabled; }

  getExecutionContext(): CoreSpiritExecutionContext { return { ...this.executionContext, frame: this.executionContext.frame ? { ...this.executionContext.frame } : undefined, session: this.executionContext.session ? { ...this.executionContext.session } : undefined }; }
  getExecutionFrame() { return this.executionContext.frame ? { ...this.executionContext.frame, session: { ...this.executionContext.frame.session } } : undefined; }
  getLoadedProgramId(): string | undefined { return this.loadedProgramId; }
  getLoadedIr(): CoreSpiritIrProgram | undefined { return this.compiledIr; }
  loadIr(ir: CoreSpiritIrProgram): void {
    this.compiledIr = ir;
    this.loadedProgramId = ir.sourceId;
    this.stateHistoryLimit = Math.min(this.maxHistoryBars, Math.max(this.stateHistoryLimit, ir.maxLookback + 32));
  }

  exportCheckpoint() {
    return {
      state: this.getState(),
      history: (this as any).history.map((x:any)=>({ ...x })),
      crossState: cloneCrossMap((this as any).crossState),
      committedSeriesState: cloneNumberMap((this as any).committedSeriesState),
      committedLocalSeries: cloneValueMap((this as any).committedLocalSeries),
      committedCrossState: cloneCrossMap((this as any).committedCrossState),
      uiState: this.uiRuntime.snapshot(),
      workspaceState: this.workspaceRuntime.snapshot(),
    };
  }

  restoreCheckpoint(checkpoint: { state: CoreSpiritRuntimeState; history:any[]; crossState:Record<string,{a:number;b:number}>; committedSeriesState:Record<string,number[]>; committedLocalSeries:Record<string,Array<number|boolean|string|null>>; committedCrossState:Record<string,{a:number;b:number}>; uiState?: CoreSpiritUiState; workspaceState?: CoreSpiritWorkspaceState }): boolean {
    try {
      this.state = { ...checkpoint.state, locals:{...checkpoint.state.locals}, seriesState:cloneNumberMap(checkpoint.state.seriesState), localSeries:cloneValueMap(checkpoint.state.localSeries) };
      (this as any).history = checkpoint.history.map((x:any)=>({ ...x })).slice(-this.maxHistoryBars);
      (this as any).crossState = cloneCrossMap(checkpoint.crossState);
      (this as any).committedSeriesState = cloneNumberMap(checkpoint.committedSeriesState);
      (this as any).committedLocalSeries = cloneValueMap(checkpoint.committedLocalSeries);
      (this as any).committedCrossState = cloneCrossMap(checkpoint.committedCrossState);
      this.uiRuntime.restore(checkpoint.uiState || checkpoint.state.uiState || {version:1,revision:0,panels:[]});
      this.workspaceRuntime.restore(checkpoint.workspaceState || checkpoint.state.workspaceState || { visuals:{version:1,revision:0,specs:[]}, app:null });
      this.state.workspaceState = this.workspaceRuntime.snapshot();
      return true;
    } catch { return false; }
  }

  private executeBlock(instructions: CoreSpiritIrInstruction[], bar: CoreSpiritMarketBar, bars: CoreSpiritMarketBar[], barIndex: number, outputs: CoreSpiritObject[], diagnostics: string[]): void {
    const values = new Map<string, unknown>(); let pc = 0; let steps = 0;
    const debugSteps: DebuggerIrStep[] = [];
    const graphByInstruction = new Map<number, CoreSpiritGraphNode>((this.compiledIr?.graphs?.semantic.nodes || []).map(node => [node.instruction, node]));
    const reuse = (instructionPc: number): unknown | undefined => {
      if (!this.reactiveExecutionEnabled) return undefined;
      const node = graphByInstruction.get(instructionPc);
      if (!this.reactiveEngine.shouldReuse(node)) return undefined;
      const cached = this.reactiveEngine.get(node!.id);
      this.reactiveEngine.reused();
      return cached;
    };
    const remember = (instructionPc: number, value: unknown): void => {
      if (!this.reactiveExecutionEnabled) return;
      const node = graphByInstruction.get(instructionPc);
      if (node?.pure && !node.effectful) this.reactiveEngine.set(node.id, value);
    };
    const debugValue = (value: unknown): DebuggerValue | undefined => {
      if (value == null) return null;
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
      return undefined;
    };
    const record = (instructionPc: number, ins: CoreSpiritIrInstruction, value?: unknown, resultRegister?: string) => {
      if (!this.debugTraceEnabled) return;
      const sourceEntry = this.compiledIr?.sourceMap.entries.filter(entry => entry.instruction <= instructionPc).at(-1);
      debugSteps.push({
        pc: instructionPc,
        opcode: ins.op,
        args: 'args' in ins ? (ins as any).args ? [...(ins as any).args] : [] : [],
        source: sourceEntry ? { line: sourceEntry.line, column: sourceEntry.column, length: Math.max(1, sourceEntry.end - sourceEntry.start) } : undefined,
        value: debugValue(value),
        resultRegister,
      });
    };
    while (pc < instructions.length) {
      if (++steps > this.options.maxStepsPerBar) throw new Error('execution step limit exceeded');
      if ((steps & 1023) === 0) this.throwIfAborted();
      const instructionPc = pc;
      const ins = instructions[pc];
      switch (ins.op) {
        case 'const': { const cached=reuse(instructionPc); const value=cached===undefined && !this.reactiveExecutionEnabled?ins.value:cached===undefined?ins.value:cached; values.set(ins.dest,value); if (cached===undefined) remember(instructionPc,value); record(instructionPc, ins, value, ins.dest); pc++; break; }
        case 'loadSeries': { const cached=reuse(instructionPc); const value=cached===undefined?this.loadSeries(ins.name, ins.offset, bar, bars, barIndex):cached; values.set(ins.dest,value); if(cached===undefined)remember(instructionPc,value); record(instructionPc, ins, value, ins.dest); pc++; break; }
        case 'move': { const cached=reuse(instructionPc); const value=cached===undefined?this.state.locals[ins.source]:cached; values.set(ins.dest, value); if(cached===undefined)remember(instructionPc,value); record(instructionPc, ins, value, ins.dest); pc++; break; }
        case 'setLocal': { const value = values.get(ins.source); this.state.locals[ins.name] = value; if (ins.series !== false) this.pushLocalState(ins.name, value as any); if(this.reactiveExecutionEnabled)this.reactiveEngine.effect(); record(instructionPc, ins, value, ins.name); pc++; break; }
        case 'unary': { const cached=reuse(instructionPc); const value=cached===undefined?this.unary(ins.operator, values.get(ins.operand)):cached; values.set(ins.dest, value); if(cached===undefined)remember(instructionPc,value); record(instructionPc, ins, value, ins.dest); pc++; break; }
        case 'binary': { const cached=reuse(instructionPc); const value=cached===undefined?this.binary(ins.operator, values.get(ins.left), values.get(ins.right)):cached; values.set(ins.dest, value); if(cached===undefined)remember(instructionPc,value); record(instructionPc, ins, value, ins.dest); pc++; break; }
        case 'call': { const cached=reuse(instructionPc); const args = ins.args.map(a => values.get(a)); const result=cached===undefined?this.call(ins.callId || ins.dest, ins.name,args,bar,bars,barIndex,ins.seriesArgs||[],ins.seriesSources||[]):cached; values.set(ins.dest,result); if(cached===undefined)remember(instructionPc,result); if ((result as any)?.__coreSpiritDataRef) this.lastRuntimeCallRefs.set(ins.dest,result); record(instructionPc, ins, result, ins.dest); pc++; break; }
        case 'index': {
          const cached=reuse(instructionPc);
          const index = Number(values.get(ins.index));
          if (!Number.isInteger(index) || index < 0) throw new Error(`invalid historical index ${String(index)}`);
          const value = cached===undefined ? (ins.seriesName ? this.loadIndexedValue(ins.seriesName,index,bar,bars,barIndex) : (index > barIndex ? null : values.get(ins.target))) : cached;
          values.set(ins.dest, value); if(cached===undefined)remember(instructionPc,value); record(instructionPc, ins, value, ins.dest); pc++; break;
        }
        case 'jumpIfFalse': { const truth = this.truthy(values.get(ins.condition)); if(this.reactiveExecutionEnabled)this.reactiveEngine.effect(); record(instructionPc, ins, truth); pc = truth ? pc + 1 : ins.target; break; }
        case 'jump': { if(this.reactiveExecutionEnabled)this.reactiveEngine.effect(); record(instructionPc, ins, ins.target); pc = ins.target; break; }
        case 'emit': { this.emitIntent(ins.kind, ins.args.slice(1).map(a=>values.get(a)),bar,barIndex,outputs,diagnostics,ins.outputId); if(this.reactiveExecutionEnabled)this.reactiveEngine.effect(); record(instructionPc, ins); pc++; break; }
      }
    }
    if (this.debugTraceEnabled) this.debugBarTraces.set(barIndex, debugSteps);
  }

  private loadSeries(name:string, offset:number, bar:CoreSpiritMarketBar, bars:CoreSpiritMarketBar[], barIndex:number):number|null {
    if (this.seriesEngine.currentIndex !== barIndex) this.seriesEngine.beginBar(barIndex, bar, this.state.barState.isConfirmed, this.executionRevision);
    return this.seriesEngine.value(name as any, offset);
  }

  private call(callKey:string,name:string,args:unknown[],bar:CoreSpiritMarketBar,bars:CoreSpiritMarketBar[],index:number,seriesArgs:string[],seriesSources:Array<{ref:string;field:'open'|'high'|'low'|'close'|'volume'|'time'}> = []):unknown {
    const series = seriesArgs[0] || 'close'; const length = Math.max(1,Math.floor(Number(args[1] ?? 14)));
    const memoKey = `${name}|${series}|${length}|${index}|${args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(',')}`;
    if (this.indicatorMemo.has(memoKey)) return this.indicatorMemo.get(memoKey);
    const finish = (value: unknown) => { this.indicatorMemo.set(memoKey, value); return value; };
    if (name === 'scan.universe') {
      this.requireTargetCapability('market-universe');
      return finish(String(args[0] ?? ''));
    }
    if (name === 'scan.emit') {
      this.requireTargetCapability('candidate-emission');
      const score = Number(args[0]);
      if (!Number.isFinite(score)) throw new Error('scan.emit requires a finite score');
      return finish(score);
    }
    if (name === 'meta') {
      const metadata: Record<string, string | number | boolean | null> = {};
      for (let i = 0; i + 1 < args.length; i += 2) metadata[String(args[i])] = (args[i + 1] === null || ['string','number','boolean'].includes(typeof args[i + 1])) ? args[i + 1] as any : String(args[i + 1]);
      return finish(Object.freeze(metadata));
    }
    if (name === 'ui.panel') { this.requireTargetCapability('interactive-ui'); return finish(this.uiRuntime.panel(`${this.options.sourceId}:panel:${callKey}`, String(args[0] ?? 'Panel'))); }
    if (name === 'ui.panel.number') return finish(this.uiRuntime.number(args[0], String(args[1] ?? ''), args[2], typeof args[3] === 'string' ? args[3] : undefined));
    if (name === 'ui.panel.button') return finish(this.uiRuntime.button(args[0], String(args[1] ?? ''), typeof args[2] === 'string' ? args[2] : undefined));
    if (name === 'ui.panel.toggle') return finish(this.uiRuntime.toggle(args[0], String(args[1] ?? ''), args[2], typeof args[3] === 'string' ? args[3] : undefined));
    if (name === 'ui.panel.slider') {
      const min = Number(args[2]); const max = Number(args[3]); const value = args.length > 4 && args[4] != null ? args[4] : (min + max) / 2;
      return finish(this.uiRuntime.slider(args[0], String(args[1] ?? ''), min, max, value, typeof args[5] === 'string' ? args[5] : undefined));
    }

    if (name === 'visual.line') { this.requireTargetCapability('visuals');
      const metadata = args[5] && typeof args[5] === 'object' ? args[5] : undefined;
      return finish(this.workspaceRuntime.declareVisual({ id:String(args[0] ?? 'line'), kind:'line', properties:{ timeStart:Number(args[1]), priceStart:Number(args[2]), timeEnd:Number(args[3]), priceEnd:Number(args[4]) }, metadata: metadata as any }));
    }
    if (name === 'visual.zone') { this.requireTargetCapability('visuals');
      const metadata = args[5] && typeof args[5] === 'object' ? args[5] : undefined;
      return finish(this.workspaceRuntime.declareVisual({ id:String(args[0] ?? 'zone'), kind:'zone', properties:{ top:Number(args[1]), bottom:Number(args[2]), left:args[3] == null ? 0 : Number(args[3]), right:args[4] == null ? 0 : Number(args[4]) }, metadata: metadata as any }));
    }
    if (name === 'visual.liquidityZone') { this.requireTargetCapability('visuals');
      const metadata = args[5] && typeof args[5] === 'object' ? args[5] : undefined;
      return finish(this.workspaceRuntime.declareVisual({ id:String(args[0] ?? 'liquidity_zone'), kind:'liquidity_zone', semanticRole:'liquidity', properties:{ top:Number(args[1]), bottom:Number(args[2]), strength:Number(args[3]), extend:String(args[4] ?? 'right') }, metadata: metadata as any }));
    }
    if (name === 'visual.heatmap' || name === 'visual.liquidityMap' || name === 'visual.depth' || name === 'visual.volumeProfile' || name === 'visual.footprint' || name === 'visual.structureGraph' || name === 'visual.probabilitySurface' || name === 'visual.regimeBand' || name === 'visual.tradePath' || name === 'visual.modelField' || name === 'visual.replayTrace') { this.requireTargetCapability('visuals');
      const kindMap: Record<string, any> = { heatmap:'heatmap', liquidityMap:'liquidity_map', depth:'depth_map', volumeProfile:'volume_profile', footprint:'footprint', structureGraph:'structure_graph', probabilitySurface:'probability_surface', regimeBand:'regime_band', tradePath:'trade_path', modelField:'model_field', replayTrace:'replay_trace' };
      const kind = kindMap[name.slice('visual.'.length)];
      const payload = typeof args[1] === 'string' ? safeJson(args[1]) : args[1];
      const metadata = args[2] && typeof args[2] === 'object' ? args[2] : undefined;
      return finish(this.workspaceRuntime.declareVisual({ id:String(args[0] ?? kind), kind, properties:{ payload }, metadata: metadata as any }));
    }
    if (name === 'app.create') { this.requireTargetCapability('interactive-ui'); return finish(this.workspaceRuntime.createApp(String(args[0] ?? 'Trading App'), args[1] == null ? undefined : String(args[1]))); }
    if (name === 'app.chart') { this.requireTargetCapability('interactive-ui'); return finish(this.workspaceRuntime.appChart(args[0] == null ? undefined : String(args[0]), (args[1] as any) || 'main', args[2] == null ? undefined : String(args[2]))); }
    if (name === 'app.panel') { this.requireTargetCapability('interactive-ui'); return finish(this.workspaceRuntime.appPanel(String(args[0] ?? 'left') as any, String(args[1] ?? 'custom') as any, args[2] == null ? undefined : String(args[2]), args[3] == null ? undefined : String(args[3]), args[4] == null ? undefined : String(args[4]))); }
    if (name === 'app.overlay') { this.requireTargetCapability('interactive-ui'); return finish(this.workspaceRuntime.appOverlay(String(args[0] ?? 'custom') as any, args[1] == null ? undefined : String(args[1]), args[2] == null ? undefined : String(args[2]))); }
    if (name === 'app.targets') { this.requireTargetCapability('interactive-ui'); this.workspaceRuntime.appTargets(...args.map(arg => String(arg)) as any); return finish(null); }
    if (name === 'app.require') { this.requireTargetCapability('interactive-ui'); this.workspaceRuntime.appRequireFeature(String(args[0] ?? '')); return finish(null); }
    if (name === 'app.bind') { this.requireTargetCapability('interactive-ui'); this.workspaceRuntime.appBind(String(args[0] ?? ''), String(args[1] ?? ''), args[2] == null ? undefined : String(args[2])); return finish(null); }

    if (name==='nz') { const value=Number(args[0]); return finish(Number.isFinite(value) ? value : Number(args[1] ?? 0)); }
    if (name==='na' || name==='isNa') return finish(args[0] == null || (typeof args[0] === 'number' && !Number.isFinite(args[0])));
    if (name==='bar_index') return finish(index);
    if (name==='time') return finish(this.toEpoch(bar.timestamp));
    if (name==='max') return finish(Math.max(Number(args[0]), Number(args[1])));
    if (name==='min') return finish(Math.min(Number(args[0]), Number(args[1])));
    if (name==='abs') return finish(Math.abs(Number(args[0])));
    if (name==='sqrt') return finish(Math.sqrt(Number(args[0])));
    if (name==='pow') return finish(Math.pow(Number(args[0]), Number(args[1])));
    if (name==='sign') { const n=Number(args[0]); return finish(Number.isFinite(n) ? (n>0?1:n<0?-1:0) : null); }
    if (name==='round') { const places=Math.max(0, Math.floor(Number(args[1] ?? 0))); const scale=10**places; return finish(Math.round(Number(args[0])*scale)/scale); }
    if (name==='cross'||name==='crossover'||name==='crossunder') {
      const a=Number(args[0]), b=Number(args[1]);
      const previous=this.crossState[callKey];
      this.crossState[callKey]={a,b};
      if(!Number.isFinite(a)||!Number.isFinite(b)||!previous) return finish(false);
      if (name==='cross') return finish((previous.a <= previous.b && a > b) || (previous.a >= previous.b && a < b));
      return finish(name==='crossover' ? previous.a <= previous.b && a > b : previous.a >= previous.b && a < b);
    }
    if(name==='rising'||name==='falling') {
      const p=Math.max(1,Math.floor(Number(args[1] ?? 1))); const values=this.window(series,p+1,bars,index);
      if(values.length < p+1) return finish(false);
      const current=values[0]; const prior=values.slice(1,p+1);
      return finish(name==='rising' ? prior.every(v=>current>v) : prior.every(v=>current<v));
    }
    if(['sma','highest','lowest','sum','mean','stdev','wma','rma','median','variance','change','ema','hma','rsi'].includes(name)) {
      const external = seriesSources[0];
      if (external) {
        const ref = this.getRuntimeRefFromCallArg(external.ref);
        const externalSeries = ref ? this.resolveDataSeries(ref, external.field, index, length) : null;
        if (externalSeries) {
          const windowed = externalSeries.slice(-length).reverse();
          const sourceKey = this.dataSeriesKey(ref, external.field);
          const value=calculateNativeIndicator(name,args,windowed,{state:this.state.seriesState,push:(key,v)=>this.pushState(key,v)},sourceKey);
          return finish(value);
        }
      }
      const values=this.window(series,length,bars,index);
      const value=calculateNativeIndicator(name,args,values,{state:this.state.seriesState,push:(key,v)=>this.pushState(key,v)},series);
      return finish(value);
    }
    if(name==='atr') {
      const previousClose=index>0?Number(this.loadSeries('close',1,bar,bars,index)):Number(bar.open);
      return finish(calculateNativeAtr(bar,previousClose,length,{state:this.state.seriesState,push:(key,v)=>this.pushState(key,v)}));
    }
    if(name==='vwap') { const day=this.sessionDay(bar.timestamp),dayKey='vwap:day',pvKey='vwap:pv',volKey='vwap:vol'; const dayNumber=Number(day.replace(/-/g,'')); const previousDay=this.state.seriesState[dayKey]?.at(-1); if(previousDay!==dayNumber){this.state.seriesState[pvKey]=[];this.state.seriesState[volKey]=[];this.state.seriesState[dayKey]=[];} this.pushState(dayKey,Number(day.replace(/-/g,''))); const pv=Number(this.state.seriesState[pvKey]?.at(-1)||0)+((Number(bar.high)+Number(bar.low)+Number(bar.close))/3)*Math.max(0,Number(bar.volume)||0),vol=Number(this.state.seriesState[volKey]?.at(-1)||0)+Math.max(0,Number(bar.volume)||0);this.pushState(pvKey,pv);this.pushState(volKey,vol);return finish(vol?pv/vol:null); }
    if(name==='market' || name==='timeframe') {
      this.requireTargetCapability(name === 'market' ? 'multi-symbol-data' : 'multi-timeframe-data');
      const refKind = name === 'market' ? 'market' : 'timeframe';
      return finish(Object.freeze(refKind === 'market' ? { __coreSpiritDataRef:'market', symbol:String(args[0] ?? this.executionContext.symbol) } : { __coreSpiritDataRef:'timeframe', timeframe:String(args[0] ?? this.executionContext.timeframe) }));
    }
    if(name==='__member_get') {
      const ref:any = args[0]; const field=String(args[1] ?? 'close') as any;
      if (!ref || !['market','timeframe'].includes(ref.__coreSpiritDataRef)) return finish(null);
      this.requireTargetCapability(ref.__coreSpiritDataRef === 'market' ? 'multi-symbol-data' : 'multi-timeframe-data');
      const symbol = ref.__coreSpiritDataRef === 'market' ? String(ref.symbol) : this.executionContext.symbol;
      const timeframe = ref.__coreSpiritDataRef === 'timeframe' ? String(ref.timeframe) : this.executionContext.timeframe;
      return finish(this.resolveDataValue(symbol,timeframe,field,index));
    }
    if(name==='request') {
      const symbol=String(args[0] ?? this.executionContext.symbol), timeframe=String(args[1] ?? this.executionContext.timeframe), field=String(args[2] ?? 'close') as any, offset=Math.max(0,Math.floor(Number(args[3] ?? 0)));
      return finish(this.resolveDataValue(symbol,timeframe,field,index,offset));
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

  private dataResolutionContext(index:number, alignment:CoreSpiritDataAlignment='last-confirmed', maxStalenessMs?:number): CoreSpiritDataResolutionContext {
    const bar = this.history[index] || this.history.at(-1);
    return {
      asOfTimestamp: bar ? this.toEpoch(bar.timestamp) : 0,
      baseSymbol: this.executionContext.symbol,
      baseTimeframe: this.executionContext.timeframe,
      executionMode: this.executionContext.mode,
      revision: this.executionRevision,
      alignment,
      ...(maxStalenessMs != null ? { maxStalenessMs } : {}),
    };
  }

  private resolveDataValue(symbol:string,timeframe:string,field:any,index:number,offset=0): number|null {
    const resolverAt = this.dataResolver?.requestAt;
    const resolver = this.dataResolver?.request;
    if (!resolverAt && !resolver) return null;
    const key=`request:${index}:${symbol}:${timeframe}:${field}:${offset}`;
    if (this.dataMemo.has(key)) return this.dataMemo.get(key) as number|null;
    const request: CoreSpiritDataRequest = { symbol,timeframe,field,offset };
    const value = resolverAt ? resolverAt(request,this.dataResolutionContext(index, 'last-confirmed')) : resolver!(request);
    if(value && typeof (value as any).then==='function') return null;
    const snapshot=value as CoreSpiritDataSnapshot | undefined;
    const asOf=this.dataResolutionContext(index).asOfTimestamp;
    if (snapshot?.timestamp != null && Number(snapshot.timestamp) > asOf) return null;
    const resolved=(snapshot?.value ?? null); this.dataMemo.set(key,resolved); return resolved;
  }

  private resolveDataSeries(ref:any, field:any, index:number, length:number): number[]|null {
    const symbol = ref.__coreSpiritDataRef === 'market' ? String(ref.symbol) : this.executionContext.symbol;
    const timeframe = ref.__coreSpiritDataRef === 'timeframe' ? String(ref.timeframe) : this.executionContext.timeframe;
    const resolver=this.dataResolver?.series;
    if (resolver) {
      const request: CoreSpiritDataRequest={symbol,timeframe,field,offset:0};
      const values=resolver(request,this.dataResolutionContext(index,'last-confirmed'));
      if(values && typeof (values as any).then==='function') return null;
      const series=(values as number[]).filter(Number.isFinite);
      return series.length ? series : null;
    }
    const values:number[]=[];
    const max=Math.max(1,Math.floor(length));
    for (let offset=0; offset<max; offset++) {
      const request: CoreSpiritDataRequest={symbol,timeframe,field,offset};
      const resolverAt=this.dataResolver?.requestAt;
      const resolverCurrent=this.dataResolver?.request;
      if (!resolverAt && !resolverCurrent) break;
      const snapshot=resolverAt ? resolverAt(request,this.dataResolutionContext(index,'last-confirmed')) : resolverCurrent!(request);
      if(snapshot && typeof (snapshot as any).then==='function') return null;
      const resolved=snapshot as CoreSpiritDataSnapshot | undefined;
      if (resolved?.timestamp != null && Number(resolved.timestamp) > this.dataResolutionContext(index).asOfTimestamp) return null;
      const value=Number(resolved?.value);
      if (Number.isFinite(value)) values.push(value);
    }
    return values.length ? values.reverse() : null;
  }

  private getRuntimeRefFromCallArg(refRegister:string): any {
    const locals:any=this.state.locals[refRegister];
    if (locals?.__coreSpiritDataRef) return locals;
    return this.lastRuntimeCallRefs.get(refRegister);
  }

  private readonly lastRuntimeCallRefs = new Map<string, any>();

  private dataSeriesKey(ref:any, field:string): string {
    if (ref?.__coreSpiritDataRef === 'market') return `market:${String(ref.symbol)}:${this.executionContext.timeframe}:${field}`;
    if (ref?.__coreSpiritDataRef === 'timeframe') return `timeframe:${this.executionContext.symbol}:${String(ref.timeframe)}:${field}`;
    return `data:${field}`;
  }


  private window(name:string,length:number,bars:CoreSpiritMarketBar[],index:number):number[] { const out:number[]=[];for(let i=index;i>=Math.max(0,index-length+1);i--){const v=Number(name==='time'?this.toEpoch(bars[i].timestamp):(bars[i] as any)[name]);if(Number.isFinite(v))out.push(v);}return out; }

  private loadIndexedValue(name:string,index:number,bar:CoreSpiritMarketBar,bars:CoreSpiritMarketBar[],barIndex:number):number|null|CoreSpiritValue {
    if (!Number.isInteger(index) || index < 0) throw new Error(`future indexing is not allowed for ${name}[${index}]`);
    if (index > barIndex) return null;
    if (['open','high','low','close','volume','time'].includes(name)) return this.loadSeries(name,index,bar,bars,barIndex);
    const values = this.state.localSeries[name] || [];
    const position = values.length - 1 - index;
    return position >= 0 ? values[position] ?? null : null;
  }

  private pushLocalState(key:string,value:CoreSpiritValue):void { const a=this.state.localSeries[key]||[]; a.push(value); if(a.length>this.stateHistoryLimit)a.splice(0,a.length-this.stateHistoryLimit); this.state.localSeries[key]=a; }
  private sessionDay(timestamp:string):string { const d=new Date(timestamp); return new Intl.DateTimeFormat('en-CA',{timeZone:this.timezone}).format(d); }
  private averageGain(series:string,length:number,bars:CoreSpiritMarketBar[],index:number):number { let total=0; for(let i=index-length+1;i<=index;i++){ if(i<=0)continue; const c=Number((bars[i] as any)[series]),p=Number((bars[i-1] as any)[series]); total+=Math.max(0,c-p); } return total/length; }
  private averageLoss(series:string,length:number,bars:CoreSpiritMarketBar[],index:number):number { let total=0; for(let i=index-length+1;i<=index;i++){ if(i<=0)continue; const c=Number((bars[i] as any)[series]),p=Number((bars[i-1] as any)[series]); total+=Math.max(0,p-c); } return total/length; }

  private emitIntent(kind:Extract<CoreSpiritIrInstruction,{op:'emit'}>['kind'],args:unknown[],bar:CoreSpiritMarketBar,barIndex:number,outputs:CoreSpiritObject[],diagnostics:string[],outputId?:string):void {
    const visualKinds = new Set(['plot','marker','label','labelAt','line','zone','box','band','fill','gradient','arrow','shape','heatmap','polyline','hline','bg','barcolor','table']);
    if (visualKinds.has(kind)) this.requireTargetCapability('visuals');
    if (kind === 'signal') this.requireTargetCapability('signals');
    if (kind === 'entry' || kind === 'exit') this.requireTargetCapability('order-intents');
    if (kind === 'buy' || kind === 'sell') this.requireTargetCapability('order-intents');
    if (kind === 'alert' || kind === 'webhook') this.requireTargetCapability('webhooks');
    if (kind === 'scanCandidate') this.requireTargetCapability('candidate-emission');

    if ((kind === 'entry' || kind === 'exit') && this.options.layer !== 'strategy' && this.options.layer !== 'automation') {
      throw new Error(`execution primitive '${kind}' is blocked for ${this.options.layer} layer; emit a signal and let automation handle risk`);
    }
    if ((kind === 'buy' || kind === 'sell') && this.options.layer !== 'automation') {
      throw new Error(`${kind} is automation-only; scripts, models and strategies must stop at the signal/strategy boundary`);
    }
    const time=this.toEpoch(bar.timestamp);
    if (++this.outputCount > this.maxOutputsPerBar) throw new Error(`output limit exceeded (${this.maxOutputsPerBar})`);
    const finite = (v:unknown) => Number.isFinite(Number(v));
    const num = (v:unknown) => Number(v);
    const color = (v:unknown, fallback:string) => typeof v === 'string' && v ? v : fallback;
    try {
      if(kind==='plot'){
        const value=args[0] == null ? null : Number(args[0]);
        const seriesId=outputId ? `${this.options.sourceId}:${outputId}` : `${this.options.sourceId}:plot:${this.plotOrdinal++}`;
        const style={color:typeof args[1]==='string'?args[1]:undefined,lineWidth:Number.isFinite(Number(args[2]))?Math.max(1,Math.min(5,Number(args[2]))):2,lineStyle:Number.isFinite(Number(args[3]))?Number(args[3]):0,title:typeof args[4]==='string'?args[4]:undefined,priceLineVisible:false,lastValueVisible:true};
        outputs.push({kind:'series',time,value:value !== null && Number.isFinite(value)?value:null,seriesId,style});
      }
      else if(kind==='marker'){
        const price=Number(args[1]??args[0]);
        if(Number.isFinite(price)) outputs.push({kind:'marker',id:`${this.options.sourceId}:marker:${barIndex}`,time:Number(args[0])||time,price,metadata:{source:this.options.sourceId,barIndex}});
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
        if(Number.isFinite(a.price)&&Number.isFinite(b.price)) {
          const colorArg = args.find((value, i) => i >= 4 && typeof value === 'string');
          const widthArg = args.find((value, i) => i >= 4 && typeof value === 'number');
          const metadataArg = args.find((value, i) => i >= 4 && value !== null && typeof value === 'object') as Record<string,unknown> | undefined;
          const widthValue = widthArg === undefined ? 1 : Math.max(1, Math.min(6, num(widthArg)));
          outputs.push({kind:'line',id:`${this.options.sourceId}:line:${outputId||barIndex}`,start:a,end:b,style:{source:this.options.sourceId,color:color(colorArg,'#f59e0b'),lineWidth:widthValue},metadata:metadataArg});
        }
      }
      else if(kind==='zone'){
        const left=num(args[0])||time,right=num(args[1])||time,top=num(args[2]),bottom=num(args[3]);
        if([left,right,top,bottom].every(Number.isFinite)) outputs.push({kind:'zone',id:`${this.options.sourceId}:zone:${outputId||barIndex}`,left,right,top,bottom,state:'active',style:{color:color(args[4],'#38bdf8'),fillColor:color(args[5],color(args[4],'#38bdf8')),fillOpacity:Number.isFinite(Number(args[6]))?Math.max(0,Math.min(1,num(args[6]))):0.12,pattern:(typeof args[7]==='string'?args[7]:'solid') as any}});
      }
      else if(kind==='box'){
        const left=num(args[0])||time,right=num(args[1])||time,top=num(args[2]),bottom=num(args[3]);
        if([left,right,top,bottom].every(Number.isFinite)) outputs.push({kind:'box',id:`${this.options.sourceId}:box:${outputId||barIndex}`,left,right,top,bottom,style:{fillColor:color(args[4],'#2563eb'),color:color(args[5],'#2563eb'),fillOpacity:Number.isFinite(Number(args[6]))?Math.max(0,Math.min(1,num(args[6]))):0.16,pattern:(typeof args[7]==='string'?args[7]:'solid') as any}});
      }
      else if(kind==='band'||kind==='fill'||kind==='gradient'){
        const top=num(args[0]),bottom=num(args[1]);
        if(finite(top)&&finite(bottom)){
          const c1=color(args[2],kind==='gradient'?'#38bdf8':'#2563eb');
          const c2=kind==='gradient'?color(args[3],'#8b5cf6'):c1;
          const opacity=Number.isFinite(Number(kind==='gradient'?args[4]:args[3]))?Math.max(0,Math.min(1,num(kind==='gradient'?args[4]:args[3]))):0.16;
          outputs.push({kind:'band',id:`${this.options.sourceId}:band:${outputId||barIndex}`,time,top,bottom,style:{fillColor:c1,fillColor2:c2,color:c1,fillOpacity:opacity,opacity}});
        }
      }
      else if(kind==='arrow'){
        const a={time:num(args[0])||time,price:num(args[1])},b={time:num(args[2])||time,price:num(args[3])};
        if([a.time,a.price,b.time,b.price].every(Number.isFinite)) outputs.push({kind:'arrow',id:`${this.options.sourceId}:arrow:${outputId||barIndex}`,start:a,end:b,style:{color:color(args[4],'#f59e0b'),lineWidth:Number.isFinite(Number(args[5]))?Math.max(1,Math.min(8,num(args[5]))):2}});
      }
      else if(kind==='shape'||kind==='heatmap'){
        const price=num(args[0]),shape=kind==='heatmap'?'square':String(args[1]||'circle') as any;
        if(finite(price)){ const intensity=kind==='heatmap'?Math.max(0,Math.min(1,Math.abs(num(args[1])))):1; outputs.push({kind:'shape',id:`${this.options.sourceId}:shape:${outputId||barIndex}`,time,price,shape,style:{color:color(kind==='heatmap'?args[2]:args[2],'#f59e0b'),fillColor:color(args[2],'#f59e0b'),opacity:kind==='heatmap'?Math.max(.08,intensity):1,size:Number.isFinite(Number(kind==='heatmap'?args[3]:args[3]))?Math.max(4,Math.min(40,num(args[3])||10)):10,text:typeof args[4]==='string'?args[4]:undefined}}); }
      }
      else if(kind==='polyline'){
        const points: {time:number;price:number}[]=[]; let i=0;
        while(i+1<args.length && typeof args[i] !== 'string' && Number.isFinite(num(args[i])) && Number.isFinite(num(args[i+1])) && points.length<8){ points.push({time:num(args[i]),price:num(args[i+1])}); i+=2; }
        const stroke=color(args[i],'#38bdf8'); const width=Number.isFinite(num(args[i+1]))?Math.max(1,Math.min(8,num(args[i+1]))):2;
        if(points.length>=2) outputs.push({kind:'polyline',id:`${this.options.sourceId}:polyline:${outputId||barIndex}`,points,style:{color:stroke,lineWidth:width,pattern:(typeof args[i+2]==='string'?args[i+2]:'solid') as any}});
      }
      else if(kind==='hline'){
        const price=num(args[0]); if(Number.isFinite(price)) outputs.push({kind:'hline',id:`${this.options.sourceId}:hline:${outputId||barIndex}`,price,style:{color:color(args[1],'#64748b'),lineWidth:Number.isFinite(num(args[2]))?Math.max(1,Math.min(6,num(args[2]))):1,lineStyle:Number.isFinite(num(args[3]))?num(args[3]):0}});
      }
      else if(kind==='bg' || kind==='barcolor'){
        const c=color(args[0],'#2563eb'), opacity=Number.isFinite(num(args[1]))?Math.max(0,Math.min(1,num(args[1]))):0.12;
        outputs.push({kind:kind==='bg'?'background':'barcolor',id:`${this.options.sourceId}:${kind}:${barIndex}`,time,color:c,opacity,metadata:{barIndex,source:this.options.sourceId}} as any);
      }
      else if(kind==='table'){
        const position=String(args[0]||'topRight') as any, row=Math.max(0,Math.floor(num(args[1]))), column=Math.max(0,Math.floor(num(args[2]))), text=String(args[3]??'');
        outputs.push({kind:'table',id:`${this.options.sourceId}:table:${position}:${row}:${column}:${outputId||barIndex}`,position,row,column,text,style:{background:color(args[4],'rgba(15,23,42,.88)'),color:color(args[5],'#fff'),fontSize:Number.isFinite(num(args[6]))?Math.max(8,Math.min(32,num(args[6]))):12},metadata:{source:this.options.sourceId}});
      }
      else if(kind==='scanCandidate'){
        const score = Number(args[0]);
        if(!Number.isFinite(score)) throw new Error('scanCandidate requires a finite score');
        const label = args.length > 1 && args[1] != null ? String(args[1]) : undefined;
        const metadata = args.length > 2 && args[2] && typeof args[2] === 'object' ? args[2] as Record<string, unknown> : undefined;
        const id = `${this.options.sourceId}:candidate:${barIndex}:${this.executionRevision}:${this.outputCount}`;
        outputs.push({ kind:'scanCandidate', id, time, score, label, metadata });
      }
      else if(kind==='signal'){
        // Boolean signal conditions are output gates; string signals remain named events.
        if(typeof args[0]==='boolean' && !args[0]) return;
        const type=typeof args[0]==='boolean' ? 'signal' : String(args[0]??'signal');
        const runtimeLocals=Object.fromEntries(Object.entries(this.state.locals).filter(([,value]) => value == null || ['number','string','boolean'].includes(typeof value)));
        const explanationFacts=Object.entries(runtimeLocals).map(([label,value]) => ({ id:`local:${label}`, label, value, category:'indicator' }));
        const signalId=`${this.options.sourceId}:signal:${barIndex}:${this.executionRevision}:${type}`;
        const metadata={
          source:this.options.sourceId,
          barIndex,
          runId:this.executionContext.runId,
          symbol:this.options.symbol,
          timeframe:this.options.timeframe,
          revision:this.executionRevision,
          confirmed:this.state.barState.isConfirmed,
          outputId,
          signalId,
          reason:`Signal ${type} emitted by ${this.options.sourceId}`,
          explanationFacts,
          runtimeLocals,
        };
        outputs.push({kind:'signal',time,type,metadata});
        this.bus.emit('script.signal',{scriptId:this.options.sourceId,time,type,metadata});
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
        const intent={kind:'orderIntent' as const,id,time,side:normalizedSide,confidence,stop,target,tag,metadata:{source:this.options.sourceId,barIndex,mode:this.executionContext.mode,sourceLayer:this.options.layer,runId:this.executionContext.runId}};
        outputs.push(intent);
        this.bus.emit('execution.intent',{source:this.options.sourceId,payload:intent});
      }
      else if(kind==='exit') {
        const condition=Boolean(args[0]); if(!condition) return;
        const tag=typeof args[1]==='string'?args[1]:undefined;
        const intent={kind:'orderIntent' as const,id:`${this.options.sourceId}:exit:${barIndex}:${tag||'exit'}`,time,side:'flat' as const,confidence:1,stop:null,target:null,tag,metadata:{source:this.options.sourceId,barIndex,exit:true,mode:this.executionContext.mode}};
        outputs.push(intent);
        this.bus.emit('execution.intent',{source:this.options.sourceId,payload:intent});
      }
      else if(kind==='buy' || kind==='sell') {
        if(this.options.layer !== 'automation') throw new Error(`${kind} is automation-only; use signal/entry/exit upstream`);
        const quantity=Number(args[0]);
        const tag=typeof args[1]==='string'?args[1]:undefined;
        const confidence=Number.isFinite(Number(args[2]))?Math.max(0,Math.min(1,Number(args[2]))):1;
        const side=kind==='buy'?'long':'short' as 'long'|'short';
        const intent={kind:'orderIntent' as const,id:`${this.options.sourceId}:${kind}:${barIndex}:${tag||kind}`,time,side,confidence,stop:null,target:null,tag,metadata:{source:this.options.sourceId,barIndex,mode:this.executionContext.mode,quantity:Number.isFinite(quantity)?quantity:undefined}};
        outputs.push(intent);
        this.bus.emit('execution.intent',{source:this.options.sourceId,payload:intent});
      }
      else if(kind==='alert') this.bus.emit('script.alert',{scriptId:this.options.sourceId,time,payload:{args,barIndex}});
      else if(kind==='webhook') this.bus.emit('script.webhook',{scriptId:this.options.sourceId,time,endpoint:typeof args[0]==='string'?args[0]:undefined,payload:{args:typeof args[0]==='string'?args.slice(1):args,barIndex}});
    } catch(error) { diagnostics.push(`output ${kind} at bar ${barIndex}: ${error instanceof Error?error.message:String(error)}`); }
  }
  private pushState(key:string,value:number|string):void { const a=this.state.seriesState[key]||[];a.push(Number(value));if(a.length>this.stateHistoryLimit)a.splice(0,a.length-this.stateHistoryLimit);this.state.seriesState[key]=a; }
  private unary(operator:string,value:unknown):unknown { if(operator==='!')return !this.truthy(value);if(operator==='+')return Number(value);return -Number(value); }
  private binary(operator:string,left:unknown,right:unknown):unknown { if(['+','-','*','/','%','<','<=','>','>='].includes(operator)&&(left==null||right==null))return null;switch(operator){case'+':return Number(left)+Number(right);case'-':return Number(left)-Number(right);case'*':return Number(left)*Number(right);case'/':return Number(right)===0?null:Number(left)/Number(right);case'%':return Number(left)%Number(right);case'==':return left===right;case'!=':return left!==right;case'<':return Number(left)<Number(right);case'<=':return Number(left)<=Number(right);case'>':return Number(left)>Number(right);case'>=':return Number(left)>=Number(right);case'and':return this.truthy(left)&&this.truthy(right);case'or':return this.truthy(left)||this.truthy(right);default:return null;} }
  private truthy(value:unknown):boolean{return Boolean(value);}
  private validateBar(bar: CoreSpiritMarketBar): void {
    const values = [bar.open, bar.high, bar.low, bar.close, bar.volume];
    if (!values.every(v => Number.isFinite(Number(v)))) throw new Error('CoreSpirit received a non-finite OHLCV bar');
    if (Number(bar.high) < Number(bar.low)) throw new Error('CoreSpirit received an invalid bar: high < low');
    const t = this.toEpoch(bar.timestamp);
    if (!Number.isFinite(t) || t <= 0) throw new Error('CoreSpirit received an invalid bar timestamp');
    const last = this.history[this.history.length - 1];
    if (last && t < this.toEpoch(last.timestamp)) throw new Error('CoreSpirit bars must be chronological');
  }

  private throwIfAborted(): void { if (this.abortSignal?.aborted) throw new DOMException('CoreSpirit execution aborted', 'AbortError'); }
  private toEpoch(timestamp:string):number{const n=Number(timestamp);if(Number.isFinite(n))return n>1e12?Math.floor(n/1000):n;const parsed=Date.parse(timestamp);return Number.isFinite(parsed)?Math.floor(parsed/1000):0;}
}
export const coreSpiritRuntime = new CoreSpiritRuntime();

function cloneNumberMap(input:Record<string,number[]>):Record<string,number[]>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,[...v]])); }
function cloneValueMap<T=any>(input:Record<string,T[]>):Record<string,T[]>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,[...v]])) as Record<string,T[]>; }
function cloneCrossMap(input:Record<string,{a:number;b:number}>):Record<string,{a:number;b:number}>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,{...v}])); }

function diffBarInputs(previous: CoreSpiritMarketBar, next: CoreSpiritMarketBar): string[] {
  const changed: string[] = [];
  if (Number(previous.open) !== Number(next.open)) changed.push('open');
  if (Number(previous.high) !== Number(next.high)) changed.push('high');
  if (Number(previous.low) !== Number(next.low)) changed.push('low');
  if (Number(previous.close) !== Number(next.close)) changed.push('close');
  if (Number(previous.volume) !== Number(next.volume)) changed.push('volume');
  if (previous.timestamp !== next.timestamp) changed.push('time');
  if (!changed.length) changed.push('bar_index');
  return changed;
}

function safeJson(value: string): unknown { try { return JSON.parse(value); } catch { return value; } }
