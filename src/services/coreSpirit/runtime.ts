import type { HistoricalCandle } from './types';
import type { CoreSpiritMarketFrame } from './marketData';
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
import type { CoreSpiritExecutionContext, CoreSpiritExecutionMode, CoreSpiritDataResolver, CoreSpiritTick, CoreSpiritFootprint, CoreSpiritIntrabar, CoreSpiritDataRequest, CoreSpiritDataSnapshot, CoreSpiritDataResolutionContext, CoreSpiritDataAlignment } from './types';
import type { CoreSpiritWorkspaceSlot, CoreSpiritWorkspaceWidgetKind } from './visualApp';
import type { CoreSpiritChartAreaKind } from './visualCoordinates';
import type { CoreSpiritSurfaceDeclaration } from './languageConcepts';
import { ATRState, RSIState, VWAPSessionState } from './statefulIndicatorKernel';
import { RollingBetaState, RollingCorrelationState, detectQuantRegime } from './quantKernels';
import { CoreSpiritGaussianHMM, coreSpiritDataset, coreSpiritIdentity, coreSpiritMatrix, coreSpiritMatrixAdd, coreSpiritMatrixMultiply, coreSpiritMatrixScale, coreSpiritMatrixTranspose, coreSpiritTensor, coreSpiritVector, coreSpiritVectorDot, coreSpiritZeros, type CoreSpiritDatasetRow } from './quantMath';
import { createCoreSpiritOrderIntent, normalizeCoreSpiritOrderDirection, normalizeCoreSpiritOrderSizing } from './orderIntent';
import { planCoreSpiritSeriesFusion, type CoreSpiritSeriesFusionPlan } from './seriesFusion';
import { CoreSpiritFusedSeriesCursor, type CoreSpiritSeriesOperationName } from './seriesVector';
import { CoreSpiritExecutionVM } from './executionVM';
import type { CoreSpiritExecutionVMHost } from './executionVM';
import { CoreSpiritOptimizedExecutionVM, type CoreSpiritExecutionCacheVersions } from './optimizedExecutionVM';
import { coreSpiritComponentRegistry } from './coreSpiritComponents';
import { CORE_SPIRIT_STDLIB } from './standardLibrary';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_OPTIMIZER_ABI, CORE_SPIRIT_RUNTIME_VERSION } from './VERSION';
import type { CoreSpiritValueStore } from './executionValueStore';
import type { CoreSpiritExecutionTier } from './executionTier';
import { CoreSpiritStateStore } from './stateStore';
import { CoreSpiritOutputCollector } from './outputCollector';
import { CoreSpiritEventRouter } from './eventRouter';
import { CoreSpiritCapabilityHost } from './capabilityHost';
import { CoreSpiritDebugHost } from './debugHost';
import { CoreSpiritSeriesRegistry, type CoreSpiritSeriesId } from './seriesRegistry';
import { CoreSpiritProfiler, type CoreSpiritProfilerOptions, type CoreSpiritProfilerSnapshot } from './profiler';
import { buildCoreSpiritDirtyGraph, CoreSpiritDirtyGraph, dirtySourcesForBar, type CoreSpiritDirtyExecutionPlan } from './dirtyGraph';
import { CoreSpiritColumnarHistory } from './columnarMarketData';
import { CoreSpiritKernelSnapshotStore, type CoreSpiritKernelSnapshot, type CoreSpiritKernelSnapshotIdentity } from './kernelStateSnapshots';
import { CoreSpiritCapabilitySandbox, validateCoreScriptCapabilitiesAgainstSandbox } from './capabilitySandbox';
import { validateSynchronizedSnapshot } from './multiSymbolTimeframe';

export type CoreSpiritModelOutputResolver = (input: { modelName:string; field:string; binding?: { kind:string; locator:string }; inputs?: Readonly<Record<string,unknown>> }) => unknown;
export type CoreSpiritModelPredictionResolver = (input: { modelName:string; field:'prediction'|'probability'; inputs:Readonly<Record<string,unknown>> }) => unknown;
export type CoreSpiritRiskResolver = (input: { action:string; symbol:string; quantity?:number; sourceId:string; timestamp:number }) => boolean;
export type CoreSpiritHMMArtifactResolver = (modelName: string) => CoreSpiritGaussianHMM | undefined;
export type CoreSpiritRuntimeOptions = {
  symbol?: string; timeframe?: string; sourceId?: string; maxStepsPerBar?: number;
  timezone?: string; stateHistoryLimit?: number; maxOutputsPerBar?: number; maxHistoryBars?: number; executionMode?: CoreSpiritExecutionMode; runId?: string; abortSignal?: AbortSignal; dataResolver?: CoreSpiritDataResolver; executionPolicy?: CoreSpiritExecutionContext['policy'];
  layer?: CoreSpiritProgramLayer; executionTarget?: CoreSpiritExecutionTarget; reactiveExecution?: boolean; executionTier?: CoreSpiritExecutionTier;
  modelOutputResolver?: CoreSpiritModelOutputResolver;
  modelPredictionResolver?: CoreSpiritModelPredictionResolver;
  /** HMM fitting is disabled in chart runtimes; only explicit research jobs may enable it. */
  modelTrainingMode?: 'disabled' | 'research';
  /** Supplies a preloaded immutable HMM artifact for inference-only chart execution. */
  hmmArtifactResolver?: CoreSpiritHMMArtifactResolver;
  riskResolver?: CoreSpiritRiskResolver;
  eventResolver?: (eventName:string) => boolean | unknown;
  profiler?: CoreSpiritProfilerOptions;
  visibleRange?: { from:number; to:number };
  inputValues?: Readonly<Record<string, CoreSpiritValue>>;
  propValues?: Readonly<Record<string, CoreSpiritValue>>;
  /** Read-only recomputation (viewport/backfill refresh) must not emit execution or external event side effects. */
  suppressExternalEffects?: boolean;
  /** Zero-copy numeric inputs for quant/ML feature adapters. */
  marketFrame?: () => CoreSpiritMarketFrame;
};
export type CoreSpiritKernelState =
  | { family:'fused'; state:CoreSpiritFusedSeriesCursor }
  | { family:'direct'; state:CoreSpiritFusedSeriesCursor }
  | { family:'rsi'; state:RSIState }
  | { family:'atr'; state:ATRState }
  | { family:'vwap'; state:VWAPSessionState }
  | { family:'beta'; state:RollingBetaState }
  | { family:'trend'; state:RollingCorrelationState };

function cloneCoreSpiritKernelState(value: CoreSpiritKernelState): CoreSpiritKernelState {
  switch (value.family) {
    case 'fused': return { family:'fused', state:value.state.clone() };
    case 'direct': return { family:'direct', state:value.state.clone() };
    case 'rsi': return { family:'rsi', state:value.state.clone() };
    case 'atr': return { family:'atr', state:value.state.clone() };
    case 'vwap': return { family:'vwap', state:value.state.clone() };
    case 'beta': return { family:'beta', state:value.state.clone() };
    case 'trend': return { family:'trend', state:value.state.clone() };
  }
}

function copyCoreSpiritKernelState(target: CoreSpiritKernelState, source: CoreSpiritKernelState): void {
  if (target.family !== source.family) throw new Error(`CoreSpirit kernel snapshot family mismatch: ${target.family} !== ${source.family}`);
  // The family equality guard above establishes matching runtime variants;
  // explicit casts let TypeScript preserve that invariant across two unions.
  switch (target.family) {
    case 'fused': target.state.copyFrom(source.state as CoreSpiritFusedSeriesCursor); break;
    case 'direct': target.state.copyFrom(source.state as CoreSpiritFusedSeriesCursor); break;
    case 'rsi': target.state.copyFrom(source.state as RSIState); break;
    case 'atr': target.state.copyFrom(source.state as ATRState); break;
    case 'vwap': target.state.copyFrom(source.state as VWAPSessionState); break;
    case 'beta': target.state.copyFrom(source.state as RollingBetaState); break;
    case 'trend': target.state.copyFrom(source.state as RollingCorrelationState); break;
  }
}

