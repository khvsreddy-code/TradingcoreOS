import type { CoreSpiritObject } from './types';
import type { CoreSpiritOutputSemantics } from './executionSemantics';
import type { CoreSpiritResourceGovernor } from './resourceGovernor';

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
  private semantics?: CoreSpiritOutputSemantics;

  constructor(private readonly maxPerBar: number, private readonly resourceGovernor?: Pick<CoreSpiritResourceGovernor, 'recordOutput'>) {}

  setExecutionSemantics(semantics: CoreSpiritOutputSemantics | undefined): void {
    this.semantics = semantics;
  }

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

    const enriched = this.semantics
      ? {
          ...value,
          metadata: {
            ...((value as unknown as { metadata?: Record<string, unknown> }).metadata ?? {}),
            coreSpiritExecution: this.semantics,
          },
        } as CoreSpiritObject
      : value;
    const rawId = (enriched as unknown as { id?: unknown }).id;
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    const existingIndex = id ? this.indexById.get(id) : undefined;
    this.resourceGovernor?.recordOutput(enriched, !id || existingIndex === undefined);
    if (id) {
      if (existingIndex !== undefined) {
        this.items[existingIndex] = enriched;
        return;
      }
      this.indexById.set(id, this.items.length);
    }

    this.items.push(enriched);
  }

  addDiagnostic(diagnostics: string[], message: string): void {
    diagnostics.push(message);
  }

  values(): CoreSpiritObject[] {
    return this.items;
  }
}
