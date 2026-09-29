/**
 * CoreSpirit declarative visual specification — v52.
 *
 * A program describes semantic visual state. The host decides rendering.
 * These specs intentionally contain no DOM, Canvas, GPU or callback objects.
 */
import type {
  CoreSpiritScene,
  CoreSpiritSceneIdentity,
  CoreSpiritSceneLayer,
  CoreSpiritSceneNode,
  CoreSpiritSceneKind,
} from './visualScene';
import { buildCoreSpiritSceneFromNodes, validateCoreSpiritScene } from './visualScene';
import type { CoreSpiritVisualMetadata } from './visualMetadata';

export const CORE_SPIRIT_DECLARATIVE_VISUAL_VERSION = 1 as const;

export type CoreSpiritDeclarativeVisualKind =
  | 'line'
  | 'zone'
  | 'liquidity_zone'
  | 'heatmap'
  | 'liquidity_map'
  | 'depth_map'
  | 'volume_profile'
  | 'footprint'
  | 'structure_graph'
  | 'probability_surface'
  | 'regime_band'
  | 'trade_path'
  | 'model_field'
  | 'replay_trace';

export type CoreSpiritDeclarativeVisualSpec = Readonly<{
  id: string;
  kind: CoreSpiritDeclarativeVisualKind;
  pane?: 'main' | 'subpane' | 'overlay' | 'floating';
  visible?: boolean;
  locked?: boolean;
  zIndex?: number;
  semanticRole?: string;
  properties: Readonly<Record<string, unknown>>;
  metadata?: CoreSpiritVisualMetadata;
  interaction?: Readonly<{
    onClick?: { kind: 'inspect' | 'focus' | 'openPanel' | 'emitEvent'; actionId: string; params?: Readonly<Record<string, unknown>> };
    onHover?: { kind: 'inspect' | 'focus' | 'openPanel' | 'emitEvent'; actionId: string; params?: Readonly<Record<string, unknown>> };
  }>;
  parentId?: string;
}>;

export type CoreSpiritDeclarativeVisualState = Readonly<{
  version: typeof CORE_SPIRIT_DECLARATIVE_VISUAL_VERSION;
  revision: number;
  specs: readonly CoreSpiritDeclarativeVisualSpec[];
}>;

const KIND_TO_SCENE: Readonly<Record<CoreSpiritDeclarativeVisualKind, { kind: CoreSpiritSceneKind; layer: CoreSpiritSceneLayer }>> = {
  line: { kind: 'line', layer: 'structure' },
  zone: { kind: 'zone', layer: 'structure' },
  liquidity_zone: { kind: 'liquidityZone', layer: 'liquidity' },
  heatmap: { kind: 'heatmap', layer: 'data' },
  liquidity_map: { kind: 'liquidityMap', layer: 'liquidity' },
  depth_map: { kind: 'depthMap', layer: 'depth' },
  volume_profile: { kind: 'volumeProfile', layer: 'volume' },
  footprint: { kind: 'footprint', layer: 'data' },
  structure_graph: { kind: 'structureGraph', layer: 'structure' },
  probability_surface: { kind: 'probabilitySurface', layer: 'data' },
  regime_band: { kind: 'regimeBand', layer: 'indicator' },
  trade_path: { kind: 'tradePath', layer: 'order' },
  model_field: { kind: 'modelField', layer: 'data' },
  replay_trace: { kind: 'replayTrace', layer: 'data' },
};

const SERIALIZABLE_PRIMITIVES = new Set(['string', 'number', 'boolean']);

function isSerializable(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (value === null) return true;
  if (SERIALIZABLE_PRIMITIVES.has(typeof value)) return typeof value !== 'number' || Number.isFinite(value as number);
  if (Array.isArray(value)) return value.length <= 100_000 && value.every(item => isSerializable(item, depth + 1));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).every(item => isSerializable(item, depth + 1));
  return false;
}

export function validateCoreSpiritDeclarativeVisual(spec: CoreSpiritDeclarativeVisualSpec): string[] {
  const errors: string[] = [];
  if (!spec.id.trim()) errors.push('visual id must not be empty');
  if (!KIND_TO_SCENE[spec.kind]) errors.push(`unsupported declarative visual kind '${spec.kind}'`);
  if (!spec.properties || typeof spec.properties !== 'object') errors.push(`${spec.id}: properties are required`);
  if (!isSerializable(spec.properties)) errors.push(`${spec.id}: properties must be serializable`);
  if (spec.metadata && !isSerializable(spec.metadata)) errors.push(`${spec.id}: metadata must be serializable`);
  if (spec.zIndex !== undefined && (!Number.isFinite(spec.zIndex) || Math.abs(spec.zIndex) > 1_000_000)) errors.push(`${spec.id}: invalid zIndex`);
  return errors;
}

