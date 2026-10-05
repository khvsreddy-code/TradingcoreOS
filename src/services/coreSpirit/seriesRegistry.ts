export type CoreSpiritSeriesId = number;
export const CORE_SPIRIT_INVALID_SERIES_ID = -1;

export type CoreSpiritStoredValue = number | boolean | string | null;

export type CoreSpiritNumericSeries = {
  readonly id: CoreSpiritSeriesId;
  readonly name: string;
  buffer: Float64Array;
  head: number;
  length: number;
  capacity: number;
};

type CoreSpiritValueSeries = {
  readonly id: CoreSpiritSeriesId;
  readonly name: string;
  buffer: CoreSpiritStoredValue[];
  head: number;
  length: number;
  capacity: number;
};

type NumericWrite = { index: number; value: number };
type ValueWrite = { index: number; value: CoreSpiritStoredValue };

type NumericJournalEntry = {
  existed: boolean;
  originalBuffer?: Float64Array;
  originalHead: number;
  originalLength: number;
  originalCapacity: number;
  writes: NumericWrite[];
  replaced: boolean;
};

type ValueJournalEntry = {
  existed: boolean;
  originalBuffer?: CoreSpiritStoredValue[];
  originalHead: number;
  originalLength: number;
  originalCapacity: number;
  writes: ValueWrite[];
  replaced: boolean;
};

function nextCapacity(required: number): number {
  let capacity = 16;
  while (capacity < Math.max(1, required)) capacity *= 2;
  return capacity;
}

function isNumericValue(value: CoreSpiritStoredValue): value is number {
  return typeof value === 'number';
}

/**
 * Numeric series storage for script-local history.
 *
 * Hot-path contract:
 *   name -> id      happens during program preparation
 *   id -> ring slot happens during VM execution
 *
 * Compatibility object/array views are lazy and intentionally allocate only
 * when callers enumerate/read the public state surface.
 */
export class CoreSpiritSeriesRegistry {
  private readonly ids = new Map<string, CoreSpiritSeriesId>();
  private readonly names: string[] = [];
  private readonly numeric = new Map<CoreSpiritSeriesId, CoreSpiritNumericSeries>();
  private readonly values = new Map<CoreSpiritSeriesId, CoreSpiritValueSeries>();
  private readonly numericJournal = new Map<CoreSpiritSeriesId, NumericJournalEntry>();
  private readonly valueJournal = new Map<CoreSpiritSeriesId, ValueJournalEntry>();
  private activeTransaction = false;

  idFor(name: string): CoreSpiritSeriesId {
    const existing = this.ids.get(name);
    if (existing !== undefined) return existing;
    const id = this.names.length;
    this.ids.set(name, id);
    this.names.push(name);
    return id;
  }

  existingId(name: string): CoreSpiritSeriesId {
    return this.ids.get(name) ?? CORE_SPIRIT_INVALID_SERIES_ID;
  }

  nameFor(id: CoreSpiritSeriesId): string | undefined {
    return this.names[id];
  }

  prepare(names: readonly string[]): void {
    for (const name of names) this.idFor(name);
  }

  reset(): void {
    this.ids.clear();
    this.names.length = 0;
    this.numeric.clear();
    this.values.clear();
    this.numericJournal.clear();
    this.valueJournal.clear();
    this.activeTransaction = false;
  }

  begin(): void {
    this.numericJournal.clear();
    this.valueJournal.clear();
    this.activeTransaction = true;
  }

  commit(): void {
    this.numericJournal.clear();
    this.valueJournal.clear();
    this.activeTransaction = false;
  }

