/**
 * CoreSpirit numerical execution planner — principles #23 / #24.
 *
 * This is a planner, not a GPU implementation. It decides whether a pure
 * numerical workload is eligible for CPU/WASM/GPU execution. The actual
 * backend remains host-owned.
 *
 * Design goals:
 * - never move side effects/broker/risk operations to a compute backend;
 * - keep deterministic execution opt-in and explicit;
 * - batch large symbol × timeframe × bar workloads;
 * - preserve one Core IR / one semantic graph / one runtime contract.
 */
import type { CoreSpiritIrProgram } from './ir';
import type { CoreSpiritGraphNode } from './semanticGraph';
import { coreSpiritChecksum } from './artifact';
import { executionLaneForNode } from './coreSpiritExecutionModel';
import { planCoreSpiritSeriesFusion, type CoreSpiritSeriesFusionPlan } from './seriesFusion';
import type { CoreSpiritSpecializedPlan } from './specializedPlan';
import { buildCoreSpiritSpecializedPlan } from './specializedPlan';
import type { CoreSpiritTradingNativePlan } from './tradingNativePlan';
import {
  createCoreSpiritBackendRegistry,
  planCoreSpiritBackend,
  toLegacyCoreSpiritBackendProfiles,
} from './backendRegistry';
import { coreSpiritKernelOperationForBuiltin, isCoreSpiritStatefulKernelOperation } from './kernelOperationMap';
import type {
  CoreSpiritBackendPlan,
  CoreSpiritBackendPurpose,
  CoreSpiritBackendRegistry,
  CoreSpiritBackendWorkload,
} from './backendRegistry';

export type CoreSpiritComputeBackend = 'cpu' | 'wasm' | 'gpu';

export interface CoreSpiritComputeBackendProfile {
  backend: CoreSpiritComputeBackend;
  available: boolean;
  deterministic: boolean;
  vectorized: boolean;
  maxBatchSize: number;
  sharedMemoryBytes: number;
  /** Exact operations supported by the registered adapter; absent means no offload eligibility. */
  supportedOperations?: readonly string[];
  supportsStatefulSeries?: boolean;
}

export interface CoreSpiritExecutionPlannerOptions {
  backends?: readonly CoreSpiritComputeBackendProfile[];
  requireDeterministic?: boolean;
  allowSplitPureWork?: boolean;
  minGpuWorkUnits?: number;
  minWasmWorkUnits?: number;
  maxBatchSize?: number;
  symbolCount?: number;
  timeframeCount?: number;
  barCount?: number;
  sandbox?: { requireComputeBackend(backend: CoreSpiritComputeBackend): void };
  tradingNativePlan?: CoreSpiritTradingNativePlan;
  /** Runtime context for per-kernel planning; omitted means safe live/local planning. */
  backendPurpose?: CoreSpiritBackendPurpose;
  backendRegistry?: CoreSpiritBackendRegistry;
  allowRemoteResearchBackend?: boolean;
  /** Optional measured cost model; conservative defaults avoid tiny-workload offload. */
  estimatedCpuWorkUnitsPerMs?: number;
  estimatedWasmWorkUnitsPerMs?: number;
  estimatedGpuWorkUnitsPerMs?: number;
  estimatedTransferBytesPerMs?: number;
  wasmStartupMs?: number;
  gpuStartupMs?: number;
  estimatedTransferBytes?: number;
  /** True when the caller can overlap execution with other work and amortize setup. */
  workloadAlreadyAsync?: boolean;
  /** Live chart output is latency-sensitive; include result handoff in the offload decision. */
  resultNeededImmediately?: boolean;
}

export interface CoreSpiritWorkloadEstimate {
  instructionCount: number;
  pureInstructionCount: number;
  effectInstructionCount: number;
  vectorizableInstructionCount: number;
  symbols: number;
  timeframes: number;
  bars: number;
  workUnits: number;
  estimatedBarWork: number;
  estimatedPureBarWork: number;
  estimatedSavedBarWork: number;
}

export interface CoreSpiritExecutionBatch {
  batchIndex: number;
  symbolStart: number;
  symbolCount: number;
  timeframeStart: number;
  timeframeCount: number;
  barStart: number;
  barCount: number;
  estimatedWorkUnits: number;
}

