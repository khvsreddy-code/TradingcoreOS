/**
 * Unified CoreDrawing object model.
 *
 * This is a shared data contract, not a chart renderer and not part of CoreSpirit.
 * Core Chart owns rendering/interaction; CoreSpirit may emit drawing intents that
 * conform to this contract. User, AI, script and system drawings remain distinct
 * through ownership/source metadata.
 */

export type CoreDrawingOwner = 'user' | 'script' | 'ai' | 'system';
export type CoreDrawingLifecycle = 'draft' | 'active' | 'hidden' | 'deleted' | 'expired';
export type CoreDrawingCoordinateSpace = 'data';

export type CoreDrawingPoint = {
  time: number;
  price: number;
};

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
  | 'horizontal' | 'horizontalRay' | 'vertical'
  | 'rectangle' | 'ellipse' | 'parallelChannel'
  | 'fib' | 'fibExtension' | 'pitchfork'
  | 'arrow' | 'priceRange' | 'dateRange'
  | 'brush' | 'highlighter' | 'text'
  | 'longPosition' | 'shortPosition' | 'measure'
  | 'marker' | 'zone' | 'signal' | 'series';

export type CoreDrawing = {
  id: string;
  kind: CoreDrawingKind;
  points: CoreDrawingPoint[];
  owner: CoreDrawingOwner;
  sourceId?: string;
  paneId?: string;
  seriesId?: string;
  coordinateSpace: CoreDrawingCoordinateSpace;
  style?: CoreDrawingStyle;
  label?: string;
  metadata?: Record<string, unknown>;
  lifecycle: CoreDrawingLifecycle;
  createdAt?: number;
  updatedAt?: number;
};

export type CoreDrawingCollection = {
  version: 1;
  drawings: CoreDrawing[];
};

const VALID_KINDS = new Set<CoreDrawingKind>([
  'trendline','ray','extendedLine','horizontal','horizontalRay','vertical',
  'rectangle','ellipse','parallelChannel','fib','fibExtension','pitchfork',
  'arrow','priceRange','dateRange','brush','highlighter','text',
  'longPosition','shortPosition','measure','marker','zone','signal','series'
]);

const finite = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Convert the legacy chart drawing shape into the canonical contract. */
export function normalizeCoreDrawing(input: unknown, owner: CoreDrawingOwner = 'user'): CoreDrawing | null {
  const d = input as any;
  if (!d || typeof d !== 'object' || !Array.isArray(d.points)) return null;
  const kind = String(d.kind ?? d.tool ?? '');
  if (!VALID_KINDS.has(kind as CoreDrawingKind)) return null;
  const points = d.points.map((p: any) => {
    const time = finite(p?.time);
    const price = finite(p?.price);
    return time == null || price == null ? null : { time, price };
  }).filter(Boolean) as CoreDrawingPoint[];
  if (!points.length) return null;
  const now = Date.now();
  return {
    id: typeof d.id === 'string' && d.id ? d.id : `draw-${now}-${Math.random().toString(36).slice(2, 8)}`,
    kind: kind as CoreDrawingKind,
    points,
    owner: d.owner === 'script' || d.owner === 'ai' || d.owner === 'system' ? d.owner : owner,
    sourceId: typeof d.sourceId === 'string' ? d.sourceId : undefined,
    paneId: typeof d.paneId === 'string' ? d.paneId : undefined,
    seriesId: typeof d.seriesId === 'string' ? d.seriesId : undefined,
    coordinateSpace: 'data',
    style: d.style && typeof d.style === 'object' ? d.style : undefined,
    label: typeof d.label === 'string' ? d.label : undefined,
    metadata: d.metadata && typeof d.metadata === 'object' ? d.metadata : undefined,
    lifecycle: d.lifecycle === 'hidden' || d.lifecycle === 'deleted' || d.lifecycle === 'expired' || d.lifecycle === 'draft' ? d.lifecycle : 'active',
    createdAt: Number.isFinite(Number(d.createdAt)) ? Number(d.createdAt) : now,
    updatedAt: Number.isFinite(Number(d.updatedAt)) ? Number(d.updatedAt) : now,
  };
}

export function isValidCoreDrawing(input: unknown): input is CoreDrawing {
  const d = input as CoreDrawing;
  return Boolean(normalizeCoreDrawing(d));
}

export function normalizeCoreDrawings(inputs: unknown, owner: CoreDrawingOwner = 'user'): CoreDrawing[] {
  if (!Array.isArray(inputs)) return [];
  return inputs.map(x => normalizeCoreDrawing(x, owner)).filter(Boolean) as CoreDrawing[];
}

export function markDrawingDeleted(drawing: CoreDrawing): CoreDrawing {
  return { ...drawing, lifecycle: 'deleted', updatedAt: Date.now() };
}

export function cloneCoreDrawing(drawing: CoreDrawing): CoreDrawing {
  return JSON.parse(JSON.stringify(drawing)) as CoreDrawing;
}

export function drawingCollection(drawings: CoreDrawing[]): CoreDrawingCollection {
  return {
    version: 1,
    drawings: drawings
      .filter(d => d.lifecycle !== 'deleted')
      .map(cloneCoreDrawing),
  };
}
