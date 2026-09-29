import { ChartScaleModel } from './chartScales';
import { ChartScene } from './chartScene';

export type ChartPaneKind = 'price' | 'volume' | 'oscillator' | 'custom';

export type ChartPane = Readonly<{
  id: string;
  kind: ChartPaneKind;
  heightRatio: number;
  scene: ChartScene;
  scales: ChartScaleModel;
}>;

export class ChartPaneRegistry {
  private readonly panes = new Map<string, ChartPane>();

  constructor() { this.ensure('price', 'price', 0.72); this.ensure('volume', 'volume', 0.16); }

  ensure(id: string, kind: ChartPaneKind = 'custom', heightRatio = 0.12): ChartPane {
    const key = String(id).trim();
    const existing = this.panes.get(key);
    if (existing) return existing;
    const pane: ChartPane = Object.freeze({ id: key, kind, heightRatio: Math.max(0.04, heightRatio), scene: new ChartScene(), scales: new ChartScaleModel() });
    this.panes.set(key, pane);
    return pane;
  }

  remove(id: string): void { if (id !== 'price' && id !== 'volume') this.panes.delete(id); }
  get(id: string): ChartPane | undefined { return this.panes.get(String(id)); }
  list(): readonly ChartPane[] { return Object.freeze([...this.panes.values()]); }
}
