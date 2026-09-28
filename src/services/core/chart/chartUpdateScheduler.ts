/** Batches chart mutations onto one animation frame to prevent update storms. */
export class ChartUpdateScheduler {
  private frame: number | null = null;
  private frameCount = 0;
  private executedTasks = 0;
  private droppedKeyedTasks = 0;
  private pending = new Set<() => void>();
  private keyed = new Map<string, () => void>();

  schedule(task: () => void): void {
    this.pending.add(task);
    this.requestFrame();
  }

  /** Keep only the newest task for a high-frequency stream (worker/tick UI). */
  scheduleLatest(key: string, task: () => void): void {
    const previous = this.keyed.get(key);
    if (previous) { this.pending.delete(previous); this.droppedKeyedTasks += 1; }
    this.keyed.set(key, task);
    this.pending.add(task);
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.frame != null) return;
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;

    this.frame = raf(() => {
      this.frame = null;
      this.frameCount += 1;
      const tasks = [...this.pending];
      this.pending.clear();
      this.keyed.clear();

      for (const run of tasks) {
        try { run(); this.executedTasks += 1; } catch (error) { console.warn('[TradingCore] batched chart update failed', error); }
      }
    });
  }

  getStats(): Readonly<{ frameCount:number; executedTasks:number; droppedKeyedTasks:number; pendingTasks:number }> {
    return Object.freeze({ frameCount:this.frameCount, executedTasks:this.executedTasks, droppedKeyedTasks:this.droppedKeyedTasks, pendingTasks:this.pending.size });
  }

  cancel(): void {
    if (this.frame == null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
    else clearTimeout(this.frame as unknown as ReturnType<typeof setTimeout>);
    this.frame = null;
    this.pending.clear();
    this.keyed.clear();
  }
}
