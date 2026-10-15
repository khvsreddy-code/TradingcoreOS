import type { CoreSpiritSemanticGraph, CoreSpiritReactivePlan } from './semanticGraph';
import type { CoreSpiritIrInstruction } from './ir';

export type CoreSpiritDirtySource = 'time' | 'open' | 'high' | 'low' | 'close' | 'volume' | 'external-data' | 'bar_index';

export interface CoreSpiritDirtyNode {
  readonly id: string;
  readonly instruction: number;
  readonly inputs: readonly string[];
  readonly output?: string;
  readonly lookback: number;
  readonly stateful: boolean;
  readonly incremental: boolean;
  readonly viewportDependent: boolean;
  readonly realtimeSafe: boolean;
  readonly dependents: readonly string[];
  readonly dependencies: readonly string[];
  readonly alwaysRecompute: boolean;
}

export interface CoreSpiritDirtyRange { readonly from: number; readonly to: number; }

export interface CoreSpiritHistoricalCorrection {
  readonly changedRange: CoreSpiritDirtyRange;
  /** State snapshot contains bars strictly before this next execution index. */
  readonly replayFrom: number;
  readonly checkpointNextBarIndex?: number;
  readonly requiresStateRestore: boolean;
  readonly reason: 'stateless-range' | 'checkpoint-replay' | 'full-replay-no-safe-checkpoint';
}

export interface CoreSpiritDirtyExecutionPlan {
  readonly sourceFields: readonly CoreSpiritDirtySource[];
  readonly nodes: ReadonlySet<string>;
  readonly instructions: ReadonlySet<number>;
  readonly ranges: ReadonlyMap<string, CoreSpiritDirtyRange>;
  readonly earliest: number;
  readonly latest: number;
  readonly allHistory: boolean;
  readonly correction?: CoreSpiritHistoricalCorrection;
}

const RECURSIVE_TAIL_CALLS = new Set(['ema', 'rma', 'wilder', 'rsi', 'atr', 'vwap']);
const FINITE_WINDOW_CALLS = new Set(['sma', 'wma', 'vwma', 'highest', 'lowest', 'stdev', 'variance', 'median', 'percentile', 'mad', 'beta', 'trendstrength']);
const ONE_BAR_CHANGE_CALLS = new Set(['change', 'pctchange', 'cross', 'crossover', 'crossunder']);

function normalizedCallName(name: string | undefined): string {
  return String(name || '').split('.').at(-1)?.toLowerCase() || '';
}

/** Forward invalidation horizon: rolling windows use N-1; rising/falling inspect N prior bars; recursive operators extend to the execution end. */
function inferLookback(node: CoreSpiritDirtyNode, instructionName: string | undefined, constantValue?: number): number {
  const name = normalizedCallName(instructionName);
  if (RECURSIVE_TAIL_CALLS.has(name)) return -1;
  if (ONE_BAR_CHANGE_CALLS.has(name)) return 1;
  if (name === 'rising' || name === 'falling') {
    return Number.isFinite(constantValue) ? Math.max(0, Math.floor(constantValue as number)) : Number.POSITIVE_INFINITY;
  }
  if (FINITE_WINDOW_CALLS.has(name)) {
    return Number.isFinite(constantValue) ? Math.max(0, Math.floor(constantValue as number) - 1) : Number.POSITIVE_INFINITY;
  }
  if (node.stateful) return Number.POSITIVE_INFINITY;
  return 0;
}

export function buildCoreSpiritDirtyGraph(graph: CoreSpiritSemanticGraph, reactive: CoreSpiritReactivePlan, instructions: readonly CoreSpiritIrInstruction[] = []): readonly CoreSpiritDirtyNode[] {
  const dependents = reactive.dependents;
  const constants = new Map<string, number>();
  for (const instruction of instructions) {
    if (!('dest' in instruction) || !instruction.dest) continue;
    // A register's last definition wins; never infer a window from a stale const.
    constants.delete(instruction.dest);
    if (instruction.op === 'const' && typeof instruction.value === 'number' && Number.isFinite(instruction.value)) {
      constants.set(instruction.dest, instruction.value);
    }
  }
  const output = graph.nodes.map((node) => {
    const name = node.name;
    const viewportDependent = Boolean(name && /visible_(bar|range|time)|chart\.left|chart\.right/.test(name));
    const realtimeSafe = node.deterministic && !node.effectful && !viewportDependent;
    const incremental = realtimeSafe || (node.stateful && node.deterministic);
    const instruction = instructions[node.instruction];
    const callName = instruction?.op === 'call' ? instruction.name : name;
    const normalizedName = normalizedCallName(callName);
    const lengthArgIndex = normalizedName === 'beta' ? 2 : 1;
    const constantValue = instruction?.op === 'call'
      ? Number(constants.get(instruction.args[lengthArgIndex] || ''))
      : instruction?.op === 'index'
        ? Number(constants.get(instruction.index))
        : instruction?.op === 'loadSeries'
          ? instruction.offset
          : undefined;
    const lookback = inferLookback({id:node.id,instruction:node.instruction,inputs:node.sourceInputs,output:node.dest,lookback:0,stateful:node.stateful,incremental,viewportDependent,realtimeSafe,dependents:dependents[node.id]||[],dependencies:node.dependencies,alwaysRecompute:reactive.alwaysRecompute.includes(node.id)}, callName, Number.isFinite(constantValue) ? constantValue : undefined);
    return Object.freeze({ id:node.id, instruction:node.instruction, inputs:Object.freeze([...(node.sourceInputs||[])]), output:node.dest, lookback, stateful:node.stateful, incremental, viewportDependent, realtimeSafe, dependents:Object.freeze([...(dependents[node.id]||[])]), dependencies:Object.freeze([...node.dependencies]), alwaysRecompute:reactive.alwaysRecompute.includes(node.id) });
  });
  return Object.freeze(output);
}

