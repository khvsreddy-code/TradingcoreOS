import type { CoreSpiritObject } from './types';

/**
 * Retained output collector for one execution pass.
 *
 * Primitive drawings with a stable ID are an upsert stream, not an append-only
 * tick log: the most recent geometry for a retained object replaces its prior
 * geometry. Zone identities include their origin-time anchor: a new zone at
 * the same call site is distinct, while updates to the same origin replace its
 * geometry. Event-like outputs without an ID remain append-only. This matters
 * for OB/FVG history, forming-bar replacements, and moving hline values.
 */
export class CoreSpiritOutputCollector {
  private readonly items: CoreSpiritObject[] = [];
  private readonly indexById = new Map<string, number>();
  private count = 0;

  constructor(private readonly maxPerBar: number) {}

  beginBar(clear = false): void {
    this.count = 0;
    if (clear) {
      this.items.length = 0;
      this.indexById.clear();
    }
  }

  push(value: CoreSpiritObject): void {
    if (++this.count > this.maxPerBar) {
      throw new Error(`output limit exceeded (${this.maxPerBar})`);
    }

    const rawId = (value as unknown as { id?: unknown }).id;
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (id) {
      const existingIndex = this.indexById.get(id);
      if (existingIndex !== undefined) {
        this.items[existingIndex] = value;
        return;
      }
      this.indexById.set(id, this.items.length);
    }

    this.items.push(value);
  }

  addDiagnostic(diagnostics: string[], message: string): void {
    diagnostics.push(message);
  }

  values(): CoreSpiritObject[] {
    return this.items;
  }
}