export interface CoreSpiritBackendAssignment {
  backend: CoreSpiritComputeBackend;
  nodeIds: readonly string[];
  workUnits: number;
  deterministic: boolean;
  reason: string;
}

export interface CoreSpiritExecutionPlan {
  version: 1;
  strategy: 'cpu-fallback' | 'wasm-portable' | 'gpu-vectorized' | 'hybrid-pure-offload';
  workload: CoreSpiritWorkloadEstimate;
  batches: readonly CoreSpiritExecutionBatch[];
  assignments: readonly CoreSpiritBackendAssignment[];
  deterministic: boolean;
  explanation: readonly string[];
  hostOwned: true;
  cacheKey: string;
  lanes: Readonly<{ hot: readonly string[]; warm: readonly string[]; cold: readonly string[] }>;
  barriers: readonly string[];
  seriesFusion: CoreSpiritSeriesFusionPlan;
  specializedPlan: CoreSpiritSpecializedPlan;
  tradingNativePlan: CoreSpiritTradingNativePlan;
  dataGraph: CoreSpiritTradingNativePlan['dataGraph'];
  chronologicalPasses: 1;
  sourceReadReuse: number;
  estimatedSavedWorkUnits: number;
  /** Per-kernel capability decisions; these are plans, not claims that an adapter ran. */
  backendCapabilityPlans: readonly CoreSpiritBackendPlan[];
}

export const CORE_SPIRIT_DEFAULT_COMPUTE_BACKENDS: readonly CoreSpiritComputeBackendProfile[] = Object.freeze([
  { backend: 'cpu', available: true, deterministic: true, vectorized: false, maxBatchSize: 1_000_000, sharedMemoryBytes: 0 },
  { backend: 'wasm', available: false, deterministic: true, vectorized: true, maxBatchSize: 65_536, sharedMemoryBytes: 64 * 1024 * 1024 },
  { backend: 'gpu', available: false, deterministic: false, vectorized: true, maxBatchSize: 262_144, sharedMemoryBytes: 512 * 1024 * 1024 },
]);

function nodesFrom(program: CoreSpiritIrProgram): CoreSpiritGraphNode[] {
  return program.graphs?.semantic.nodes ?? program.entry.instructions.map((instruction, index) => ({
    id: `i:${index}`,
    instruction: index,
    kind: instruction.op === 'emit' ? 'effect' : instruction.op === 'loadSeries' ? 'input' : 'compute',
    op: instruction.op,
    name: instruction.op === 'call' ? instruction.name : instruction.op,
    dest: 'dest' in instruction ? instruction.dest : undefined,
    dependencies: [],
    sourceInputs: [],
    pure: ['const','loadSeries','move','unary','binary','index'].includes(instruction.op) ||
      (instruction.op === 'call' && coreSpiritKernelOperationForBuiltin(instruction.name) !== undefined),
    effectful: !(['const','loadSeries','move','unary','binary','index'].includes(instruction.op) ||
      (instruction.op === 'call' && coreSpiritKernelOperationForBuiltin(instruction.name) !== undefined)),
  } as unknown as CoreSpiritGraphNode));
}

export function estimateCoreSpiritWorkload(
  program: CoreSpiritIrProgram,
  dimensions: { symbolCount?: number; timeframeCount?: number; barCount?: number } = {},
): CoreSpiritWorkloadEstimate {
  const nodes = nodesFrom(program);
  const symbols = Math.max(1, Math.floor(dimensions.symbolCount ?? 1));
  const timeframes = Math.max(1, Math.floor(dimensions.timeframeCount ?? 1));
  const bars = Math.max(1, Math.floor(dimensions.barCount ?? 1));
  const pureInstructionCount = nodes.filter(node => node.pure && !node.effectful).length;
  const effectInstructionCount = nodes.filter(node => node.effectful).length;
  const vectorizableInstructionCount = nodes.filter(node => node.pure && !node.effectful && ['binary','unary','call','loadSeries','index'].includes(node.op)).length;
  const estimatedPureBarWork = program.optimizationPlan?.cost.pureBarWork ?? Math.max(1, pureInstructionCount);
  const estimatedBarWork = program.optimizationPlan?.cost.estimatedBarWork ?? Math.max(1, pureInstructionCount + effectInstructionCount * 0.25);
  const estimatedSavedBarWork = program.optimizationPlan?.cost.estimatedSavedBarWork ?? 0;
  return {
    instructionCount: nodes.length,
    pureInstructionCount,
    effectInstructionCount,
    vectorizableInstructionCount,
    symbols,
    timeframes,
    bars,
    workUnits: Math.max(1, estimatedPureBarWork) * symbols * timeframes * bars,
    estimatedBarWork,
    estimatedPureBarWork,
    estimatedSavedBarWork,
  };
}