export function normalizeCoreSpiritDeclarativeVisual(spec: CoreSpiritDeclarativeVisualSpec): CoreSpiritDeclarativeVisualSpec {
  const normalized: CoreSpiritDeclarativeVisualSpec = {
    ...spec,
    id: spec.id.trim(),
    pane: spec.pane ?? 'main',
    visible: spec.visible ?? true,
    locked: spec.locked ?? false,
    zIndex: spec.zIndex ?? 0,
    properties: Object.freeze({ ...spec.properties }),
    metadata: spec.metadata ? Object.freeze({ ...spec.metadata }) : undefined,
  };
  const errors = validateCoreSpiritDeclarativeVisual(normalized);
  if (errors.length) throw new Error(errors.join('; '));
  return Object.freeze(normalized);
}

function anchorFromProperties(properties: Readonly<Record<string, unknown>>): { time?: number; price?: number } | undefined {
  const time = typeof properties.time === 'number' ? properties.time : undefined;
  const price = typeof properties.price === 'number' ? properties.price : undefined;
  return time === undefined && price === undefined ? undefined : { time, price };
}

function anchorsFromProperties(properties: Readonly<Record<string, unknown>>): readonly { time?: number; price?: number }[] | undefined {
  const points = properties.points;
  if (!Array.isArray(points)) return undefined;
  const anchors = points
    .filter(point => point && typeof point === 'object')
    .map(point => ({
      time: typeof (point as any).time === 'number' ? (point as any).time : undefined,
      price: typeof (point as any).price === 'number' ? (point as any).price : undefined,
    }));
  return anchors.length ? anchors : undefined;
}

function timeRangeFromProperties(properties: Readonly<Record<string, unknown>>): { start: number; end: number } | undefined {
  const range = properties.timeRange;
  if (range && typeof range === 'object' && typeof (range as any).start === 'number' && typeof (range as any).end === 'number') {
    return { start: Math.min((range as any).start, (range as any).end), end: Math.max((range as any).start, (range as any).end) };
  }
  return undefined;
}

export function declarativeVisualToSceneNode(specInput: CoreSpiritDeclarativeVisualSpec, sourceId: string): CoreSpiritSceneNode {
  const spec = normalizeCoreSpiritDeclarativeVisual(specInput);
  const mapping = KIND_TO_SCENE[spec.kind];
  return {
    id: `${sourceId}:${spec.id}`,
    kind: mapping.kind,
    layer: mapping.layer,
    pane: spec.pane ?? 'main',
    zIndex: spec.zIndex ?? 0,
    visible: spec.visible ?? true,
    interactive: Boolean(spec.interaction?.onClick || spec.interaction?.onHover || spec.metadata),
    locked: spec.locked ?? false,
    sourceId,
    anchor: anchorFromProperties(spec.properties),
    anchors: anchorsFromProperties(spec.properties),
    timeRange: timeRangeFromProperties(spec.properties),
    style: typeof spec.properties.style === 'object' && spec.properties.style ? { ...(spec.properties.style as Record<string, unknown>) } : undefined,
    payload: Object.fromEntries(Object.entries(spec.properties).filter(([key]) => key !== 'style')),
    metadata: spec.metadata,
    semanticRole: spec.semanticRole,
    parentId: spec.parentId ? `${sourceId}:${spec.parentId}` : undefined,
    interaction: spec.interaction,
  };
}

export function buildCoreSpiritSceneFromDeclarativeVisuals(
  identity: CoreSpiritSceneIdentity,
  specs: readonly CoreSpiritDeclarativeVisualSpec[],
  sourceId: string,
  revision = 0,
): CoreSpiritScene {
  const nodes = specs.map(spec => declarativeVisualToSceneNode(spec, sourceId));
  const scene = buildCoreSpiritSceneFromNodes(identity, nodes, revision);
  const errors = validateCoreSpiritScene(scene);
  if (errors.length) throw new Error(errors.join('; '));
  return scene;
}

export function replaceDeclarativeVisual(
  state: CoreSpiritDeclarativeVisualState,
  spec: CoreSpiritDeclarativeVisualSpec,
): CoreSpiritDeclarativeVisualState {
  const next = normalizeCoreSpiritDeclarativeVisual(spec);
  return Object.freeze({
    version: CORE_SPIRIT_DECLARATIVE_VISUAL_VERSION,
    revision: state.revision + 1,
    specs: Object.freeze([...state.specs.filter(existing => existing.id !== next.id), next]),
  });
}

export function removeDeclarativeVisual(state: CoreSpiritDeclarativeVisualState, id: string): CoreSpiritDeclarativeVisualState {
  if (!state.specs.some(spec => spec.id === id)) return state;
  return Object.freeze({ version: CORE_SPIRIT_DECLARATIVE_VISUAL_VERSION, revision: state.revision + 1, specs: Object.freeze(state.specs.filter(spec => spec.id !== id)) });
}
