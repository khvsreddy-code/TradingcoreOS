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
type TaskLane = Task['lane'];
type QueuedTask = Readonly<{ task: Task }>;

/**
 * Deterministic lane scheduler. It is a host scheduler, not a second VM.
 *
 * Dequeue is O(1): a head cursor replaces Array.shift(), which moves every
 * remaining entry on each task. Superseded work is tombstoned by entry identity
 * and compacted amortized, so rescheduling a keyed task does not scan/splice a
 * hot queue on every market update.
 */
export class CoreSpiritLaneScheduler {
  private queues: Record<TaskLane, QueuedTask[]> = { hot: [], warm: [], cold: [] };
  private readonly heads: Record<TaskLane, number> = { hot: 0, warm: 0, cold: 0 };
  private readonly activeCounts: Record<TaskLane, number> = { hot: 0, warm: 0, cold: 0 };
  private readonly flushing: Record<TaskLane, boolean> = { hot: false, warm: false, cold: false };
  private keyed = new Map<string, QueuedTask>();

  schedule(task: Task): void {
    const existing = this.keyed.get(task.id);
    const entry: QueuedTask = Object.freeze({ task });
    this.keyed.set(task.id, entry);
    if (existing) {
      this.activeCounts[existing.task.lane] = Math.max(0, this.activeCounts[existing.task.lane] - 1);
      this.compact(existing.task.lane);
    }
    this.activeCounts[task.lane] += 1;
    this.queues[task.lane].push(entry);
    this.compact(task.lane);
  }

  flush(
    lane: TaskLane,
    budgetMs = lane === 'hot'
      ? CORE_SPIRIT_DEFAULT_PERFORMANCE_BUDGET.hotTaskMs
      : lane === 'warm'
        ? CORE_SPIRIT_DEFAULT_PERFORMANCE_BUDGET.reactiveMs
        : CORE_SPIRIT_DEFAULT_PERFORMANCE_BUDGET.backgroundMs,
  ): number {
    const queue = this.queues[lane];
    const started = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    let ran = 0;
    this.flushing[lane] = true;
    try {
      while (this.heads[lane] < queue.length) {
        const entry = queue[this.heads[lane]++]!;
        // A newer task with the same key owns the slot; stale entries are
        // skipped without touching the keyed task's live count.
        if (this.keyed.get(entry.task.id) !== entry) continue;
        this.keyed.delete(entry.task.id);
        this.activeCounts[lane] = Math.max(0, this.activeCounts[lane] - 1);
        entry.task.run();
        ran += 1;
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        if (now - started >= budgetMs) break;
      }
      return ran;
    } finally {
      this.flushing[lane] = false;
      this.compact(lane);
    }
  }

  flushAll(): number {
    return this.flush('hot', Number.POSITIVE_INFINITY) +
      this.flush('warm', Number.POSITIVE_INFINITY) +
      this.flush('cold', Number.POSITIVE_INFINITY);
  }

  pending(lane?: TaskLane): number {
    return lane
      ? this.activeCounts[lane]
      : this.activeCounts.hot + this.activeCounts.warm + this.activeCounts.cold;
  }

  clear(): void {
    this.queues = { hot: [], warm: [], cold: [] };
    this.heads.hot = 0;
    this.heads.warm = 0;
    this.heads.cold = 0;
    this.activeCounts.hot = 0;
    this.activeCounts.warm = 0;
    this.activeCounts.cold = 0;
    this.keyed.clear();
  }

  private compact(lane: TaskLane): void {
    if (this.flushing[lane]) return;
    const queue = this.queues[lane];
    const head = this.heads[lane];
    const threshold = Math.max(64, this.activeCounts[lane] * 2);
    if (this.activeCounts[lane] > 0 && head < threshold && queue.length <= threshold) return;

    const live: QueuedTask[] = [];
    for (let index = head; index < queue.length; index += 1) {
      const entry = queue[index]!;
      if (this.keyed.get(entry.task.id) === entry) live.push(entry);
    }
    this.queues[lane] = live;
    this.heads[lane] = 0;
  }
}
