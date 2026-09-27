/**
 * CoreSpirit visual scene model — Stage 41.
 *
 * A script does not draw pixels. It emits declarative scene nodes. The chart
 * renderer owns pixels, interaction, hit-testing, device coordinates and UI.
 * Nodes are identified and diffed by stable ids so a realtime revision can
 * update a scene instead of rebuilding the entire chart.
 */

import type { CoreSpiritObject } from './types';
import { coreSpiritChecksum } from './artifact';
import type { CoreSpiritVisualPatch } from './visualIdentity';
import { normalizeCoreSpiritVisualMetadata } from './visualMetadata';
import type { CoreSpiritAdvancedVisualObject } from './visualAdvanced';
import type { CoreSpiritVisualPlacement, CoreSpiritVisualRelativePosition } from './visualCoordinates';
import { validateCoreSpiritVisualPlacement } from './visualCoordinates';

export const CORE_SPIRIT_SCENE_VERSION = 1 as const;

export type CoreSpiritSceneLayer =
  | 'price'
  | 'indicator'
  | 'structure'
  | 'liquidity'
  | 'volume'
  | 'depth'
  | 'order'
  | 'data'
  | 'ui';

export type CoreSpiritScenePane = 'main' | 'subpane' | 'overlay' | 'floating';

export type CoreSpiritSceneKind =
  | 'candles'
  | 'heikinAshi'
  | 'customBars'
  | 'series'
  | 'line'
  | 'hline'
  | 'zone'
  | 'box'
  | 'band'
  | 'arrow'
  | 'shape'
  | 'polyline'
  | 'polygon'
  | 'label'
  | 'background'
  | 'barcolor'
  | 'footprint'
  | 'marker'
  | 'signal'
  | 'orderIntent'
  | 'table'
  | 'panel'
  | 'liquidityZone'
  | 'heatmap'
  | 'volumeProfile'
  | 'depthMap'
  | 'interactivePanel'
  | 'probabilitySurface'
  | 'regimeBand'
  | 'tradePath'
  | 'structureGraph'
  | 'replayTrace'
  | 'liquidityMap'
  | 'modelField'
  | 'customVisual';

export type CoreSpiritSceneAnchor = {
  time?: number;
  price?: number;
};

export type CoreSpiritSceneAction = Readonly<{
  kind: 'inspect' | 'focus' | 'openPanel' | 'emitEvent';
  actionId: string;
  params?: Readonly<Record<string, unknown>>;
}>;

export type CoreSpiritSceneInteraction = Readonly<{
  onClick?: CoreSpiritSceneAction;
  onHover?: CoreSpiritSceneAction;
  onContextMenu?: CoreSpiritSceneAction;
}>;

export type CoreSpiritSceneStyle = Record<string, unknown>;

export type CoreSpiritSceneNode = {
  id: string;
  kind: CoreSpiritSceneKind;
  layer: CoreSpiritSceneLayer;
  pane: CoreSpiritScenePane;
  zIndex: number;
  visible: boolean;
  interactive: boolean;
  locked: boolean;
  sourceId: string;
  anchor?: CoreSpiritSceneAnchor;
  anchors?: readonly CoreSpiritSceneAnchor[];
  timeRange?: { start: number; end: number };
  style?: CoreSpiritSceneStyle;
  payload: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
  parentId?: string;
  semanticRole?: string;
  interaction?: CoreSpiritSceneInteraction;
  placement?: CoreSpiritVisualPlacement;
  relativePosition?: CoreSpiritVisualRelativePosition;
};

export type CoreSpiritSceneIdentity = {
  chartId: string;
  symbol: string;
  timeframe: string;
  pane: CoreSpiritScenePane;
};

export type CoreSpiritScene = {
  version: typeof CORE_SPIRIT_SCENE_VERSION;
  identity: CoreSpiritSceneIdentity;
  revision: number;
  nodes: readonly CoreSpiritSceneNode[];
  checksum: string;
};

export type CoreSpiritSceneDiff = {
  fromRevision: number;
  toRevision: number;
  added: readonly CoreSpiritSceneNode[];
  updated: readonly CoreSpiritSceneNode[];
  removed: readonly string[];
};

