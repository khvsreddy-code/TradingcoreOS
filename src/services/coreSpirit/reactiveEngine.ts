import type { CoreSpiritGraphNode, CoreSpiritReactivePlan } from './semanticGraph';

export type CoreSpiritReactiveStats = {
  revision: number;
  recomputed: number;
  reused: number;
  effects: number;
  dirtyNodes: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  executionTimeMs: number;
  revisionCount: number;
  totalRecomputed: number;
  totalReused: number;
  cumulativeCacheHitRate: number;
  averageExecutionTimeMs: number;
  worstExecutionTimeMs: number;
  queueVisits: number;
  invalidationMs: number;
};

const nowMs = (): number => typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
const hitRate = (hits: number, misses: number): number => {
  const total = hits + misses;
  return total > 0 ? hits / total : 0;
};

type Aggregate = { revisionCount:number; totalRecomputed:number; totalReused:number; totalExecutionTimeMs:number; worstExecutionTimeMs:number; totalInvalidationMs:number; totalQueueVisits:number };

/**
 * Incremental dependency executor support layer.
 *
 * The VM stays the executor; this class only decides what is dirty/reusable.
 * The hot path uses indexed adjacency + an array cursor instead of shift(),
 * and a bounded LRU cache prevents long-lived chart sessions from retaining
 * an unbounded number of node values.
 */
export class CoreSpiritReactiveEngine {
  private plan?: CoreSpiritReactivePlan;
  private dirty = new Set<string>();
  private cache = new Map<string, unknown>();
  private stats: CoreSpiritReactiveStats = this.emptyStats();
  private revisionStartedAt?: number;
  private invalidationStartedAt?: number;
  private aggregate: Aggregate = { revisionCount: 0, totalRecomputed: 0, totalReused: 0, totalExecutionTimeMs: 0, worstExecutionTimeMs: 0, totalInvalidationMs: 0, totalQueueVisits: 0 };
  private readonly maxCacheEntries: number;

  constructor(plan?: CoreSpiritReactivePlan, options: { maxCacheEntries?: number } = {}) {
    this.plan = plan;
    this.maxCacheEntries = Math.max(64, Math.floor(options.maxCacheEntries ?? 4096));
  }

  setPlan(plan?: CoreSpiritReactivePlan): void { this.plan = plan; this.reset(); }

  reset(): void {
    this.dirty.clear();
    this.cache.clear();
    this.stats = this.emptyStats();
    this.revisionStartedAt = undefined;
    this.invalidationStartedAt = undefined;
    this.aggregate = { revisionCount: 0, totalRecomputed: 0, totalReused: 0, totalExecutionTimeMs: 0, worstExecutionTimeMs: 0, totalInvalidationMs: 0, totalQueueVisits: 0 };
  }

  beginRevision(changedInputs: readonly string[], newBar: boolean): void {
    this.dirty.clear();
    this.stats = { ...this.emptyStats(), revision: this.stats.revision + 1 };
    this.revisionStartedAt = nowMs();
    this.invalidationStartedAt = nowMs();
    this.aggregate.revisionCount += 1;
    if (!this.plan) return;

    const queue: string[] = [];
    let cursor = 0;
    const mark = (nodeId: string): void => {
      if (this.dirty.has(nodeId)) return;
      this.dirty.add(nodeId);
      queue.push(nodeId);
    };

    if (newBar) {
      for (const nodeId of Object.keys(this.plan.sourceInputs)) mark(nodeId);
    } else {
      for (const input of changedInputs) for (const nodeId of this.plan.sourceDependents[input] ?? []) mark(nodeId);
    }
    for (const nodeId of this.plan.alwaysRecompute) mark(nodeId);

    while (cursor < queue.length) {
      const nodeId = queue[cursor++];
      for (const dependent of this.plan.dependents[nodeId] ?? []) mark(dependent);
    }

    this.stats.dirtyNodes = this.dirty.size;
    this.stats.queueVisits = cursor;
    this.stats.invalidationMs = Math.max(0, nowMs() - (this.invalidationStartedAt ?? nowMs()));
    this.aggregate.totalInvalidationMs += this.stats.invalidationMs;
    this.aggregate.totalQueueVisits += cursor;
    this.invalidationStartedAt = undefined;
  }

