export type CoreSpiritStoredValue = number | boolean | string | null;

type NumberEntry = {
  existed: boolean;
  original: number[] | undefined;
  originalLength: number;
  replaced: boolean;
  removed: number[];
};

type ValueEntry = {
  existed: boolean;
  original: CoreSpiritStoredValue[] | undefined;
  originalLength: number;
  replaced: boolean;
  removed: CoreSpiritStoredValue[];
};

type CrossEntry = {
  existed: boolean;
  original: { a: number; b: number } | undefined;
};

export class CoreSpiritSeriesStore {
  private numberState: Record<string, number[]> = {};
  private valueState: Record<string, CoreSpiritStoredValue[]> = {};
  private crossState: Record<string, { a: number; b: number }> = {};
  private numberJournal = new Map<string, NumberEntry>();
  private valueJournal = new Map<string, ValueEntry>();
  private crossJournal = new Map<string, CrossEntry>();
  private active = false;

  bind(
    numberState: Record<string, number[]>,
    valueState: Record<string, CoreSpiritStoredValue[]>,
    crossState: Record<string, { a: number; b: number }>,
  ): void {
    this.numberState = numberState;
    this.valueState = valueState;
    this.crossState = crossState;
  }

  begin(): void {
    this.numberJournal.clear();
    this.valueJournal.clear();
    this.crossJournal.clear();
    this.active = true;
  }

  commit(): void {
    this.numberJournal.clear();
    this.valueJournal.clear();
    this.crossJournal.clear();
    this.active = false;
  }

  rollback(): void {
    if (!this.active) return;

    for (const [key, entry] of this.numberJournal) {
      if (!entry.existed) {
        delete this.numberState[key];
        continue;
      }
      if (entry.replaced) {
        this.numberState[key] = entry.original!;
        continue;
      }
      const current = this.numberState[key];
      if (!current) {
        if (entry.original) this.numberState[key] = entry.original;
        continue;
      }
      if (entry.removed.length) current.unshift(...entry.removed);
      current.length = entry.originalLength;
      this.numberState[key] = current;
    }

    for (const [key, entry] of this.valueJournal) {
      if (!entry.existed) {
        delete this.valueState[key];
        continue;
      }
      if (entry.replaced) {
        this.valueState[key] = entry.original!;
        continue;
      }
      const current = this.valueState[key];
      if (!current) {
        if (entry.original) this.valueState[key] = entry.original;
        continue;
      }
      if (entry.removed.length) current.unshift(...entry.removed);
      current.length = entry.originalLength;
      this.valueState[key] = current;
    }

    for (const [key, entry] of this.crossJournal) {
      if (entry.existed) this.crossState[key] = { ...entry.original! };
      else delete this.crossState[key];
    }

    this.commit();
  }

  hasActiveTransaction(): boolean {
    return this.active;
  }

  pushNumber(key: string, value: number, limit: number): void {
    const existing = this.numberState[key];
    this.recordNumber(key, existing);
    const target = existing ?? [];
    target.push(Number(value));
    const overflow = Math.max(0, target.length - Math.max(1, limit));
    if (overflow) {
      const removed = target.splice(0, overflow);
      const entry = this.numberJournal.get(key);
      if (entry) entry.removed.push(...removed);
    }
    this.numberState[key] = target;
  }

  pushValue(key: string, value: CoreSpiritStoredValue, limit: number): void {
    const existing = this.valueState[key];
    this.recordValue(key, existing);
    const target = existing ?? [];
    target.push(value);
    const overflow = Math.max(0, target.length - Math.max(1, limit));
    if (overflow) {
      const removed = target.splice(0, overflow);
      const entry = this.valueJournal.get(key);
      if (entry) entry.removed.push(...removed);
    }
    this.valueState[key] = target;
  }

  replaceNumber(key: string, values: number[]): void {
    const existing = this.numberState[key];
    this.recordNumber(key, existing);
    this.numberState[key] = values;
    const entry = this.numberJournal.get(key);
    if (entry) entry.replaced = true;
  }

  replaceValue(key: string, values: CoreSpiritStoredValue[]): void {
    const existing = this.valueState[key];
    this.recordValue(key, existing);
    this.valueState[key] = values;
    const entry = this.valueJournal.get(key);
    if (entry) entry.replaced = true;
  }

  setCross(key: string, value: { a: number; b: number }): void {
    if (this.active && !this.crossJournal.has(key)) {
      const previous = this.crossState[key];
      this.crossJournal.set(key, {
        existed: previous !== undefined,
        original: previous ? { ...previous } : undefined,
      });
    }
    this.crossState[key] = value;
  }

  private recordNumber(key: string, existing: number[] | undefined): void {
    if (!this.active || this.numberJournal.has(key)) return;
    this.numberJournal.set(key, {
      existed: existing !== undefined,
      original: existing,
      originalLength: existing?.length ?? 0,
      replaced: false;
      removed: [],
    });
  }

  private recordValue(key: string, existing: CoreSpiritStoredValue[] | undefined): void {
    if (!this.active || this.valueJournal.has(key)) return;
    this.valueJournal.set(key, {
      existed: existing !== undefined,
      original: existing,
      originalLength: existing?.length ?? 0,
      replaced: false;
      removed: [],
    });
  }
}