export type CoreSpiritSceneQuota = {
  maxNodes: number;
  maxLabels: number;
  maxTables: number;
  maxPointsPerPolyline: number;
  maxPayloadBytes: number;
  maxAdvancedCells: number;
  maxDepthLevels: number;
  maxGraphNodes: number;
  maxGraphEdges: number;
};

export const CORE_SPIRIT_DEFAULT_SCENE_QUOTA: Readonly<CoreSpiritSceneQuota> = Object.freeze({
  maxNodes: 50000,
  maxLabels: 5000,
  maxTables: 1000,
  maxPointsPerPolyline: 5000,
  maxPayloadBytes: 1_500_000,
  maxAdvancedCells: 250_000,
  maxDepthLevels: 20_000,
  maxGraphNodes: 20_000,
  maxGraphEdges: 40_000,
});

const LAYER_BY_KIND: Readonly<Record<CoreSpiritSceneKind, CoreSpiritSceneLayer>> = {
  candles: 'price',
  heikinAshi: 'price',
  customBars: 'price',
  series: 'indicator',
  line: 'structure',
  hline: 'structure',
  zone: 'structure',
  box: 'structure',
  band: 'indicator',
  arrow: 'structure',
  shape: 'structure',
  polyline: 'structure',
  polygon: 'structure',
  label: 'ui',
  background: 'price',
  barcolor: 'price',
  footprint: 'data',
  marker: 'structure',
  signal: 'order',
  orderIntent: 'order',
  table: 'ui',
  panel: 'ui',
  liquidityZone: 'liquidity',
  heatmap: 'data',
  volumeProfile: 'volume',
  depthMap: 'depth',
  interactivePanel: 'ui',
  probabilitySurface: 'data',
  regimeBand: 'indicator',
  tradePath: 'order',
  structureGraph: 'structure',
  replayTrace: 'data',
  liquidityMap: 'liquidity',
  modelField: 'data',
  customVisual: 'data',
};

function payloadFromObject(output: CoreSpiritObject): Readonly<Record<string, unknown>> {
  const copy: Record<string, unknown> = { ...output };
  delete copy.kind;
  delete copy.id;
  delete copy.time;
  delete copy.price;
  delete copy.seriesId;
  delete copy.name;
  delete copy.style;
  delete copy.metadata;
  delete copy.visual;
  delete copy.geometry;
  delete copy.relativePosition;
  return copy;
}

function fallbackId(output: CoreSpiritObject, sourceId: string, index: number): string {
  const candidate = (output as { id?: string }).id;
  if (candidate) return `${sourceId}:${candidate}`;
  const time = 'time' in output ? Number((output as { time?: number }).time ?? 0) : 0;
  return `${sourceId}:${output.kind}:${time}:${index}`;
}

function styleFromObject(output: CoreSpiritObject): CoreSpiritSceneStyle | undefined {
  const style = (output as { style?: unknown }).style;
  return style && typeof style === 'object' ? { ...(style as Record<string, unknown>) } : undefined;
}

function anchorsFromObject(output: CoreSpiritObject): readonly CoreSpiritSceneAnchor[] | undefined {
  switch (output.kind) {
    case 'line':
    case 'arrow':
      return [output.start, output.end];
    case 'polyline':
    case 'polygon':
      return output.points.map(point => ({ time: point.time, price: point.price }));
    case 'customVisual':
      return output.geometry?.kind === 'polygon' ? output.geometry.points.map(point => ({ time: point.x, price: point.y })) : undefined;
    default:
      return undefined;
  }
}

function timeRangeFromObject(output: CoreSpiritObject): { start: number; end: number } | undefined {
  switch (output.kind) {
    case 'line':
    case 'arrow': {
      const times = [output.start.time, output.end.time];
      return { start: Math.min(...times), end: Math.max(...times) };
    }
    case 'zone':
      if (output.domain === 'viewport') return undefined;
      return { start: Math.min(output.left, output.right), end: Math.max(output.left, output.right) };
    case 'box':
      return { start: Math.min(output.left, output.right), end: Math.max(output.left, output.right) };
    case 'polygon':
      if (!output.points.length) return undefined;
      return { start: Math.min(...output.points.map(point => point.time)), end: Math.max(...output.points.map(point => point.time)) };
    case 'customVisual':
      if (output.geometry?.kind === 'polygon' && output.geometry.points.length) return { start: Math.min(...output.geometry.points.map(point => point.x)), end: Math.max(...output.geometry.points.map(point => point.x)) };
      return undefined;
    default:
      return undefined;
  }
}

