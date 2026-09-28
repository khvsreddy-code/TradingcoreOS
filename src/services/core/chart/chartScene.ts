export type ChartPrimitiveKind = 'candles'|'line'|'area'|'histogram'|'marker'|'zone'|'text'|'drawing'|'heatmap';
export type ChartSceneNode = {
  id: string;
  kind: ChartPrimitiveKind;
  layer: number;
  visible: boolean;
  dirty: boolean;
  payload: unknown;
};

export class ChartScene {
  private readonly nodes = new Map<string, ChartSceneNode>();
  private _revision = 0;

  upsert(node: Omit<ChartSceneNode, 'dirty'> & { dirty?: boolean }): void {
    const previous = this.nodes.get(node.id);
    const changed = !previous || previous.kind !== node.kind || previous.layer !== node.layer || previous.visible !== node.visible || previous.payload !== node.payload;
    this.nodes.set(node.id, { ...node, dirty: node.dirty ?? changed });
    if (changed) this._revision += 1;
  }

  remove(id: string): void {
    if (this.nodes.delete(id)) this._revision += 1;
  }

  markClean(id: string): void {
    const node = this.nodes.get(id);
    if (node) node.dirty = false;
  }

  dirtyNodes(): ChartSceneNode[] {
    return [...this.nodes.values()].filter(node => node.dirty).sort((a, b) => a.layer - b.layer);
  }

  snapshot(): readonly ChartSceneNode[] {
    return Object.freeze([...this.nodes.values()].sort((a, b) => a.layer - b.layer).map(node => Object.freeze({ ...node })));
  }

  get revision() { return this._revision; }
  clear(): void { if (this.nodes.size) this._revision += 1; this.nodes.clear(); }
}
