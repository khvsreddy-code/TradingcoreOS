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

export const CORE_SPIRIT_SCENE_VERSION = 1 as const;

export type CoreSpiritSceneLayer =
  | 'price'
  | 'indicator'
  | 'structure'
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
  | 'label'
  | 'background'
  | 'barcolor'
  | 'footprint'
  | 'marker'
  | 'signal'
  | 'orderIntent'
  | 'table'
  | 'panel';

export type CoreSpiritSceneAnchor = {
  time?: number;
  price?: number;
};

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
};

export const CORE_SPIRIT_DEFAULT_SCENE_QUOTA: Readonly<CoreSpiritSceneQuota> = Object.freeze({
  maxNodes: 50000,
  maxLabels: 5000,
  maxTables: 1000,
  maxPointsPerPolyline: 5000,
  maxPayloadBytes: 1_500_000,
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
  label: 'ui',
  background: 'price',
  barcolor: 'price',
  footprint: 'data',
  marker: 'structure',
  signal: 'order',
  orderIntent: 'order',
  table: 'ui',
  panel: 'ui',
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
      return output.points.map(point => ({ time: point.time, price: point.price }));
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
    case 'box':
      return { start: Math.min(output.left, output.right), end: Math.max(output.left, output.right) };
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
  return {
    id: fallbackId(output, sourceId, index),
    kind,
    layer: LAYER_BY_KIND[kind],
    pane,
    zIndex: kind === 'signal' || kind === 'orderIntent' ? 700 : kind === 'label' || kind === 'table' ? 900 : 100,
    visible: true,
    interactive: false,
    locked: true,
    sourceId,
    anchor: time != null || price != null ? { time, price } : undefined,
    anchors: anchorsFromObject(output),
    timeRange: timeRangeFromObject(output),
    style: styleFromObject(output),
    payload: payloadFromObject(output),
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
  let labels = 0;
  let tables = 0;
  for (const node of scene.nodes) {
    if (ids.has(node.id)) errors.push(`duplicate scene node id '${node.id}'`);
    ids.add(node.id);
    if (!Number.isInteger(node.zIndex)) errors.push(`scene node '${node.id}' has non-integer zIndex`);
    if (node.kind === 'label') labels += 1;
    if (node.kind === 'table') tables += 1;
    if (node.kind === 'polyline' && (node.anchors?.length ?? 0) > quota.maxPointsPerPolyline) {
      errors.push(`scene node '${node.id}' exceeds polyline point quota`);
    }
  }
  if (labels > quota.maxLabels) errors.push(`scene exceeds maxLabels (${quota.maxLabels})`);
  if (tables > quota.maxTables) errors.push(`scene exceeds maxTables (${quota.maxTables})`);
  const bytes = new TextEncoder().encode(JSON.stringify(scene.nodes)).byteLength;
  if (bytes > quota.maxPayloadBytes) errors.push(`scene payload exceeds maxPayloadBytes (${quota.maxPayloadBytes})`);
  return errors;
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
  'line', 'hline', 'zone', 'box', 'band', 'arrow', 'shape', 'polyline',
  'label', 'background', 'barcolor', 'footprint', 'marker', 'table', 'panel',
] as const);
