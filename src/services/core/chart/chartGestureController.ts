import type { ChartNavigationApi } from './chartNavigationApi';

export type ChartGestureEvent = Readonly<{
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'wheel' | 'pinch';
  x: number;
  y: number;
  deltaX?: number;
  deltaY?: number;
  pointerId?: number;
  pointerCount?: number;
}>;

/** Gesture translator: no React state, no renderer APIs, only the navigation contract. */
export class ChartGestureController {
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(private readonly navigation: ChartNavigationApi) {}

  handle(event: ChartGestureEvent): void {
    if (event.type === 'pointerdown') {
      this.dragging = true; this.lastX = event.x; this.lastY = event.y; return;
    }
    if (event.type === 'pointermove' && this.dragging) {
      const dx = Number(event.deltaX ?? (event.x - this.lastX));
      this.lastX = event.x; this.lastY = event.y;
      this.navigation.panByPixels(-dx);
      return;
    }
    if (event.type === 'pointerup') { this.dragging = false; return; }
    if (event.type === 'wheel') {
      const dy = Number(event.deltaY ?? 0);
      if (!Number.isFinite(dy)) return;
      this.navigation.zoomBy(Math.exp(-dy * 0.001), Math.max(0, Math.min(1, event.x / this.navigation.pixelWidth())));
      return;
    }
    if (event.type === 'pinch') {
      const delta = Number(event.deltaY ?? 1);
      if (Number.isFinite(delta)) this.navigation.zoomBy(Math.max(0.1, Math.min(10, delta)), 0.5);
    }
  }

  cancel(): void { this.dragging = false; }
}