function makeBatches(workload: CoreSpiritWorkloadEstimate, maxBatchSize: number): CoreSpiritExecutionBatch[] {
  const batches: CoreSpiritExecutionBatch[] = [];
  const symbolChunk = 1;
  const timeframeChunk = 1;
  const barsPerBatch = Math.max(1, Math.floor(maxBatchSize / Math.max(1, workload.pureInstructionCount * symbolChunk * timeframeChunk)));
  let batchIndex = 0;
  for (let symbolStart = 0; symbolStart < workload.symbols; symbolStart += symbolChunk) {
    for (let timeframeStart = 0; timeframeStart < workload.timeframes; timeframeStart += timeframeChunk) {
      for (let barStart = 0; barStart < workload.bars; barStart += barsPerBatch) {
        const barCount = Math.min(barsPerBatch, workload.bars - barStart);
        batches.push({
          batchIndex: batchIndex++,
          symbolStart,
          symbolCount: Math.min(symbolChunk, workload.symbols - symbolStart),
          timeframeStart,
          timeframeCount: Math.min(timeframeChunk, workload.timeframes - timeframeStart),
          barStart,
          barCount,
          estimatedWorkUnits: workload.pureInstructionCount * Math.min(symbolChunk, workload.symbols - symbolStart) * Math.min(timeframeChunk, workload.timeframes - timeframeStart) * barCount,
        });
      }
    }
  }
  return batches;
}

function pickBackend(
  profiles: readonly CoreSpiritComputeBackendProfile[],
  workload: CoreSpiritWorkloadEstimate,
  options: Required<Pick<CoreSpiritExecutionPlannerOptions, 'requireDeterministic'|'allowSplitPureWork'|'minGpuWorkUnits'|'minWasmWorkUnits'>> & CoreSpiritExecutionPlannerOptions,
  capabilityPlans: readonly CoreSpiritBackendPlan[],
): CoreSpiritComputeBackendProfile {
  const cpu = profiles.find(profile => profile.backend === 'cpu') ??
    { backend: 'cpu' as const, available: true, deterministic: true, vectorized: false, maxBatchSize: 1_000_000, sharedMemoryBytes: 0 };
  // The whole-program compatibility planner must never advertise acceleration
  // from optimistic caller metadata. The executable registry and exact per-kernel
  // plans are the source of truth.
  const accelerated = capabilityPlans.length > 0 &&
    capabilityPlans.every(plan => !plan.fallback && plan.backend === capabilityPlans[0]!.backend);
  if (!accelerated || !workload.vectorizableInstructionCount) return cpu;
  const actualBackend = capabilityPlans[0]!.backend;
  const legacyBackend: CoreSpiritComputeBackend | undefined =
    actualBackend === 'wasm-simd' ? 'wasm' : actualBackend === 'webgpu' ? 'gpu' : undefined;
  if (!legacyBackend) return cpu;
  const profile = profiles.find(candidate => candidate.backend === legacyBackend);
  if (!profile?.available || !profile.vectorized ||
      (options.requireDeterministic && !profile.deterministic)) return cpu;
  const requiredThreshold = legacyBackend === 'gpu' ? options.minGpuWorkUnits : options.minWasmWorkUnits;
  if (workload.workUnits < requiredThreshold) return cpu;
  // WebGPU is for stateless historical kernels only. Stateful recurrences stay
  // in chronological CPU execution unless a separately validated path is added.
  if (legacyBackend === 'gpu' && capabilityPlans.some(plan => ['ema', 'rma', 'atr', 'rsi'].includes(plan.operation))) return cpu;

  // Compare estimated end-to-end costs, not just arithmetic throughput. These
  // are conservative defaults and can be replaced with measured host telemetry.
  // Stateful recurrences and effects remain CPU-owned regardless of this score.
  const cpuThroughput = Math.max(1, options.estimatedCpuWorkUnitsPerMs ?? 25_000);
  const acceleratedThroughput = Math.max(1, legacyBackend === 'gpu'
    ? options.estimatedGpuWorkUnitsPerMs ?? 500_000
    : options.estimatedWasmWorkUnitsPerMs ?? 150_000);
  const transferRate = Math.max(1, options.estimatedTransferBytesPerMs ?? 100_000_000);
  const inferredTransferBytes = Math.max(0, options.estimatedTransferBytes ??
    workload.bars * workload.symbols * workload.timeframes * Float64Array.BYTES_PER_ELEMENT * Math.max(1, capabilityPlans.length));
  const startupMs = options.workloadAlreadyAsync ? 0 : legacyBackend === 'gpu'
    ? Math.max(0, options.gpuStartupMs ?? 5)
    : Math.max(0, options.wasmStartupMs ?? 1.5);
  const handoffMs = options.resultNeededImmediately ? inferredTransferBytes / transferRate : 0;
  const eligibleWorkUnits = workload.workUnits * Math.min(1, capabilityPlans.length / Math.max(1, workload.pureInstructionCount));
  const cpuCostMs = workload.workUnits / cpuThroughput;
  const acceleratedCostMs = eligibleWorkUnits / acceleratedThroughput + inferredTransferBytes / transferRate + startupMs + handoffMs;
  if (acceleratedCostMs >= cpuCostMs) return cpu;
  return profile;
}