export function coreSpiritObjectToSceneNode(
  output: CoreSpiritObject,
  sourceId: string,
  index: number,
  pane: CoreSpiritScenePane = 'main',
): CoreSpiritSceneNode {
  const kind = output.kind as CoreSpiritSceneKind;
  const time = 'time' in output ? Number((output as { time?: number }).time ?? 0) : undefined;
  const price = 'price' in output ? Number((output as { price?: number }).price ?? 0) : undefined;
  const id = fallbackId(output, sourceId, index);
  const metadata = normalizeCoreSpiritVisualMetadata((output as { metadata?: Readonly<Record<string, unknown>> }).metadata);
  const interactive = Boolean(metadata);
  return {
    id,
    kind,
    layer: LAYER_BY_KIND[kind],
    pane,
    zIndex: kind === 'signal' || kind === 'orderIntent' ? 700 : kind === 'label' || kind === 'table' ? 900 : 100,
    visible: true,
    interactive,
    locked: true,
    sourceId,
    anchor: time != null || price != null ? { time, price } : undefined,
    anchors: anchorsFromObject(output),
    timeRange: timeRangeFromObject(output),
    style: styleFromObject(output),
    payload: payloadFromObject(output),
    metadata,
    interaction: metadata ? { onHover: { kind:'inspect', actionId:'visual.inspect', params:{ objectId:id } } } : undefined,
    placement: (output as any).visual,
    relativePosition: (output as any).relativePosition,
  };
}


export function patchCoreSpiritSceneNode(
  node: CoreSpiritSceneNode,
  patch: CoreSpiritVisualPatch,
): CoreSpiritSceneNode {
  return {
    ...node,
    ...patch,
    id: node.id,
    sourceId: node.sourceId,
    kind: node.kind,
    layer: node.layer,
    style: patch.style ? { ...(patch.style as CoreSpiritSceneStyle) } : node.style,
    payload: patch.payload ? { ...patch.payload } : node.payload,
    anchor: patch.anchor ? { ...patch.anchor } : node.anchor,
    anchors: patch.anchors ? patch.anchors.map(anchor => ({ ...anchor })) : node.anchors,
    timeRange: patch.timeRange ? { ...patch.timeRange } : node.timeRange,
    parentId: 'parentId' in patch ? patch.parentId : node.parentId,
    semanticRole: 'semanticRole' in patch ? patch.semanticRole : node.semanticRole,
    interaction: 'interaction' in patch ? patch.interaction : node.interaction,
  };
}


export function coreSpiritAdvancedVisualToSceneNode(
  visual: CoreSpiritAdvancedVisualObject,
  pane: CoreSpiritScenePane = 'main',
): CoreSpiritSceneNode {
  const kind = visual.kind;
  const timeRange = visual.timeRange ? { ...visual.timeRange } : undefined;
  return {
    id: visual.id,
    kind: kind as CoreSpiritSceneKind,
    layer: LAYER_BY_KIND[kind as CoreSpiritSceneKind],
    pane,
    zIndex: visual.zIndex ?? (kind === 'tradePath' ? 720 : 150),
    visible: true,
    interactive: Boolean(visual.metadata),
    locked: true,
    sourceId: visual.sourceId,
    timeRange,
    payload: { ...visual.payload },
    metadata: visual.metadata,
    semanticRole: visual.semanticRole,
    interaction: visual.metadata
      ? { onHover: { kind: 'inspect', actionId: 'visual.inspect', params: { objectId: visual.id } } }
      : undefined,
  };
}

export function buildCoreSpiritSceneFromAdvancedVisuals(
  identity: CoreSpiritSceneIdentity,
  visuals: readonly CoreSpiritAdvancedVisualObject[],
  sourceId = 'advanced',
  revision = 0,
): CoreSpiritScene {
  const normalized = visuals.map(visual => coreSpiritAdvancedVisualToSceneNode({ ...visual, sourceId: visual.sourceId || sourceId }, identity.pane));
  return buildCoreSpiritSceneFromNodes(identity, normalized, revision);
}

