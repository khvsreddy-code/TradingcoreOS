/**
 * Unified CoreDrawing object model.
 *
 * Renderer-neutral drawing contract. Creation/control methods live in the chart
 * API, while the object itself is shared by user/script/AI/system producers.
 */

export type CoreDrawingOwner = 'user' | 'script' | 'ai' | 'system';
export type CoreDrawingLifecycle = 'draft' | 'active' | 'hidden' | 'deleted' | 'expired';
export type CoreDrawingCoordinateSpace = 'data' | 'viewport';

export type CoreDrawingPoint = { time: number; price: number };
export type CoreDrawingViewportAnchor = { x: number; y: number };

export type CoreDrawingStyle = {
  color?: string;
  lineWidth?: number;
  lineStyle?: 0 | 1 | 2;
  fillColor?: string;
  fillOpacity?: number;
  textColor?: string;
  fontSize?: number;
  opacity?: number;
};

export type CoreDrawingKind =
  | 'trendline' | 'ray' | 'extendedLine'
  | 'horizontal' | 'horizontalRay' | 'vertical' | 'crossline'
  | 'rectangle' | 'rotatedRectangle' | 'ellipse' | 'circle' | 'triangle'
  | 'parallelChannel' | 'disjointChannel' | 'flatChannel'
  | 'fib' | 'fibExtension' | 'fibChannel' | 'fibTime' | 'fibSpeedResistanceFan'
  | 'pitchfork' | 'schiffPitchfork' | 'modifiedSchiffPitchfork' | 'insidePitchfork'
  | 'gannBox' | 'gannSquare' | 'gannFan'
  | 'arrow' | 'priceRange' | 'dateRange' | 'datePriceRange' | 'measure'
  | 'brush' | 'highlighter' | 'path' | 'polyline' | 'curve' | 'doubleCurve' | 'arc'
  | 'text' | 'note' | 'anchoredText' | 'anchoredNote' | 'callout' | 'signpost'
  | 'priceLabel' | 'flag' | 'icon'
  | 'longPosition' | 'shortPosition' | 'forecast'
  | 'marker' | 'zone' | 'signal' | 'series';

export type CoreDrawing = {
  id: string;
  kind: CoreDrawingKind;
  points: CoreDrawingPoint[];
  anchor?: CoreDrawingViewportAnchor;
  owner: CoreDrawingOwner;
  sourceId?: string;
  paneId?: string;
  seriesId?: string;
  coordinateSpace: CoreDrawingCoordinateSpace;
  style?: CoreDrawingStyle;
  label?: string;
  metadata?: Record<string, unknown>;
  lifecycle: CoreDrawingLifecycle;
  visible: boolean;
  selectionEnabled: boolean;
  locked: boolean;
  zIndex: number;
  groupId?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type CoreDrawingCollection = { version: 2; drawings: CoreDrawing[] };

const VALID_KINDS = new Set<CoreDrawingKind>([
  'trendline','ray','extendedLine','horizontal','horizontalRay','vertical','crossline',
  'rectangle','rotatedRectangle','ellipse','circle','triangle','parallelChannel','disjointChannel','flatChannel',
  'fib','fibExtension','fibChannel','fibTime','fibSpeedResistanceFan','pitchfork','schiffPitchfork','modifiedSchiffPitchfork','insidePitchfork',
  'gannBox','gannSquare','gannFan','arrow','priceRange','dateRange','datePriceRange','measure',
  'brush','highlighter','path','polyline','curve','doubleCurve','arc','text','note','anchoredText','anchoredNote','callout','signpost',
  'priceLabel','flag','icon','longPosition','shortPosition','forecast','marker','zone','signal','series'
]);

const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function normalizeCoreDrawing(input: unknown, owner: CoreDrawingOwner = 'user'): CoreDrawing | null {
  const d = input as any;
  if (!d || typeof d !== 'object') return null;
  const kind = String(d.kind ?? d.tool ?? '');
  if (!VALID_KINDS.has(kind as CoreDrawingKind)) return null;

  const coordinateSpace: CoreDrawingCoordinateSpace = d.coordinateSpace === 'viewport' ? 'viewport' : 'data';
  const points = Array.isArray(d.points)
    ? d.points.map((p: any) => {
      const time = finite(p?.time); const price = finite(p?.price);
      return time == null || price == null ? null : { time, price };
    }).filter(Boolean) as CoreDrawingPoint[]
    : [];

  const anchor = d.anchor && typeof d.anchor === 'object'
    ? { x: Math.max(0, Math.min(1, Number(d.anchor.x))), y: Math.max(0, Math.min(1, Number(d.anchor.y))) }
    : undefined;
  if (coordinateSpace === 'data' && !points.length) return null;
  if (coordinateSpace === 'viewport' && (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y))) return null;

  const now = Date.now();
  return {
    id: typeof d.id === 'string' && d.id ? d.id : `draw-${now}-${Math.random().toString(36).slice(2, 8)}`,
    kind: kind as CoreDrawingKind,
    points,
    anchor,
    owner: d.owner === 'script' || d.owner === 'ai' || d.owner === 'system' ? d.owner : owner,
    sourceId: typeof d.sourceId === 'string' ? d.sourceId : undefined,
    paneId: typeof d.paneId === 'string' ? d.paneId : undefined,
    seriesId: typeof d.seriesId === 'string' ? d.seriesId : undefined,
    coordinateSpace,
    style: d.style && typeof d.style === 'object' ? d.style : undefined,
    label: typeof d.label === 'string' ? d.label : undefined,
    metadata: d.metadata && typeof d.metadata === 'object' ? d.metadata : undefined,
    lifecycle: d.lifecycle === 'hidden' || d.lifecycle === 'deleted' || d.lifecycle === 'expired' || d.lifecycle === 'draft' ? d.lifecycle : 'active',
    visible: d.visible !== false,
    selectionEnabled: d.selectionEnabled !== false,
    locked: d.locked === true,
    zIndex: Number.isFinite(Number(d.zIndex)) ? Number(d.zIndex) : 0,
    groupId: typeof d.groupId === 'string' ? d.groupId : undefined,
    createdAt: Number.isFinite(Number(d.createdAt)) ? Number(d.createdAt) : now,
    updatedAt: Number.isFinite(Number(d.updatedAt)) ? Number(d.updatedAt) : now,
  };
}

export function isValidCoreDrawing(input: unknown): input is CoreDrawing {
  return Boolean(normalizeCoreDrawing(input));
}

export function normalizeCoreDrawings(inputs: unknown, owner: CoreDrawingOwner = 'user'): CoreDrawing[] {
  if (!Array.isArray(inputs)) return [];
  return inputs.map(x => normalizeCoreDrawing(x, owner)).filter(Boolean) as CoreDrawing[];
}

export function markDrawingDeleted(drawing: CoreDrawing): CoreDrawing {
  return { ...drawing, lifecycle: 'deleted', visible: false, updatedAt: Date.now() };
}

export function cloneCoreDrawing(drawing: CoreDrawing): CoreDrawing {
  return {
    ...drawing,
    points: drawing.points.map(point => ({ ...point })),
    anchor: drawing.anchor ? { ...drawing.anchor } : undefined,
    style: drawing.style ? { ...drawing.style } : undefined,
    metadata: drawing.metadata ? { ...drawing.metadata } : undefined,
  };
}

export function drawingCollection(drawings: CoreDrawing[]): CoreDrawingCollection {
  return {
    version: 2,
    drawings: drawings.filter(d => d.lifecycle !== 'deleted').map(cloneCoreDrawing),
  };
}
