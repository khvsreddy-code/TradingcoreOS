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

export type CoreSpiritPerformanceAggregate = Readonly<{
  lane: CoreSpiritPerformanceMetric['lane'];
  name: string;
  sampleCount: number;
  overBudgetCount: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  worstMs: number;
}>;

function nearestRank(values: readonly number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(percentile * sorted.length) - 1));
  return sorted[index] ?? 0;
}

/**
 * A bounded monitor for the execution hot path.
 *
 * Samples are stored in a fixed-size ring: recording a sample is O(1) and never
 * shifts or splices the existing buffer. Aggregation happens only when a caller
 * explicitly requests a snapshot, so percentile sorting is kept off live ticks.
 */
export class CoreSpiritPerformanceMonitor {
  private readonly samples: Array<CoreSpiritPerformanceMetric | undefined>;
  private nextWrite = 0;
  private sampleCount = 0;

  constructor(
    private readonly budget: CoreSpiritPerformanceBudget = CORE_SPIRIT_DEFAULT_PERFORMANCE_BUDGET,
    private readonly maxSamples = 2048,
  ) {
    if (!Number.isSafeInteger(maxSamples) || maxSamples < 1 || maxSamples > 65_536) {
      throw new Error('CoreSpirit performance sample capacity must be an integer between 1 and 65536.');
    }
    this.samples = new Array<CoreSpiritPerformanceMetric | undefined>(maxSamples);
  }

  measure<T>(lane: CoreSpiritPerformanceMetric['lane'], name: string, task: () => T): T {
    const started = this.now();
    try { return task(); }
    finally { this.record(lane, name, Math.max(0, this.now() - started)); }
  }

  async measureAsync<T>(
    lane: CoreSpiritPerformanceMetric['lane'],
    name: string,
    task: () => PromiseLike<T> | T,
  ): Promise<T> {
    const started = this.now();
    try { return await task(); }
    finally { this.record(lane, name, Math.max(0, this.now() - started)); }
  }

  record(lane: CoreSpiritPerformanceMetric['lane'], name: string, durationMs: number): void {
    if (typeof name !== 'string' || !name.trim()) throw new Error('CoreSpirit performance metric name is required.');
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new Error('CoreSpirit performance duration must be a finite non-negative number.');
    }
    const budgetMs = lane === 'hot' ? this.budget.hotTaskMs
      : lane === 'warm' ? this.budget.reactiveMs
      : this.budget.backgroundMs;
    this.samples[this.nextWrite] = Object.freeze({
      lane,
      name,
      durationMs,
      budgetMs,
      overBudget: durationMs > budgetMs,
      timestamp: Date.now(),
    });
    this.nextWrite = (this.nextWrite + 1) % this.maxSamples;
    this.sampleCount = Math.min(this.maxSamples, this.sampleCount + 1);
  }

  snapshot(): Readonly<{
    samples: readonly CoreSpiritPerformanceMetric[];
    overBudgetCount: number;
    worstMs: number;
    averageMs: number;
  }> {
    const samples: CoreSpiritPerformanceMetric[] = [];
    const first = this.sampleCount === this.maxSamples ? this.nextWrite : 0;
    for (let index = 0; index < this.sampleCount; index += 1) {
      const item = this.samples[(first + index) % this.maxSamples];
      if (item) samples.push(item);
    }
    const total = samples.reduce((sum, item) => sum + item.durationMs, 0);
    return Object.freeze({
      samples: Object.freeze(samples),
      overBudgetCount: samples.filter(item => item.overBudget).length,
      worstMs: samples.reduce((max, item) => Math.max(max, item.durationMs), 0),
      averageMs: samples.length ? total / samples.length : 0,
    });
  }

  /** Aggregate the bounded sample window on demand; no sorting occurs during record(). */
  summarizeByName(): readonly CoreSpiritPerformanceAggregate[] {
    const groups = new Map<string, CoreSpiritPerformanceMetric[]>();
    for (const item of this.snapshot().samples) {
      const key = item.lane + ':' + item.name;
      const group = groups.get(key);
      if (group) group.push(item);
      else groups.set(key, [item]);
    }
    return Object.freeze([...groups.values()].map(group => {
      const first = group[0]!;
      const values = group.map(item => item.durationMs);
      const total = values.reduce((sum, value) => sum + value, 0);
      return Object.freeze({
        lane: first.lane,
        name: first.name,
        sampleCount: group.length,
        overBudgetCount: group.filter(item => item.overBudget).length,
        averageMs: total / group.length,
        p50Ms: nearestRank(values, 0.50),
        p95Ms: nearestRank(values, 0.95),
        p99Ms: nearestRank(values, 0.99),
        worstMs: values.reduce((max, value) => Math.max(max, value), 0),
      });
    }));
  }

  clear(): void {
    this.samples.fill(undefined);
    this.nextWrite = 0;
    this.sampleCount = 0;
  }

  get size(): number {
    return this.sampleCount;
  }

  private now(): number {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }
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
    this.queues.hot.length = 0;
    this.queues.warm.length = 0;
    this.queues.cold.length = 0;
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