  rollback(): void {
    if (!this.activeTransaction) return;

    for (const [id, entry] of this.numericJournal) {
      if (!entry.existed) {
        this.numeric.delete(id);
        continue;
      }
      const slot = this.numeric.get(id);
      if (!slot) continue;
      for (let i = entry.writes.length - 1; i >= 0; i -= 1) {
        const write = entry.writes[i]!;
        slot.buffer[write.index] = write.value;
      }
      if (entry.originalBuffer) slot.buffer = entry.originalBuffer;
      slot.head = entry.originalHead;
      slot.length = entry.originalLength;
      slot.capacity = entry.originalCapacity;
    }

    for (const [id, entry] of this.valueJournal) {
      if (!entry.existed) {
        this.values.delete(id);
        continue;
      }
      const slot = this.values.get(id);
      if (!slot) continue;
      for (let i = entry.writes.length - 1; i >= 0; i -= 1) {
        const write = entry.writes[i]!;
        slot.buffer[write.index] = write.value;
      }
      if (entry.originalBuffer) slot.buffer = entry.originalBuffer;
      slot.head = entry.originalHead;
      slot.length = entry.originalLength;
      slot.capacity = entry.originalCapacity;
    }

    this.commit();
  }

  hasActiveTransaction(): boolean {
    return this.activeTransaction;
  }

  pushNumber(id: CoreSpiritSeriesId, value: number, limit: number): void {
    const existing = this.numeric.get(id);
    this.recordNumeric(id, existing);
    const slot = this.ensureNumericSlot(id, limit);
    this.pushNumeric(slot, Number(value));
  }

  pushValue(id: CoreSpiritSeriesId, value: CoreSpiritStoredValue, limit: number): void {
    if (isNumericValue(value) && !this.values.has(id)) {
      const existing = this.numeric.get(id);
      this.recordNumeric(id, existing);
      const slot = this.ensureNumericSlot(id, limit);
      this.pushNumeric(slot, value);
      return;
    }

    if (!isNumericValue(value) && this.numeric.has(id)) this.migrateNumericToValues(id, limit);

    const existing = this.values.get(id);
    this.recordValue(id, existing);
    const slot = this.ensureValueSlot(id, limit);
    this.pushValueRing(slot, value);
  }

  replaceNumber(id: CoreSpiritSeriesId, values: number[]): void {
    const existing = this.numeric.get(id);
    this.recordNumeric(id, existing);
    const capacity = nextCapacity(values.length);
    const slot: CoreSpiritNumericSeries = {
      id,
      name: this.names[id] ?? String(id),
      buffer: new Float64Array(capacity),
      head: 0,
      length: values.length,
      capacity,
    };
    slot.buffer.set(values);
    this.numeric.set(id, slot);
    const entry = this.numericJournal.get(id);
    if (entry) entry.replaced = true;
  }

  getNumberAt(id: CoreSpiritSeriesId, offset: number): number | null {
    const slot = this.numeric.get(id);
    if (!slot || offset < 0 || offset >= slot.length) return null;
    const index = (slot.head + slot.length - 1 - offset + slot.capacity) % slot.capacity;
    return slot.buffer[index] ?? null;
  }

  getValueAt(id: CoreSpiritSeriesId, offset: number): CoreSpiritStoredValue {
    const numeric = this.numeric.get(id);
    if (numeric && offset >= 0 && offset < numeric.length) return this.getNumberAt(id, offset);
    const values = this.values.get(id);
    if (!values || offset < 0 || offset >= values.length) return null;
    const index = (values.head + values.length - 1 - offset + values.capacity) % values.capacity;
    return values.buffer[index] ?? null;
  }

  numericSnapshot(id: CoreSpiritSeriesId): Float64Array {
    const slot = this.numeric.get(id);
    if (!slot || slot.length === 0) return new Float64Array(0);
    const out = new Float64Array(slot.length);
    for (let i = 0; i < slot.length; i += 1) {
      const index = (slot.head + i) % slot.capacity;
      out[i] = slot.buffer[index]!;
    }
    return out;
  }

  valueSnapshot(id: CoreSpiritSeriesId): CoreSpiritStoredValue[] {
    const numeric = this.numeric.get(id);
    if (numeric && !this.values.has(id)) return Array.from(this.numericSnapshot(id));
    const values = this.values.get(id);
    if (!values || values.length === 0) return [];
    const out: CoreSpiritStoredValue[] = new Array(values.length);
    for (let i = 0; i < values.length; i += 1) {
      const index = (values.head + i) % values.capacity;
      out[i] = values.buffer[index]!;
    }
    return out;
  }

