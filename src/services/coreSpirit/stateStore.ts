import { CoreSpiritSeriesRegistry, type CoreSpiritSeriesId, type CoreSpiritStoredValue } from './seriesRegistry';

export type CoreSpiritCrossState = Record<string, { a: number; b: number }>;

export class CoreSpiritStateStore {
  readonly series: CoreSpiritSeriesRegistry;
  private crossState: CoreSpiritCrossState = {};

  constructor(registry = new CoreSpiritSeriesRegistry()) {
    this.series = registry;
  }

  bind(registry: CoreSpiritSeriesRegistry, crossState: CoreSpiritCrossState): void {
    (this as any).series = registry;
    this.crossState = crossState;
  }

  beginRealtimeTransaction(): void {
    this.series.begin();
  }

  commitRealtimeTransaction(): void {
    this.series.commit();
    this.seriesCrossJournal?.clear();
  }

  rollbackRealtimeTransaction(): void {
    this.series.rollback();
    if (this.seriesCrossJournal) {
      for (const [key, value] of this.seriesCrossJournal) {
        if (value) this.crossState[key] = value;
        else delete this.crossState[key];
      }
      this.seriesCrossJournal.clear();
    }
  }

  hasRealtimeTransaction(): boolean {
    return this.series.hasActiveTransaction();
  }

  pushSeries(id: CoreSpiritSeriesId, value: number, limit: number): void {
    this.series.pushNumber(id, value, limit);
  }

  pushLocal(id: CoreSpiritSeriesId, value: CoreSpiritStoredValue, limit: number): void {
    this.series.pushValue(id, value, limit);
  }

  replaceSeries(id: CoreSpiritSeriesId, values: number[]): void {
    this.series.replaceNumber(id, values);
  }

  setCross(key: string, value: { a: number; b: number }): void {
    this.seriesCrossJournal ??= new Map();
    if (this.series.hasActiveTransaction() && !this.seriesCrossJournal.has(key)) {
      const previous = this.crossState[key];
      this.seriesCrossJournal.set(key, previous ? { ...previous } : null);
    }
    this.crossState[key] = value;
  }

  private seriesCrossJournal?: Map<string, { a: number; b: number } | null>;
}
