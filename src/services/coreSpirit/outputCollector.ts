import type { CoreSpiritObject } from './types';

export class CoreSpiritOutputCollector {
  private readonly items: CoreSpiritObject[] = [];
  private count = 0;

  constructor(private readonly maxPerBar: number) {}

  beginBar(clear = false): void {
    this.count = 0;
    if (clear) this.items.length = 0;
  }

  push(value: CoreSpiritObject): void {
    if (++this.count > this.maxPerBar) {
      throw new Error(`output limit exceeded (${this.maxPerBar})`);
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