// This fingerprint covers the statically declared builtin contract surface. Implementation
// changes must also bump CORE_SPIRIT_COMPILER_VERSION; dynamic component changes have their
// own monotonically increasing registry definitionVersion.
function fingerprintExecutionDefinition(value: string): string {
  // Two small independent rolling hashes keep the hot-bar cache-version token compact.
  // The compiler release token remains the authoritative invalidation for implementation changes.
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}-${value.length}`;
}

const CORE_SPIRIT_STATIC_BUILTIN_DEFINITION_VERSION = fingerprintExecutionDefinition(
  CORE_SPIRIT_STDLIB.map((builtin) => [
    builtin.name,
    builtin.minArgs,
    builtin.maxArgs ?? '',
    JSON.stringify(builtin.returnType),
    builtin.pure,
    builtin.capability ?? '',
    builtin.emitKind ?? '',
    builtin.category,
    JSON.stringify(builtin.seriesExecution ?? null),
    JSON.stringify(builtin.temporalSafety ?? null),
  ].join(':')).join('|'),
);

function fingerprintExecutionConfiguration(value: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(value, (_key, item) => typeof item === 'function' ? '[function]' : item) ?? String(value);
  } catch {
    serialized = Object.prototype.toString.call(value);
  }
  return fingerprintExecutionDefinition(serialized);
}

function componentSignatureForIr(ir: CoreSpiritIrProgram): string {
  const signature = ir.entry.instructions.flatMap((instruction) => instruction.op === 'call' ? [[
    instruction.name,
    instruction.componentId ?? '',
    instruction.componentPure ?? '',
    instruction.componentStateful ?? '',
    instruction.componentDeterministic ?? '',
    ...(instruction.seriesArgs ?? []),
    ...(instruction.seriesSources ?? []).flatMap(source => [source.ref, source.field]),
  ].map(String).join(':')] : []).join('|');
  return fingerprintExecutionDefinition(signature);
}

export type CoreSpiritRuntimeState = {
  barIndex: number; time: number; locals: Record<string, unknown>; seriesState: Record<string, number[]>; localSeries: Record<string, Array<number | boolean | string | null>>; barState: { index:number; time:number; isFirst:boolean; isLast:boolean; isRealtime:boolean; isConfirmed:boolean; revision:number; symbol:string; timeframe:string; mode:CoreSpiritExecutionMode };
  workspaceState: { ui: CoreSpiritUiState; app: CoreSpiritVisualAppState; visuals: CoreSpiritDeclarativeVisualState };
};
export type CoreSpiritExecutionResult = { outputs: CoreSpiritObject[]; state: CoreSpiritRuntimeState; diagnostics: string[] };

function candleTimeMillis(value: HistoricalCandle['timestamp']): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric >= 1e11 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function visibleVpvrPoc(
  bars: readonly HistoricalCandle[],
  visibleRange: { from:number; to:number } | undefined,
  rows: number,
): number | null {
  if (!bars.length) return null;
  let from = 0;
  let to = bars.length;
  if (visibleRange && Number.isFinite(visibleRange.from) && Number.isFinite(visibleRange.to)) {
    const left = Math.min(visibleRange.from, visibleRange.to);
    const right = Math.max(visibleRange.from, visibleRange.to);
    while (from < bars.length && candleTimeMillis(bars[from]!.timestamp) < left) from += 1;
    to = from;
    while (to < bars.length && candleTimeMillis(bars[to]!.timestamp) <= right) to += 1;
  }
  if (to <= from) return null;

  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (let i=from;i<to;i+=1) {
    const bar=bars[i]!;
    low=Math.min(low,Number(bar.low));
    high=Math.max(high,Number(bar.high));
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (high <= low) return low;

  const safeRows=Math.max(2,Math.min(400,Math.floor(rows)));
  const bins=new Float64Array(safeRows);
  const width=(high-low)/safeRows;
  for(let i=from;i<to;i+=1){
    const bar=bars[i]!;
    const volume=Math.max(0,Number(bar.volume)||0);
    if(volume<=0)continue;
    const typical=(Number(bar.high)+Number(bar.low)+Number(bar.close))/3;
    const index=Math.max(0,Math.min(safeRows-1,Math.floor((typical-low)/width)));
    bins[index]+=volume;
  }
  let poc=0;
  for(let i=1;i<bins.length;i+=1)if(bins[i]!>bins[poc]!)poc=i;
  return low+(poc+0.5)*width;
}

/** Stateful, chronological CoreSpirit executor. No DOM, network or broker APIs are exposed here. */
export class CoreSpiritRuntime {
  private readonly dataResolver?: CoreSpiritDataResolver;
  private marketFrameResolver?: () => CoreSpiritMarketFrame;
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
  private readonly modelPredictionResolver?: CoreSpiritModelPredictionResolver;
  private readonly modelTrainingMode: 'disabled' | 'research';
  private readonly hmmArtifactResolver?: CoreSpiritHMMArtifactResolver;
  private readonly riskResolver?: CoreSpiritRiskResolver;
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
  /** Direct stateful built-ins that are not absorbed into a fusion group. */
  private readonly directKernelCursors = new Map<string, CoreSpiritFusedSeriesCursor>();
  private readonly rsiKernels = new Map<string, RSIState>();
  private readonly atrKernels = new Map<string, ATRState>();
  private readonly vwapKernels = new Map<string, VWAPSessionState>();
  private readonly betaKernels = new Map<string, RollingBetaState>();
  private readonly trendStrengthKernels = new Map<string, RollingCorrelationState>();
  private readonly hmmModels = new Map<string, { signature:string; model:CoreSpiritGaussianHMM }>();
  /**
   * Bounded confirmed-bar checkpoints. The fast hot path restores only the
   * stateful kernels that the dirty graph says are affected by the forming bar.
   */
  private readonly kernelStateSnapshots = new CoreSpiritKernelSnapshotStore<CoreSpiritKernelState>(4);
  private readonly kernelNodeIdentities = new Map<string, { nodeId:string; inputDependencies:readonly string[] }>();
  /** Changes only when the loaded/history generation is rebuilt, not on forming-bar ticks. */
  private kernelDataRevision = 0;
  private readonly recoveryStats = {
    barsReused: 0,
    barsReplayed: 0,
    checkpointsRestored: 0,
    checkpointRestoreFailures: 0,
    fullReplayFallbacks: 0,
    lastReplayFrom: 0,
  };
  private realtimeTransactionId?: string;
  private readonly executionVm = new CoreSpiritExecutionVM();
  private readonly optimizedExecutionVm = new CoreSpiritOptimizedExecutionVM();
  /** Stable per-runtime key lets the optimized VM retain registers across ticks without crossing runtimes. */
  private readonly optimizedExecutionContextKey = {};
  private optimizedComponentDefinitionSignature = '';
  private readonly executionTier: Exclude<CoreSpiritExecutionTier, 'auto'>;
  private readonly inputValues: Readonly<Record<string, CoreSpiritValue>>;
  private readonly propValues: Readonly<Record<string, CoreSpiritValue>>;
  private suppressExternalEffects: boolean;
  private visibleRange?: { from:number; to:number };
  private readonly viewportMemo = new Map<string, number | null>();
  private readonly stateStore = new CoreSpiritStateStore();
  /** Numeric IDs are stable for one loaded runtime/program. Names are resolved only during lowering. */
  private readonly seriesRegistry: CoreSpiritSeriesRegistry = this.stateStore.series;
  private readonly outputCollector: CoreSpiritOutputCollector;
  private readonly eventRouter: CoreSpiritEventRouter;
  private readonly capabilityHost: CoreSpiritCapabilityHost;
  private readonly debugHost = new CoreSpiritDebugHost();
  private readonly profiler: CoreSpiritProfiler;
  private dirtyGraph?: CoreSpiritDirtyGraph;
  private lastDirtyPlan?: CoreSpiritDirtyExecutionPlan;
  private readonly columnarHistory = new CoreSpiritColumnarHistory();
  private readonly realtimeDirtyInstructions = new Set<number>();
  private committedSeriesState: Record<string, number[]> = {};
  private committedLocalSeries: Record<string, CoreSpiritValue[]> = {};
  private committedCrossState: Record<string, { a:number; b:number }> = {};

  constructor(options: CoreSpiritRuntimeOptions = {}, bus: CoreEventBus = coreEventBus) {
    this.dataResolver = options.dataResolver;
    this.marketFrameResolver = options.marketFrame;
    this.profiler = new CoreSpiritProfiler(options.profiler);
    this.modelOutputResolver = options.modelOutputResolver;
    this.modelPredictionResolver = options.modelPredictionResolver;
    this.modelTrainingMode = options.modelTrainingMode === 'research' ? 'research' : 'disabled';
    this.hmmArtifactResolver = options.hmmArtifactResolver;
    this.riskResolver = options.riskResolver;
    this.inputValues = Object.freeze({ ...(options.inputValues ?? {}) });
    this.propValues = Object.freeze({ ...(options.propValues ?? {}) });
    this.suppressExternalEffects = options.suppressExternalEffects === true;
    this.visibleRange = options.visibleRange ? { from:Number(options.visibleRange.from), to:Number(options.visibleRange.to) } : undefined;
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

  private updateOptimizedComponentDefinitionSignature(ir: CoreSpiritIrProgram): void {
    this.optimizedComponentDefinitionSignature = componentSignatureForIr(ir);
  }

  /**
   * Pass release, registry and execution-policy identity into the actual VM calls.
   * Registry revisions are read dynamically, so registering/unregistering a component
   * between bars invalidates its cached lowered plan before it can be reused.
   */
  private optimizedExecutionCacheVersions(): CoreSpiritExecutionCacheVersions {
    return {
      compilerVersion: [
        CORE_SPIRIT_COMPILER_VERSION,
        CORE_SPIRIT_RUNTIME_VERSION,
        `ir-${this.compiledIr?.version ?? 1}`,
        `optimizer-${CORE_SPIRIT_OPTIMIZER_ABI}`,
      ].join(':'),
      componentDefinitionVersion: [
        CORE_SPIRIT_STATIC_BUILTIN_DEFINITION_VERSION,
        `registry-${coreSpiritComponentRegistry.definitionVersion}`,
        this.optimizedComponentDefinitionSignature,
      ].join(':'),
      executionConfigurationVersion: fingerprintExecutionConfiguration({
        target: this.executionTarget,
        layer: this.layer,
        executionTier: this.executionTier,
        mode: this.executionContext.mode,
        timezone: this.timezone,
        maxStepsPerBar: this.options.maxStepsPerBar,
        policy: this.executionContext.policy ?? null,
      }),
    };
  }

  reset(): void {
    this.kernelDataRevision += 1;
    this.uiRuntime.reset();
    this.appRuntime.reset();
    this.declarativeVisualState = { version:1, revision:0, specs:[] };
    this.reactiveRevision = 0; this.reactiveRecomputed = 0; this.reactiveReused = 0; this.reactiveEffects = 0;
    this.realtimeRevision = 0; this.eventRouter.rollbackTransaction(); this.realtimeEventTransactionId = undefined; this.debugHost.reset(); this.realtimeLifecycle='idle';
    this.state = { barIndex: -1, time: 0, locals: {}, seriesState: this.seriesRegistry.createNumericCompatibilityView(), localSeries: this.seriesRegistry.createValueCompatibilityView(), barState: { index:-1, time:0, isFirst:true, isLast:false, isRealtime:false, isConfirmed:true, revision:0, symbol:this.options.symbol, timeframe:this.options.timeframe, mode:this.executionContext.mode }, workspaceState: this.workspaceSnapshot() };
    this.history = []; this.columnarHistory.clear(); this.crossState = {}; this.lastDirtyPlan=undefined; this.realtimeDirtyInstructions.clear(); this.viewportMemo.clear();
    this.seriesRegistry.reset();
    this.stateStore.bind(this.crossState);
    this.currentBarSnapshot = undefined; this.plotOrdinal = 0; this.indicatorMemo.clear(); this.dataMemo.clear(); this.hmmModels.clear(); this.outputCount = 0; this.lastBarWasRealtime = false;
    this.stateStore.commitRealtimeTransaction();
    this.committedSeriesState=this.seriesRegistry.snapshotNumericObject();
    this.committedLocalSeries=this.seriesRegistry.snapshotValueObject();
    this.committedCrossState=cloneCrossMap(this.crossState);
    this.eventRouter.rollbackTransaction();
    this.realtimeTransactionId = undefined;
    this.rsiKernels.clear(); this.atrKernels.clear(); this.vwapKernels.clear();
    this.betaKernels.clear();
    this.trendStrengthKernels.clear();
    this.kernelStateSnapshots.clear();
    this.kernelNodeIdentities.clear();
    this.resetFusedSeriesCursors();
  }
  getState(options: { clone?: boolean } = {}): CoreSpiritRuntimeState {
    this.state.workspaceState=this.workspaceSnapshot();
    if (options.clone === false) {
      return { ...this.state, workspaceState:this.state.workspaceState, locals:this.state.locals, seriesState:this.state.seriesState, localSeries:this.state.localSeries };
    }
    return { ...this.state, workspaceState:this.workspaceSnapshot(), locals:{...this.state.locals}, seriesState:this.seriesRegistry.snapshotNumericObject(), localSeries:this.seriesRegistry.snapshotValueObject() };
  }

  private installDirtyGraph(ir: CoreSpiritIrProgram): void {
    const bundle=ir.graphs;
    this.dirtyGraph = bundle
      ? new CoreSpiritDirtyGraph(
          buildCoreSpiritDirtyGraph(bundle.semantic,bundle.reactive,ir.entry.instructions),
          bundle.reactive,
        )
      : undefined;
  }

  /**
   * Detect a historical correction before executeIr resets state. The runtime currently
   * rebuilds the full execution context for every executeIr(), so the public plan must
   * report a full replay even when the dirty graph identifies a narrower causal range.
   * The original changed range remains attached for diagnostics and future safe replay.
   */
  private planHistoricalCorrection(
    previousIr: CoreSpiritIrProgram | undefined,
    previousBars: readonly HistoricalCandle[],
    nextIr: CoreSpiritIrProgram,
    nextBars: readonly HistoricalCandle[],
  ): CoreSpiritDirtyExecutionPlan | undefined {
    if (previousIr !== nextIr || previousBars.length === 0 || !this.dirtyGraph) return undefined;
    const fullReplayPlan = (): CoreSpiritDirtyExecutionPlan => {
      const plan = this.dirtyGraph!.planFull(nextBars.length);
      const requiresStateRestore = [...plan.nodes].some(id => this.dirtyGraph!.nodesById.get(id)?.stateful === true);
      return {
        ...plan,
        correction: Object.freeze({
          changedRange: Object.freeze({ from:0, to:nextBars.length }),
          replayFrom:0,
          requiresStateRestore,
          reason: requiresStateRestore ? 'full-replay-no-safe-checkpoint' : 'full-replay-conservative',
        }),
      };
    };
    // Structural history edits change index identity. Full replay is the only safe fallback.
    if (previousBars.length !== nextBars.length) return fullReplayPlan();
    let from = nextBars.length;
    let to = -1;
    const changedSources = new Set<ReturnType<typeof dirtySourcesForBar>[number]>();
    for (let i = 0; i < nextBars.length; i += 1) {
      const previous = previousBars[i]!;
      const current = nextBars[i]!;
      // Timestamp changes or reordering invalidate index identity; executeIr still
      // rebuilds the complete dataset, but we do not advertise a localized range.
      if (this.toEpoch(previous.timestamp) !== this.toEpoch(current.timestamp)) return fullReplayPlan();
      const changed = dirtySourcesForBar(
        { time:this.toEpoch(previous.timestamp), open:Number(previous.open), high:Number(previous.high), low:Number(previous.low), close:Number(previous.close), volume:Number(previous.volume) },
        { time:this.toEpoch(current.timestamp), open:Number(current.open), high:Number(current.high), low:Number(current.low), close:Number(current.close), volume:Number(current.volume) },
      );
      if (!changed.length) continue;
      from = Math.min(from, i);
      to = Math.max(to, i + 1);
      for (const source of changed) changedSources.add(source);
    }
    if (to <= from) return undefined;

    const causalPlan = this.dirtyGraph.planCorrection([...changedSources], { from, to }, nextBars.length);
    // executeIr below resets kernel state and processes all bars in chronological
    // order. Never publish the narrower causal-plan ranges as if they were the
    // work actually performed. Keep its changedRange, but report the real full
    // replay and remove any checkpoint claim (none is restored in this path).
    const requiresStateRestore = causalPlan.correction?.requiresStateRestore === true;
    const full = this.dirtyGraph.planFull(nextBars.length);
    return {
      ...full,
      sourceFields: causalPlan.sourceFields,
      correction: Object.freeze({
        changedRange: Object.freeze({ from, to }),
        replayFrom: 0,
        requiresStateRestore,
        reason: requiresStateRestore ? 'full-replay-no-safe-checkpoint' : 'full-replay-conservative',
      }),
    };
  }

  loadProgram(program: CoreSpiritProgram): CoreSpiritIrProgram {
    const compiled = this.profiler.measureCompile(() => this.compiler.compile(program.ast, program.id || this.options.sourceId, { layer:this.layer, surface:program.surface }));
    const errors = compiled.diagnostics.filter(d => d.severity === 'error');
    if (!compiled.ir || errors.length) throw new Error(errors.map(d => d.message).join('; ') || 'CoreSpirit compilation failed');
    this.compiledIr = compiled.ir; this.loadedProgramId = program.id; this.loadedSurface = program.surface;
    this.updateOptimizedComponentDefinitionSignature(compiled.ir);
    this.installSeriesFusion(compiled.ir);
    // State retention must always cover the program's declared lookback plus a safety margin.
    if (compiled.ir.maxLookback + 32 > this.stateHistoryLimit) this.stateHistoryLimit = Math.min(this.maxHistoryBars, compiled.ir.maxLookback + 32);
    this.reset();
    this.installDirtyGraph(compiled.ir);
    this.prepareSeriesBindings(compiled.ir);
    this.optimizedExecutionVm.prepare(compiled.ir.entry.instructions, this.seriesRegistry, compiled.ir.specializedPlan, this.optimizedExecutionCacheVersions());
    return compiled.ir;
  }

  execute(program: CoreSpiritProgram, bars: HistoricalCandle[]): CoreSpiritObject[] {
    this.loadProgram(program);
    return this.executeIr(this.compiledIr!, bars).outputs;
  }

  executeBar(bar: HistoricalCandle, profilePhase: 'historical'|'realtime' = 'realtime'): CoreSpiritExecutionResult {
    this.throwIfAborted();
    if (!this.compiledIr) throw new Error('CoreSpirit program is not loaded');
    const normalized = { ...bar };
    // Validate before touching history, transactions, or kernel cursors. Historical
    // corrections must arrive through executeIr(), never as a live tail append.
    this.validateBar(normalized);
    const currentTail = this.history.at(-1);
    if (currentTail && this.toEpoch(normalized.timestamp) < this.toEpoch(currentTail.timestamp)) {
      throw new Error('out-of-order bar update rejected; use executeIr() to reconcile historical corrections');
    }
    this.profiler.beginBar(profilePhase, this.compiledIr.entry.instructions.length);
    const diagnostics: string[] = [];
    this.outputCollector.beginBar(true);
    const outputs = this.outputCollector.values();
    this.profiler.recordAllocation(1);
    const last = this.history[this.history.length - 1];
    const sameBucket = !!last && this.toEpoch(last.timestamp) === this.toEpoch(normalized.timestamp);
    // A same-timestamp candle is incremental only when there is a captured
    // forming-bar snapshot to roll back to. A history replay alone is not one.
    const canIncremental = sameBucket && Boolean(this.currentBarSnapshot);
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
      const confirmedBarIndex = this.currentBarSnapshot ? this.currentBarSnapshot.historyLength - 1 : this.history.length - 1;
      const restored = this.restoreKernelSnapshotsAtBar(confirmedBarIndex);
      if (!restored.complete) {
        // A missing or incompatible checkpoint means the forming-bar state may
        // already contain the previous tick. Rebuild confirmed history from zero,
        // suppress historical external effects, then replay this live observation.
        const confirmedHistory = this.history.slice(0, this.currentBarSnapshot.historyLength).map(item => ({ ...item }));
        this.recoveryStats.fullReplayFallbacks += 1;
        const previousSuppression = this.suppressExternalEffects;
        this.suppressExternalEffects = true;
        try { this.executeIr(this.compiledIr!, confirmedHistory); }
        finally { this.suppressExternalEffects = previousSuppression; }
        return this.executeBar(normalized, profilePhase);
      }
      this.recoveryStats.barsReused += this.currentBarSnapshot.historyLength;
      this.history[this.history.length - 1] = normalized;
      this.columnarHistory.replaceLast(normalized);
    } else {
      this.realtimeRevision = 0;
      if (this.reactiveExecution) { this.reactiveRevision += 1; this.reactiveRecomputed += 1; this.reactiveEffects += 1; }
      this.currentBarSnapshot = { historyLength: this.history.length };
      this.stateStore.beginRealtimeTransaction();
      this.realtimeEventTransactionId = `${this.options.sourceId}:${this.history.length}:${this.realtimeRevision}`;
      this.eventRouter.beginTransaction(this.realtimeEventTransactionId);
      this.snapshotKernelsForBar(this.history.length - 1);
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
    this.state.barState = { index:barIndex, time:this.state.time, isFirst:barIndex===0, isLast:false, isRealtime:true, isConfirmed:false, revision:this.realtimeRevision, symbol:this.options.symbol, timeframe:this.options.timeframe, mode:this.executionContext.mode };
    this.executionContext.frame = createCoreSpiritExecutionFrame({ timestamp:this.state.time*1000, barIndex, symbol:this.options.symbol, timeframe:this.options.timeframe, timezone:this.timezone, mode:this.executionContext.mode, isRealtime:true, isConfirmed:false, isNewBar:this.realtimeRevision===0, revision:this.realtimeRevision, isFirst:barIndex===0, isLast:false });
    this.executionContext.session = this.executionContext.frame.session;
    this.lastBarWasRealtime = true;
    if (canIncremental && dirtyPlan) {
      this.realtimeDirtyInstructions.clear();
      for (const instruction of dirtyPlan.instructions) this.realtimeDirtyInstructions.add(instruction);
      // The VM expands this graph-derived set through register consumers before skipping any pure work.
    }
    try {
      this.executeBlock(this.compiledIr.entry.instructions, normalized, this.history, barIndex, this.outputCollector, diagnostics, {
        reuseValues: this.executionTier === 'optimized',
        resetValues: !canIncremental,
        dirtyInstructions: canIncremental && dirtyPlan && dirtyPlan.instructions.size > 0
          ? this.realtimeDirtyInstructions
          : undefined,
      });
    }
    catch (error) { const message = error instanceof Error ? error.message : String(error); diagnostics.push(`bar ${barIndex}: ${message}`); this.debugHost.record({ kind:'execution-error', barIndex, message }); }
    this.profiler.endBar();
    return { outputs, state: this.getState({ clone:false }), diagnostics };
  }

  /** Execute a host-supplied tick against the current realtime bar. The VM remains socket-free. */
  /** Re-evaluate the live bar during recovery without replaying orders or external events. */
  executeBarReadOnly(bar: HistoricalCandle, profilePhase: 'historical'|'realtime' = 'realtime'): CoreSpiritExecutionResult {
    const previous = this.suppressExternalEffects;
    this.suppressExternalEffects = true;
    try {
      return this.executeBar(bar, profilePhase);
    } finally {
      this.suppressExternalEffects = previous;
    }
  }

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
    const result = this.executeBar(bar, historicalTick ? 'historical' : 'realtime');
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
    this.snapshotKernelsForBar(this.state.barIndex);
    this.currentBarSnapshot = undefined;
    this.lastBarWasRealtime = false;
  }

  commitRealtimeBar(): void { this.confirmRealtimeBar(); }

  rollbackRealtimeBar(): void {
    if (!this.currentBarSnapshot) return;
    this.stateStore.rollbackRealtimeTransaction();
    this.eventRouter.rollbackTransaction(this.realtimeEventTransactionId);
    this.realtimeEventTransactionId = undefined;
    const confirmedHistory = this.history.slice(0, this.currentBarSnapshot.historyLength).map(item => ({ ...item }));
    const restored = this.restoreKernelSnapshotsAtBar(this.currentBarSnapshot.historyLength - 1);
    this.history = confirmedHistory;
    this.columnarHistory.trimTo(this.currentBarSnapshot.historyLength);
    if (!restored.complete && this.compiledIr) {
      this.recoveryStats.fullReplayFallbacks += 1;
      const previousSuppression = this.suppressExternalEffects;
      this.suppressExternalEffects = true;
      try { this.executeIr(this.compiledIr, confirmedHistory); }
      finally { this.suppressExternalEffects = previousSuppression; }
      return;
    }
    this.state.barIndex=this.history.length-1;
    this.state.time=this.history.length?this.toEpoch(this.history.at(-1)!.timestamp):0;
    this.realtimeRevision=0;
    this.state.barState={ index:this.state.barIndex,time:this.state.time,isFirst:this.state.barIndex===0,isLast:false,isRealtime:false,isConfirmed:true,revision:0,symbol:this.options.symbol,timeframe:this.options.timeframe,mode:this.executionContext.mode };
    if(this.state.barIndex>=0){ this.executionContext.frame=createCoreSpiritExecutionFrame({timestamp:this.state.time*1000,barIndex:this.state.barIndex,symbol:this.options.symbol,timeframe:this.options.timeframe,timezone:this.timezone,mode:this.executionContext.mode,isRealtime:false,isConfirmed:true,isNewBar:true,revision:0,isFirst:this.state.barIndex===0,isLast:false}); this.executionContext.session=this.executionContext.frame.session; }
    this.currentBarSnapshot=undefined;
    this.lastBarWasRealtime=false;
    this.realtimeLifecycle='idle';
    this.lastDirtyPlan=undefined;
    this.reactiveRecomputed=0; this.reactiveReused=0; this.reactiveEffects=0;
  }

  getRealtimeLifecycle(): 'idle'|'evaluating'|'committed' { return this.realtimeLifecycle; }

  /** Recovery counters are cumulative for this runtime instance and safe to sample in telemetry. */
  getRecoveryStats(): Readonly<{
    barsReused:number;
    barsReplayed:number;
    checkpointsRestored:number;
    checkpointRestoreFailures:number;
    fullReplayFallbacks:number;
    lastReplayFrom:number;
  }> {
    return Object.freeze({ ...this.recoveryStats });
  }

  /** Direct typed-column input boundary for quant and ML feature builders. */
  getMarketFrame(): CoreSpiritMarketFrame | undefined {
    return this.marketFrameResolver?.();
  }

  /** Worker contexts can replace column views without rebuilding the runtime. */
  setMarketFrameResolver(resolver: () => CoreSpiritMarketFrame): void {
    this.marketFrameResolver = resolver;
  }

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

  private kernelModelVersion(): string {
    const ir = this.compiledIr;
    if (!ir) throw new Error('CoreSpirit kernel snapshots require a loaded IR.');
    const versions = this.optimizedExecutionCacheVersions();
    return [
      `ir${ir.version}`,
      ir.sourceId,
      ir.graphs?.semantic.checksum ?? 'no-graph',
      `compiler=${versions.compilerVersion ?? 'unknown'}`,
      `components=${versions.componentDefinitionVersion ?? 'unknown'}`,
      `execution=${versions.executionConfigurationVersion ?? 'unknown'}`,
    ].join(':');
  }

  private rememberKernelIdentity(
    family: CoreSpiritKernelState['family'],
    key: string,
    callKey: string,
    fallbackDependencies: readonly string[],
  ): void {
    const identityKey = `${family}:${key}`;
    if (this.kernelNodeIdentities.has(identityKey)) return;
    const instructionIndex = this.compiledIr?.entry.instructions.findIndex((instruction) =>
      instruction.op === 'call' && (instruction.callId || instruction.dest) === callKey,
    ) ?? -1;
    const node = instructionIndex >= 0 ? this.dirtyGraph?.nodeForInstruction(instructionIndex) : undefined;
    this.kernelNodeIdentities.set(identityKey, {
      nodeId: node?.id ?? `kernel:${family}:${key}`,
      inputDependencies: Object.freeze([...(node?.inputs?.length ? node.inputs : fallbackDependencies)]),
    });
  }

  private kernelIdentity(
    family: CoreSpiritKernelState['family'],
    key: string,
  ): { nodeId: string; inputDependencies: readonly string[] } {
    const remembered = this.kernelNodeIdentities.get(`${family}:${key}`);
    if (remembered) return remembered;
    const group = family === 'fused'
      ? this.fusedGroupById.get(key) ?? this.seriesFusionPlan?.groups.find(item => item.id === key)
      : undefined;
    const instructionIndex = group?.instructions[0] ?? this.compiledIr?.entry.instructions.findIndex((instruction) =>
      instruction.op === 'call' && (instruction.callId || instruction.dest) === key,
    ) ?? -1;
    const node = instructionIndex >= 0 ? this.dirtyGraph?.nodeForInstruction(instructionIndex) : undefined;
    return {
      nodeId: node?.id ?? `kernel:${family}:${key}`,
      inputDependencies: Object.freeze([...(node?.inputs?.length ? node.inputs : group ? [group.inputRegister] : [])]),
    };
  }

  /** Describe the reaching definition of a kernel argument so parameter edits invalidate checkpoints. */
  private registerConfiguration(register: string, beforeIndex: number, visiting = new Set<string>()): unknown {
    const visitKey = `${register}@${beforeIndex}`;
    if (visiting.has(visitKey)) return { register, cycle: true };
    const nextVisiting = new Set(visiting);
    nextVisiting.add(visitKey);
    const instructions = this.compiledIr?.entry.instructions ?? [];
    const describe = (name: string, index: number) => this.registerConfiguration(name, index, nextVisiting);
    for (let index = Math.min(beforeIndex - 1, instructions.length - 1); index >= 0; index -= 1) {
      const instruction = instructions[index]!;
      if ('dest' in instruction && instruction.dest === register) {
        switch (instruction.op) {
          case 'const': return { op:instruction.op, value:instruction.value };
          case 'loadSeries': return { op:instruction.op, name:instruction.name, offset:instruction.offset };
          case 'loadState': return { op:instruction.op, name:instruction.name };
          case 'move': return { op:instruction.op, source:describe(instruction.source,index) };
          case 'unary': return { op:instruction.op, operator:instruction.operator, operand:describe(instruction.operand,index) };
          case 'binary': return { op:instruction.op, operator:instruction.operator, left:describe(instruction.left,index), right:describe(instruction.right,index) };
          case 'call': return {
            op:instruction.op, name:instruction.name,
            args:instruction.args.map(name=>describe(name,index)),
            seriesArgs:instruction.seriesArgs ?? [], seriesSources:instruction.seriesSources ?? [],
            componentId:instruction.componentId ?? null,
            componentPure:instruction.componentPure ?? null,
            componentStateful:instruction.componentStateful ?? null,
            componentDeterministic:instruction.componentDeterministic ?? null,
          };
          case 'index': return { op:instruction.op, seriesName:instruction.seriesName ?? null, target:describe(instruction.target,index), index:describe(instruction.index,index) };
          // Every destination-producing IR instruction is handled above. Keep
          // an explicit stable fallback without dereferencing the exhausted union.
          default: return { op:'unhandled-destination-instruction', register };
        }
      }
      if ((instruction.op === 'setLocal' || instruction.op === 'setState') && instruction.name === register) {
        return { op:instruction.op, name:instruction.name, source:describe(instruction.source,index) };
      }
    }
    return { register, external:true };
  }

  private kernelSnapshotConfiguration(
    family: CoreSpiritKernelState['family'],
    key: string,
  ): Readonly<{ kernelType:string; kernelVersion:string|number; parametersSignature:string }> {
    const group = family === 'fused'
      ? this.fusedGroupById.get(key) ?? this.seriesFusionPlan?.groups.find(item => item.id === key)
      : undefined;
    if (group) return {
      kernelType:'fused-series',
      kernelVersion:1,
      parametersSignature:JSON.stringify({ operations:group.operations.map(operation=>({name:operation.name,length:operation.length,parameter:operation.parameter})) }),
    };
    const instructions = this.compiledIr?.entry.instructions ?? [];
    const instructionIndex = instructions.findIndex(instruction => {
      if (instruction.op !== 'call') return false;
      const callId = instruction.callId || instruction.dest;
      return callId === key || (family === 'direct' && key.startsWith(`direct:${callId}|`));
    });
    const instruction = instructionIndex >= 0 ? instructions[instructionIndex] : undefined;
    const isCall = instruction?.op === 'call';
    const parametersSignature = JSON.stringify({
      family,
      key,
      name:isCall ? instruction.name : null,
      args:isCall ? instruction.args.map(register=>this.registerConfiguration(register,instructionIndex)) : [],
      seriesArgs:isCall ? instruction.seriesArgs ?? [] : [],
      seriesSources:isCall ? instruction.seriesSources ?? [] : [],
      componentId:isCall ? instruction.componentId ?? null : null,
      componentStateful:isCall ? instruction.componentStateful ?? null : null,
      componentDeterministic:isCall ? instruction.componentDeterministic ?? null : null,
    });
    return {
      kernelType:`${family}:${isCall ? instruction.name : key}`,
      kernelVersion:1,
      parametersSignature,
    };
  }

  /**
   * Combine the runtime's bar-history generation with canonical external dataset
   * identities. If a required external source cannot provide an identity, restore
   * is disabled rather than trusting a potentially stale cache.
   */
  private externalKernelDataRevision(): string | number {
    const dependencies = this.compiledIr?.tradingNativePlan?.dataDependencies ?? [];
    const external: string[] = [];
    for (const dependency of dependencies) {
      const symbol = dependency.symbol === 'current' ? this.options.symbol : dependency.symbol;
      const timeframe = dependency.timeframe === 'chart' ? this.options.timeframe : dependency.timeframe;
      const isPrimaryChart = dependency.domain === 'market' &&
        symbol.trim().toUpperCase() === String(this.options.symbol ?? '').trim().toUpperCase() &&
        String(timeframe).trim().toLowerCase() === String(this.options.timeframe ?? '').trim().toLowerCase();
      if (isPrimaryChart) continue;
      const fields = dependency.fields.filter((field): field is CoreSpiritDataRequest['field'] =>
        ['open','high','low','close','volume','time'].includes(field),
      );
      if (dependency.domain !== 'market' || !fields.length || !this.dataResolver?.cacheKey) {
        external.push('unversioned:' + dependency.id);
        continue;
      }
      for (const field of fields) {
        try {
          external.push(this.dataResolver.cacheKey({ symbol, timeframe, field, offset:0 }));
        } catch {
          external.push('unversioned:' + dependency.id + ':' + field);
        }
      }
    }
    if (!external.length) return this.kernelDataRevision;
    external.sort();
    return JSON.stringify([this.kernelDataRevision, ...external]);
  }

  private hasUnversionedExternalKernelInputs(): boolean {
    const dependencies = this.compiledIr?.tradingNativePlan?.dataDependencies ?? [];
    return dependencies.some(dependency => {
      const symbol = dependency.symbol === 'current' ? this.options.symbol : dependency.symbol;
      const timeframe = dependency.timeframe === 'chart' ? this.options.timeframe : dependency.timeframe;
      const isPrimaryChart = dependency.domain === 'market' &&
        symbol.trim().toUpperCase() === String(this.options.symbol ?? '').trim().toUpperCase() &&
        String(timeframe).trim().toLowerCase() === String(this.options.timeframe ?? '').trim().toLowerCase();
      if (isPrimaryChart) return false;
      const fields = dependency.fields.filter(field => ['open','high','low','close','volume','time'].includes(field));
      if (dependency.domain !== 'market' || !fields.length || !this.dataResolver?.cacheKey) return true;
      try {
        return fields.some(field => typeof this.dataResolver?.cacheKey?.({symbol,timeframe,field:field as CoreSpiritDataRequest['field'],offset:0}) !== 'string');
      } catch {
        return true;
      }
    });
  }

  private kernelSnapshotIdentity(
    family: CoreSpiritKernelState['family'],
    key: string,
    nextBarIndex: number,
  ): CoreSpiritKernelSnapshotIdentity {
    return {
      modelVersion:this.kernelModelVersion(),
      ...this.kernelSnapshotConfiguration(family,key),
      dataRevision:this.externalKernelDataRevision(),
      nextBarIndex,
      inputDependencies:this.kernelIdentity(family,key).inputDependencies,
    };
  }

  private captureKernelSnapshot(
    family: CoreSpiritKernelState['family'],
    key: string,
    state: CoreSpiritKernelState['state'],
    barIndex: number,
  ): void {
    const identity = this.kernelIdentity(family, key);
    this.kernelStateSnapshots.capture(
      {
        nodeId:identity.nodeId,
        revision:this.state.barState.revision,
        inputDependencies:identity.inputDependencies,
        barIndex,
        ...this.kernelSnapshotIdentity(family,key,barIndex + 1),
      },
      { family, state } as CoreSpiritKernelState,
      cloneCoreSpiritKernelState,
    );
  }

  private snapshotKernelsForBar(barIndex: number): void {
    if (!this.compiledIr || barIndex < -1) return;
    for (const [groupId, cursor] of this.fusedCursors) this.captureKernelSnapshot('fused', groupId, cursor, barIndex);
    for (const [key, cursor] of this.directKernelCursors) this.captureKernelSnapshot('direct', key, cursor, barIndex);
    for (const [key, kernel] of this.rsiKernels) this.captureKernelSnapshot('rsi', key, kernel, barIndex);
    for (const [key, kernel] of this.atrKernels) this.captureKernelSnapshot('atr', key, kernel, barIndex);
    for (const [key, kernel] of this.vwapKernels) this.captureKernelSnapshot('vwap', key, kernel, barIndex);
    for (const [key, kernel] of this.betaKernels) this.captureKernelSnapshot('beta', key, kernel, barIndex);
    for (const [key, kernel] of this.trendStrengthKernels) this.captureKernelSnapshot('trend', key, kernel, barIndex);
  }

  private restoreKernelSnapshotsAtBar(barIndex: number): Readonly<{complete:boolean;expected:number;restored:number}> {
    if (!this.compiledIr || barIndex < -1) return Object.freeze({ complete:false, expected:0, restored:0 });
    const activeKernelCount = this.fusedCursors.size + this.directKernelCursors.size +
      this.rsiKernels.size + this.atrKernels.size + this.vwapKernels.size +
      this.betaKernels.size + this.trendStrengthKernels.size;
    if (activeKernelCount > 0 && this.hasUnversionedExternalKernelInputs()) {
      // No cache identity means no proof that secondary data stayed unchanged.
      // Keep the live result correct by replaying instead of restoring any cursor.
      this.recoveryStats.checkpointRestoreFailures += activeKernelCount;
      return Object.freeze({complete:false,expected:activeKernelCount,restored:0});
    }
    const modelVersion = this.kernelModelVersion();
    let expectedCount = 0;
    let restoredCount = 0;
    const restore = <T extends CoreSpiritKernelState>(
      family: T['family'],
      key: string,
      state: T['state'],
    ): void => {
      expectedCount += 1;
      const identity = this.kernelIdentity(family, key);
      const restored = this.kernelStateSnapshots.restoreAt(
        { family, state } as T,
        identity.nodeId,
        modelVersion,
        identity.inputDependencies,
        barIndex,
        (target, source) => copyCoreSpiritKernelState(target as CoreSpiritKernelState, source as CoreSpiritKernelState),
        this.kernelSnapshotIdentity(family,key,barIndex + 1),
      );
      if (restored) {
        restoredCount += 1;
        this.recoveryStats.checkpointsRestored += 1;
      } else {
        this.recoveryStats.checkpointRestoreFailures += 1;
      }
    };
    for (const [key, cursor] of this.directKernelCursors) restore('direct', key, cursor);
    for (const [key, kernel] of this.rsiKernels) restore('rsi', key, kernel);
    for (const [key, kernel] of this.atrKernels) restore('atr', key, kernel);
    for (const [key, kernel] of this.vwapKernels) restore('vwap', key, kernel);
    for (const [key, kernel] of this.betaKernels) restore('beta', key, kernel);
    for (const [key, kernel] of this.trendStrengthKernels) restore('trend', key, kernel);
    for (const [groupId, cursor] of this.fusedCursors) restore('fused', groupId, cursor);
    return Object.freeze({ complete:expectedCount === restoredCount, expected:expectedCount, restored:restoredCount });
  }

  getKernelStateSnapshots(): readonly CoreSpiritKernelSnapshot<CoreSpiritKernelState>[] {
    return Object.freeze(this.kernelStateSnapshots.entries().map((snapshot) => Object.freeze({
      ...snapshot,
      inputDependencies: Object.freeze([...snapshot.inputDependencies]),
      state: cloneCoreSpiritKernelState(snapshot.state),
    })));
  }

  getKernelStateSnapshot(
    nodeId: string,
    barIndex?: number,
  ): CoreSpiritKernelSnapshot<CoreSpiritKernelState> | undefined {
    const modelVersion = this.compiledIr ? this.kernelModelVersion() : '';
    const snapshot = barIndex == null
      ? this.kernelStateSnapshots.latest(nodeId)
      : this.kernelStateSnapshots.at(nodeId, barIndex);
    if (!snapshot || (modelVersion && snapshot.modelVersion !== modelVersion)) return undefined;
    return Object.freeze({
      ...snapshot,
      inputDependencies: Object.freeze([...snapshot.inputDependencies]),
      state: cloneCoreSpiritKernelState(snapshot.state),
    });
  }

  /**
   * Replays confirmed history to reconstruct a chart's indicator state without
   * dispatching order intents, alerts, webhooks or host events. The suppression
   * scope is restored even if a bar fails, so the next forming-bar run keeps its
   * normal live execution semantics.
   */
  executeIrReadOnly(ir: CoreSpiritIrProgram, bars: HistoricalCandle[]): CoreSpiritExecutionResult {
    const previous = this.suppressExternalEffects;
    this.suppressExternalEffects = true;
    try {
      return this.executeIr(ir, bars);
    } finally {
      this.suppressExternalEffects = previous;
    }
  }

  executeIr(ir: CoreSpiritIrProgram, bars: HistoricalCandle[]): CoreSpiritExecutionResult {
    const previousIr = this.compiledIr;
    const previousBars = this.history.map(bar => ({ ...bar }));
    this.viewportMemo.clear();
    const diagnostics: string[] = [];
    this.outputCollector.beginBar(true);
    const outputs = this.outputCollector.values();
    this.compiledIr = ir; this.updateOptimizedComponentDefinitionSignature(ir); this.installSeriesFusion(ir); this.reset(); this.installDirtyGraph(ir); this.prepareSeriesBindings(ir); this.optimizedExecutionVm.prepare(ir.entry.instructions, this.seriesRegistry, ir.specializedPlan, this.optimizedExecutionCacheVersions());
    const historicalCorrectionPlan = this.planHistoricalCorrection(previousIr, previousBars, ir, bars);
    const priorEffectSuppression = this.suppressExternalEffects;
    // Corrections rebuild semantic state without firing the same order intents,
    // alerts, webhooks, or host events a second time.
    if (historicalCorrectionPlan) this.suppressExternalEffects = true;
    this.recoveryStats.lastReplayFrom = 0;
    try {
    for (let i = 0; i < bars.length; i++) {
      this.throwIfAborted();
      this.recoveryStats.barsReplayed += 1;
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
      this.columnarHistory.append(bar);
      if (this.history.length > this.maxHistoryBars) { const drop=this.history.length-this.maxHistoryBars; this.history.splice(0,drop); this.columnarHistory.trimTo(this.history.length); }
      try { this.executeBlock(ir.entry.instructions, bar, this.history, i, this.outputCollector, diagnostics); }
      catch (error) { const message = error instanceof Error ? error.message : String(error); diagnostics.push(`bar ${i}: ${message}`); this.debugHost.record({ kind:'execution-error', barIndex:i, message }); }
      finally { this.profiler.endBar(); }
    }
    if (this.history.length) this.snapshotKernelsForBar(this.history.length - 1);
    if (historicalCorrectionPlan) this.lastDirtyPlan = historicalCorrectionPlan;
    return { outputs, state: this.getState(), diagnostics };
    } finally {
      this.suppressExternalEffects = priorEffectSuppression;
    }
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
    if (ir.languagePolicy && ir.authoringLevel !== undefined &&
        ir.languagePolicy.level !== ir.authoringLevel) {
      throw new Error('CoreSpirit runtime rejected inconsistent authoring-level metadata in the compiled artifact.');
    }
    const requiredCapabilities = ir.requiredCapabilities ?? [];
    if (requiredCapabilities.length) {
      const sandbox = new CoreSpiritCapabilitySandbox({ layer:this.layer, target:this.executionTarget });
      const capabilityErrors = validateCoreScriptCapabilitiesAgainstSandbox(sandbox, requiredCapabilities);
      if (capabilityErrors.length) throw new Error(capabilityErrors.join('; '));
    }
    this.kernelStateSnapshots.clear();
    this.kernelNodeIdentities.clear();
    this.compiledIr = ir;
    this.loadedProgramId = ir.sourceId;
    this.updateOptimizedComponentDefinitionSignature(ir);
    this.installDirtyGraph(ir);
    this.prepareSeriesBindings(ir);
    this.optimizedExecutionVm.prepare(ir.entry.instructions, this.seriesRegistry, ir.specializedPlan, this.optimizedExecutionCacheVersions());
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
    this.directKernelCursors.clear();
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
    this.rememberKernelIdentity('fused', group.id, first.callId || first.dest, first.seriesArgs || []);
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
    executionOptions: { reuseValues?: boolean; resetValues?: boolean; dirtyInstructions?: ReadonlySet<number> } = {},
  ): void {
    this.prefetchTradingNativeData(barIndex, this.toEpoch(bar.timestamp));
    const host: CoreSpiritExecutionVMHost = {
      maxStepsPerBar: this.options.maxStepsPerBar,
      throwIfAborted: () => this.throwIfAborted(),
      loadSeries: (name, offset) => this.loadSeries(name, offset, bar, bars, barIndex),
      moveLocal: (source) => this.state.locals[source],
      loadState: (name) => this.stateStore.getState(name),
      setState: (name,value,initialize) => {
        this.stateStore.setState(name, value as CoreSpiritValue, initialize === true);
        this.state.locals[name] = initialize ? this.stateStore.getState(name) : value;
      },
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
      eventActive: (eventName) => this.eventActive(eventName),
      emit: (instruction, values, output) => this.emitIntent(instruction.kind, instruction.args.slice(1).map((name) => values.get(name)), bar, barIndex, output, diagnostics, instruction.outputId),
      profileInstruction: this.profiler.hooks(),
    };
    if (this.executionTier === 'reference') this.executionVm.run(instructions, barIndex, host, outputs);
    else this.optimizedExecutionVm.run(instructions, barIndex, host, outputs, {
      ...executionOptions,
      executionContextKey:this.optimizedExecutionContextKey,
      seriesRegistry:this.seriesRegistry,
      specializedPlan:this.compiledIr?.specializedPlan,
      ...this.optimizedExecutionCacheVersions(),
    });
  }

  private prefetchTradingNativeData(barIndex:number, asOfTimestamp:number): void {
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
    const value=batchResolver(requests,{asOfTimestamp,baseSymbol:this.executionContext.symbol,baseTimeframe:this.executionContext.timeframe,executionMode:this.executionContext.mode,revision:this.state.barState.revision,alignment:'last-confirmed'});
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
    if (!Number.isInteger(offset) || offset < 0) throw new Error('future indexing is not allowed for ' + name + '[' + offset + ']');
    if (offset > barIndex) return null;
    const sourceIndex = barIndex - offset;
    const source = bars[sourceIndex];
    if (!source) return null;

    // The runtime's bar timestamps are authoritative for the time series. A worker's
    // MarketFrame can describe a different viewport/revision than this historical
    // replay, so never let a detached frame return a stale or empty time value.
    // CoreSpirit scripts use time as epoch seconds for drawing coordinates and
    // persistent state; derive it from the exact bar being executed.
    if (name === 'time') {
      const timestamp = this.toEpoch(source.timestamp);
      return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
    }

    // Persistent worker contexts read OHLCV directly from shared MarketFrame
    // columns, avoiding a second object/column lookup for every quant feature.
    const frame = this.marketFrameResolver?.();
    if (frame && sourceIndex < frame.length) {
      const column = name === 'open' ? frame.open :
        name === 'high' ? frame.high :
        name === 'low' ? frame.low :
        name === 'close' ? frame.close :
        name === 'volume' ? frame.volume : undefined;
      if (column) {
        const value = column[sourceIndex];
        return value != null && Number.isFinite(value) ? value : null;
      }
    }

    const columnar = this.columnarHistory.valueAt(name, sourceIndex);
    if (columnar != null) return columnar;
    const value = Number((source as any)[name]);
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

  private getHMMModel(modelName: string): CoreSpiritGaussianHMM {
    const declaration = this.loadedSurface?.declarations.find(
      (item): item is Extract<CoreSpiritSurfaceDeclaration, { kind:'model' }> =>
        item.kind === 'model' && item.name === modelName,
    );
    if (!declaration || !declaration.modelType || !/^HMM(?:<.*>)?$/i.test(declaration.modelType)) {
      throw new Error("Unknown typed HMM model '" + modelName + "'. Declare it with model name: HMM<float> { ... }.");
    }
    const options = {
      states: declaration.states ?? 3,
      emission: declaration.emission ?? 'gaussian' as const,
      covariance: declaration.covariance ?? 'full' as const,
    };
    const signature = JSON.stringify(options);
    const cached = this.hmmModels.get(modelName);
    if (cached?.signature === signature) return cached.model;
    const model = new CoreSpiritGaussianHMM(options);
    this.hmmModels.set(modelName, { signature, model });
    return model;
  }

  private call(callKey:string,name:string,args:unknown[],bar:HistoricalCandle,bars:HistoricalCandle[],index:number,seriesArgs:string[]):unknown {
    const series = seriesArgs[0] || 'close'; const length = Math.max(1,Math.floor(Number(args[1] ?? 14)));
    const memoKey = `${name}|${series}|${length}|${index}|${args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(',')}`;
    if (this.indicatorMemo.has(memoKey)) return this.indicatorMemo.get(memoKey);
    const finish = (value: unknown) => { this.indicatorMemo.set(memoKey, value); return value; };
    this.capabilityHost.assert(name);
    if (name === 'vector') return finish(coreSpiritVector(...args));
    if (name === 'matrix') return finish(coreSpiritMatrix(args[0], args[1], ...args.slice(2)));
    if (name === 'tensor') return finish(coreSpiritTensor(args[0], ...args.slice(1)));
    if (name === 'zeros') return finish(coreSpiritZeros(args[0], args[1]));
    if (name === 'identity') return finish(coreSpiritIdentity(args[0]));
    if (name === 'matrixAdd') return finish(coreSpiritMatrixAdd(args[0], args[1]));
    if (name === 'matrixScale') return finish(coreSpiritMatrixScale(args[0], args[1]));
    if (name === 'matmul') return finish(coreSpiritMatrixMultiply(args[0], args[1]));
    if (name === 'transpose') return finish(coreSpiritMatrixTranspose(args[0]));
    if (name === 'dot') return finish(coreSpiritVectorDot(args[0], args[1]));
    if (name === 'dataset') return finish(coreSpiritDataset(...args));
    if (name === 'hmmFit') {
      if (this.modelTrainingMode !== 'research') {
        throw new Error('HMM fitting is disabled in chart execution. Train a versioned model in the CoreSpirit background research worker and load its immutable artifact for inference.');
      }
      const modelName = String(args[0] ?? '');
      const model = this.getHMMModel(modelName);
      const row = args[1] as CoreSpiritDatasetRow | null | undefined;
      if (!row || row.kind !== 'dataset') throw new Error('hmmFit expects a dataset<float> row');
      if (row.values.some(value => typeof value !== 'number' || !Number.isFinite(value))) return finish(null);
      return finish(model.observe(row.values as readonly number[], this.toEpoch(bar.timestamp), row.fields));
    }
    if (name === 'hmmDecode' || name === 'hmmProbability' || name === 'hmmPosterior') {
      const modelName = String(args[0] ?? '');
      const artifactModel = this.hmmArtifactResolver?.(modelName);
      if (artifactModel) {
        const row = args[1] as CoreSpiritDatasetRow | null | undefined;
        if (!row || row.kind !== 'dataset') {
          throw new Error('Loaded HMM artifacts require a dataset<float> feature row for inference.');
        }
        const inferenceTimestamp = this.toEpoch(bar.timestamp);
        // Bars inside the model's fit range are deliberately blanked to avoid
        // leaking an in-sample model into historical chart/backtest results.
        if (!artifactModel.canPredictAt(inferenceTimestamp)) return finish(null);
        // predict() is timestamp-aware: repeated calls for the same developing bar
        // roll back to the prior posterior before recomputing, so a revised candle
        // never gets counted twice and no stale feature-value memo can leak state.
        const prediction = artifactModel.predict(
          row.values as readonly number[],
          row.fields,
          inferenceTimestamp,
        );
        if (name === 'hmmDecode') return finish(prediction.state);
        if (name === 'hmmProbability') return finish(prediction.confidence);
        return finish(Object.freeze({
          kind: 'distribution' as const,
          length: prediction.probabilities.length,
          data: Float64Array.from(prediction.probabilities),
        }));
      }
      if (this.modelTrainingMode !== 'research') {
        throw new Error('No immutable HMM artifact is loaded for model "' + modelName + '". Fit is disabled in chart execution.');
      }
      const model = this.getHMMModel(modelName);
      if (name === 'hmmDecode') return finish(model.decodeLatest());
      if (name === 'hmmProbability') return finish(model.probabilityLatest());
      return finish(model.posterior());
    }
    if(name==='__input') {
      const key = String(args[0] ?? '');
      const override = this.inputValues[key];
      return finish(override !== undefined ? override : args[1] ?? null);
    }
    if(name==='vpvr') {
      const rows = Math.max(2, Math.min(400, Math.floor(Number(args[0] ?? 24))));
      const from = this.visibleRange?.from ?? Number.NaN;
      const to = this.visibleRange?.to ?? Number.NaN;
      const firstTime = candleTimeMillis(bars[0]?.timestamp);
      const lastTime = candleTimeMillis(bars.at(-1)?.timestamp);
      const key = [bars.length, firstTime, lastTime, from, to, rows].join('|');
      if (this.viewportMemo.has(key)) return finish(this.viewportMemo.get(key) ?? null);
      const value = visibleVpvrPoc(bars, this.visibleRange, rows);
      this.viewportMemo.set(key, value);
      return finish(value);
    }
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
    if(name==='__model_predict' || name==='__model_probability') {
      const rawRef=args[0];
      const modelName=rawRef && typeof rawRef==='object' ? String((rawRef as Record<string,unknown>).modelName ?? '') : String(rawRef ?? '');
      const inputs:Record<string,unknown>={};
      for(let i=1;i+1<args.length;i+=2) inputs[String(args[i])]=args[i+1];
      const field=name==='__model_probability' ? 'probability' : 'prediction';
      const resolved=this.modelPredictionResolver?.({modelName,field,inputs})
        ?? this.modelOutputResolver?.({modelName,field,binding:(()=>{const d=this.loadedSurface?.declarations.find((item): item is Extract<CoreSpiritSurfaceDeclaration,{kind:'model'}> => item.kind==='model'&&item.name===modelName);return d?.binding;})(),inputs})
        ?? null;
      return finish(typeof resolved === 'number' || typeof resolved === 'boolean' || typeof resolved === 'string' ? resolved : (resolved == null ? null : (resolved as any).value ?? resolved));
    }
    if(name==='model.predict' || name==='model.probability') {
      const modelName=String(args[0]??'');
      const inputs:Record<string,unknown>={};
      for(let i=1;i+1<args.length;i+=2) inputs[String(args[i])]=args[i+1];
      const field=name==='model.probability' ? 'probability' : 'prediction';
      return finish(this.modelPredictionResolver?.({modelName,field,inputs}) ?? this.modelOutputResolver?.({modelName,field,inputs}) ?? null);
    }
    if(name==='risk.allowed') {
      const quantity=Number(args[0]);
      return finish(this.riskResolver?.({action:'evaluate',symbol:this.executionContext.symbol,quantity:Number.isFinite(quantity)?quantity:undefined,sourceId:this.options.sourceId,timestamp:this.state.barState.time}) ?? false);
    }
    if(name==='automation.notify' || name==='automation.route') {
      const action=name==='automation.notify' ? 'automation.notify' : 'automation.route';
      const message=String(args[0]??'');
      const target=args[1]==null ? undefined : String(args[1]);
      if (!this.suppressExternalEffects) {
        this.eventRouter.scriptEvent({scriptId:this.options.sourceId,time:this.toEpoch(bar.timestamp),name:action,metadata:{message,target,barIndex:index,action}});
      }
      return finish({__coreSpiritAutomationEvent:true,action,message,target});
    }
    if(name==='background.when') {
      return finish(this.truthy(args[0]) ? String(args[1]??'') : null);
    }
    if(name==='model') return finish({ __coreSpiritModelRef:true, modelName:String(args[0]??'') });
    if(name==='market') return finish({ kind:'market', symbol:String(args[0]??this.executionContext.symbol), timeframe:this.executionContext.timeframe });
    if(name==='timeframe') return finish({ kind:'timeframe', timeframe:String(args[0]??this.executionContext.timeframe) });
    if(name==='series') return finish({ kind:'series', timeframe:String(args[0]??this.executionContext.timeframe) });
    if(name==='__market_timeframe') {
      const ref=args[0] as Record<string, unknown> | null | undefined;
      const timeframe=String(args[1] ?? this.executionContext.timeframe);
      const symbol=ref?.kind === 'market'
        ? String(ref.symbol ?? this.executionContext.symbol)
        : this.executionContext.symbol;
      return finish({ kind:'market', symbol, timeframe });
    }
    if(name==='__market_alignment') {
      const ref=args[0] as Record<string, unknown> | null | undefined;
      const phase=String(args[1] ?? 'confirmed');
      if(!ref||!['market','timeframe','series'].includes(String(ref.kind??''))||
        !['confirmed','developing','historical','realtime'].includes(phase)) return finish(null);
      const alignment=phase==='developing'||phase==='realtime'?'developing':'last-confirmed';
      return finish({...ref,alignment,temporalPhase:phase});
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
    if(name==='time') return finish(this.toEpoch(bar.timestamp));
    if(name==='bar_index') return finish(index);
    if (name==='nz') { const value=Number(args[0]); return finish(Number.isFinite(value) ? value : Number(args[1] ?? 0)); }
    if (name==='isNa') return finish(args[0] == null || (typeof args[0] === 'number' && !Number.isFinite(args[0])));
    if (name==='max') return finish(Math.max(Number(args[0]), Number(args[1])));
    if (name==='min') return finish(Math.min(Number(args[0]), Number(args[1])));
    if (name==='abs') return finish(Math.abs(Number(args[0])));
    if (name==='toNumber'||name==='toPrice'||name==='toVolume'||name==='toTime'||name==='toDuration'||name==='toCurrency') return finish(Number(args[0]));
    if (name==='sqrt') return finish(Math.sqrt(Number(args[0])));
    if (name==='pow') return finish(Math.pow(Number(args[0]), Number(args[1])));
    if (name==='log') return finish(Math.log(Number(args[0])));
    if (name==='roc') {
      const period=Math.max(1,Math.floor(Number(args[1] ?? 1)));
      const current=Number(args[0]);
      const seriesName=seriesArgs[0] || 'close';
      const previous=this.loadSeries(seriesName,period,bar,bars,index);
      return finish(Number.isFinite(current) && previous !== null && Number.isFinite(Number(previous)) && Number(previous)!==0 ? (current/Number(previous)-1)*100 : null);
    }
    if (name==='exp') return finish(Math.exp(Number(args[0])));
    if(name==='returns'){
      const ref=args[0];
      let current=Number.NaN;
      let previous=Number.NaN;
      const objectRef=ref && typeof ref==='object' ? ref as Record<string,unknown> : undefined;
      const symbol=objectRef?.kind==='market' ? String(objectRef.symbol ?? this.executionContext.symbol) : this.executionContext.symbol;
      const timeframe=objectRef?.kind==='market' ? String(objectRef.timeframe ?? this.executionContext.timeframe) : this.executionContext.timeframe;
      if(objectRef?.kind==='market'){
        if(!this.dataResolver?.requestAt) return finish(null);
        const ctx:CoreSpiritDataResolutionContext={
          asOfTimestamp:this.toEpoch(bar.timestamp),
          baseSymbol:this.executionContext.symbol,
          baseTimeframe:this.executionContext.timeframe,
          executionMode:this.executionContext.mode,
          revision:this.state.barState.revision,
          alignment:'last-confirmed',
        };
        const now=this.dataResolver.requestAt({symbol,timeframe,field:'close',offset:0},ctx);
        const prior=this.dataResolver.requestAt({symbol,timeframe,field:'close',offset:1},ctx);
        if ((now && typeof (now as any).then==='function') || (prior && typeof (prior as any).then==='function')) return finish(null);
        const confirmedNow=now && typeof now==='object' ? validateSynchronizedSnapshot(now as CoreSpiritDataSnapshot,ctx) : null;
        const confirmedPrior=prior && typeof prior==='object' ? validateSynchronizedSnapshot(prior as CoreSpiritDataSnapshot,ctx) : null;
        current=Number(confirmedNow?.value ?? Number.NaN);
        previous=Number(confirmedPrior?.value ?? Number.NaN);
      }else{
        current=Number(bars[index]?.close ?? Number.NaN);
        previous=Number(bars[Math.max(0,index-1)]?.close ?? Number.NaN);
      }
      if(!Number.isFinite(current)||!Number.isFinite(previous)||previous===0)return finish(null);
      return finish(current/previous-1);
    }
    if(name==='beta'){
      const x=Number(args[0]), y=Number(args[1]), period=Math.max(2,Math.floor(Number(args[2] ?? 252)));
      if(!Number.isFinite(x)||!Number.isFinite(y))return finish(null);
      const key=`beta:${callKey}:${period}`;
      this.rememberKernelIdentity('beta', key, callKey, seriesArgs);
      let kernel=this.betaKernels.get(key);
      if(!kernel){kernel=new RollingBetaState(period);this.betaKernels.set(key,kernel);}
      const mode:'append'|'replace'=this.lastBarWasRealtime&&this.realtimeRevision>0?'replace':'append';
      return finish(kernel.update(x,y,mode));
    }
    if(name==='trendStrength'){
      const value=Number(args[0]), period=Math.max(2,Math.floor(Number(args[1] ?? 50)));
      if(!Number.isFinite(value))return finish(null);
      const key=`trend:${callKey}:${period}`;
      this.rememberKernelIdentity('trend', key, callKey, seriesArgs);
      let kernel=this.trendStrengthKernels.get(key);
      if(!kernel){kernel=new RollingCorrelationState(period);this.trendStrengthKernels.set(key,kernel);}
      const mode:'append'|'replace'=this.lastBarWasRealtime&&this.realtimeRevision>0?'replace':'append';
      return finish(kernel.update(value,mode));
    }
    if(name==='regimeDetect')return finish(detectQuantRegime(Number(args[0]),Number(args[1]),Number(args[2] ?? 0.02)));
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
      const key = 'direct:' + callKey + '|' + name + '|' + series + '|' + length;
      this.rememberKernelIdentity('direct', key, callKey, seriesArgs);
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
      this.rememberKernelIdentity('rsi', key, callKey, seriesArgs);
      let kernel = this.rsiKernels.get(key); if (!kernel) { kernel = new RSIState(length); this.rsiKernels.set(key, kernel); }
      const mode: 'append'|'replace' = this.lastBarWasRealtime && this.realtimeRevision > 0 ? 'replace' : 'append';
      return finish(kernel.update(current, mode));
    }
    if(name==='atr') {
      const key = 'atr:' + length;
      this.rememberKernelIdentity('atr', key, callKey, seriesArgs);
      let kernel = this.atrKernels.get(key); if (!kernel) { kernel = new ATRState(length); this.atrKernels.set(key, kernel); }
      const mode: 'append'|'replace' = this.lastBarWasRealtime && this.realtimeRevision > 0 ? 'replace' : 'append';
      return finish(kernel.update(Number(bar.high), Number(bar.low), Number(bar.close), mode));
    }
    if(name==='vwap') {
      const key = 'vwap:session';
      this.rememberKernelIdentity('vwap', key, callKey, seriesArgs);
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
        if (kind==='market' || kind==='timeframe' || kind==='series') {
          const symbol=kind==='market' ? String(r.symbol ?? this.executionContext.symbol) : this.executionContext.symbol;
          // market(...).timeframe(...) keeps kind='market'; always honor its
          // explicit timeframe instead of silently falling back to the chart TF.
          const timeframe=String(r.timeframe ?? this.executionContext.timeframe);
          const field=member;
          if(field==='trade') return finish(this.dataResolver?.trade?.(symbol,timeframe) ?? null);
          if(field==='orderbook') return finish(this.dataResolver?.orderbook?.(symbol,timeframe) ?? null);
          if(field==='footprint') return finish(this.dataResolver?.footprint?.(symbol,timeframe) ?? null);
          if(field==='volumeProfile') return finish(this.dataResolver?.volumeProfile?.(symbol,timeframe) ?? null);
          if(['open','high','low','close','volume','time'].includes(field)) {
            const alignment = r.alignment === 'developing' ? 'developing' : 'last-confirmed';
            // Historical higher-timeframe rows may already contain final values;
            // only a realtime host can supply a trustworthy developing snapshot.
            if(alignment==='developing' && this.executionContext.mode!=='realtime') return finish(null);
            const req={symbol,timeframe,field:field as CoreSpiritDataRequest['field'],offset:0};
            const memoKey=`request:${index}:${symbol}:${timeframe}:${field}:0:${alignment}`;
            if(this.dataMemo.has(memoKey)) return finish(this.dataMemo.get(memoKey));
            const ctx: CoreSpiritDataResolutionContext={asOfTimestamp:this.toEpoch(bar.timestamp),baseSymbol:this.executionContext.symbol,baseTimeframe:this.executionContext.timeframe,executionMode:this.executionContext.mode,revision:this.state.barState.revision,alignment};
            const resolver=this.dataResolver;
            const value=resolver?.requestAt ? resolver.requestAt(req,ctx) : resolver?.request?.(req);
            if(value && typeof (value as any).then==='function') return finish(null);
            const validated=value && typeof value==='object'
              ? validateSynchronizedSnapshot(value as CoreSpiritDataSnapshot,ctx)
              : null;
            const resolved=validated?.value ?? null;
            this.dataMemo.set(memoKey,resolved);
            return finish(resolved);
          }
        }
      }
      return finish(null);
    }
    if(name==='request') {
      const symbol=String(args[0] ?? this.executionContext.symbol);
      const timeframe=String(args[1] ?? this.executionContext.timeframe);
      const field=String(args[2] ?? 'close') as CoreSpiritDataRequest['field'];
      const offset=Math.max(0,Math.floor(Number(args[3] ?? 0)));
      const phase=String(args[4] ?? 'confirmed').toLowerCase();
      if(!['confirmed','historical','developing','realtime'].includes(phase)) return finish(null);
      const alignment:CoreSpiritDataAlignment=phase==='developing'||phase==='realtime'?'developing':'last-confirmed';
      // Completed historical higher-TF candles cannot stand in for a developing snapshot.
      if(alignment==='developing' && this.executionContext.mode!=='realtime') return finish(null);
      const requestAt=this.dataResolver?.requestAt;
      const requestCurrent=this.dataResolver?.request;
      if(!requestAt&&!requestCurrent) return finish(null);
      const key=`request:${index}:${symbol}:${timeframe}:${field}:${offset}:${alignment}`;
      if(this.dataMemo.has(key)) return finish(this.dataMemo.get(key));
      const asOfTimestamp=this.toEpoch(bar.timestamp);
      const ctx:CoreSpiritDataResolutionContext={
        asOfTimestamp,baseSymbol:this.executionContext.symbol,baseTimeframe:this.executionContext.timeframe,
        executionMode:this.executionContext.mode,revision:this.state.barState.revision,alignment,
      };
      const request:CoreSpiritDataRequest={symbol,timeframe,field,offset};
      const value=requestAt?requestAt(request,ctx):(alignment==='developing'?null:requestCurrent!(request));
      // Async providers must prefetch into the host-owned snapshot before VM execution.
      if(value && typeof (value as any).then==='function') return finish(null);
      const snapshot=value as CoreSpiritDataSnapshot|undefined;
      const validated=snapshot && typeof snapshot==='object'
        ? validateSynchronizedSnapshot(snapshot,ctx)
        : null;
      const resolved=validated?.value ?? null;
      this.dataMemo.set(key,resolved);
      return finish(resolved);
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
    // Viewport/backfill rendering passes evaluate a bounded slice of history and
    // are not an execution clock. Suppress any order/alert/webhook side effects
    // before argument validation or intent construction.
    if (this.suppressExternalEffects && ['orderIntent','buy','sell','entry','exit','alert','webhook'].includes(kind)) return;
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
        const isAt=kind==='labelAt';
        // labelAt retains the original price-first form: labelAt(price, text, ...).
        // A time-first overload supports confirmed historical anchors:
        // labelAt(timeSeconds, price, text, position, background, color, size, shape, weight).
        // Its second argument is numeric and its third is text, keeping the legacy form unambiguous.
        const timeAnchored=isAt&&args.length>=3&&Number.isFinite(Number(args[0]))&&Number.isFinite(Number(args[1]))&&typeof args[2]==='string';
        const labelTime=timeAnchored?num(args[0]):time;
        const price=Number(isAt?(timeAnchored?args[1]:args[0]):(String(args[1]??'above')==='below'?bar.low:bar.high));
        const text=String(isAt?args[timeAnchored?2:1]:args[0]??'');
        const position=String(isAt?args[timeAnchored?3:2]??'price':args[1]??'above') as any;
        const background=String(isAt?args[timeAnchored?4:3]??'#2563eb':args[2]??'#2563eb');
        const textColor=String(isAt?args[timeAnchored?5:4]??'#ffffff':args[3]??'#ffffff');
        const fontSize=Number(isAt?args[timeAnchored?6:5]??12:args[4]??12);
        const shape=String(isAt?args[timeAnchored?7:6]??'pill':args[5]??'pill') as any;
        const fontWeight=String(isAt?args[timeAnchored?8:7]??'600':args[6]??'600');
        const fontStyle=String(isAt?(timeAnchored?'normal':args[8]??'normal'):args[7]??'normal') as any;
        const id=timeAnchored
          ? `${this.options.sourceId}:labelAt:${outputId||'label'}:${labelTime}`
          : `${this.options.sourceId}:label:${barIndex}:${outputId||text}`;
        if(Number.isFinite(labelTime)&&Number.isFinite(price)&&text) outputs.push({kind:'label',id,time:labelTime,price,text,position,style:{background,color:textColor,fontSize,shape,fontWeight,fontStyle},metadata:{source:this.options.sourceId,barIndex,...(timeAnchored?{anchor:'time-price'}:{})}});
      }
      else if(kind==='line'){
        const a={time:num(args[0])||time,price:num(args[1])},b={time:num(args[2])||time,price:num(args[3])};
        if(Number.isFinite(a.price)&&Number.isFinite(b.price)) { const md=(typeof args.at(-1)==='object'&&args.at(-1))?(args.at(-1) as Record<string,unknown>):{}; outputs.push({kind:'line',id:`${this.options.sourceId}:line:${outputId||'line'}:${a.time}`,start:a,end:b,style:{source:this.options.sourceId,color:color(args[4],'#f59e0b'),lineWidth:Math.max(1,Math.min(6,num(args[5])||1))},metadata:{source:this.options.sourceId,barIndex,...md}}); }
      }
      else if(kind==='zone'){
        const left=num(args[0])||time,right=num(args[1])||time,top=num(args[2]),bottom=num(args[3]);
        if([left,right,top,bottom].every(Number.isFinite)) outputs.push({kind:'zone',id:`${this.options.sourceId}:zone:${outputId||'zone'}`,left,right,top,bottom,state:'active',style:{color:color(args[4],'#38bdf8'),fillColor:color(args[5],color(args[4],'#38bdf8')),fillOpacity:Number.isFinite(Number(args[6]))?Math.max(0,Math.min(1,num(args[6]))):0.12,pattern:(typeof args[7]==='string'?args[7]:'solid') as any}});
      }
      else if(kind==='box'){
        const left=num(args[0])||time,right=num(args[1])||time,top=num(args[2]),bottom=num(args[3]);
        if([left,right,top,bottom].every(Number.isFinite)) outputs.push({kind:'box',id:`${this.options.sourceId}:box:${outputId||'box'}:${left}`,left,right,top,bottom,style:{fillColor:color(args[4],'#2563eb'),color:color(args[5],'#2563eb'),fillOpacity:Number.isFinite(Number(args[6]))?Math.max(0,Math.min(1,num(args[6]))):0.16,pattern:(typeof args[7]==='string'?args[7]:'solid') as any}});
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
        if([a.time,a.price,b.time,b.price].every(Number.isFinite)) outputs.push({kind:'arrow',id:`${this.options.sourceId}:arrow:${outputId||'arrow'}:${a.time}`,start:a,end:b,style:{color:color(args[4],'#f59e0b'),lineWidth:Number.isFinite(Number(args[5]))?Math.max(1,Math.min(8,num(args[5]))):2}});
      }
      else if(kind==='shape'||kind==='heatmap'){
        const price=num(args[0]),shape=kind==='heatmap'?'square':String(args[1]||'circle') as any;
        if(finite(price)){ const intensity=kind==='heatmap'?Math.max(0,Math.min(1,Math.abs(num(args[1])))):1; outputs.push({kind:'shape',id:`${this.options.sourceId}:shape:${outputId||'shape'}:${barIndex}`,time,price,shape,style:{color:color(kind==='heatmap'?args[2]:args[2],'#f59e0b'),fillColor:color(args[2],'#f59e0b'),opacity:kind==='heatmap'?Math.max(.08,intensity):1,size:Number.isFinite(Number(kind==='heatmap'?args[3]:args[3]))?Math.max(4,Math.min(40,num(args[3])||10)):10,text:typeof args[4]==='string'?args[4]:undefined}}); }
      }
      else if(kind==='polyline'){
        const points: {time:number;price:number}[]=[]; let i=0;
        while(i+1<args.length && typeof args[i] !== 'string' && Number.isFinite(num(args[i])) && Number.isFinite(num(args[i+1])) && points.length<8){ points.push({time:num(args[i]),price:num(args[i+1])}); i+=2; }
        const stroke=color(args[i],'#38bdf8'); const width=Number.isFinite(num(args[i+1]))?Math.max(1,Math.min(8,num(args[i+1]))):2;
        if(points.length>=2) outputs.push({kind:'polyline',id:`${this.options.sourceId}:polyline:${outputId||'polyline'}:${points[0]?.time ?? time}`,points,style:{color:stroke,lineWidth:width,pattern:(typeof args[i+2]==='string'?args[i+2]:'solid') as any}});
      }
      else if(kind==='hline'){
        const price=num(args[0]); if(Number.isFinite(price)) outputs.push({kind:'hline',id:`${this.options.sourceId}:hline:${outputId||'hline'}`,price,style:{color:color(args[1],'#64748b'),lineWidth:Number.isFinite(num(args[2]))?Math.max(1,Math.min(6,num(args[2]))):1,lineStyle:Number.isFinite(num(args[3]))?num(args[3]):0}});
      }
      else if(kind==='bg' || kind==='barcolor'){
        if(kind==='bg' && args.length>=3 && args[0]==null) return;
        const c=color(args[0],'#2563eb'), opacity=Number.isFinite(num(args[1]))?Math.max(0,Math.min(1,num(args[1]))):0.12;
        outputs.push({kind:kind==='bg'?'background':'barcolor',id:`${this.options.sourceId}:${kind}:${barIndex}`,time,color:c,opacity,metadata:{barIndex,source:this.options.sourceId}} as any);
      }
      else if(kind==='table'){
        const position=String(args[0]||'topRight') as any, row=Math.max(0,Math.floor(num(args[1]))), column=Math.max(0,Math.floor(num(args[2]))), text=String(args[3]??'');
        outputs.push({kind:'table',id:`${this.options.sourceId}:table:${position}:${row}:${column}:${outputId||'table'}`,position,row,column,text,style:{background:color(args[4],'rgba(15,23,42,.88)'),color:color(args[5],'#fff'),fontSize:Number.isFinite(num(args[6]))?Math.max(8,Math.min(32,num(args[6]))):12},metadata:{source:this.options.sourceId}});
      }
      else if(kind==='scanCandidate'){
        const score=Number(args[0]??0); const label=typeof args[1]==='string'?args[1]:undefined; const metadata=typeof args[2]==='object'&&args[2] ? args[2] as Record<string,unknown> : {};
        outputs.push({kind:'scanCandidate',id:`${this.options.sourceId}:scan:${barIndex}:${outputId||label||'candidate'}`,time,score:Number.isFinite(score)?score:0,label,metadata:{source:this.options.sourceId,barIndex,...metadata}});
      }
      else if(kind==='event'){
        const name=String(args[0]??'event');
        const event={kind:'event' as const,id:`${this.options.sourceId}:event:${barIndex}:${outputId||name}`,time,name,metadata:{source:this.options.sourceId,barIndex}};
        outputs.push(event);
        if (!this.suppressExternalEffects) this.eventRouter.scriptEvent({scriptId:this.options.sourceId,time,name,metadata:{barIndex}});
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
        if (!this.suppressExternalEffects) this.eventRouter.executionIntent(this.options.sourceId,intent);
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
        if (!this.suppressExternalEffects) this.eventRouter.scriptSignal({scriptId:this.options.sourceId,time,type,metadata:{barIndex}});
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
      else if(kind==='alert' && !this.suppressExternalEffects) this.eventRouter.scriptAlert({scriptId:this.options.sourceId,time,payload:{args,barIndex}});
      else if(kind==='webhook' && !this.suppressExternalEffects) this.eventRouter.scriptWebhook({scriptId:this.options.sourceId,time,endpoint:typeof args[0]==='string'?args[0]:undefined,payload:{args:typeof args[0]==='string'?args.slice(1):args,barIndex}});
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
