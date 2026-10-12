
export type HistoryRequestPriority = 'initial' | 'visible' | 'warm';

type QueueItem<T> = {
  key: string;
  priority: number;
  sequence: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

const PRIORITY: Record<HistoryRequestPriority, number> = { initial: -10, visible: 0, warm: 10 };

/**
 * Global history request gate. A chart dataset owns its lifecycle, but the
 * browser shares one bounded request budget across all datasets. This prevents
 * a 16-chart mount or multi-chart left-edge gesture from becoming an upstream
 * REST burst while preserving per-dataset single-flight in ChartDataPlane.
 */
export class ChartHistoryCoordinator {
  readonly maxConcurrent = 6;
  private active = 0;
  private sequence = 0;
  private queue: Array<QueueItem<any>> = [];
  private queuedByKey = new Map<string, QueueItem<any>>();
  private inflight = new Map<string, Promise<any>>();

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.priority === PRIORITY.initial) return b.sequence - a.sequence;
      return a.sequence - b.sequence;
    });
  }

  promote(key: string, priority: HistoryRequestPriority = 'initial'): boolean {
    const queued = this.queuedByKey.get(key);
    const nextPriority = PRIORITY[priority];
    if (!queued || nextPriority >= queued.priority) return false;
    queued.priority = nextPriority;
    queued.sequence = ++this.sequence;
    this.sortQueue();
    return true;
  }

  request<T>(key: string, run: () => Promise<T>, priority: HistoryRequestPriority = 'visible'): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      this.promote(key, priority);
      return existing as Promise<T>;
    }

    const promise = new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = { key, priority: PRIORITY[priority], sequence: ++this.sequence, run, resolve, reject };
      this.queue.push(item);
      this.queuedByKey.set(key, item);
      this.sortQueue();
      this.pump();
    });
    this.inflight.set(key, promise);
    return promise.finally(() => this.inflight.delete(key));
  }

  private pump(): void {
    while (this.active < this.maxConcurrent && this.queue.length) {
      const item = this.queue.shift()!;
      this.queuedByKey.delete(item.key);
      this.active += 1;
      Promise.resolve()
        .then(item.run)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }

  snapshot() {
    return { active: this.active, queued: this.queue.length, inflight: this.inflight.size, maxConcurrent: this.maxConcurrent };
  }
}

export const chartHistoryCoordinator = new ChartHistoryCoordinator();
export { INITIAL_HISTORY_CANDLES, HISTORY_PAGE_CANDLES, HISTORY_WARM_TARGET_CANDLES, initialHistoryCandles, historyPageCandles, historyWarmTarget, historyDemandPageCandles, historyDemandLeadBars, shouldLoadOlderHistory } from './chartHistoryPolicy';
