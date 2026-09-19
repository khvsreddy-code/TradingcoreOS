/** Batches chart mutations onto one animation frame to prevent update storms. */
export class ChartUpdateScheduler {
  private frame: number | null = null;
  private pending = new Set<() => void>();

  schedule(task: () => void): void {
    this.pending.add(task);
    if (this.frame != null) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
    this.frame = raf(() => {
      this.frame = null;
      const tasks = [...this.pending];
      this.pending.clear();
      for (const run of tasks) {
        try { run(); } catch (error) { console.warn('[TradingCore] batched chart update failed', error); }
      }
    });
  }

  cancel(): void {
    if (this.frame == null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.frame);
    else clearTimeout(this.frame as unknown as ReturnType<typeof setTimeout>);
    this.frame = null;
    this.pending.clear();
  }
}
