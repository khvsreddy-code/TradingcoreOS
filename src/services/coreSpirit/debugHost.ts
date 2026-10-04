export type CoreSpiritDebugEntry = Record<string, unknown>;

export class CoreSpiritDebugHost {
  private trace: CoreSpiritDebugEntry[] = [];

  reset(): void {
    this.trace = [];
  }

  record(entry: CoreSpiritDebugEntry): void {
    this.trace.push({ ...entry });
    if (this.trace.length > 2048) this.trace.splice(0, this.trace.length - 2048);
  }

  snapshot(): CoreSpiritDebugEntry[] {
    return this.trace.map((entry) => ({ ...entry }));
  }
}
