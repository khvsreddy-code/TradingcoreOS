/** Chart-only lifecycle guard. CoreSpirit remains a separate entity. */
export class ChartLifecycle {
  private generation = 0;
  private disposed = false;

  public begin(): number { return ++this.generation; }
  public invalidate(): number { return ++this.generation; }
  public isCurrent(generation: number): boolean { return !this.disposed && generation === this.generation; }
  public isAlive(): boolean { return !this.disposed; }
  public dispose(): void { this.disposed = true; ++this.generation; }
}

export const safeChartCall = <T>(call: () => T, fallback?: T): T | undefined => {
  try { return call(); } catch { return fallback; }
};
