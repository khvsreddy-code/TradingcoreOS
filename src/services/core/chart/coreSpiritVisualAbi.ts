import type { CoreSpiritObject, CoreSpiritVisualStyle } from '../../coreSpirit/types';
import type { CoreSpiritVelaOutputRevision } from '../../coreSpirit/velaOutputAdapter';
import type { DrawingBox, DrawingLabel, DrawingLine, DrawingPolyline, DrawingTable, LabelStyle, LabelYLoc, BoxTextSize } from '../../../../vendor/vela/src/core/model/drawings';
import type { Background, PriceLine } from '../../../../vendor/vela/src/core/model/scene';
import type { LineStyle } from '../../../../vendor/vela/src/core/model/series';

export const CORE_SPIRIT_VISUAL_ABI_VERSION = 1 as const;
export const CORE_SPIRIT_VELA_COORDINATE_SYSTEM = 'vela-epoch-milliseconds-price+tagged-visual-space' as const;

export type CoreSpiritVisualAbiOperation = 'snapshot' | 'patch';
export type CoreSpiritVisualAbiMetadata = Readonly<{
  schemaVersion: typeof CORE_SPIRIT_VISUAL_ABI_VERSION;
  scriptInstanceId: string;
  datasetRevision: number;
  outputRevision: number;
  coordinateSystem: typeof CORE_SPIRIT_VELA_COORDINATE_SYSTEM;
  paneId: string;
  renderTarget: 'chart' | 'panel' | 'sidePanel' | 'floating';
  visible: boolean;
}>;

type CoreSpiritVisualAbiBase = CoreSpiritVisualAbiMetadata & Readonly<{
  revision: CoreSpiritVelaOutputRevision;
}>;

export type CoreSpiritVisualAbiSnapshot = CoreSpiritVisualAbiBase & Readonly<{
  operation: 'snapshot';
  objects: readonly CoreSpiritObject[];
}>;

export type CoreSpiritVisualAbiPatch = CoreSpiritVisualAbiBase & Readonly<{
  operation: 'patch';
  upsert: readonly CoreSpiritObject[];
  /** Stable IDs returned by coreSpiritVisualObjectId(), not source-level IDs. */
  removeIds: readonly string[];
}>;

export type CoreSpiritVisualAbiMutation = CoreSpiritVisualAbiSnapshot | CoreSpiritVisualAbiPatch;

export type PreparedCoreSpiritVisualSnapshot = Readonly<{
  streamId: string;
  datasetRevision: number;
  outputRevision: number;
  visible: boolean;
  /** Chart-visible objects for the render commit. */
  objects: readonly CoreSpiritObject[];
  /** Full retained source objects so visibility toggles do not lose patch state. */
  retainedObjects: readonly CoreSpiritObject[];
}>;

