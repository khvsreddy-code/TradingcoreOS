import type { CoreDrawingKind, CoreDrawingPoint } from './coreDrawing';
import { getCoreDrawingTool } from './drawingTools';

export type DrawingDraft = Readonly<{
  kind: CoreDrawingKind;
  points: CoreDrawingPoint[];
  complete: boolean;
}>;

/** State machine for mouse/touch drawing creation. Rendering stays outside. */
export class CoreDrawingToolSession {
  private _tool: CoreDrawingKind | null = null;
  private _points: CoreDrawingPoint[] = [];

  activate(kind: CoreDrawingKind): void { this._tool = kind; this._points = []; }
  deactivate(): void { this._tool = null; this._points = []; }
  tool(): CoreDrawingKind | null { return this._tool; }
  draft(): DrawingDraft | null {
    if (!this._tool) return null;
    const definition = getCoreDrawingTool(this._tool);
    return Object.freeze({ kind: this._tool, points: this._points.map(point => ({ ...point })), complete: definition ? definition.accepts(this._points.length) : false });
  }

  addPoint(point: CoreDrawingPoint): DrawingDraft | null {
    const kind = this._tool;
    if (!kind) return null;
    const definition = getCoreDrawingTool(kind);
    if (!definition || definition.coordinateSpace !== 'data') return null;
    this._points.push({ time: Number(point.time), price: Number(point.price) });
    const max = definition.maxPoints;
    if (max != null && this._points.length > max) this._points.length = max;
    return this.draft();
  }

  finish(): CoreDrawingPoint[] | null {
    const current = this.draft();
    if (!current || !current.complete) return null;
    const points = current.points.map(point => ({ ...point }));
    this._points = [];
    return points;
  }
}
