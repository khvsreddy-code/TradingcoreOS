/**
 * CoreSpirit visual scene graph — #18.2.
 *
 * The language describes semantic chart objects; the host stores a persistent
 * graph and renderers decide how those objects become pixels. Interaction is
 * represented by serializable action references, never function closures.
 */
import { coreSpiritChecksum } from './artifact';
import {
  type CoreSpiritScene,
  type CoreSpiritSceneIdentity,
  type CoreSpiritSceneLayer,
  type CoreSpiritSceneNode,
  type CoreSpiritSceneKind,
  type CoreSpiritSceneAction,
  type CoreSpiritSceneInteraction,
  buildCoreSpiritSceneFromNodes,
  validateCoreSpiritScene,
} from './visualScene';
import { CoreSpiritVisualObjectStore } from './visualIdentity';
import type { CoreSpiritVisualMetadata } from './visualMetadata';

export interface CoreSpiritZoneSpec {
  id: string;
  top: number;
  bottom: number;
  left?: number;
  right?: number;
  label?: string;
  opacity?: number;
  fill?: string;
  border?: string;
  semanticRole?: 'liquidity' | 'support' | 'resistance' | 'imbalance' | 'custom';
  onClick?: CoreSpiritSceneAction;
  onHover?: CoreSpiritSceneAction;
  metadata?: CoreSpiritVisualMetadata;
}

export interface CoreSpiritHeatmapSpec {
  id: string;
  time: number;
  cells: readonly { price: number; intensity: number; label?: string; side?: 'buy' | 'sell' | 'balanced' }[];
  opacity?: number;
  onClick?: CoreSpiritSceneAction;
  onHover?: CoreSpiritSceneAction;
  metadata?: CoreSpiritVisualMetadata;
}

export interface CoreSpiritVolumeProfileSpec {
  id: string;
  rows: readonly { price: number; volume: number; buyVolume?: number; sellVolume?: number }[];
  opacity?: number;
  onClick?: CoreSpiritSceneAction;
  onHover?: CoreSpiritSceneAction;
  metadata?: CoreSpiritVisualMetadata;
}

export interface CoreSpiritDepthMapSpec {
  id: string;
  bids: readonly { price: number; size: number }[];
  asks: readonly { price: number; size: number }[];
  opacity?: number;
  onClick?: CoreSpiritSceneAction;
  onHover?: CoreSpiritSceneAction;
  metadata?: CoreSpiritVisualMetadata;
}

export interface CoreSpiritPanelSpec {
  id: string;
  title?: string;
  position: 'topLeft'|'topCenter'|'topRight'|'middleLeft'|'middleCenter'|'middleRight'|'bottomLeft'|'bottomCenter'|'bottomRight';
  width?: number;
  height?: number;
  interactive?: boolean;
  onClick?: CoreSpiritSceneAction;
  onHover?: CoreSpiritSceneAction;
  metadata?: CoreSpiritVisualMetadata;
  payload?: Readonly<Record<string, unknown>>;
}

export interface CoreSpiritVisualGraphSnapshot {
  scene: CoreSpiritScene;
  nodeCount: number;
  interactiveCount: number;
  layerCounts: Readonly<Record<CoreSpiritSceneLayer, number>>;
  checksum: string;
}

export interface CoreSpiritVisualObjectProxy {
  readonly id: string;
  readonly kind: CoreSpiritSceneKind;
  set(property: string, value: unknown): void;
  remove(): void;
}

export class CoreSpiritVisualZoneProxy implements CoreSpiritVisualObjectProxy {
  constructor(private readonly graph: CoreSpiritVisualSceneGraph, public readonly id: string) {}
  readonly kind = 'zone' as const;
  get opacity(): number { return Number(this.graph.get(this.id)?.style?.opacity ?? 1); }
  set opacity(value: number) { this.set('opacity', value); }
  get label(): string { return String(this.graph.get(this.id)?.payload.label ?? ''); }
  set label(value: string) { this.graph.set(this.id, { label: value }); }
  set on_click(action: CoreSpiritSceneAction | undefined) { this.graph.setInteraction(this.id, { onClick: action }); }
  set(property: string, value: unknown): void {
    if (property === 'opacity') this.graph.setStyle(this.id, { opacity: Number(value) });
    else this.graph.set(this.id, { [property]: value });
  }
  remove(): void { this.graph.remove(this.id); }
}

export class CoreSpiritVisualSceneGraph {
  private readonly store: CoreSpiritVisualObjectStore;