export function planCoreSpiritExecution(
  program: CoreSpiritIrProgram,
  options: CoreSpiritExecutionPlannerOptions = {},
): CoreSpiritExecutionPlan {
  const inputErrors = validateCoreSpiritExecutionPlannerInputs(options);
  if (inputErrors.length) throw new Error(`Invalid CoreSpirit execution planner options: ${inputErrors.join('; ')}`);
  const backendRegistry = options.backendRegistry ?? createCoreSpiritBackendRegistry();
  const registeredProfiles = toLegacyCoreSpiritBackendProfiles(backendRegistry);
  const requestedProfiles = options.backends?.length ? [...options.backends] : registeredProfiles;
  // Caller-supplied profiles may tune limits but cannot manufacture adapter
  // availability. Intersect them with live registry capabilities before planning.
  const profiles: CoreSpiritComputeBackendProfile[] = requestedProfiles.map(profile => {
    const registryBackend = backendRegistry.get(
      profile.backend === 'wasm' ? 'wasm-simd' : profile.backend === 'gpu' ? 'webgpu' : 'cpu-optimized',
    );
    return {
      ...profile,
      available: profile.available && registryBackend?.available === true,
      deterministic: profile.deterministic && registryBackend?.deterministic === true,
      vectorized: profile.vectorized && registryBackend?.vectorized === true,
      maxBatchSize: Math.max(1, Math.min(profile.maxBatchSize, registryBackend?.maxInputElements ?? 1)),
      supportedOperations: registryBackend?.supportedOperations ?? [],
      supportsStatefulSeries: registryBackend?.supportsStatefulSeries ?? false,
    };
  });
  const requireDeterministic = options.requireDeterministic ?? true;
  const allowSplitPureWork = options.allowSplitPureWork ?? true;
  const minGpuWorkUnits = Math.max(1, Math.floor(options.minGpuWorkUnits ?? 1_000_000));
  const minWasmWorkUnits = Math.max(1, Math.floor(options.minWasmWorkUnits ?? 10_000));
  // Keep every planned batch inside the CPU kernel library's hard input bound.
  const maxBatchSize = Math.max(1, Math.min(4_194_304, Math.floor(options.maxBatchSize ?? 65_536)));
  const workload = estimateCoreSpiritWorkload(program, {
    symbolCount: options.symbolCount,
    timeframeCount: options.timeframeCount,
    barCount: options.barCount,
  });
  const nodes = nodesFrom(program);
  const backendPurpose = options.backendPurpose ?? 'live';
  const kernelCalls = program.entry.instructions.flatMap((instruction, index) => {
    if (instruction.op !== 'call') return [];
    const operation = coreSpiritKernelOperationForBuiltin(instruction.name);
    if (!operation) return [];
    const matrixOperation = operation === 'matrixMultiply' || operation === 'matrixDecomposition';
    const workloadKind: CoreSpiritBackendWorkload = matrixOperation ? 'matrix'
      : operation === 'dotProduct' || operation === 'logSumExp' || operation === 'softmax' ? 'scalar'
      : 'series';
    return [{ operation, workloadKind, stateful: isCoreSpiritStatefulKernelOperation(operation), nodeId: `i:${index}` }];
  });
  const perKernelWork = Math.max(1, workload.workUnits / Math.max(1, kernelCalls.length));
  // Per-dispatch size is bounded by the compiler's actual batch limit; workUnits below still reflect total workload for threshold selection.
  const inputElements = Math.max(1, Math.min(workload.bars * workload.symbols * workload.timeframes, maxBatchSize));
  const backendCapabilityPlans: readonly CoreSpiritBackendPlan[] = Object.freeze(kernelCalls.map(call =>
    planCoreSpiritBackend({
      operation: call.operation,
      purpose: backendPurpose,
      workload: call.workloadKind,
      workUnits: perKernelWork,
      inputElements,
      stateful: call.stateful,
      deterministic: requireDeterministic,
      allowRemoteResearch: options.allowRemoteResearchBackend === true,
    }, backendRegistry),
  ));
  const effectNodes = nodes.filter(node => node.effectful);
  const pureNodes = nodes.filter(node => node.pure && !node.effectful);
  const kernelNodeIds = new Set(kernelCalls.map(call => call.nodeId));
  const offloadableNodes = pureNodes.filter(node => kernelNodeIds.has(`i:${node.instruction}`));
  let backend = pickBackend(profiles, workload, { ...options, requireDeterministic, allowSplitPureWork, minGpuWorkUnits, minWasmWorkUnits, resultNeededImmediately: options.resultNeededImmediately ?? backendPurpose === 'live' }, backendCapabilityPlans);
  // This registry describes numerical-kernel executors, not a general Core IR
  // machine. Keep unsupported IR instructions on CPU and make the split explicit.
  if (backend.backend !== 'cpu' && offloadableNodes.length === 0) {
    backend = profiles.find(profile => profile.backend === 'cpu')!;
  }
  const cpuNodes = nodes.filter(node => !offloadableNodes.includes(node));
  if (backend.backend !== 'cpu' && cpuNodes.length > 0 && !allowSplitPureWork) {
    backend = profiles.find(profile => profile.backend === 'cpu')!;
  }
  const seriesFusion = planCoreSpiritSeriesFusion(program);
  const specializedPlan = program.specializedPlan ?? buildCoreSpiritSpecializedPlan(program.entry.instructions);
  const tradingNativePlan = options.tradingNativePlan ?? program.tradingNativePlan ?? {
    version:1,
    dataDependencies:[],
    batches:[],
    eventTriggers:[],
    computeClasses:['scalar','fused','simd','worker','wasm','gpu'] as const,
    dataGraph:{version:1,nodes:[],roots:[],minimumTimeframes:[]},
    multiSymbol:false,
    multiTimeframe:false,
    dataNative:false,
    eventNative:false,
  };

  const explanation: string[] = [
    `workload=${workload.workUnits.toFixed(2)} units (${workload.symbols} symbols × ${workload.timeframes} timeframes × ${workload.bars} bars × ${workload.estimatedPureBarWork.toFixed(2)} optimized pure work/bar)`,
  ];

  let strategy: CoreSpiritExecutionPlan['strategy'];
  const assignments: CoreSpiritBackendAssignment[] = [];

  if (backend.backend === 'cpu') {
    strategy = 'cpu-fallback';
    assignments.push({
      backend: 'cpu',
      nodeIds: nodes.map(node => node.id),
      workUnits: workload.workUnits,
      deterministic: true,
      reason: effectNodes.length ? 'effectful/stateful operations require the ordered CPU runtime' : 'backend unavailable, below threshold, nondeterministic, or estimated transfer/startup/handoff cost exceeds the CPU baseline',
    });
    explanation.push('CPU is the deterministic baseline and remains the semantic fallback.');
    if (backendCapabilityPlans.length && backendCapabilityPlans.every(plan => !plan.fallback)) explanation.push('Offload was not selected because the eligible workload did not beat the estimated end-to-end CPU cost after setup and data-transfer overhead.');
  } else if (cpuNodes.length > 0) {
    strategy = 'hybrid-pure-offload';
    assignments.push({
      backend: backend.backend,
      nodeIds: offloadableNodes.map(node => node.id),
      workUnits: Math.max(1, backendCapabilityPlans.reduce((sum, plan) => sum + plan.workUnits, 0)),
      deterministic: backend.deterministic,
      reason: `registered ${backend.backend.toUpperCase()} kernels receive only explicitly mapped numerical builtin nodes`,
    });
    assignments.push({
      backend: 'cpu',
      nodeIds: cpuNodes.map(node => node.id),
      workUnits: 0,
      deterministic: true,
      reason: 'non-kernel IR, effects and unsupported operations remain ordered on CPU',
    });
    explanation.push(`hybrid plan selected: ${backend.backend} may execute ${offloadableNodes.length} registered numerical kernel node(s); CPU retains ${cpuNodes.length} other node(s).`);
  } else {
    strategy = backend.backend === 'gpu' ? 'gpu-vectorized' : 'wasm-portable';
    assignments.push({
      backend: backend.backend,
      nodeIds: offloadableNodes.map(node => node.id),
      workUnits: Math.max(1, backendCapabilityPlans.reduce((sum, plan) => sum + plan.workUnits, 0)),
      deterministic: backend.deterministic,
      reason: `${backend.backend.toUpperCase()} is registered for the exact numerical kernel operation(s) in this plan`,
    });
    explanation.push(`${backend.backend.toUpperCase()} is selected for registered numerical kernels only.`);
  }

  const computeAssignment = assignments.find(a => a.backend !== 'cpu');
  if (options.sandbox && computeAssignment) options.sandbox.requireComputeBackend(computeAssignment.backend);

  const deterministic = assignments.every(assignment => assignment.deterministic);
  if (requireDeterministic && !deterministic) {
    // Defensive fallback; pickBackend should already prevent this.
    return planCoreSpiritExecution(program, { ...options, backends: profiles.map(p => p.backend === 'gpu' ? { ...p, available: false } : p) });
  }

  const lanes = {
    hot: nodes.filter(node => executionLaneForNode({ effectful: node.effectful, stateful: node.stateful, latencyClass: node.latencyClass, kind: node.kind }) === 'hot').map(node => node.id),
    warm: nodes.filter(node => executionLaneForNode({ effectful: node.effectful, stateful: node.stateful, latencyClass: node.latencyClass, kind: node.kind }) === 'warm').map(node => node.id),
    cold: nodes.filter(node => executionLaneForNode({ effectful: node.effectful, stateful: node.stateful, latencyClass: node.latencyClass, kind: node.kind }) === 'cold').map(node => node.id),
  } as const;
  const cacheKey = coreSpiritChecksum({
    sourceId: program.sourceId,
    irVersion: program.version,
    semanticGraph: program.graphs?.semantic.checksum ?? '',
    dimensions: { symbols: workload.symbols, timeframes: workload.timeframes, bars: workload.bars },
    strategy,
    backendPurpose,
    requireDeterministic,
    backendCapabilityRegistry: backendCapabilityPlans[0]?.registrySnapshot ?? backendRegistry.profiles.map(profile => ({
      backend: profile.backend,
      available: profile.available,
      deterministic: profile.deterministic,
      vectorized: profile.vectorized,
      supportedOperations: profile.supportedOperations,
    })),
    backendCapabilities: backendCapabilityPlans.map(plan => ({
      operation: plan.operation,
      backend: plan.backend,
      deterministic: plan.deterministic,
      fallback: plan.fallback,
      workUnits: plan.workUnits,
      inputElements: plan.inputElements,
    })),
    tradingNative: {
      multiSymbol: tradingNativePlan.multiSymbol,
      multiTimeframe: tradingNativePlan.multiTimeframe,
      dataDependencyCount: tradingNativePlan.dataDependencies.length,
      eventCount: tradingNativePlan.eventTriggers.length,
      graphNodes: tradingNativePlan.dataGraph.nodes.map(node=>({id:node.id,source:node.sourceTimeframe ?? '',kind:node.kind})),
    },
  });
  explanation.push(`execution lanes: hot=${lanes.hot.length}, warm=${lanes.warm.length}, cold=${lanes.cold.length}`);
  explanation.push(`chronological traversal: 1 pass; estimated optimizer savings=${workload.estimatedSavedBarWork.toFixed(2)} work/bar`);
  if (seriesFusion.groups.length) explanation.push(`series fusion: ${seriesFusion.groups.length} group(s), ${seriesFusion.fusedInstructionCount} instruction(s) lowered to single-pass kernels`);
  explanation.push(`specialized plan: ${specializedPlan.strategy}, ${specializedPlan.slotCount} slots, ${specializedPlan.seriesFanouts.length} shared-input fanout group(s)`);
  explanation.push(`trading-native plan: symbols=${tradingNativePlan.multiSymbol ? 'multi' : 'single'}, timeframes=${tradingNativePlan.multiTimeframe ? 'multi' : 'single'}, dataDeps=${tradingNativePlan.dataDependencies.length}, events=${tradingNativePlan.eventTriggers.length}`);
  explanation.push(`data graph: nodes=${tradingNativePlan.dataGraph.nodes.length}, roots=${tradingNativePlan.dataGraph.roots.length}, minimumSources=${tradingNativePlan.dataGraph.minimumTimeframes.length}`);
  for (const capabilityPlan of backendCapabilityPlans) explanation.push(`kernel ${capabilityPlan.operation}: planned ${capabilityPlan.backend} (${capabilityPlan.reason})`);
  return {
    version: 1,
    strategy,
    workload,
    batches: makeBatches(workload, Math.min(maxBatchSize, Math.max(1, backend.maxBatchSize))),
    assignments,
    deterministic,
    explanation,
    hostOwned: true,
    cacheKey,
    lanes,
    barriers: effectNodes.map(node => node.id),
    seriesFusion,
    specializedPlan,
    tradingNativePlan,
    dataGraph:tradingNativePlan.dataGraph,
    chronologicalPasses:1,
    sourceReadReuse: program.optimizationPlan?.cost.sourceReadReuse ?? 0,
    estimatedSavedWorkUnits: workload.estimatedSavedBarWork * workload.symbols * workload.timeframes * workload.bars,
    backendCapabilityPlans,
  };
}

