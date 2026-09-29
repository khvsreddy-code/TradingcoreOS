/** Runtime performance budgets and hot/warm/cold scheduling primitives. */

export type CoreSpiritPerformanceBudget = Readonly<{
  hotTaskMs: number;
  frameMs: number;
  reactiveMs: number;
  visualMs: number;
  backgroundMs: number;
}>;

export const CORE_SPIRIT_DEFAULT_PERFORMANCE_BUDGET: CoreSpiritPerformanceBudget = Object.freeze({
  hotTaskMs: 3,
  frameMs: 8,
  reactiveMs: 4,
  visualMs: 2,
  backgroundMs: 50,
});

export type CoreSpiritPerformanceMetric = Readonly<{
  lane: 'hot' | 'warm' | 'cold';
  name: string;
  durationMs: number;
  budgetMs: number;
  overBudget: boolean;
  timestamp: number;
}>;

export class CoreSpiritPerformanceMonitor {
  private readonly samples: CoreSpiritPerformanceMetric[] = [];
  constructor(private readonly budget: CoreSpiritPerformanceBudget = CORE_SPIRIT_DEFAULT_PERFORMANCE_BUDGET, private readonly maxSamples = 2048) {}

  measure<T>(lane: CoreSpiritPerformanceMetric['lane'], name: string, task: () => T): T {
    const started = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    try { return task(); }
    finally {
      const ended = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      this.record(lane, name, Math.max(0, ended - started));
    }
  }

  record(lane: CoreSpiritPerformanceMetric['lane'], name: string, durationMs: number): void {
    const budgetMs = lane === 'hot' ? this.budget.hotTaskMs : lane === 'warm' ? this.budget.reactiveMs : this.budget.backgroundMs;
    this.samples.push(Object.freeze({ lane, name, durationMs, budgetMs, overBudget: durationMs > budgetMs, timestamp: Date.now() }));
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples);
  }

  snapshot(): Readonly<{ samples: readonly CoreSpiritPerformanceMetric[]; overBudgetCount: number; worstMs: number; averageMs: number }> {
    const samples = [...this.samples];
    const total = samples.reduce((sum, item) => sum + item.durationMs, 0);
    return Object.freeze({ samples: Object.freeze(samples), overBudgetCount: samples.filter(item => item.overBudget).length, worstMs: samples.reduce((max, item) => Math.max(max, item.durationMs), 0), averageMs: samples.length ? total / samples.length : 0 });
  }

  clear(): void { this.samples.length = 0; }
}

type Task = { id: string; lane: 'hot' | 'warm' | 'cold'; run: () => void };

/** Deterministic lane scheduler. It is a host scheduler, not a second VM. */
export class CoreSpiritLaneScheduler {
  private queues: Record<Task['lane'], Task[]> = { hot: [], warm: [], cold: [] };
  private keyed = new Map<string, Task>();

  schedule(task: Task): void {
    const existing = this.keyed.get(task.id);
    if (existing) {
      const queue = this.queues[existing.lane];
      const index = queue.indexOf(existing);
      if (index >= 0) queue.splice(index, 1);
    }
    this.keyed.set(task.id, task);
    this.queues[task.lane].push(task);
  }

  flush(lane: Task['lane'], budgetMs = lane === 'hot' ? CORE_SPIRIT_DEFAULT_PERFORMANCE_BUDGET.hotTaskMs : lane === 'warm' ? CORE_SPIRIT_DEFAULT_PERFORMANCE_BUDGET.reactiveMs : CORE_SPIRIT_DEFAULT_PERFORMANCE_BUDGET.backgroundMs): number {
    const queue = this.queues[lane];
    const started = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    let ran = 0;
    while (queue.length) {
      const task = queue.shift()!;
      this.keyed.delete(task.id);
      task.run();
      ran += 1;
      const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      if (now - started >= budgetMs) break;
    }
    return ran;
  }

  flushAll(): number { return this.flush('hot', Number.POSITIVE_INFINITY) + this.flush('warm', Number.POSITIVE_INFINITY) + this.flush('cold', Number.POSITIVE_INFINITY); }
  pending(lane?: Task['lane']): number { return lane ? this.queues[lane].length : this.queues.hot.length + this.queues.warm.length + this.queues.cold.length; }
  clear(): void { this.queues.hot.length = 0; this.queues.warm.length = 0; this.queues.cold.length = 0; this.keyed.clear(); }
}
