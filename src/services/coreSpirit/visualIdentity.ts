/**
 * CoreSpirit persistent visual identity + reactive state contract — Stage 42.
 * A visual handle names one logical object across revisions. Rendering is downstream.
 */

import { coreSpiritChecksum } from './artifact';
import type { CoreSpiritSceneNode } from './visualScene';

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
    this.assertNoParentCycle(node.id, node.parentId);
    this.nodes.set(node.id, cloneNode(node));
    return { id: node.id, sourceId: this.sourceId, kind: node.kind };
  }

  upsert(node: CoreSpiritSceneNode): CoreSpiritVisualHandle {
    if (node.sourceId !== this.sourceId) throw new Error(`visual '${node.id}' belongs to '${node.sourceId}', expected '${this.sourceId}'`);
    const current = this.nodes.get(node.id);
    if (current && current.kind !== node.kind) {
      throw new Error(`visual '${node.id}' cannot change kind from '${current.kind}' to '${node.kind}'`);
    }
    this.assertNoParentCycle(node.id, node.parentId);
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
    };
    this.assertNoParentCycle(id, next.parentId);
    this.nodes.set(id, cloneNode(next));
    return { id, sourceId: this.sourceId, kind: current.kind };
  }

  private assertNoParentCycle(id: string, parentId?: string): void {
    let cursor = parentId;
    const visited = new Set<string>();
    while (cursor) {
      if (cursor === id) throw new Error(`visual '${id}' cannot create a parent cycle`);
      if (visited.has(cursor)) throw new Error(`visual hierarchy contains a parent cycle at '${cursor}'`);
      visited.add(cursor);
      cursor = this.nodes.get(cursor)?.parentId;
    }
  }

  remove(id: string): boolean {
    if (!this.nodes.delete(id)) return false;
    // Removing a group root must not leave dangling parent references in the retained scene.
    for (const [childId, child] of this.nodes) {
      if (child.parentId === id) this.nodes.set(childId, cloneNode({ ...child, parentId: undefined }));
    }
    return true;
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
  // Scene payloads can contain nested grids, matrices, metadata, and interaction parameters.
  // A shallow copy would let producer mutations change retained output without a scene revision.
  if (typeof globalThis.structuredClone === 'function') return globalThis.structuredClone(node);
  return clonePlainValue(node, new WeakSet<object>()) as CoreSpiritSceneNode;
}

function clonePlainValue<T>(value: T, ancestors: WeakSet<object>): T {
  if (value === null || typeof value !== 'object') return value;
  const source = value as object;
  if (ancestors.has(source)) throw new Error('visual scene data cannot contain circular references');
  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(source);
    if (prototype !== Object.prototype && prototype !== null) return value;
  }
  ancestors.add(source);
  let result: unknown;
  if (Array.isArray(value)) {
    result = value.map(item => clonePlainValue(item, ancestors));
  } else {
    const output: Record<string, unknown> = Object.create(Object.getPrototypeOf(source));
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) output[key] = clonePlainValue(child, ancestors);
    result = output;
  }
  ancestors.delete(source);
  return result as T;
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
    const current = store.get(id);
    if (!current) throw new Error(`visual '${id}' does not exist`);
    return store.update(id, { payload: { ...current.payload, text: String(value) } });
  }
  if (property === 'visible' || property === 'zIndex') {
    return store.update(id, property === 'visible' ? { visible: Boolean(value) } : { zIndex: Number(value) });
  }
  const current = store.get(id);
  if (!current) throw new Error(`visual '${id}' does not exist`);
  return store.update(id, { style: { ...(current.style ?? {}), [property]: value } });
}
