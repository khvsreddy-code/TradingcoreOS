/** Value storage shared by the reference VM and optimized scalar executor. */
export interface CoreSpiritValueStore { get(key: string | number): unknown; set(key: string | number, value: unknown): void; }

/** Numeric register slots are the optimized path; string keys remain for VM/host compatibility. */
export class CoreSpiritSlotValueStore implements CoreSpiritValueStore {
  private readonly slots: unknown[];
  constructor(private readonly names: ReadonlyMap<string, number>, slotCount: number) { this.slots = new Array(slotCount); }
  get(key: string | number): unknown { if (typeof key === 'number') return this.slots[key]; const slot = this.names.get(key); return slot == null ? undefined : this.slots[slot]; }
  set(key: string | number, value: unknown): void { const slot = typeof key === 'number' ? key : this.names.get(key); if (slot == null || slot < 0) return; this.slots[slot] = value; }
  clear(): void { this.slots.fill(undefined); }
}