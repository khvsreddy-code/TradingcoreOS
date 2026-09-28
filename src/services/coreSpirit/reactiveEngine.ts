import type { CoreSpiritGraphNode, CoreSpiritReactivePlan } from './semanticGraph';

type ReactiveStats = { revision: number; recomputed: number; reused: number; effects: number; dirtyNodes: number };

export class CoreSpiritReactiveEngine {
  private plan?: CoreSpiritReactivePlan;
  private dirty = new Set<string>();
  private cache = new Map<string, unknown>();
  private stats: ReactiveStats = { revision: 0, recomputed: 0, reused: 0, effects: 0, dirtyNodes: 0 };

  constructor(plan?: CoreSpiritReactivePlan) { this.plan = plan; }

  setPlan(plan?: CoreSpiritReactivePlan): void { this.plan = plan; this.reset(); }
  reset(): void { this.dirty.clear(); this.cache.clear(); this.stats = { revision: 0, recomputed: 0, reused: 0, effects: 0, dirtyNodes: 0 }; }

  beginRevision(changedInputs: readonly string[], newBar: boolean): void {
    this.dirty.clear();
    this.stats = { revision: this.stats.revision + 1, recomputed: 0, reused: 0, effects: 0, dirtyNodes: 0 };
    if (!this.plan) return;
    const changed = new Set(changedInputs);
    const queue: string[] = [];
    for (const [nodeId, inputs] of Object.entries(this.plan.sourceInputs)) {
      if (newBar || inputs.some(input => changed.has(input))) { this.dirty.add(nodeId); queue.push(nodeId); }
    }
    for (const nodeId of this.plan.alwaysRecompute) {
      if (!this.dirty.has(nodeId)) { this.dirty.add(nodeId); queue.push(nodeId); }
    }
    while (queue.length) {
      const nodeId = queue.shift()!;
      for (const dependent of this.plan.dependents[nodeId] || []) {
        if (!this.dirty.has(dependent)) { this.dirty.add(dependent); queue.push(dependent); }
      }
    }
    this.stats.dirtyNodes = this.dirty.size;
  }

  shouldReuse(node: CoreSpiritGraphNode | undefined): boolean {
    if (!node || !this.plan) return false;
    if (!node.pure || node.effectful) return false;
    return !this.dirty.has(node.id) && this.cache.has(node.id);
  }

  get(nodeId: string): unknown { return this.cache.get(nodeId); }
  set(nodeId: string, value: unknown): void { this.cache.set(nodeId, value); this.stats.recomputed++; }
  reused(): void { this.stats.reused++; }
  effect(): void { this.stats.effects++; }
  getStats(): ReactiveStats { return { ...this.stats, dirtyNodes: this.dirty.size }; }
}
