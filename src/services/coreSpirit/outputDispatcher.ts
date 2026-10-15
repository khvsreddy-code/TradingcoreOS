import { CoreEventBus, coreEventBus } from '../core/event/eventBus';
import { CoreDrawingStore } from '../core/drawing/coreDrawingStore';
import { CoreDrawingDispatcher } from '../core/drawing/drawingDispatcher';
import { CoreSpiritObject } from './types';

export type CoreSpiritPlotPoint = { time: number; value: number | null };
function canonicalSecondsTime(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Number.NaN;
  return Math.abs(numeric) >= 1e11 ? numeric / 1000 : numeric;
}

function upsertPlotPoint(points: CoreSpiritPlotPoint[], point: CoreSpiritPlotPoint): void {
  if (!Number.isFinite(point.time)) return;
  let low = 0, high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle]!.time < point.time) low = middle + 1;
    else high = middle;
  }
  if (low < points.length && points[low]!.time === point.time) points[low] = point;
  else points.splice(low, 0, point);
}

function signalIdentity(output: Extract<CoreSpiritObject, { kind: 'signal' }>): string {
  const metadata = output.metadata ?? {};
  const stableId = metadata.signalId ?? metadata.outputId ?? metadata.intentId;
  return stableId != null
    ? `id:${String(stableId)}`
    : `bar:${canonicalSecondsTime(output.time)}:${String(output.type)}:${String(metadata.barIndex ?? '')}`;
}

function visualIdentity(output: CoreSpiritObject, fallback: string): string {
  const value = output as any;
  const explicitId = typeof value.id === 'string' && value.id.length ? value.id : undefined;
  const kind = output.kind;
  const time = Number.isFinite(Number(value.time)) ? canonicalSecondsTime(value.time) : undefined;
  // Per-bar visuals carry an identity for the bar as well as their script ID.
  // Without this, one developing bar can overwrite every previous background or band.
  if (['band','shape','background','barcolor','footprint'].includes(kind) && time !== undefined) {
    return `${explicitId ?? `${kind}:${time}`}@${time}`;
  }
  if (explicitId) return explicitId;
  if (kind === 'marker') return `marker:${time ?? ''}:${Number(value.price)}`;
  if (kind === 'line' || kind === 'arrow') return `${kind}:${value.start?.time ?? ''}:${value.start?.price ?? ''}:${value.end?.time ?? ''}:${value.end?.price ?? ''}`;
  if (kind === 'zone' || kind === 'box') return `${kind}:${value.left ?? ''}:${value.right ?? ''}:${value.top ?? ''}:${value.bottom ?? ''}`;
  if (kind === 'hline') return `hline:${Number(value.price)}`;
  if (kind === 'polyline') return `polyline:${JSON.stringify(value.points ?? [])}`;
  return fallback;
}

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
        upsertPlotPoint(points, { time: canonicalSecondsTime(output.time), value: output.value });
        if (points.length > 50000) points.splice(0, points.length - 50000);
        this.plots.set(key, points);
        if (output.style) this.plotStyles.set(key, output.style);
      } else if (output.kind === 'line' || output.kind === 'zone' || output.kind === 'marker' || output.kind === 'polyline' || output.kind === 'hline') {
        const id = visualIdentity(output, `${output.kind}:${(output as any).time ?? this.outputDrawings.length}`);
        const idx = this.outputDrawings.findIndex(x => visualIdentity(x, '') === id);
        if (idx >= 0) this.outputDrawings[idx] = output; else this.outputDrawings.push(output);
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
        const id = visualIdentity(output, `${output.kind}:${this.visuals.length}`);
        const idx = this.visuals.findIndex(x => visualIdentity(x, '') === id);
        if (idx >= 0) this.visuals[idx] = output;
        else this.visuals.push(output);
        if (this.visuals.length > 25000) this.visuals.splice(0, this.visuals.length - 25000);
      } else if (output.kind === 'signal') {
        const identity = signalIdentity(output);
        const existing = this.signals.findIndex(item => item.kind === 'signal' && signalIdentity(item as Extract<CoreSpiritObject,{kind:'signal'}>) === identity);
        if (existing >= 0) this.signals[existing] = output;
        else this.signals.push(output);
        if (this.signals.length > 10000) this.signals.splice(0, this.signals.length - 10000);
      } else if (output.kind === 'orderIntent') {
        // Execution remains outside the chart renderer. The visual projection shows
        // the intent as a marker while the event bus/execution layer decides whether
        // anything may actually be sent to a broker.
        const projected: Extract<CoreSpiritObject, { kind: 'signal' }> = {
          kind: 'signal',
          time: output.time,
          type: output.side === 'flat' ? 'EXIT' : output.side === 'long' ? 'ENTRY LONG' : 'ENTRY SHORT',
          metadata: { ...(output.metadata || {}), intentId: output.id, confidence: output.confidence, position: output.side === 'short' ? 'above' : 'below', shape: output.side === 'short' ? 'arrowDown' : 'arrowUp', color: output.side === 'short' ? '#ef4444' : '#22c55e' },
        };
        const identity = signalIdentity(projected);
        const existing = this.signals.findIndex(item => item.kind === 'signal' && signalIdentity(item as Extract<CoreSpiritObject,{kind:'signal'}>) === identity);
        if (existing >= 0) this.signals[existing] = projected; else this.signals.push(projected);
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
