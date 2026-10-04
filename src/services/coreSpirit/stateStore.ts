import { CoreSpiritSeriesStore, type CoreSpiritStoredValue } from './seriesStore';

export type CoreSpiritCrossState = Record<string, { a: number; b: number }>;

export class CoreSpiritStateStore {
  readonly series = new CoreSpiritSeriesStore();

  bind(
    seriesState: Record<string, number[]>,
    localSeries: Record<string, CoreSpiritStoredValue[]>,
    crossState: CoreSpiritCrossState,
  ): void {
    this.series.bind(seriesState, localSeries, crossState);
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

  pushSeries(key: string, value: number, limit: number): void {
    this.series.pushNumber(key, value, limit);
  }

  pushLocal(key: string, value: CoreSpiritStoredValue, limit: number): void {
    this.series.pushValue(key, value, limit);
  }

  replaceSeries(key: string, values: number[]): void {
    this.series.replaceNumber(key, values);
  }

  setCross(key: string, value: { a: number; b: number }): void {
    this.series.setCross(key, value);
  }
}