  snapshotNumericObject(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const [id] of this.numeric) out[this.names[id] ?? String(id)] = Array.from(this.numericSnapshot(id));
    return out;
  }

  snapshotValueObject(): Record<string, CoreSpiritStoredValue[]> {
    const out: Record<string, CoreSpiritStoredValue[]> = {};
    for (const id of this.names.keys()) {
      const values = this.valueSnapshot(id);
      if (values.length) out[this.names[id]!] = values;
      else if (this.numeric.has(id)) out[this.names[id]!] = Array.from(this.numericSnapshot(id));
    }
    return out;
  }

  restoreNumericObject(values: Record<string, number[]>): void {
    for (const [name, data] of Object.entries(values)) this.replaceNumber(this.idFor(name), [...data]);
    this.commit();
  }

  restoreValueObject(values: Record<string, CoreSpiritStoredValue[]>): void {
    for (const [name, data] of Object.entries(values)) {
      const id = this.idFor(name);
      this.values.set(id, this.makeValueSlot(id, data));
    }
    this.commit();
  }

  createNumericCompatibilityView(): Record<string, number[]> {
    const registry = this;
    return new Proxy({} as Record<string, number[]>, {
      get(_target, property: string | symbol) {
        if (property === Symbol.toStringTag) return 'CoreSpiritSeriesView';
        if (typeof property !== 'string') return undefined;
        const id = registry.existingId(property);
        return id < 0 ? undefined : Array.from(registry.numericSnapshot(id));
      },
      ownKeys() {
        return registry.names.filter((name) => registry.numeric.has(registry.existingId(name)));
      },
      getOwnPropertyDescriptor(_target, property: string | symbol) {
        if (typeof property !== 'string') return undefined;
        const id = registry.existingId(property);
        return id >= 0 && registry.numeric.has(id)
          ? { enumerable: true, configurable: true, writable: false, value: Array.from(registry.numericSnapshot(id)) }
          : undefined;
      },
    });
  }

  createValueCompatibilityView(): Record<string, CoreSpiritStoredValue[]> {
    const registry = this;
    return new Proxy({} as Record<string, CoreSpiritStoredValue[]>, {
      get(_target, property: string | symbol) {
        if (property === Symbol.toStringTag) return 'CoreSpiritLocalSeriesView';
        if (typeof property !== 'string') return undefined;
        const id = registry.existingId(property);
        return id < 0 ? undefined : registry.valueSnapshot(id);
      },
      ownKeys() {
        return registry.names.filter((name) => registry.values.has(registry.existingId(name)) || registry.numeric.has(registry.existingId(name)));
      },
      getOwnPropertyDescriptor(_target, property: string | symbol) {
        if (typeof property !== 'string') return undefined;
        const id = registry.existingId(property);
        return id >= 0 && (registry.values.has(id) || registry.numeric.has(id))
          ? { enumerable: true, configurable: true, writable: false, value: registry.valueSnapshot(id) }
          : undefined;
      },
    });
  }

  private migrateNumericToValues(id: CoreSpiritSeriesId, limit: number): void {
    const numeric = this.numeric.get(id);
    if (!numeric) return;
    const existingValues = this.values.get(id);
    this.recordNumeric(id, numeric);
    this.recordValue(id, existingValues);
    const values = this.makeValueSlot(id, Array.from(this.numericSnapshot(id)), nextCapacity(Math.max(limit, numeric.length)));
    this.values.set(id, values);
    this.numeric.delete(id);
  }

  private ensureNumericSlot(id: CoreSpiritSeriesId, limit: number): CoreSpiritNumericSeries {
    const required = Math.max(1, Math.floor(limit));
    const existing = this.numeric.get(id);
    if (!existing) {
      const capacity = nextCapacity(required);
      const slot: CoreSpiritNumericSeries = {
        id,
        name: this.names[id] ?? String(id),
        buffer: new Float64Array(capacity),
        head: 0,
        length: 0,
        capacity,
      };
      this.numeric.set(id, slot);
      return slot;
    }
    if (existing.capacity >= required) return existing;
    this.recordNumeric(id, existing);
    const capacity = nextCapacity(required);
    const grown: CoreSpiritNumericSeries = {
      ...existing,
      buffer: new Float64Array(capacity),
      capacity,
      head: 0,
    };
    for (let i = 0; i < existing.length; i += 1) grown.buffer[i] = existing.buffer[(existing.head + i) % existing.capacity]!;
    this.numeric.set(id, grown);
    return grown;
  }

  private ensureValueSlot(id: CoreSpiritSeriesId, limit: number): CoreSpiritValueSeries {
    const required = Math.max(1, Math.floor(limit));
    const existing = this.values.get(id);
    if (!existing) {
      const capacity = nextCapacity(required);
      const slot = this.makeValueSlot(id, [], capacity);
      this.values.set(id, slot);
      return slot;
    }
    if (existing.capacity >= required) return existing;
    this.recordValue(id, existing);
    const grown = this.makeValueSlot(id, [], nextCapacity(required));
    grown.length = existing.length;
    for (let i = 0; i < existing.length; i += 1) grown.buffer[i] = existing.buffer[(existing.head + i) % existing.capacity]!;
    this.values.set(id, grown);
    return grown;
  }

  private makeValueSlot(id: CoreSpiritSeriesId, data: readonly CoreSpiritStoredValue[], capacity = nextCapacity(data.length)): CoreSpiritValueSeries {
    const slot: CoreSpiritValueSeries = { id, name: this.names[id] ?? String(id), buffer: new Array(capacity), head: 0, length: data.length, capacity };
    for (let i = 0; i < data.length; i += 1) slot.buffer[i] = data[i]!;
    return slot;
  }

  private pushNumeric(slot: CoreSpiritNumericSeries, value: number): void {
    const index = slot.length < slot.capacity ? (slot.head + slot.length) % slot.capacity : slot.head;
    if (slot.length === slot.capacity) {
      const entry = this.numericJournal.get(slot.id);
      if (entry) entry.writes.push({ index, value: slot.buffer[index]! });
      slot.head = (slot.head + 1) % slot.capacity;
    } else {
      slot.length += 1;
    }
    slot.buffer[index] = value;
  }

  private pushValueRing(slot: CoreSpiritValueSeries, value: CoreSpiritStoredValue): void {
    const index = slot.length < slot.capacity ? (slot.head + slot.length) % slot.capacity : slot.head;
    if (slot.length === slot.capacity) {
      const entry = this.valueJournal.get(slot.id);
      if (entry) entry.writes.push({ index, value: slot.buffer[index]! });
      slot.head = (slot.head + 1) % slot.capacity;
    } else {
      slot.length += 1;
    }
    slot.buffer[index] = value;
  }

  private recordNumeric(id: CoreSpiritSeriesId, existing: CoreSpiritNumericSeries | undefined): void {
    if (!this.activeTransaction || this.numericJournal.has(id)) return;
    this.numericJournal.set(id, {
      existed: existing !== undefined,
      originalBuffer: existing?.buffer,
      originalHead: existing?.head ?? 0,
      originalLength: existing?.length ?? 0,
      originalCapacity: existing?.capacity ?? 0,
      writes: [],
      replaced: false,
    });
  }

  private recordValue(id: CoreSpiritSeriesId, existing: CoreSpiritValueSeries | undefined): void {
    if (!this.activeTransaction || this.valueJournal.has(id)) return;
    this.valueJournal.set(id, {
      existed: existing !== undefined,
      originalBuffer: existing?.buffer,
      originalHead: existing?.head ?? 0,
      originalLength: existing?.length ?? 0,
      originalCapacity: existing?.capacity ?? 0,
      writes: [],
      replaced: false,
    });
  }
}