export function buildCoreSpiritSceneFromNodes(
  identity: CoreSpiritSceneIdentity,
  nodes: readonly CoreSpiritSceneNode[],
  revision = 0,
): CoreSpiritScene {
  const structural = { version: CORE_SPIRIT_SCENE_VERSION, identity, revision, nodes: nodes.map(cloneSceneNodeForGraph) };
  return { ...structural, checksum: coreSpiritChecksum(structural) };
}

function cloneSceneNodeForGraph(node: CoreSpiritSceneNode): CoreSpiritSceneNode {
  return {
    ...node,
    anchor: node.anchor ? { ...node.anchor } : undefined,
    anchors: node.anchors?.map(anchor => ({ ...anchor })),
    timeRange: node.timeRange ? { ...node.timeRange } : undefined,
    style: node.style ? { ...node.style } : undefined,
    payload: { ...node.payload },
    metadata: node.metadata ? { ...node.metadata } : undefined,
    placement: node.placement ? { ...node.placement, area: { ...node.placement.area }, range: node.placement.range ? { ...node.placement.range } : undefined } : undefined,
    relativePosition: node.relativePosition ? { ...node.relativePosition } : undefined,
    interaction: node.interaction ? {
      onClick: node.interaction.onClick ? { ...node.interaction.onClick, params: node.interaction.onClick.params ? { ...node.interaction.onClick.params } : undefined } : undefined,
      onHover: node.interaction.onHover ? { ...node.interaction.onHover, params: node.interaction.onHover.params ? { ...node.interaction.onHover.params } : undefined } : undefined,
      onContextMenu: node.interaction.onContextMenu ? { ...node.interaction.onContextMenu, params: node.interaction.onContextMenu.params ? { ...node.interaction.onContextMenu.params } : undefined } : undefined,
    } : undefined,
  };
}

export function buildCoreSpiritScene(
  identity: CoreSpiritSceneIdentity,
  outputs: readonly CoreSpiritObject[],
  sourceId: string,
  revision = 0,
): CoreSpiritScene {
  const nodes = outputs.map((output, index) => coreSpiritObjectToSceneNode(output, sourceId, index, identity.pane));
  const structural = { version: CORE_SPIRIT_SCENE_VERSION, identity, revision, nodes };
  return { ...structural, checksum: coreSpiritChecksum(structural) };
}

