import type { ChartRenderer } from './chartRenderer';
import { ChartScene } from './chartScene';
import { ChartScaleModel } from './chartScales';
import { ChartPaneRegistry } from './chartPane';
import { CHART_LAYER_ORDER } from './chartLayers';

/** Retained rendering coordinator. React should not be required to render a frame. */
export class ChartRenderingEngine {
  readonly panes = new ChartPaneRegistry();
  readonly layers = CHART_LAYER_ORDER;

  get scene(): ChartScene { return this.panes.ensure('price', 'price').scene; }
  get scales(): ChartScaleModel { return this.panes.ensure('price', 'price').scales; }
  private frameRevision = 0;
  private lastSceneRevision = -1;

  constructor(readonly renderer: ChartRenderer) {}

  render(): void {
    this.renderer.setScene(this.scene);
    this.renderer.render();
    this.frameRevision += 1;
    this.lastSceneRevision = this.scene.revision;
  }

  getStats() { return Object.freeze({ frameRevision: this.frameRevision, sceneRevision: this.scene.revision, lastRenderedSceneRevision: this.lastSceneRevision, backend: this.renderer.kind }); }
  dispose(): void { this.renderer.dispose(); }
}
