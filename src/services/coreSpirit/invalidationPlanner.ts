/**
 * Canonical revision-aware dirty-range propagation for CoreSpirit.
 * This module plans invalidation only; it does not execute kernels or publish to
 * Vela. Ranges are half-open [from, to), and to may be Infinity when a recursive
 * dependency must be recomputed through the current tail.
 *
 * Stateful recursive nodes invalidate the full downstream tail for historical
 * corrections unless the caller can restore a compatible checkpoint.
 */
export type CoreSpiritDirtyRange = Readonly<{ from: number; to: number }>;
export type CoreSpiritCorrectionPolicy = 'bounded-lookback' | 'stateful-tail' | 'full-range';

export type CoreSpiritInvalidationNode = Readonly<{
  id: string;
  dependencies: readonly string[];
  /** Number of later output bars affected by one changed input bar. */
  lookback: number;
  stateful: boolean;
  incremental: boolean;
  /** False means the node cannot safely repair a forming-bar replacement in place. */
  supportsReplace: boolean;
  correctionPolicy?: CoreSpiritCorrectionPolicy;
}>;

export type CoreSpiritInvalidationPlan = Readonly<{
  sourceRevision: number;
  graphRevision: string;
  ranges: Readonly<Record<string, CoreSpiritDirtyRange>>;
  recomputeOrder: readonly string[];
  fullRecompute: boolean;
  reasons: readonly string[];
}>;

function validRange(range: CoreSpiritDirtyRange): boolean {
  return Number.isSafeInteger(range.from) && range.from >= 0 &&
    (range.to === Number.POSITIVE_INFINITY || (Number.isSafeInteger(range.to) && range.to > range.from));
}
function mergeRange(a: CoreSpiritDirtyRange | undefined, b: CoreSpiritDirtyRange): CoreSpiritDirtyRange {
  return a ? { from: Math.min(a.from, b.from), to: Math.max(a.to, b.to) } : b;
}
function propagateRange(range: CoreSpiritDirtyRange, node: CoreSpiritInvalidationNode, historical: boolean, replacement: boolean, historyEnd: number) {
  const policy = node.correctionPolicy ?? (node.stateful ? 'stateful-tail' : 'bounded-lookback');
  if (!node.incremental || policy === 'full-range') return { range: { from: 0, to: historyEnd }, full: true, reason: node.id + ': incremental contract unavailable' };
  if (replacement && !node.supportsReplace) return { range: { from: range.from, to: historyEnd }, full: true, reason: node.id + ': forming-bar replacement unsupported' };
  if (historical && policy === 'stateful-tail') return { range: { from: range.from, to: historyEnd }, full: false, reason: node.id + ': recursive state invalidated through history tail' };
  if (policy === 'stateful-tail') return { range: { from: range.from, to: historyEnd }, full: false };
  const lookback = Math.max(0, Math.floor(node.lookback));
  return { range: { from: range.from, to: Math.min(historyEnd, range.to + lookback) }, full: false };
}

/** Build a deterministic invalidation plan from a dependency DAG. */
export function planCoreSpiritInvalidation(input: {
  nodes: readonly CoreSpiritInvalidationNode[];
  changedSources: Readonly<Record<string, CoreSpiritDirtyRange>>;
  sourceRevision: number;
  graphRevision: string;
  historyEnd: number;
  historicalCorrection?: boolean;
  formingBarReplacement?: boolean;
}): CoreSpiritInvalidationPlan {
  if (!Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 0) throw new Error('sourceRevision must be a non-negative safe integer');
  if (!Number.isSafeInteger(input.historyEnd) || input.historyEnd < 0) throw new Error('historyEnd must be a non-negative safe integer');
  const byId = new Map<string, CoreSpiritInvalidationNode>();
  for (const node of input.nodes) {
    if (!node.id || byId.has(node.id)) throw new Error('Invalid or duplicate CoreSpirit node id: ' + node.id);
    if (!Number.isFinite(node.lookback) || node.lookback < 0) throw new Error('Invalid lookback for node: ' + node.id);
    byId.set(node.id, node);
  }
  for (const node of input.nodes) for (const dep of node.dependencies) if (!byId.has(dep)) throw new Error('Unknown dependency ' + dep + ' referenced by ' + node.id);

  const ranges: Record<string, CoreSpiritDirtyRange> = {};
  const reasons: string[] = [];
  let fullRecompute = false;
  for (const [id, range] of Object.entries(input.changedSources)) {
    if (!byId.has(id)) throw new Error('Unknown changed source: ' + id);
    if (!validRange(range) || range.from >= input.historyEnd || range.to > input.historyEnd) throw new Error('Invalid dirty range for source: ' + id);
    ranges[id] = range;
  }

  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const node of input.nodes) {
    indegree.set(node.id, node.dependencies.length);
    for (const dep of node.dependencies) dependents.set(dep, [...(dependents.get(dep) ?? []), node.id]);
  }
  const ready = input.nodes.filter(n => indegree.get(n.id) === 0).map(n => n.id);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of dependents.get(id) ?? []) {
      const degree = (indegree.get(next) ?? 1) - 1;
      indegree.set(next, degree);
      if (degree === 0) ready.push(next);
    }
  }
  if (order.length !== input.nodes.length) throw new Error('CoreSpirit dependency graph contains a cycle');

  for (const id of order) {
    const node = byId.get(id)!;
    const upstream = node.dependencies.map(dep => ranges[dep]).filter((r): r is CoreSpiritDirtyRange => Boolean(r));
    if (!upstream.length) continue;
    let affected: CoreSpiritDirtyRange | undefined;
    for (const range of upstream) {
      const next = propagateRange(range, node, Boolean(input.historicalCorrection), Boolean(input.formingBarReplacement), input.historyEnd);
      affected = mergeRange(affected, next.range);
      if (next.full) fullRecompute = true;
      if (next.reason) reasons.push(next.reason);
    }
    if (affected) ranges[id] = mergeRange(ranges[id], affected);
  }
  return Object.freeze({
    sourceRevision: input.sourceRevision,
    graphRevision: input.graphRevision,
    ranges: Object.freeze(ranges),
    recomputeOrder: Object.freeze(order.filter(id => Boolean(ranges[id]))),
    fullRecompute,
    reasons: Object.freeze([...new Set(reasons)]),
  });
}