  constructor(private readonly sourceId: string) {
    this.store = new CoreSpiritVisualObjectStore(sourceId);
  }

  zone(spec: CoreSpiritZoneSpec): CoreSpiritVisualZoneProxy {
    const left = spec.left ?? 0;
    const right = spec.right ?? left;
    const node = this.createNode({
      id: this.namespace(spec.id),
      kind: 'zone',
      layer: spec.semanticRole === 'liquidity' ? 'liquidity' : spec.semanticRole === 'imbalance' ? 'data' : 'structure',
      pane: 'main',
      zIndex: 300,
      visible: true,
      interactive: Boolean(spec.onClick || spec.onHover || spec.metadata),
      locked: false,
      sourceId: this.sourceId,
      timeRange: { start: Math.min(left, right), end: Math.max(left, right) },
      style: {
        opacity: spec.opacity ?? 1,
        fillColor: spec.fill,
        borderColor: spec.border,
      },
      payload: { label: spec.label ?? '', semanticRole: spec.semanticRole ?? 'custom' },
      metadata: spec.metadata,
      interaction: (spec.onClick || spec.onHover) ? { onClick: spec.onClick, onHover: spec.onHover } : (spec.metadata ? { onHover: { kind:'inspect', actionId:'visual.inspect', params:{ objectId: this.namespace(spec.id) } } } : undefined),
    });
    this.store.upsert(node);
    return new CoreSpiritVisualZoneProxy(this, node.id);
  }

  heatmap(spec: CoreSpiritHeatmapSpec): CoreSpiritVisualObjectProxy {
    const node = this.createNode({
      id: this.namespace(spec.id),
      kind: 'heatmap',
      layer: 'data',
      pane: 'main',
      zIndex: 250,
      visible: true,
      interactive: Boolean(spec.onClick || spec.onHover || spec.metadata),
      locked: false,
      sourceId: this.sourceId,
      anchor: { time: spec.time },
      style: { opacity: spec.opacity ?? 1 },
      payload: { cells: spec.cells.map(cell => ({ ...cell })) },
      metadata: spec.metadata,
      interaction: (spec.onClick || spec.onHover) ? { onClick: spec.onClick, onHover: spec.onHover } : (spec.metadata ? { onHover: { kind:'inspect', actionId:'visual.inspect', params:{ objectId: this.namespace(spec.id) } } } : undefined),
    });
    this.store.upsert(node);
    return this.proxy(node.id, node.kind);
  }

  volumeProfile(spec: CoreSpiritVolumeProfileSpec): CoreSpiritVisualObjectProxy {
    const node = this.createNode({
      id: this.namespace(spec.id), kind: 'volumeProfile', layer: 'volume', pane: 'main', zIndex: 220,
      visible: true, interactive: Boolean(spec.onClick || spec.onHover || spec.metadata), locked: false, sourceId: this.sourceId,
      style: { opacity: spec.opacity ?? 1 },
      payload: { rows: spec.rows.map(row => ({ ...row })) },
      metadata: spec.metadata,
      interaction: (spec.onClick || spec.onHover) ? { onClick: spec.onClick, onHover: spec.onHover } : (spec.metadata ? { onHover: { kind:'inspect', actionId:'visual.inspect', params:{ objectId: this.namespace(spec.id) } } } : undefined),
    });
    this.store.upsert(node);
    return this.proxy(node.id, node.kind);
  }

  depth(spec: CoreSpiritDepthMapSpec): CoreSpiritVisualObjectProxy {
    const node = this.createNode({
      id: this.namespace(spec.id), kind: 'depthMap', layer: 'depth', pane: 'main', zIndex: 230,
      visible: true, interactive: Boolean(spec.onClick || spec.onHover || spec.metadata), locked: false, sourceId: this.sourceId,
      style: { opacity: spec.opacity ?? 1 },
      payload: { bids: spec.bids.map(level => ({ ...level })), asks: spec.asks.map(level => ({ ...level })) },
      metadata: spec.metadata,
      interaction: (spec.onClick || spec.onHover) ? { onClick: spec.onClick, onHover: spec.onHover } : (spec.metadata ? { onHover: { kind:'inspect', actionId:'visual.inspect', params:{ objectId: this.namespace(spec.id) } } } : undefined),
    });
    this.store.upsert(node);
    return this.proxy(node.id, node.kind);
  }