  endRevision(): void {
    if (this.revisionStartedAt == null) return;
    const duration = Math.max(0, nowMs() - this.revisionStartedAt);
    this.stats.executionTimeMs = duration;
    this.aggregate.totalRecomputed += this.stats.recomputed;
    this.aggregate.totalReused += this.stats.reused;
    this.aggregate.totalExecutionTimeMs += duration;
    this.aggregate.worstExecutionTimeMs = Math.max(this.aggregate.worstExecutionTimeMs, duration);
    this.stats.averageExecutionTimeMs = this.aggregate.revisionCount > 0 ? this.aggregate.totalExecutionTimeMs / this.aggregate.revisionCount : 0;
    this.stats.worstExecutionTimeMs = this.aggregate.worstExecutionTimeMs;
    this.stats.totalRecomputed = this.aggregate.totalRecomputed;
    this.stats.totalReused = this.aggregate.totalReused;
    this.stats.cumulativeCacheHitRate = hitRate(this.aggregate.totalReused, this.aggregate.totalRecomputed);
    this.revisionStartedAt = undefined;
  }

  shouldReuse(node: CoreSpiritGraphNode | undefined): boolean {
    if (!node || !this.plan) return false;
    if (!node.pure || node.effectful || this.dirty.has(node.id) || !this.cache.has(node.id)) return false;
    return true;
  }

  get(nodeId: string): unknown {
    const value = this.cache.get(nodeId);
    if (value !== undefined || this.cache.has(nodeId)) {
      this.cache.delete(nodeId);
      this.cache.set(nodeId, value);
    }
    return value;
  }

  set(nodeId: string, value: unknown): void {
    this.cache.delete(nodeId);
    this.cache.set(nodeId, value);
    while (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value!);
    this.stats.recomputed++;
    this.stats.cacheMisses++;
  }

  invalidate(nodeIds: readonly string[]): void {
    for (const nodeId of nodeIds) this.cache.delete(nodeId);
  }

  reused(): void {
    this.stats.reused++;
    this.stats.cacheHits++;
  }

  effect(): void { this.stats.effects++; }

  getStats(): CoreSpiritReactiveStats {
    const currentRate = hitRate(this.stats.cacheHits, this.stats.cacheMisses);
    return {
      ...this.stats,
      dirtyNodes: this.dirty.size,
      cacheHitRate: currentRate,
      revisionCount: this.aggregate.revisionCount,
      totalRecomputed: this.aggregate.totalRecomputed,
      totalReused: this.aggregate.totalReused,
      cumulativeCacheHitRate: hitRate(this.aggregate.totalReused, this.aggregate.totalRecomputed),
      averageExecutionTimeMs: this.aggregate.revisionCount > 0 ? this.aggregate.totalExecutionTimeMs / this.aggregate.revisionCount : 0,
      worstExecutionTimeMs: this.aggregate.worstExecutionTimeMs,
      invalidationMs: this.stats.invalidationMs,
    };
  }

  private emptyStats(): CoreSpiritReactiveStats {
    return {
      revision: 0, recomputed: 0, reused: 0, effects: 0, dirtyNodes: 0, cacheHits: 0, cacheMisses: 0,
      cacheHitRate: 0, executionTimeMs: 0, revisionCount: 0, totalRecomputed: 0, totalReused: 0,
      cumulativeCacheHitRate: 0, averageExecutionTimeMs: 0, worstExecutionTimeMs: 0, queueVisits: 0, invalidationMs: 0,
    };
  }
}
