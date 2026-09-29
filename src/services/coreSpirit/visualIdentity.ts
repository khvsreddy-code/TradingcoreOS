/**
 * CoreSpirit persistent visual identity + reactive state contract — Stage 42.
 * A visual handle names one logical object across revisions. Rendering is downstream.
 */

import { coreSpiritChecksum } from './artifact';
import type { CoreSpiritSceneNode, CoreSpiritSceneStyle } from './visualScene';

export type CoreSpiritVisualHandle = Readonly<{
  id: string;
  sourceId: string;
  kind: CoreSpiritSceneNode['kind'];
}>;

export type CoreSpiritVisualPatch = Partial<Pick<
  CoreSpiritSceneNode,
  'visible' | 'interactive' | 'locked' | 'anchor' | 'anchors' | 'timeRange' | 'style' | 'payload' | 'metadata' | 'zIndex' | 'pane' | 'parentId' | 'semanticRole' | 'interaction'
>>;

export type CoreSpiritVisualMutation =
  | { op: 'create'; node: CoreSpiritSceneNode }
  | { op: 'update'; id: string; patch: CoreSpiritVisualPatch }
  | { op: 'remove'; id: string };

export class CoreSpiritVisualObjectStore {
  private readonly nodes = new Map<string, CoreSpiritSceneNode>();

  constructor(private readonly sourceId: string) {}

  create(node: CoreSpiritSceneNode): CoreSpiritVisualHandle {
    if (node.sourceId !== this.sourceId) throw new Error(`visual '${node.id}' belongs to '${node.sourceId}', expected '${this.sourceId}'`);
    if (this.nodes.has(node.id)) throw new Error(`visual '${node.id}' already exists`);
    this.nodes.set(node.id, cloneNode(node));
    return { id: node.id, sourceId: this.sourceId, kind: node.kind };
  }

  upsert(node: CoreSpiritSceneNode): CoreSpiritVisualHandle {
    if (node.sourceId !== this.sourceId) throw new Error(`visual '${node.id}' belongs to '${node.sourceId}', expected '${this.sourceId}'`);
    this.nodes.set(node.id, cloneNode(node));
    return { id: node.id, sourceId: this.sourceId, kind: node.kind };
  }

  update(id: string, patch: CoreSpiritVisualPatch): CoreSpiritVisualHandle {
    const current = this.nodes.get(id);
    if (!current) throw new Error(`visual '${id}' does not exist`);
    const next: CoreSpiritSceneNode = {
      ...current,
      ...patch,
      id: current.id,
      sourceId: current.sourceId,
      kind: current.kind,
      layer: current.layer,
      payload: patch.payload ? { ...patch.payload } : current.payload,
      style: patch.style ? { ...(patch.style as CoreSpiritSceneStyle) } : current.style,
      metadata: patch.metadata ? { ...patch.metadata } : current.metadata,
    };
    this.nodes.set(id, cloneNode(next));
    return { id, sourceId: this.sourceId, kind: current.kind };
  }

  remove(id: string): boolean {
    return this.nodes.delete(id);
  }

  get(id: string): CoreSpiritSceneNode | undefined {
    const node = this.nodes.get(id);
    return node ? cloneNode(node) : undefined;
  }

  values(): CoreSpiritSceneNode[] {
    return [...this.nodes.values()].map(cloneNode);
  }

  checksum(): string {
    return coreSpiritChecksum(this.values());
  }

  apply(mutations: readonly CoreSpiritVisualMutation[]): void {
    const rollback = this.values();
    try {
      for (const mutation of mutations) {
        if (mutation.op === 'create') this.create(mutation.node);
        else if (mutation.op === 'update') this.update(mutation.id, mutation.patch);
        else this.remove(mutation.id);
      }
    } catch (error) {
      this.nodes.clear();
      for (const node of rollback) this.nodes.set(node.id, node);
      throw error;
    }
  }
}

function cloneNode(node: CoreSpiritSceneNode): CoreSpiritSceneNode {
  return {
    ...node,
    anchor: node.anchor ? { ...node.anchor } : undefined,
    anchors: node.anchors ? node.anchors.map(anchor => ({ ...anchor })) : undefined,
    timeRange: node.timeRange ? { ...node.timeRange } : undefined,
    style: node.style ? { ...node.style } : undefined,
    payload: { ...node.payload },
  };
}

/** Future language lowering target for reactive assignment syntax. */
export type CoreSpiritVisualProperty =
  | 'price' | 'time' | 'opacity' | 'width' | 'color' | 'fill'
  | 'text' | 'visible' | 'zIndex';

export function updateVisualProperty(
  store: CoreSpiritVisualObjectStore,
  id: string,
  property: CoreSpiritVisualProperty,
  value: unknown,
): CoreSpiritVisualHandle {
  if (property === 'price' || property === 'time') {
    const current = store.get(id);
    if (!current) throw new Error(`visual '${id}' does not exist`);
    const anchor = { ...(current.anchor ?? {}) };
    if (property === 'price') anchor.price = Number(value);
    else anchor.time = Number(value);
    return store.update(id, { anchor });
  }

  if (property === 'text') {
    return store.update(id, { payload: { ...store.get(id)!.payload, text: String(value) } });
  }
  if (property === 'visible' || property === 'zIndex') {
    return store.update(id, property === 'visible' ? { visible: Boolean(value) } : { zIndex: Number(value) });
  }
  const current = store.get(id);
  if (!current) throw new Error(`visual '${id}' does not exist`);
  return store.update(id, { style: { ...(current.style ?? {}), [property]: value } });
}