  attach(childId: string, parentId: string): void {
    this.require(parentId);
    this.require(childId);
    this.store.update(childId, { parentId });
  }

  panel(spec: CoreSpiritPanelSpec): CoreSpiritVisualObjectProxy {
    const node = this.createNode({
      id: this.namespace(spec.id),
      kind: 'interactivePanel',
      layer: 'ui',
      pane: 'floating',
      zIndex: 1000,
      visible: true,
      interactive: spec.interactive ?? Boolean(spec.onClick || spec.onHover || spec.metadata),
      locked: false,
      sourceId: this.sourceId,
      style: { width: spec.width, height: spec.height },
      payload: { position: spec.position, title: spec.title ?? '', ...(spec.payload ?? {}) },
      metadata: spec.metadata,
      interaction: (spec.onClick || spec.onHover) ? { onClick: spec.onClick, onHover: spec.onHover } : (spec.metadata ? { onHover: { kind:'inspect', actionId:'visual.inspect', params:{ objectId: this.namespace(spec.id) } } } : undefined),
    });
    this.store.upsert(node);
    return this.proxy(node.id, node.kind);
  }

  get(id: string): CoreSpiritSceneNode | undefined { return this.store.get(id); }
  set(id: string, payload: Readonly<Record<string, unknown>>): void {
    const current = this.require(id);
    this.store.update(id, { payload: { ...current.payload, ...payload } });
  }
  setMetadata(id: string, metadata: CoreSpiritVisualMetadata): void { this.require(id); this.store.update(id, { metadata }); }
  setStyle(id: string, style: Readonly<Record<string, unknown>>): void {
    const current = this.require(id);
    this.store.update(id, { style: { ...(current.style ?? {}), ...style } });
  }
  setInteraction(id: string, interaction: CoreSpiritSceneInteraction): void {
    const current = this.require(id);
    this.store.update(id, { interaction, interactive: Boolean(interaction.onClick || interaction.onHover || interaction.onContextMenu) });
  }
  remove(id: string): void { this.store.remove(id); }

  build(identity: CoreSpiritSceneIdentity, revision = 0): CoreSpiritScene {
    const scene = buildCoreSpiritSceneFromNodes(identity, this.store.values(), revision);
    const errors = validateCoreSpiritScene(scene);
    if (errors.length) throw new Error(errors.join('; '));
    return scene;
  }

  snapshot(identity: CoreSpiritSceneIdentity, revision = 0): CoreSpiritVisualGraphSnapshot {
    const scene = this.build(identity, revision);
    const layerCounts: Record<CoreSpiritSceneLayer, number> = {
      price: 0, indicator: 0, structure: 0, liquidity: 0, volume: 0, depth: 0,
      order: 0, data: 0, ui: 0,
    };
    let interactiveCount = 0;
    for (const node of scene.nodes) {
      layerCounts[node.layer] += 1;
      if (node.interactive) interactiveCount += 1;
    }
    return {
      scene,
      nodeCount: scene.nodes.length,
      interactiveCount,
      layerCounts: Object.freeze({ ...layerCounts }),
      checksum: coreSpiritChecksum(scene),
    };
  }

  private proxy(id: string, kind: CoreSpiritSceneKind): CoreSpiritVisualObjectProxy {
    return {
      id,
      kind,
      set: (property, value) => {
        if (property === 'visible' || property === 'interactive' || property === 'locked' || property === 'zIndex') {
          this.store.update(id, { [property]: value } as any);
          return;
        }
        if (property === 'metadata') {
          this.setMetadata(id, value as CoreSpiritVisualMetadata);
          return;
        }
        this.set(id, { [property]: value });
      },
      remove: () => this.remove(id),
    };
  }

  private createNode(node: CoreSpiritSceneNode & Pick<CoreSpiritSceneNode, 'interaction'>): CoreSpiritSceneNode {
    return node;
  }
  private require(id: string): CoreSpiritSceneNode {
    const node = this.store.get(id);
    if (!node) throw new Error(`visual '${id}' does not exist`);
    return node;
  }
  private namespace(id: string): string { return id.includes(':') ? id : `${this.sourceId}:${id}`; }
}

/** Future language lowering target: visual.zone(...), visual.heatmap(...), visual.panel(...). */
export const CORE_SPIRIT_VISUAL_GRAPH_LOWERING = Object.freeze({
  create: 'visual.create',
  update: 'visual.update',
  remove: 'visual.remove',
  bindInteraction: 'visual.interaction.bind',
} as const);