export class CoreSpiritDirtyGraph {
  readonly nodesById: ReadonlyMap<string, CoreSpiritDirtyNode>;
  readonly sourceDependents: ReadonlyMap<string, readonly string[]>;
  readonly statefulInstructions: ReadonlySet<number>;
  constructor(nodes: readonly CoreSpiritDirtyNode[], reactive: CoreSpiritReactivePlan) {
    this.nodesById = new Map(nodes.map((node) => [node.id, node] as const));
    this.sourceDependents = new Map(Object.entries(reactive.sourceDependents).map(([key, ids]) => [key, Object.freeze([...ids])] as const));
    this.statefulInstructions = new Set(nodes.filter((node) => node.stateful).map((node) => node.instruction));
  }

  nodeForInstruction(instruction: number): CoreSpiritDirtyNode | undefined {
    for (const node of this.nodesById.values()) {
      if (node.instruction === instruction) return node;
    }
    return undefined;
  }

  /** A live candle update is the half-open range [barIndex, barIndex + 1). */
  planTail(sources: readonly CoreSpiritDirtySource[], barIndex: number, executionEnd?: number): CoreSpiritDirtyExecutionPlan {
    const start = Math.max(0, Math.floor(Number.isFinite(barIndex) ? barIndex : 0));
    const end = Math.max(start + 1, Number.isFinite(executionEnd) ? Math.floor(executionEnd as number) : start + 1);
    return this.planRange(sources, { from: start, to: start + 1 }, end);
  }

  /** Propagate an arbitrary changed absolute-history interval through the graph. */
  planRange(
    sources: readonly CoreSpiritDirtySource[],
    changedRange: CoreSpiritDirtyRange,
    executionEnd: number,
  ): CoreSpiritDirtyExecutionPlan {
    const end = Math.max(0, Math.floor(Number.isFinite(executionEnd) ? executionEnd : 0));
    const start = Math.min(end, Math.max(0, Math.floor(Number.isFinite(changedRange.from) ? changedRange.from : 0)));
    const finish = Math.min(end, Math.max(start, Math.floor(Number.isFinite(changedRange.to) ? changedRange.to : start)));
    const dirty = new Map<string, CoreSpiritDirtyRange>();
    const queue: string[] = [];
    let queueCursor = 0;
    const mark = (id: string, from: number, inputTo: number): void => {
      const node = this.nodesById.get(id);
      if (!node) return;
      const nextFrom = Math.min(end, Math.max(0, Math.floor(Number.isFinite(from) ? from : 0)));
      const clampedInputTo = Math.max(nextFrom, Math.min(end, Math.floor(Number.isFinite(inputTo) ? inputTo : end)));
      // Input/output coordinates are absolute-history and half-open. Finite lookback
      // expands the final affected output bar; recursive nodes extend to executionEnd.
      const nextTo = node.lookback < 0 || !Number.isFinite(node.lookback)
        ? end
        : Math.min(end, clampedInputTo + Math.max(0, Math.floor(node.lookback)));
      const previous = dirty.get(id);
      if (previous && previous.from <= nextFrom && previous.to >= nextTo) return;
      dirty.set(id, previous
        ? { from: Math.min(previous.from, nextFrom), to: Math.max(previous.to, nextTo) }
        : { from: nextFrom, to: nextTo });
      queue.push(id);
    };

    if (finish > start) {
      for (const source of sources) {
        for (const id of this.sourceDependents.get(source) || []) mark(id, start, finish);
      }
      for (const node of this.nodesById.values()) {
        if (node.alwaysRecompute) mark(node.id, start, finish);
      }
    }

    // Cursor traversal avoids Array.shift() copies and tolerates converging dependencies.
    while (queueCursor < queue.length) {
      const id = queue[queueCursor++]!;
      const node = this.nodesById.get(id);
      const range = dirty.get(id);
      if (!node || !range) continue;
      for (const dependent of node.dependents) mark(dependent, range.from, range.to);
    }

    const instructions = new Set<number>();
    for (const id of dirty.keys()) {
      const node = this.nodesById.get(id);
      if (node) instructions.add(node.instruction);
    }
    const ranges = new Map<string, CoreSpiritDirtyRange>(dirty);
    let earliest = start;
    let latest = start;
    if (ranges.size) {
      const values = [...ranges.values()];
      earliest = Math.min(...values.map(range => range.from));
      latest = Math.max(...values.map(range => range.to));
    }
    return {
      sourceFields: Object.freeze([...new Set(sources)]),
      nodes: new Set(dirty.keys()),
      instructions,
      ranges,
      earliest,
      latest,
      allHistory: false,
    };
  }

