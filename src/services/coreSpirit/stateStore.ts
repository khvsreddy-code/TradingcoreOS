import { CoreSpiritSeriesRegistry, type CoreSpiritSeriesId, type CoreSpiritStoredValue } from './seriesRegistry';

export type CoreSpiritCrossState = Record<string, { a: number; b: number }>;

export class CoreSpiritStateStore {
  readonly series = new CoreSpiritSeriesRegistry();

  bind(registry: CoreSpiritSeriesRegistry): void {
    (this as any).series = registry;
  }

  beginRealtimeTransaction(): void {
    this.series.begin();
  }

  commitRealtimeTransaction(): void {
    this.series.commit();
  }

  rollbackRealtimeTransaction(): void {
    this.series.rollback();
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
    // Cross state remains a scalar keyed map; only chronological series buffers
    // are lowered to numeric IDs in this tier.
    void key;
    void value;
  }
}
