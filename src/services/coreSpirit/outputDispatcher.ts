import { CoreEventBus, coreEventBus } from '../core/event/eventBus';
import { CoreDrawingStore } from '../core/drawing/coreDrawingStore';
import { CoreDrawingDispatcher } from '../core/drawing/drawingDispatcher';
import { CoreSpiritObject } from './types';

export type CoreSpiritPlotPoint = { time: number; value: number | null };
export type CoreSpiritOutputFrame = {
  /** Plot arrays are dispatcher-owned and retained across frames. Consumers must treat them as read-only. */
  plots: Map<string, CoreSpiritPlotPoint[]>;
  plotStyles: Map<string, NonNullable<Extract<CoreSpiritObject,{kind:'series'}>['style']>>;
  drawingCount: number;
  signals: CoreSpiritObject[];
  drawings: CoreSpiritObject[];
  visuals: CoreSpiritObject[];
  labels: Extract<CoreSpiritObject,{kind:'label'}>[];
  tables: Extract<CoreSpiritObject,{kind:'table'}>[];
};

/** Main-thread boundary: turns CoreSpirit's declarative outputs into chart-owned data. */
export class CoreSpiritOutputDispatcher {
  readonly drawings: CoreDrawingStore;
  readonly drawingDispatcher: CoreDrawingDispatcher;
  private plots = new Map<string, CoreSpiritPlotPoint[]>();
  private signals: CoreSpiritObject[] = [];
  private outputDrawings: CoreSpiritObject[] = [];
  private labels: Extract<CoreSpiritObject,{kind:'label'}>[] = [];
  private visuals: CoreSpiritObject[] = [];
  private tables: Extract<CoreSpiritObject,{kind:'table'}>[] = [];
  private plotStyles = new Map<string, NonNullable<Extract<CoreSpiritObject,{kind:'series'}>['style']>>();

  constructor(bus: CoreEventBus = coreEventBus, drawingStore = new CoreDrawingStore()) {
    this.drawings = drawingStore;
    this.drawingDispatcher = new CoreDrawingDispatcher(drawingStore, bus);
  }

  reset(): void { this.plots.clear(); this.plotStyles.clear(); this.signals = []; this.outputDrawings = []; this.labels = []; this.visuals = []; this.tables = []; this.drawings.clear(); }

  accept(outputs: CoreSpiritObject[], sourceId = 'coreSpirit'): CoreSpiritOutputFrame {
    for (const output of outputs) {
      if (output.kind === 'series') {
        const key = output.seriesId || output.name || `${sourceId}:plot:0`;
        const points = this.plots.get(key) || [];
        points.push({ time: output.time, value: output.value });
        if (points.length > 50000) points.splice(0, points.length - 50000);
        this.plots.set(key, points);
        if (output.style) this.plotStyles.set(key, output.style);
      } else if (output.kind === 'line' || output.kind === 'zone' || output.kind === 'marker' || output.kind === 'polyline' || output.kind === 'hline') {
        const id = (output as any).id || `${output.kind}:${this.outputDrawings.length}`;
        const idx = this.outputDrawings.findIndex(x => (x as any).id === id);
        if (idx >= 0 && output.kind !== 'marker') this.outputDrawings[idx] = output; else this.outputDrawings.push(output);
        if (output.kind === 'line' || output.kind === 'zone' || output.kind === 'marker') this.drawingDispatcher.accept(output, sourceId, 'script');
      } else if (output.kind === 'label') {
        const idx = this.labels.findIndex(x => x.id === output.id);
        if (idx >= 0) this.labels[idx] = output; else this.labels.push(output);
        if (this.labels.length > 5000) this.labels.splice(0, this.labels.length - 5000);
      } else if (output.kind === 'table') {
        const idx = this.tables.findIndex(x => x.id === output.id);
        if (idx >= 0) this.tables[idx] = output; else this.tables.push(output);
        if (this.tables.length > 1000) this.tables.splice(0, this.tables.length - 1000);
      } else if (output.kind === 'box' || output.kind === 'band' || output.kind === 'arrow' || output.kind === 'shape' || output.kind === 'background' || output.kind === 'barcolor') {
        const id = (output as any).id || `${output.kind}:${this.visuals.length}`;
        const idx = this.visuals.findIndex(x => (x as any).id === id);
        if (idx >= 0 && !['band','shape','background','barcolor'].includes(output.kind)) this.visuals[idx] = output; else this.visuals.push(output);
        if (this.visuals.length > 25000) this.visuals.splice(0, this.visuals.length - 25000);
      } else if (output.kind === 'signal') {
        this.signals.push(output);
        if (this.signals.length > 10000) this.signals.splice(0, this.signals.length - 10000);
      } else if (output.kind === 'orderIntent') {
        // Execution remains outside the chart renderer. The visual projection shows
        // the intent as a marker while the event bus/execution layer decides whether
        // anything may actually be sent to a broker.
        this.signals.push({
          kind: 'signal',
          time: output.time,
          type: output.side === 'flat' ? 'EXIT' : output.side === 'long' ? 'ENTRY LONG' : 'ENTRY SHORT',
          metadata: { ...(output.metadata || {}), intentId: output.id, confidence: output.confidence, position: output.side === 'short' ? 'above' : 'below', shape: output.side === 'short' ? 'arrowDown' : 'arrowUp', color: output.side === 'short' ? '#ef4444' : '#22c55e' },
        });
        if (this.signals.length > 10000) this.signals.splice(0, this.signals.length - 10000);
      }
    }
    return this.frame();
  }

  frame(): CoreSpiritOutputFrame {
    // Keep the hot-path object graph stable. The chart projection reads the retained
    // arrays directly and performs targeted Vela patches instead of cloning O(history)
    // data on every tick.
    return {
      plots: this.plots,
      plotStyles: this.plotStyles,
      drawingCount: this.drawings.list().length,
      signals: this.signals,
      drawings: this.outputDrawings,
      visuals: this.visuals,
      labels: this.labels,
      tables: this.tables,
    };
  }
}

export const coreSpiritOutputDispatcher = new CoreSpiritOutputDispatcher();
