export type ComputePriority = 'interactive'|'realtime'|'visible'|'background'|'research';

export type ComputeJob<T> = {
  key: string;
  priority?: ComputePriority;
  run: () => Promise<T> | T;
};

const PRIORITY: Record<ComputePriority, number> = { interactive: 0, realtime: 1, visible: 2, background: 3, research: 4 };

/** Shared orchestration layer for chart/CoreSpirit/research compute work. */
export class CoreComputeScheduler {
  private queue: Array<ComputeJob<unknown>> = [];
  private running = false;
  private latest = new Map<string, Promise<unknown>>();

  schedule<T>(job: ComputeJob<T>): Promise<T> {
    const existing = this.latest.get(job.key);
    if (existing) return existing as Promise<T>;
    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({ ...job, run: async () => { try { resolve(await job.run()); } catch (error) { reject(error); } } });
      this.queue.sort((a, b) => PRIORITY[a.priority ?? 'background'] - PRIORITY[b.priority ?? 'background']);
      void this.dispatch();
    });
    this.latest.set(job.key, promise);
    promise.then(() => this.latest.delete(job.key), () => this.latest.delete(job.key));
    return promise;
  }

  private async dispatch(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!;
        try { await job.run(); } catch {};
        await Promise.resolve();
      }
    } finally { this.running = false; }
  }

  clear(): void { this.queue.length = 0; this.latest.clear(); }
  get pending(): number { return this.queue.length; }
}

export const coreComputeScheduler = new CoreComputeScheduler();