/** Lightweight contract hook for host-side planner validation. */
export function validateCoreSpiritExecutionPlannerInputs(options: CoreSpiritExecutionPlannerOptions): string[] {
  const errors: string[] = [];
  if (options.maxBatchSize != null && (!Number.isInteger(options.maxBatchSize) || options.maxBatchSize < 1)) errors.push('maxBatchSize must be positive');
  if (options.minGpuWorkUnits != null && (!Number.isInteger(options.minGpuWorkUnits) || options.minGpuWorkUnits < 1)) errors.push('minGpuWorkUnits must be positive');
  if (options.minWasmWorkUnits != null && (!Number.isInteger(options.minWasmWorkUnits) || options.minWasmWorkUnits < 1)) errors.push('minWasmWorkUnits must be positive');
  if (options.symbolCount != null && (!Number.isInteger(options.symbolCount) || options.symbolCount < 1)) errors.push('symbolCount must be positive');
  if (options.timeframeCount != null && (!Number.isInteger(options.timeframeCount) || options.timeframeCount < 1)) errors.push('timeframeCount must be positive');
  if (options.barCount != null && (!Number.isInteger(options.barCount) || options.barCount < 1)) errors.push('barCount must be positive');
  for (const key of ['estimatedCpuWorkUnitsPerMs','estimatedWasmWorkUnitsPerMs','estimatedGpuWorkUnitsPerMs','estimatedTransferBytesPerMs'] as const) {
    const value = options[key];
    if (value != null && (!Number.isFinite(value) || value <= 0)) errors.push(`${key} must be finite and positive`);
  }
  for (const key of ['wasmStartupMs','gpuStartupMs','estimatedTransferBytes'] as const) {
    const value = options[key];
    if (value != null && (!Number.isFinite(value) || value < 0)) errors.push(`${key} must be finite and non-negative`);
  }
  return errors;
}