type RetainedVisualState = {
  datasetRevision: number;
  outputRevision: number;
  visible: boolean;
  objects: Map<string, CoreSpiritObject>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function assertVelaEpochMillis(value: unknown, label: string): number {
  const numeric = finiteNumber(value);
  // The renderer boundary is deliberately strict: seconds are normalized upstream,
  // never guessed in a paint loop. Current market timelines use epoch milliseconds.
  if (numeric === undefined || Math.abs(numeric) < 100_000_000_000) {
    throw new Error(`CoreSpirit visual ABI rejected ${label}: expected epoch milliseconds after chart alignment.`);
  }
  return numeric;
}

function rawStableSeed(object: CoreSpiritObject, index: number): string {
  const item = object as unknown as Record<string, any>;
  const metadata = record(item.metadata);
  const existing = metadata.visualId ?? metadata.outputId ?? metadata.objectId ?? metadata.drawingId;
  if (existing != null && String(existing).trim()) return String(existing).trim();
  if (metadata.sourceNodeId != null && String(metadata.sourceNodeId).trim()) {
    return `node:${String(metadata.sourceNodeId).trim()}`;
  }

  switch (object.kind) {
    case 'series': return `series:${String(object.seriesId ?? object.name ?? 'plot')}:${String(object.time)}`;
    case 'signal': return `signal:${String(object.type)}:${String(object.time)}`;
    case 'line': return `line:${String(object.start.time)}:${String(object.start.price)}`;
    case 'arrow': return `arrow:${String(object.start.time)}:${String(object.start.price)}`;
    case 'zone': return `zone:${String(object.left)}:${String(object.top)}:${String(object.bottom)}`;
    case 'box': return `box:${String(object.left)}:${String(object.top)}:${String(object.bottom)}`;
    case 'label': return `label:${String(object.time)}:${String(object.price)}:${String(object.text)}`;
    case 'marker': return `marker:${String(object.time)}:${String(object.price)}:${String(metadata.shape ?? '')}`;
    case 'shape': return `shape:${String(object.time)}:${String(object.price)}:${String(object.shape)}`;
    case 'polyline':
    case 'polygon': {
      const first = object.points[0];
      return `${object.kind}:${String(first?.time ?? 'empty')}:${String(first?.price ?? 'empty')}`;
    }
    case 'hline': return `hline:${String(object.price)}`;
    case 'background':
    case 'barcolor': return `${object.kind}:${String(object.time)}`;
    case 'band': return `band:${String(object.time)}`;
    case 'footprint': return `footprint:${String(object.time)}`;
    case 'customVisual': return `custom:${String(object.time ?? 'static')}:${String(record(object.geometry).kind ?? 'geometry')}`;
    case 'table': return `table:${String(object.id)}:${String(object.row)}:${String(object.column)}`;
    case 'event': return `event:${String(object.name)}:${String(object.time)}`;
    case 'orderIntent': return `order:${String(object.time)}:${String(object.side)}:${String(object.tag ?? '')}`;
    case 'scanCandidate': return `candidate:${String(object.time ?? 'static')}:${String(object.score ?? '')}:${String(object.label ?? '')}`;
    default: return `${object.kind}:${index}`;
  }
}

/** Return the canonical identity for a visual, scoped to its script instance. */
export function coreSpiritVisualObjectId(object: CoreSpiritObject, scriptInstanceId: string, index = 0): string {
  const item = object as unknown as Record<string, any>;
  const existingAbi = record(record(object.metadata).coreSpiritVisualAbi);
  if (existingAbi.schemaVersion === CORE_SPIRIT_VISUAL_ABI_VERSION &&
      existingAbi.scriptInstanceId === scriptInstanceId &&
      typeof existingAbi.objectId === 'string' && existingAbi.objectId.trim()) {
    return existingAbi.objectId;
  }
  const originalId = item.id == null ? undefined : String(item.id).trim();
  // A table emits cells as multiple outputs. Its retained identity is per cell while
  // metadata retains the table-level id for projection into Vela's single table model.
  const tableCell = object.kind === 'table' ? `:${object.row}:${object.column}` : '';
  const seed = originalId && object.kind !== 'series'
    ? `id:${originalId}${tableCell}`
    : rawStableSeed(object, index);
  return `${scriptInstanceId}:${object.kind}:${seed}`;
}

function validateObjectCoordinates(object: CoreSpiritObject): void {
  const item = object as unknown as Record<string, any>;
  const requirePrice = (value: unknown, label: string) => {
    if (finiteNumber(value) === undefined) throw new Error(`CoreSpirit visual ABI rejected ${object.kind} ${label}: expected a finite price.`);
  };
  const requireTime = (value: unknown, label: string) => { assertVelaEpochMillis(value, `${object.kind} ${label}`); };

  switch (object.kind) {
    case 'series':
    case 'marker':
    case 'signal':
    case 'label':
    case 'shape':
    case 'background':
    case 'barcolor':
    case 'footprint':
    case 'orderIntent':
    case 'event':
      if (item.time != null) requireTime(item.time, 'time');
      if ('price' in item) requirePrice(item.price, 'price');
      break;
    case 'line':
    case 'arrow':
      requireTime(item.start?.time, 'start.time');
      requireTime(item.end?.time, 'end.time');
      requirePrice(item.start?.price, 'start.price');
      requirePrice(item.end?.price, 'end.price');
      break;
    case 'zone':
      if (item.domain !== 'viewport') {
        requireTime(item.left, 'left');
        requireTime(item.right, 'right');
      }
      requirePrice(item.top, 'top');
      requirePrice(item.bottom, 'bottom');
      break;
    case 'box':
      requireTime(item.left, 'left');
      requireTime(item.right, 'right');
      requirePrice(item.top, 'top');
      requirePrice(item.bottom, 'bottom');
      break;
    case 'polyline':
    case 'polygon':
      for (let index = 0; index < object.points.length; index += 1) {
        requireTime(object.points[index]?.time, `points[${index}].time`);
        requirePrice(object.points[index]?.price, `points[${index}].price`);
      }
      break;
    case 'hline':
      requirePrice(item.price, 'price');
      break;
    case 'band':
      requireTime(item.time, 'time');
      if (item.top != null) requirePrice(item.top, 'top');
      if (item.bottom != null) requirePrice(item.bottom, 'bottom');
      break;
    case 'table':
    case 'customVisual':
    case 'scanCandidate':
      if (item.time != null) requireTime(item.time, 'time');
      break;
  }
}

/**
 * Validate renderer-facing coordinates and attach ABI provenance without mutating
 * runtime-owned output objects. The resulting objects are immutable snapshots.
 */
export function normalizeCoreSpiritVisualObjects(
  objects: readonly CoreSpiritObject[],
  scriptInstanceId: string,
  revision: CoreSpiritVelaOutputRevision,
  fallbackPaneId = 'price',
): CoreSpiritObject[] {
  if (!scriptInstanceId.trim()) throw new Error('CoreSpirit visual ABI requires a script instance id.');
  const occurrences = new Map<string, number>();
  return objects.map((object, index) => {
    validateObjectCoordinates(object);
    const baseId = coreSpiritVisualObjectId(object, scriptInstanceId, index);
    const occurrence = occurrences.get(baseId) ?? 0;
    occurrences.set(baseId, occurrence + 1);
    const id = occurrence === 0 ? baseId : `${baseId}:duplicate:${occurrence}`;
    const source = object as unknown as Record<string, any>;
    const metadata = record(object.metadata);
    const visual = record((object as unknown as Record<string, unknown>).visual);
    const area = record(visual.area);
    const declaredPane = typeof metadata.paneId === 'string' && metadata.paneId.trim()
      ? metadata.paneId.trim()
      : area.kind === 'chart' && typeof area.id === 'string' && area.id.trim()
        ? area.id.trim()
        : area.kind === 'chart' && typeof area.area === 'string' && area.area === 'price'
          ? 'price'
          : fallbackPaneId;
    const renderTarget = area.kind === 'panel' ? 'panel'
      : area.kind === 'sidePanel' ? 'sidePanel'
      : area.kind === 'floating' ? 'floating'
      : 'chart';
    const abiMetadata = Object.freeze({
      schemaVersion: CORE_SPIRIT_VISUAL_ABI_VERSION,
      scriptInstanceId,
      objectId: id,
      datasetRevision: revision.datasetRevision,
      outputRevision: revision.outputRevision,
      coordinateSystem: CORE_SPIRIT_VELA_COORDINATE_SYSTEM,
      paneId: declaredPane,
      renderTarget,
      visible: visual.visible !== false,
      sourceNodeId: metadata.sourceNodeId == null ? undefined : String(metadata.sourceNodeId),
      sourceSpan: metadata.sourceSpan ?? (metadata.start != null || metadata.end != null
        ? { start: metadata.start, end: metadata.end }
        : undefined),
      tableId: object.kind === 'table' ? `${scriptInstanceId}:${String(source.id ?? 'CoreSpirit Table')}` : undefined,
    });
    const normalized = {
      ...source,
      ...(object.kind === 'series' ? {} : { id }),
      metadata: Object.freeze({ ...metadata, coreSpiritVisualAbi: abiMetadata }),
    };
    return Object.freeze(normalized) as unknown as CoreSpiritObject;
  });
}

function revisionIsNewer(previous: RetainedVisualState | undefined, revision: CoreSpiritVelaOutputRevision): boolean {
  if (!revision.streamId.trim() ||
      !Number.isSafeInteger(revision.datasetRevision) || revision.datasetRevision < 0 ||
      !Number.isSafeInteger(revision.outputRevision) || revision.outputRevision < 0) return false;
  if (!previous) return true;
  return revision.datasetRevision > previous.datasetRevision ||
    (revision.datasetRevision === previous.datasetRevision && revision.outputRevision > previous.outputRevision);
}

/** A patch is prepared against a retained snapshot and committed only after chart projection succeeds. */
export class CoreSpiritVisualAbiStore {
  private readonly streams = new Map<string, RetainedVisualState>();

  prepare(mutation: CoreSpiritVisualAbiMutation): PreparedCoreSpiritVisualSnapshot | undefined {
    if (mutation.schemaVersion !== CORE_SPIRIT_VISUAL_ABI_VERSION ||
        mutation.coordinateSystem !== CORE_SPIRIT_VELA_COORDINATE_SYSTEM ||
        !mutation.scriptInstanceId.trim() ||
        typeof mutation.paneId !== 'string' || !mutation.paneId.trim() ||
        typeof mutation.visible !== 'boolean') return undefined;
    const revision = mutation.revision;
    if (revision.streamId !== mutation.scriptInstanceId) {
      // Stream identity is a separate concept from the Vela indicator id, but both
      // identities travel in the ABI. They need not be equal; a non-empty stream is enough.
      if (!revision.streamId.trim()) return undefined;
    }
    const previous = this.streams.get(revision.streamId);
    if (!revisionIsNewer(previous, revision)) return undefined;

    const objects = mutation.operation === 'snapshot'
      ? new Map<string, CoreSpiritObject>()
      : new Map(previous?.objects ?? []);
    if (mutation.operation === 'patch' && !previous) return undefined;

    if (mutation.operation === 'snapshot') {
      const normalized = normalizeCoreSpiritVisualObjects(mutation.objects, mutation.scriptInstanceId, revision, mutation.paneId);
      for (const object of normalized) {
        const id = String(record(object.metadata).coreSpiritVisualAbi && record(record(object.metadata).coreSpiritVisualAbi).objectId || '');
        if (id) objects.set(id, object);
      }
    } else {
      for (const id of mutation.removeIds) objects.delete(id);
      const normalized = normalizeCoreSpiritVisualObjects(mutation.upsert, mutation.scriptInstanceId, revision, mutation.paneId);
      for (const object of normalized) {
        const id = String(record(record(object.metadata).coreSpiritVisualAbi).objectId ?? '');
        if (id) objects.set(id, object);
      }
    }

    const retainedObjects = Object.freeze([...objects.values()]);
    return Object.freeze({
      streamId: revision.streamId,
      datasetRevision: revision.datasetRevision,
      outputRevision: revision.outputRevision,
      visible: mutation.visible,
      objects: Object.freeze(mutation.visible ? retainedObjects.filter(isCoreSpiritVisualVisibleObject) : []),
      retainedObjects,
    });
  }

  commit(prepared: PreparedCoreSpiritVisualSnapshot): void {
    const previous = this.streams.get(prepared.streamId);
    const revision = { streamId: prepared.streamId, datasetRevision: prepared.datasetRevision, outputRevision: prepared.outputRevision };
    if (!revisionIsNewer(previous, revision)) throw new Error('CoreSpirit visual ABI commit rejected a stale prepared revision.');
    const objects = new Map<string, CoreSpiritObject>();
    for (const object of prepared.retainedObjects) {
      const id = String(record(record(object.metadata).coreSpiritVisualAbi).objectId ?? '');
      if (id) objects.set(id, object);
    }
    this.streams.set(prepared.streamId, {
      datasetRevision: prepared.datasetRevision,
      outputRevision: prepared.outputRevision,
      visible: prepared.visible,
      objects,
    });
  }

  objects(streamId: string): readonly CoreSpiritObject[] {
    const state = this.streams.get(streamId);
    if (!state?.visible) return Object.freeze([]);
    return Object.freeze([...state.objects.values()].filter(isCoreSpiritVisualVisibleObject));
  }

  /** Clears visible scene objects but retains revision fences so delayed work cannot resurrect them. */
  clearObjects(streamId?: string): void {
    if (streamId === undefined) {
      for (const state of this.streams.values()) state.objects.clear();
    } else this.streams.get(streamId)?.objects.clear();
  }

  clear(): void {
    this.streams.clear();
  }
}

export function createCoreSpiritVisualSnapshot(
  objects: readonly CoreSpiritObject[],
  revision: CoreSpiritVelaOutputRevision,
  scriptInstanceId: string,
  paneId = 'price',
  visible = true,
): CoreSpiritVisualAbiSnapshot {
  return Object.freeze({
    schemaVersion: CORE_SPIRIT_VISUAL_ABI_VERSION,
    scriptInstanceId,
    datasetRevision: revision.datasetRevision,
    outputRevision: revision.outputRevision,
    coordinateSystem: CORE_SPIRIT_VELA_COORDINATE_SYSTEM,
    paneId,
    visible,
    revision,
    operation: 'snapshot',
    objects,
  });
}

export function createCoreSpiritVisualPatch(
  upsert: readonly CoreSpiritObject[],
  removeIds: readonly string[],
  revision: CoreSpiritVelaOutputRevision,
  scriptInstanceId: string,
  paneId = 'price',
  visible = true,
): CoreSpiritVisualAbiPatch {
  return Object.freeze({
    schemaVersion: CORE_SPIRIT_VISUAL_ABI_VERSION,
    scriptInstanceId,
    datasetRevision: revision.datasetRevision,
    outputRevision: revision.outputRevision,
    coordinateSystem: CORE_SPIRIT_VELA_COORDINATE_SYSTEM,
    paneId,
    visible,
    revision,
    operation: 'patch',
    upsert,
    removeIds: Object.freeze([...removeIds]),
  });
}

function styleRecord(value: unknown): Record<string, any> {
  return record(value);
}

function safeOpacity(value: unknown, fallback = 0.12): number {
  const numeric = finiteNumber(value);
  return numeric === undefined ? fallback : Math.max(0, Math.min(1, numeric));
}

function cssWithOpacity(value: unknown, opacityValue: unknown, fallback: string): string {
  const input = String(value ?? fallback).trim();
  const opacity = safeOpacity(opacityValue, 1);
  const hex = input.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let red: number, green: number, blue: number, sourceAlpha = 1;
    const body = hex[1]!;
    if (body.length === 3) {
      red = parseInt(body[0]! + body[0]!, 16);
      green = parseInt(body[1]! + body[1]!, 16);
      blue = parseInt(body[2]! + body[2]!, 16);
    } else {
      red = parseInt(body.slice(0, 2), 16);
      green = parseInt(body.slice(2, 4), 16);
      blue = parseInt(body.slice(4, 6), 16);
      if (body.length === 8) sourceAlpha = parseInt(body.slice(6, 8), 16) / 255;
    }
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, sourceAlpha * opacity))})`;
  }
  const rgba = input.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgba) {
    const sourceAlpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    return `rgba(${Number(rgba[1])}, ${Number(rgba[2])}, ${Number(rgba[3])}, ${Math.max(0, Math.min(1, sourceAlpha * opacity))})`;
  }
  return input;
}

function velaLineStyle(value: unknown): LineStyle {
  const numeric = finiteNumber(value);
  if (value === 'dashed' || numeric === 1) return 'dashed';
  if (value === 'dotted' || numeric === 2) return 'dotted';
  return 'solid';
}

function textSize(value: unknown): BoxTextSize {
  const numeric = finiteNumber(value);
  if (numeric === undefined) {
    const str = String(value ?? 'normal');
    return (['auto', 'tiny', 'small', 'normal', 'large', 'huge'] as string[]).includes(str) ? str as BoxTextSize : 'normal';
  }
  if (numeric <= 9) return 'tiny';
  if (numeric <= 11) return 'small';
  if (numeric <= 14) return 'normal';
  if (numeric <= 18) return 'large';
  return 'huge';
}

function labelStyle(value: unknown, position: string, fallbackShape?: string): LabelStyle {
  const st = styleRecord(value);
  const shape = String(st.shape ?? fallbackShape ?? '');
  if (shape === 'circle' || shape === 'square' || shape === 'diamond' ||
      shape === 'flag' || shape === 'arrowup' || shape === 'arrowdown' ||
      shape === 'triangleup' || shape === 'triangledown' || shape === 'cross' ||
      shape === 'xcross' || shape === 'text_outline' || shape === 'none') return shape as LabelStyle;
  if (position === 'above') return 'label_up';
  if (position === 'below') return 'label_down';
  if (position === 'inBar') return 'label_center';
  return 'label_center';
}

function tablePosition(value: unknown): DrawingTable['position'] {
  const normalized = String(value ?? 'topRight').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  const aliases: Record<string, DrawingTable['position']> = {
    top_left: 'top_left', top_center: 'top_center', top_right: 'top_right',
    middle_left: 'middle_left', middle_center: 'middle_center', middle_right: 'middle_right',
    bottom_left: 'bottom_left', bottom_center: 'bottom_center', bottom_right: 'bottom_right',
  };
  return aliases[normalized] ?? 'top_right';
}

export type CoreSpiritVelaDrawingCollections = Readonly<{
  lines: DrawingLine[];
  boxes: DrawingBox[];
  labels: DrawingLabel[];
  polylines: DrawingPolyline[];
  backgrounds: Background[];
  priceLines: PriceLine[];
  tables: DrawingTable[];
  barColors: Array<{ time: number; color: string }>;
  customObjects: CoreSpiritObject[];
}>;

/** Convert standard drawing primitives into Vela's own retained drawing collections. */
export function projectCoreSpiritObjectsToVela(
  objects: readonly CoreSpiritObject[],
  paneId = 'price',
): CoreSpiritVelaDrawingCollections {
  const lines: DrawingLine[] = [];
  const boxes: DrawingBox[] = [];
  const labels: DrawingLabel[] = [];
  const polylines: DrawingPolyline[] = [];
  const backgrounds: Background[] = [];
  const priceLines: PriceLine[] = [];
  const tables = new Map<string, { id: string; position: DrawingTable['position']; cells: Array<Array<any>>; bgColor?: string; frameColor?: string; borderColor?: string; frameWidth: number; borderWidth: number }>();
  const barColors: Array<{ time: number; color: string }> = [];
  const customObjects: CoreSpiritObject[] = [];

  for (const object of objects) {
    const raw = object as unknown as Record<string, any>;
    const metadata = record(object.metadata);
    const abi = record(metadata.coreSpiritVisualAbi);
    const forceOverlay = metadata.forceOverlay === true || metadata.force_overlay === true || raw.forceOverlay === true;
    const id = String(abi.objectId ?? raw.id ?? `${object.kind}:${raw.time ?? 'static'}`);
    const itemPane = forceOverlay ? 'price' : String(abi.paneId ?? paneId);
    const itemOverlay = forceOverlay || itemPane === 'price';
    if (object.kind === 'line' || object.kind === 'arrow') {
      const st = styleRecord(object.style);
      lines.push({
        id, paneId: itemPane, xloc: 'bar_time',
        x1: assertVelaEpochMillis(object.start.time, 'line x1'), y1: Number(object.start.price),
        x2: assertVelaEpochMillis(object.end.time, 'line x2'), y2: Number(object.end.price),
        extend: 'none', color: String(st.color ?? st.borderColor ?? '#f59e0b'),
        invisible: false, width: Math.max(1, finiteNumber(st.lineWidth ?? st.width) ?? 1),
        style: velaLineStyle(st.lineStyle), arrowLeft: false,
        arrowRight: object.kind === 'arrow' || Boolean(st.arrowRight),
        overlay: itemOverlay,
      });
    } else if ((object.kind === 'zone' || object.kind === 'box') &&
      !(object.kind === 'zone' && object.domain === 'viewport')) {
      const st = styleRecord(object.style) as CoreSpiritVisualStyle & Record<string, unknown>;
      const state = object.kind === 'zone' ? object.state : undefined;
      const defaultFillOpacity = state === 'mitigated' ? 0.07 : state === 'broken' ? 0.035 : 0.12;
      const fillOpacity = safeOpacity(st.fillOpacity ?? st.opacity, defaultFillOpacity);
      const defaultBorderStyle = state === 'mitigated' ? 1 : state === 'broken' ? 2 : 0;
      boxes.push({
        id, paneId: itemPane, xloc: 'bar_time',
        left: assertVelaEpochMillis(object.left, 'box left'), right: assertVelaEpochMillis(object.right, 'box right'),
        top: Number(object.top), bottom: Number(object.bottom), extend: 'none',
        bgColor: cssWithOpacity(st.fillColor ?? st.color, fillOpacity, 'rgba(59,130,246,0.12)'),
        borderColor: String(st.borderColor ?? st.color ?? '#3b82f6'),
        borderWidth: Math.max(0, finiteNumber(st.borderWidth ?? st.lineWidth) ?? 1),
        borderStyle: velaLineStyle(st.lineStyle ?? defaultBorderStyle),
        text: typeof st.text === 'string' ? st.text : undefined,
        textColor: typeof st.textColor === 'string' ? st.textColor : undefined,
        textSize: textSize(st.fontSize), hAlign: 'left', vAlign: 'top',
        wrap: false, fontFamily: 'default', bold: false, italic: false,
        overlay: itemOverlay,
      });
    } else if (object.kind === 'label' || object.kind === 'marker' || object.kind === 'shape') {
      const st = styleRecord(object.style);
      const item = object as any;
      const metadataShape = metadata.shape;
      const position = object.kind === 'label' ? object.position : String(metadata.position ?? 'price');
      labels.push({
        id, paneId: itemPane, xloc: 'bar_time',
        x: assertVelaEpochMillis(object.time, 'label time'),
        y: Number(object.price), yloc: position === 'above' ? 'abovebar' : position === 'below' ? 'belowbar' : position === 'inBar' ? 'price' : 'price',
        text: object.kind === 'label' ? object.text : String(st.text ?? metadata.text ?? ''),
        style: labelStyle(st, position, object.kind === 'shape' ? object.shape : String(metadataShape ?? '')),
        color: cssWithOpacity(st.background ?? metadata.color ?? st.fillColor ?? st.color, st.opacity, '#3b82f6'),
        textColor: String(st.textColor ?? st.color ?? '#fff'), size: textSize(st.fontSize ?? st.size),
        textAlign: st.textAlign === 'left' || st.textAlign === 'right' ? st.textAlign : 'center',
        fontFamily: 'default', bold: st.fontWeight === '700' || st.fontWeight === 'bold',
        italic: st.fontStyle === 'italic', noFill: st.opacity === 0, overlay: true,
      });
    } else if (object.kind === 'polyline' || object.kind === 'polygon') {
      const st = styleRecord(object.style);
      polylines.push({
        id, paneId: itemPane,
        points: object.points.map(point => ({ xloc: 'bar_time', x: assertVelaEpochMillis(point.time, 'polyline x'), price: Number(point.price) })),
        curved: false, closed: object.kind === 'polygon' || Boolean((object as any).closed),
        lineColor: String(st.borderColor ?? st.color ?? '#f59e0b'),
        fillColor: object.kind === 'polygon' ? cssWithOpacity(st.fillColor ?? st.color, st.fillOpacity ?? st.opacity, 'rgba(59,130,246,0.12)') : undefined,
        lineWidth: Math.max(1, finiteNumber(st.lineWidth ?? st.borderWidth) ?? 1),
        lineStyle: velaLineStyle(st.lineStyle), arrowLeft: false, arrowRight: false, overlay: true,
      });
    } else if (object.kind === 'hline') {
      const st = styleRecord((object as any).style);
      priceLines.push({
        id, paneId: itemPane, price: Number(object.price),
        color: String(st.color ?? '#f59e0b'), lineStyle: velaLineStyle(st.lineStyle),
        width: Math.max(1, finiteNumber(st.lineWidth ?? st.width) ?? 1),
        title: String(st.text ?? ''),
      });
    } else if (object.kind === 'barcolor') {
      barColors.push({ time: assertVelaEpochMillis(object.time, 'barcolor time'), color: String(object.color) });
    } else if (object.kind === 'background') {
      const end = finiteNumber(metadata.endTime);
      if (end !== undefined && end > object.time) {
        backgrounds.push({
          id, paneId: itemPane,
          from: assertVelaEpochMillis(object.time, 'background from'),
          to: assertVelaEpochMillis(end, 'background to'),
          color: cssWithOpacity(object.color, object.opacity, object.color),
          overlay: itemOverlay,
        });
      } else customObjects.push(object);
    } else if (object.kind === 'table') {
      const tableId = String(abi.tableId ?? metadata.tableId ?? raw.id ?? 'CoreSpirit Table');
      let table = tables.get(tableId);
      const position = tablePosition(object.position);
      if (!table) {
        table = {
          id: tableId, position, cells: [], bgColor: undefined, frameColor: undefined,
          borderColor: undefined, frameWidth: 1, borderWidth: 1,
        };
        tables.set(tableId, table);
      }
      const row = Math.floor(Number(object.row)), column = Math.floor(Number(object.column));
      if (!Number.isSafeInteger(row) || !Number.isSafeInteger(column) || row < 0 || column < 0 || row > 63 || column > 63) continue;
      const style = styleRecord(object.style);
      while (table.cells.length <= row) table.cells.push([]);
      while (table.cells[row]!.length <= column) table.cells[row]!.push(null);
      table.cells[row]![column] = {
        text: String(object.text ?? ''),
        textColor: String(style.color ?? '#e5e7eb'),
        bgColor: cssWithOpacity(style.background, style.opacity, '#111827'),
        hAlign: style.align === 'left' || style.align === 'right' ? style.align : 'center',
        vAlign: 'center', textSize: textSize(style.fontSize), fontFamily: 'default',
        tooltip: undefined, bold: style.fontWeight === '700' || style.fontWeight === 'bold', italic: false,
      };
      if (style.border) table.borderColor = String(style.border);
      if (style.background) table.bgColor = cssWithOpacity(style.background, style.opacity, '#111827');
      (table as any).paneId = itemPane;
      (table as any).overlay = itemOverlay;
    } else if (object.kind === 'series' || object.kind === 'signal') {
      // Ordinary numeric outputs and signals are consumed by native Vela series/markers.
      continue;
    } else {
      customObjects.push(object);
    }
  }

  for (const table of tables.values()) {
    const columns = Math.max(1, ...table.cells.map(row => row.length));
    while (table.cells.length && table.cells[table.cells.length - 1]!.length < columns) table.cells[table.cells.length - 1]!.push(null);
    (table as any).columns = columns;
    (table as any).rows = Math.max(1, table.cells.length);
  }

  return {
    lines, boxes, labels, polylines, backgrounds, priceLines,
    tables: [...tables.values()] as unknown as DrawingTable[],
    barColors, customObjects,
  };
}

export function isCoreSpiritChartTargetObject(object: CoreSpiritObject): boolean {
  const metadata = record(object.metadata);
  const abi = record(metadata.coreSpiritVisualAbi);
  return abi.renderTarget == null || abi.renderTarget === 'chart';
}

export function isCoreSpiritVisualVisibleObject(object: CoreSpiritObject): boolean {
  const metadata = record(object.metadata);
  const abi = record(metadata.coreSpiritVisualAbi);
  const visual = record((object as unknown as Record<string, unknown>).visual);
  return abi.visible !== false && visual.visible !== false;
}

export function coreSpiritPaneIdOf(object: CoreSpiritObject, fallback = 'price'): string {
  const metadata = record(object.metadata);
  const abi = record(metadata.coreSpiritVisualAbi);
  const pane = typeof abi.paneId === 'string' ? abi.paneId.trim() : '';
  return pane || fallback;
}

export function isCoreSpiritCustomLayerObject(object: CoreSpiritObject): boolean {
  if (!isCoreSpiritChartTargetObject(object) || !isCoreSpiritVisualVisibleObject(object)) return false;
  if (object.kind === 'zone' && object.domain === 'viewport') return true;
  if (object.kind === 'background') {
    const metadata = record(object.metadata);
    const end = finiteNumber(metadata.endTime);
    return end === undefined || !Number.isFinite(Number(object.time)) || end <= Number(object.time);
  }
  return object.kind === 'band' || object.kind === 'footprint' || object.kind === 'customVisual';
}
