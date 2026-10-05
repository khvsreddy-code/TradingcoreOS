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

export type CoreSpiritComputeBackend = 'cpu' | 'wasm' | 'gpu';

export interface CoreSpiritComputeBackendProfile {
  backend: CoreSpiritComputeBackend;
  available: boolean;
  deterministic: boolean;
  vectorized: boolean;
  maxBatchSize: number;
  sharedMemoryBytes: number;
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
  chronologicalPasses: 1;
  sourceReadReuse: number;
  estimatedSavedWorkUnits: number;
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
    pure: ['const','loadSeries','move','unary','binary','index'].includes(instruction.op),
    effectful: !['const','loadSeries','move','unary','binary','index'].includes(instruction.op),
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
  options: Required<Pick<CoreSpiritExecutionPlannerOptions, 'requireDeterministic'|'allowSplitPureWork'|'minGpuWorkUnits'|'minWasmWorkUnits'>>,
): CoreSpiritComputeBackendProfile {
  const eligible = profiles.filter(profile =>
    profile.available &&
    profile.vectorized &&
    workload.vectorizableInstructionCount > 0 &&
    (!options.requireDeterministic || profile.deterministic),
  );
  const gpu = eligible.find(profile => profile.backend === 'gpu');
  if (gpu && workload.workUnits >= options.minGpuWorkUnits) return gpu;
  const wasm = eligible.find(profile => profile.backend === 'wasm');
  if (wasm && workload.workUnits >= options.minWasmWorkUnits) return wasm;
  return profiles.find(profile => profile.backend === 'cpu') ?? { backend: 'cpu', available: true, deterministic: true, vectorized: false, maxBatchSize: 1_000_000, sharedMemoryBytes: 0 };
}

export function planCoreSpiritExecution(
  program: CoreSpiritIrProgram,
  options: CoreSpiritExecutionPlannerOptions = {},
): CoreSpiritExecutionPlan {
  const profiles = options.backends?.length ? [...options.backends] : [...CORE_SPIRIT_DEFAULT_COMPUTE_BACKENDS];
  const requireDeterministic = options.requireDeterministic ?? true;
  const allowSplitPureWork = options.allowSplitPureWork ?? true;
  const minGpuWorkUnits = Math.max(1, Math.floor(options.minGpuWorkUnits ?? 1_000_000));
  const minWasmWorkUnits = Math.max(1, Math.floor(options.minWasmWorkUnits ?? 10_000));
  const maxBatchSize = Math.max(1, Math.floor(options.maxBatchSize ?? 65_536));
  const workload = estimateCoreSpiritWorkload(program, {
    symbolCount: options.symbolCount,
    timeframeCount: options.timeframeCount,
    barCount: options.barCount,
  });
  const nodes = nodesFrom(program);
  const effectNodes = nodes.filter(node => node.effectful);
  const pureNodes = nodes.filter(node => node.pure && !node.effectful);
  const backend = pickBackend(profiles, workload, { requireDeterministic, allowSplitPureWork, minGpuWorkUnits, minWasmWorkUnits });
  const seriesFusion = planCoreSpiritSeriesFusion(program);
  const specializedPlan = program.specializedPlan ?? buildCoreSpiritSpecializedPlan(program.entry.instructions);

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
      reason: effectNodes.length ? 'effectful/stateful operations require the ordered CPU runtime' : 'GPU/WASM thresholds or availability did not qualify an alternate backend',
    });
    explanation.push('CPU is the deterministic baseline and remains the semantic fallback.');
  } else if (effectNodes.length && allowSplitPureWork) {
    strategy = 'hybrid-pure-offload';
    assignments.push({
      backend: backend.backend,
      nodeIds: pureNodes.map(node => node.id),
      workUnits: workload.workUnits,
      deterministic: backend.deterministic,
      reason: `${backend.backend.toUpperCase()} receives only pure numerical nodes; effect/state nodes remain in the CPU runtime`,
    });
    assignments.push({
      backend: 'cpu',
      nodeIds: effectNodes.map(node => node.id),
      workUnits: 0,
      deterministic: true,
      reason: 'side effects, state transitions and output emission stay ordered on CPU',
    });
    explanation.push(`hybrid plan selected: ${backend.backend} may accelerate pure work while CPU retains ${effectNodes.length} effect/state nodes.`);
  } else {
    strategy = backend.backend === 'gpu' ? 'gpu-vectorized' : 'wasm-portable';
    assignments.push({
      backend: backend.backend,
      nodeIds: pureNodes.map(node => node.id),
      workUnits: workload.workUnits,
      deterministic: backend.deterministic,
      reason: `${backend.backend.toUpperCase()} profile is available and eligible for the pure numerical workload`,
    });
    explanation.push(`${backend.backend.toUpperCase()} is selected for pure vectorizable work.`);
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
  });
  explanation.push(`execution lanes: hot=${lanes.hot.length}, warm=${lanes.warm.length}, cold=${lanes.cold.length}`);
  explanation.push(`chronological traversal: 1 pass; estimated optimizer savings=${workload.estimatedSavedBarWork.toFixed(2)} work/bar`);
  if (seriesFusion.groups.length) explanation.push(`series fusion: ${seriesFusion.groups.length} group(s), ${seriesFusion.fusedInstructionCount} instruction(s) lowered to single-pass kernels`);
  explanation.push(`specialized plan: ${specializedPlan.strategy}, ${specializedPlan.slotCount} slots, ${specializedPlan.seriesFanouts.length} shared-input fanout group(s)`);
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
    chronologicalPasses:1,
    sourceReadReuse: program.optimizationPlan?.cost.sourceReadReuse ?? 0,
    estimatedSavedWorkUnits: workload.estimatedSavedBarWork * workload.symbols * workload.timeframes * workload.bars,
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
  return errors;
}