  /**
   * Historical corrections invalidate all causally affected downstream ranges.
   * Stateful computations restore a snapshot from before the corrected interval;
   * without a safe snapshot, the safe fallback is deterministic replay from bar zero.
   */
  planCorrection(
    sources: readonly CoreSpiritDirtySource[],
    changedRange: CoreSpiritDirtyRange,
    executionEnd: number,
    checkpointNextBarIndex?: number,
  ): CoreSpiritDirtyExecutionPlan {
    const base = this.planRange(sources, changedRange, executionEnd);
    const end = Math.max(0, Math.floor(Number.isFinite(executionEnd) ? executionEnd : 0));
    const from = Math.min(end, Math.max(0, Math.floor(Number.isFinite(changedRange.from) ? changedRange.from : 0)));
    const to = Math.min(end, Math.max(from, Math.floor(Number.isFinite(changedRange.to) ? changedRange.to : from)));
    const requiresStateRestore = [...base.nodes].some(id => this.nodesById.get(id)?.stateful === true);
    const checkpointIsSafe = Number.isSafeInteger(checkpointNextBarIndex)
      && (checkpointNextBarIndex as number) >= 0
      && (checkpointNextBarIndex as number) <= from;
    const replayFrom = !requiresStateRestore ? from : checkpointIsSafe ? checkpointNextBarIndex as number : 0;
    const correction: CoreSpiritHistoricalCorrection = Object.freeze({
      changedRange: Object.freeze({ from, to }),
      replayFrom,
      ...(requiresStateRestore && checkpointIsSafe ? { checkpointNextBarIndex: checkpointNextBarIndex as number } : {}),
      requiresStateRestore,
      reason: !requiresStateRestore ? 'stateless-range'
        : checkpointIsSafe ? 'checkpoint-replay' : 'full-replay-no-safe-checkpoint',
    });
    if (requiresStateRestore && !checkpointIsSafe) {
      // A recursive kernel's internal state cannot be reconstructed by patching
      // only the corrected output range. Without a pre-correction checkpoint,
      // replay every graph node from bar zero; never expose a partial plan that
      // looks incremental but leaves downstream state stale.
      const full = this.planFull(end);
      return { ...full, sourceFields: base.sourceFields, correction };
    }

    if (requiresStateRestore && checkpointIsSafe) {
      // Replaying from a checkpoint means affected nodes must be evaluated from
      // that checkpoint, not merely from the corrected candle. Restrict this to
      // the causally affected subgraph so unrelated indicators remain reusable.
      const ranges = new Map<string, CoreSpiritDirtyRange>();
      for (const id of base.nodes) ranges.set(id, { from: replayFrom, to: end });
      return {
        ...base,
        ranges,
        earliest: ranges.size ? replayFrom : base.earliest,
        latest: ranges.size ? end : base.latest,
        correction,
      };
    }

    return { ...base, correction };
  }

  planFull(executionEnd: number): CoreSpiritDirtyExecutionPlan {
    const end = Math.max(0, Math.floor(Number.isFinite(executionEnd) ? executionEnd : 0));
    const nodes = new Set<string>(this.nodesById.keys());
    const instructions = new Set<number>([...this.nodesById.values()].map(node => node.instruction));
    const ranges = new Map<string, CoreSpiritDirtyRange>([...this.nodesById.keys()].map(id => [id, { from: 0, to: end }] as const));
    return { sourceFields: Object.freeze([]), nodes, instructions, ranges, earliest: 0, latest: end, allHistory: true };
  }
}

export type CoreSpiritDirtyBar = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: number;
};

export function dirtySourcesForBar(previous: CoreSpiritDirtyBar | undefined, current: CoreSpiritDirtyBar): CoreSpiritDirtySource[] {
  if (!previous) return ['time', 'open', 'high', 'low', 'close', 'volume', 'bar_index'];
  const out: CoreSpiritDirtySource[] = [];
  if (previous.time !== current.time && (previous.time !== undefined || current.time !== undefined)) out.push('time');
  if (previous.open !== current.open) out.push('open');
  if (previous.high !== current.high) out.push('high');
  if (previous.low !== current.low) out.push('low');
  if (previous.close !== current.close) out.push('close');
  if (previous.volume !== current.volume) out.push('volume');
  return out;
}