import { CoreEventBus, coreEventBus } from '../core/event/eventBus';
import { CoreDrawingStore } from '../core/drawing/coreDrawingStore';
import { CoreDrawingDispatcher } from '../core/drawing/drawingDispatcher';
import { CoreSpiritObject } from './types';

export type CoreSpiritPlotPoint = { time: number; value: number | null };
export type CoreSpiritOutputFrame = { plots: Map<string, CoreSpiritPlotPoint[]>; drawingCount: number; signals: CoreSpiritObject[] };

/** Main-thread boundary: turns CoreSpirit's declarative outputs into chart-owned data. */
export class CoreSpiritOutputDispatcher {
  readonly drawings: CoreDrawingStore;
  readonly drawingDispatcher: CoreDrawingDispatcher;
  private plots = new Map<string, CoreSpiritPlotPoint[]>();
  private signals: CoreSpiritObject[] = [];

  constructor(bus: CoreEventBus = coreEventBus, drawingStore = new CoreDrawingStore()) {
    this.drawings = drawingStore;
    this.drawingDispatcher = new CoreDrawingDispatcher(drawingStore, bus);
  }

  reset(): void { this.plots.clear(); this.signals = []; this.drawings.clear(); }

  accept(outputs: CoreSpiritObject[], sourceId = 'coreSpirit'): CoreSpiritOutputFrame {
    for (const output of outputs) {
      if (output.kind === 'series') {
        const key = output.name || sourceId;
        const points = this.plots.get(key) || [];
        points.push({ time: output.time, value: output.value });
        if (points.length > 50000) points.splice(0, points.length - 50000);
        this.plots.set(key, points);
      } else if (output.kind === 'line' || output.kind === 'zone' || output.kind === 'marker') {
        this.drawingDispatcher.accept(output, sourceId, 'script');
      } else if (output.kind === 'signal') {
        this.signals.push(output);
        if (this.signals.length > 10000) this.signals.splice(0, this.signals.length - 10000);
      }
    }
    return this.frame();
  }

  frame(): CoreSpiritOutputFrame {
    return { plots: new Map([...this.plots].map(([k,v]) => [k, v.slice()])), drawingCount: this.drawings.list().length, signals: this.signals.slice() };
  }
}

export const coreSpiritOutputDispatcher = new CoreSpiritOutputDispatcher();
