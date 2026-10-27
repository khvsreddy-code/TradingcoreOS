import { CoreSpiritSeriesRegistry, type CoreSpiritSeriesId, type CoreSpiritStoredValue } from './seriesRegistry';

export type CoreSpiritCrossState = Record<string, { a: number; b: number }>;
export type CoreSpiritPersistentState = Map<string, CoreSpiritStoredValue>;

export class CoreSpiritStateStore {
  readonly series: CoreSpiritSeriesRegistry;
  private crossState: CoreSpiritCrossState = {};
  private readonly persistentState: CoreSpiritPersistentState = new Map();
  private persistentJournal?: Map<string, CoreSpiritStoredValue | undefined>;

  constructor(registry = new CoreSpiritSeriesRegistry()) {
    this.series = registry;
  }

  bind(crossState: CoreSpiritCrossState): void {
    this.crossState = crossState;
  }

  clear(): void {
    this.persistentState.clear();
    this.persistentJournal?.clear();
    this.persistentJournal = undefined;
  }

  beginRealtimeTransaction(): void {
    this.series.begin();
    this.persistentJournal = new Map();
  }

  commitRealtimeTransaction(): void {
    this.series.commit();
    this.persistentJournal?.clear();
    this.persistentJournal = undefined;
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
    if (this.persistentJournal) {
      for (const [key, value] of this.persistentJournal) {
        if (value === undefined) this.persistentState.delete(key);
        else this.persistentState.set(key, value);
      }
      this.persistentJournal.clear();
    }
    this.commit();
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

  getState(key: string): CoreSpiritStoredValue {
    return this.persistentState.get(key) ?? null;
  }

  setState(key: string, value: CoreSpiritStoredValue, initializeIfAbsent = false): void {
    if (initializeIfAbsent && this.persistentState.has(key)) return;
    if (this.persistentJournal && !this.persistentJournal.has(key)) {
      this.persistentJournal.set(key, this.persistentState.has(key) ? this.persistentState.get(key) : undefined);
    }
    this.persistentState.set(key, value);
  }

  stateSnapshot(): Record<string, CoreSpiritStoredValue> {
    return Object.fromEntries(this.persistentState.entries());
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

  private commit(): void {
    this.series.commit();
    this.persistentJournal?.clear();
    this.persistentJournal = undefined;
  }
}
