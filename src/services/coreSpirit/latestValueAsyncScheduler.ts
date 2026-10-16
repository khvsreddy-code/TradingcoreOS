/**
 * A single-flight scheduler for work where only the newest queued snapshot matters.
 *
 * Raw market events must be processed upstream in sequence. This scheduler is for
 * downstream snapshot work (for example, refreshing a forming-bar indicator output):
 * while one calculation is in flight, repeated enqueue calls replace the one pending
 * snapshot instead of building an unbounded worker queue.
 */
export class LatestValueAsyncScheduler<T> {
  private pendingValue: T | undefined;
  private hasPending = false;
  private running = false;
  private disposed = false;

  constructor(
    private readonly processValue: (value: T) => Promise<void> | void,
    private readonly onError: (error: unknown) => void = () => undefined,
  ) {}

  enqueue(value: T): boolean {
    if (this.disposed) return false;
    this.pendingValue = value;
    this.hasPending = true;
    void this.drain();
    return true;
  }

  /** Drop a queued snapshot. Already-running work must be guarded by its caller's revision. */
  clear(): void {
    this.pendingValue = undefined;
    this.hasPending = false;
  }

  /** Drop pending work and prevent future enqueues. Does not pretend to cancel an active promise. */
  dispose(): void {
    this.clear();
    this.disposed = true;
  }

  get isRunning(): boolean { return this.running; }
  get hasQueuedValue(): boolean { return this.hasPending; }
  get isDisposed(): boolean { return this.disposed; }

  private async drain(): Promise<void> {
    if (this.running || this.disposed) return;
    this.running = true;
    try {
      while (this.hasPending && !this.disposed) {
        const value = this.pendingValue as T;
        this.pendingValue = undefined;
        this.hasPending = false;
        try {
          await this.processValue(value);
        } catch (error) {
          try { this.onError(error); } catch { /* observers must not break scheduler liveness */ }
        }
      }
    } finally {
      this.running = false;
      // An enqueue can land between the final loop condition and clearing running.
      if (this.hasPending && !this.disposed) void this.drain();
    }
  }
}
