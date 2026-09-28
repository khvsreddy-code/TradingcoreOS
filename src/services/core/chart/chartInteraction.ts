import type { ChartScene, ChartSceneNode } from './chartScene';

export type ChartPointerType = 'mouse' | 'touch' | 'pen';
export type ChartInteractionEvent = Readonly<{
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'wheel' | 'doubleclick' | 'pinch';
  pointerType?: ChartPointerType;
  x: number;
  y: number;
  deltaX?: number;
  deltaY?: number;
  buttons?: number;
}>;

export type ChartHitTestBounds = Readonly<{ x: number; y: number; width: number; height: number }>;

export class ChartInteractionEngine {
  private activePointers = new Map<number, { x: number; y: number }>();
  private _dragX = 0;
  private _dragY = 0;
  private _zoom = 1;
  private _lastHit: ChartSceneNode | null = null;

  handle(event: ChartInteractionEvent): void {
    if (event.type === 'pointerdown') {
      this.activePointers.set(event.buttons ?? 0, { x: event.x, y: event.y });
      return;
    }
    if (event.type === 'pinch') {
      this._zoom = Math.max(0.1, Math.min(20, this._zoom * Math.max(0.1, Math.min(10, Number(event.deltaY ?? 1)))));
      return;
    }
    if (event.type === 'pointermove') {
      this._dragX += Number(event.deltaX ?? 0);
      this._dragY += Number(event.deltaY ?? 0);
      return;
    }
    if (event.type === 'wheel') {
      this._zoom = Math.max(0.1, Math.min(20, this._zoom * Math.exp(-(Number(event.deltaY ?? 0)) * 0.001)));
      return;
    }
    if (event.type === 'pointerup') this.activePointers.delete(event.buttons ?? 0);
  }

  hitTest(scene: ChartScene, x: number, y: number): ChartSceneNode | null {
    const nodes = scene.snapshot();
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const bounds = (nodes[i].payload as { bounds?: ChartHitTestBounds } | null)?.bounds;
      if (nodes[i].visible && bounds && inside(bounds, x, y)) {
        this._lastHit = nodes[i];
        return nodes[i];
      }
    }
    this._lastHit = null;
    return null;
  }

  snapshot() { return Object.freeze({ dragX: this._dragX, dragY: this._dragY, zoom: this._zoom, activePointers: this.activePointers.size, lastHitId: this._lastHit?.id ?? null }); }
  resetGesture(): void { this._dragX = 0; this._dragY = 0; }
}

function inside(bounds: ChartHitTestBounds, x: number, y: number): boolean {
  return x >= bounds.x && y >= bounds.y && x <= bounds.x + bounds.width && y <= bounds.y + bounds.height;
}
