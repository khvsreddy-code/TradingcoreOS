import type { MarketDataStore } from './marketDataStore';

export type DerivedSeriesValues = readonly number[] | Float64Array;

/**
 * Timeline-aligned store for derived data. It never owns another timestamp
 * column: all derived domains borrow the canonical MarketDataStore timeline.
 */
export class TimelineSeriesStore {
  private readonly fields = new Map<string, Float64Array>();
  private capacity = 0;
  private _revision = 0;

  constructor(readonly timeline: MarketDataStore) {}

  get length() { return this.timeline.length; }
  get revision() { return this._revision; }
  get time() { return this.timeline.time; }
  get timelineRevision() { return this.timeline.revision; }

  ensureField(name: string): Float64Array {
    const key = String(name).trim();
    if (!key) throw new Error('Derived series field name cannot be empty');
    let field = this.fields.get(key);
    if (!field || field.length !== this.capacity) {
      field = new Float64Array(Math.max(64, this.capacity, this.timeline.length));
      field.fill(Number.NaN);
      this.fields.set(key, field);
    }
    return field;
  }

  set(name: string, values: DerivedSeriesValues, from = 0): void {
    const start = Math.max(0, Math.floor(from));
    if (start + values.length > this.timeline.length) throw new Error(`Derived series '${name}' exceeds timeline length`);
    const field = this.ensureField(name);
    field.set(values, start);
    this._revision += 1;
  }

  get(name: string): Float64Array | undefined {
    const field = this.fields.get(String(name));
    return field?.subarray(0, this.timeline.length);
  }

  has(name: string): boolean { return this.fields.has(String(name)); }
  names(): readonly string[] { return [...this.fields.keys()]; }

  syncLength(): void {
    if (this.capacity >= this.timeline.length) return;
    const next = Math.max(64, this.timeline.length, this.capacity * 2);
    for (const [name, previous] of this.fields) {
      const replacement = new Float64Array(next); replacement.fill(Number.NaN); replacement.set(previous); this.fields.set(name, replacement);
    }
    this.capacity = next;
  }
}

export class IndicatorStore extends TimelineSeriesStore {}
export class ModelStore extends TimelineSeriesStore {}
export class StructureStore extends TimelineSeriesStore {}
export class LiquidityStore extends TimelineSeriesStore {}
export class OrderFlowStore extends TimelineSeriesStore {}