export function validateCoreSpiritScene(
  scene: CoreSpiritScene,
  quota: CoreSpiritSceneQuota = CORE_SPIRIT_DEFAULT_SCENE_QUOTA,
): string[] {
  const errors: string[] = [];
  if (scene.version !== CORE_SPIRIT_SCENE_VERSION) errors.push('unsupported scene version');
  if (scene.nodes.length > quota.maxNodes) errors.push(`scene exceeds maxNodes (${quota.maxNodes})`);
  const ids = new Set<string>();
  const parentById = new Map<string, string | undefined>();
  let labels = 0;
  let tables = 0;
  let advancedCells = 0;
  let depthLevels = 0;
  let graphNodes = 0;
  let graphEdges = 0;
  for (const node of scene.nodes) {
    if (ids.has(node.id)) errors.push(`duplicate scene node id '${node.id}'`);
    ids.add(node.id);
    parentById.set(node.id, node.parentId);
    if (node.parentId && node.parentId === node.id) errors.push(`scene node '${node.id}' cannot parent itself`);
    if (containsFunction(node)) errors.push(`scene node '${node.id}' contains a non-serializable function`);
    if (node.placement) errors.push(...validateCoreSpiritVisualPlacement(node.placement).map(error => `scene node '${node.id}': ${error}`));
    if (!Number.isInteger(node.zIndex)) errors.push(`scene node '${node.id}' has non-integer zIndex`);
    if (node.kind === 'label') labels += 1;
    if (node.kind === 'table') tables += 1;
    if (node.kind === 'polyline' && (node.anchors?.length ?? 0) > quota.maxPointsPerPolyline) {
      errors.push(`scene node '${node.id}' exceeds polyline point quota`);
    }
    const payload = node.payload as Record<string, unknown>;
    if (node.kind === 'heatmap' || node.kind === 'probabilitySurface') {
      const grid = payload.grid as { columns?: number; rows?: number; values?: unknown[] } | undefined;
      const cells = (grid?.values?.length ?? 0);
      advancedCells += cells;
      if (cells > quota.maxAdvancedCells) errors.push(`scene node '${node.id}' exceeds advanced cell quota`);
    }
    if (node.kind === 'depthMap' || node.kind === 'footprint') {
      const levels = ((payload.levels ?? payload.rows) as unknown[] | undefined)?.length ?? 0;
      depthLevels += levels;
      if (levels > quota.maxDepthLevels) errors.push(`scene node '${node.id}' exceeds depth-level quota`);
    }
    if (node.kind === 'structureGraph') {
      graphNodes += ((payload.nodes as unknown[] | undefined)?.length ?? 0);
      graphEdges += ((payload.edges as unknown[] | undefined)?.length ?? 0);
    }
  }
  for (const node of scene.nodes) {
    let cursor = node.parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (seen.has(cursor)) { errors.push(`scene graph contains a parent cycle at '${node.id}'`); break; }
      seen.add(cursor);
      if (!parentById.has(cursor)) { errors.push(`scene node '${node.id}' references missing parent '${cursor}'`); break; }
      cursor = parentById.get(cursor);
    }
  }
  if (labels > quota.maxLabels) errors.push(`scene exceeds maxLabels (${quota.maxLabels})`);
  if (tables > quota.maxTables) errors.push(`scene exceeds maxTables (${quota.maxTables})`);
  if (advancedCells > quota.maxAdvancedCells) errors.push(`scene exceeds maxAdvancedCells (${quota.maxAdvancedCells})`);
  if (depthLevels > quota.maxDepthLevels) errors.push(`scene exceeds maxDepthLevels (${quota.maxDepthLevels})`);
  if (graphNodes > quota.maxGraphNodes) errors.push(`scene exceeds maxGraphNodes (${quota.maxGraphNodes})`);
  if (graphEdges > quota.maxGraphEdges) errors.push(`scene exceeds maxGraphEdges (${quota.maxGraphEdges})`);
  const bytes = new TextEncoder().encode(JSON.stringify(scene.nodes)).byteLength;
  if (bytes > quota.maxPayloadBytes) errors.push(`scene payload exceeds maxPayloadBytes (${quota.maxPayloadBytes})`);
  return errors;
}

function containsFunction(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object') return false;
  const objectValue = value as object;
  if (seen.has(objectValue)) return false;
  seen.add(objectValue);
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (containsFunction(child, seen)) return true;
  }
  return false;
}

export function diffCoreSpiritScenes(previous: CoreSpiritScene, next: CoreSpiritScene): CoreSpiritSceneDiff {
  const before = new Map(previous.nodes.map(node => [node.id, node]));
  const after = new Map(next.nodes.map(node => [node.id, node]));
  const added: CoreSpiritSceneNode[] = [];
  const updated: CoreSpiritSceneNode[] = [];
  const removed: string[] = [];

  for (const [id, node] of after) {
    const prior = before.get(id);
    if (!prior) added.push(node);
    else if (coreSpiritChecksum(prior) !== coreSpiritChecksum(node)) updated.push(node);
  }
  for (const id of before.keys()) if (!after.has(id)) removed.push(id);

  return { fromRevision: previous.revision, toRevision: next.revision, added, updated, removed };
}

export function serializeCoreSpiritScene(scene: CoreSpiritScene): string {
  return JSON.stringify({
    version: scene.version,
    identity: scene.identity,
    revision: scene.revision,
    nodes: scene.nodes,
  });
}

/** Visual APIs are extension capabilities, not additions to the 30-function core stdlib. */
export const CORE_SPIRIT_VISUAL_PRIMITIVES = Object.freeze([
  'candleLayer', 'heikinAshi', 'customBars',
  'line', 'hline', 'zone', 'box', 'band', 'arrow', 'shape', 'polyline', 'polygon', 'customVisual',
  'label', 'background', 'barcolor', 'footprint', 'marker', 'table', 'panel',
  'liquidityZone', 'heatmap', 'volumeProfile', 'depthMap', 'interactivePanel',
  'probabilitySurface', 'regimeBand', 'tradePath', 'structureGraph', 'replayTrace',
] as const);
