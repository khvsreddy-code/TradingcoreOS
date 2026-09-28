/**
 * CoreSpirit v1 programmable visual coordinate contract.
 *
 * Visuals describe semantic geometry and placement. Hosts resolve those
 * coordinates into device/view coordinates. CoreSpirit never receives DOM,
 * Canvas, WebGL, WebGPU or native renderer handles.
 */

export const CORE_SPIRIT_VISUAL_COORDINATE_VERSION = 1 as const;

export type CoreSpiritCoordinateSpace =
  | 'time'
  | 'bar'
  | 'price'
  | 'percentage'
  | 'screen'
  | 'normalized';

export type CoreSpiritChartAreaKind = 'price' | 'volume' | 'indicator' | 'custom';

export type CoreSpiritVisualArea =
  | Readonly<{ kind: 'chart'; area: CoreSpiritChartAreaKind; id: string }>
  | Readonly<{ kind: 'panel'; id: string; title: string }>
  | Readonly<{ kind: 'sidePanel'; id: string; title: string }>
  | Readonly<{ kind: 'floating'; id: string; title: string }>;

export type CoreSpiritVisualPoint = Readonly<{
  kind: 'point';
  space: CoreSpiritCoordinateSpace;
  x: number;
  y: number;
}>;

export type CoreSpiritVisualRange = Readonly<{
  kind: 'range';
  min: number;
  max: number;
}>;

export type CoreSpiritVisualRelativePosition = Readonly<{
  kind: 'aboveBar' | 'belowBar' | 'atBar';
  offset: number;
}>;

export type CoreSpiritVisualPlacement = Readonly<{
  version: typeof CORE_SPIRIT_VISUAL_COORDINATE_VERSION;
  area: CoreSpiritVisualArea;
  coordinateSpace: CoreSpiritCoordinateSpace;
  visible: boolean;
  range?: CoreSpiritVisualRange;
  clip: 'area' | 'none';
}>;

export type CoreSpiritVisualGeometry =
  | Readonly<{ kind: 'point'; point: CoreSpiritVisualPoint }>
  | Readonly<{ kind: 'line'; from: CoreSpiritVisualPoint; to: CoreSpiritVisualPoint }>
  | Readonly<{ kind: 'box'; from: CoreSpiritVisualPoint; to: CoreSpiritVisualPoint }>
  | Readonly<{ kind: 'polygon'; points: readonly CoreSpiritVisualPoint[] }>;

function finite(value: number): boolean {
  return Number.isFinite(value);
}

export function coreSpiritChartArea(area: CoreSpiritChartAreaKind = 'price', id?: string): CoreSpiritVisualArea {
  return Object.freeze({ kind: 'chart', area, id: (id || area).trim() || area });
}

export function coreSpiritPanelArea(title: string): CoreSpiritVisualArea {
  const normalized = title.trim();
  if (!normalized) throw new Error('panel title must not be empty');
  return Object.freeze({ kind: 'panel', id: normalized, title: normalized });
}

export function coreSpiritSidePanelArea(title: string): CoreSpiritVisualArea {
  const normalized = title.trim();
  if (!normalized) throw new Error('side panel title must not be empty');
  return Object.freeze({ kind: 'sidePanel', id: normalized, title: normalized });
}

export function coreSpiritFloatingArea(title: string): CoreSpiritVisualArea {
  const normalized = title.trim();
  if (!normalized) throw new Error('floating area title must not be empty');
  return Object.freeze({ kind: 'floating', id: normalized, title: normalized });
}

export function coreSpiritPoint(
  x: number,
  y: number,
  space: CoreSpiritCoordinateSpace = 'time',
): CoreSpiritVisualPoint {
  if (!finite(x) || !finite(y)) throw new Error('visual point coordinates must be finite');
  return Object.freeze({ kind: 'point', space, x, y });
}

export function coreSpiritTimePricePoint(time: number, price: number): CoreSpiritVisualPoint {
  return coreSpiritPoint(time, price, 'time');
}

export function coreSpiritBarPricePoint(bar: number, price: number): CoreSpiritVisualPoint {
  return coreSpiritPoint(bar, price, 'bar');
}

export function coreSpiritScreenPoint(x: number, y: number): CoreSpiritVisualPoint {
  return coreSpiritPoint(x, y, 'screen');
}

export function coreSpiritNormalizedPoint(x: number, y: number): CoreSpiritVisualPoint {
  return coreSpiritPoint(x, y, 'normalized');
}

export function coreSpiritPercentagePoint(x: number, y: number): CoreSpiritVisualPoint {
  return coreSpiritPoint(x, y, 'percentage');
}

export function coreSpiritRange(min: number, max: number): CoreSpiritVisualRange {
  if (!finite(min) || !finite(max)) throw new Error('visual range must be finite');
  return Object.freeze({ kind: 'range', min: Math.min(min, max), max: Math.max(min, max) });
}

export function coreSpiritAboveBar(offset = 0): CoreSpiritVisualRelativePosition {
  if (!finite(offset)) throw new Error('aboveBar offset must be finite');
  return Object.freeze({ kind: 'aboveBar', offset });
}

export function coreSpiritBelowBar(offset = 0): CoreSpiritVisualRelativePosition {
  if (!finite(offset)) throw new Error('belowBar offset must be finite');
  return Object.freeze({ kind: 'belowBar', offset });
}

export function coreSpiritAtBar(offset = 0): CoreSpiritVisualRelativePosition {
  if (!finite(offset)) throw new Error('atBar offset must be finite');
  return Object.freeze({ kind: 'atBar', offset });
}

export function coreSpiritPlacement(
  area: CoreSpiritVisualArea = coreSpiritChartArea('price'),
  coordinateSpace: CoreSpiritCoordinateSpace = 'time',
  options: { visible?: boolean; range?: CoreSpiritVisualRange; clip?: 'area' | 'none' } = {},
): CoreSpiritVisualPlacement {
  return Object.freeze({
    version: CORE_SPIRIT_VISUAL_COORDINATE_VERSION,
    area,
    coordinateSpace,
    visible: options.visible ?? true,
    range: options.range,
    clip: options.clip ?? 'area',
  });
}

export function validateCoreSpiritVisualArea(area: CoreSpiritVisualArea): string[] {
  const errors: string[] = [];
  if (!area.id.trim()) errors.push('visual area id must not be empty');
  if (area.kind !== 'chart' && !area.title.trim()) errors.push('visual area title must not be empty');
  if (area.kind === 'chart' && !['price', 'volume', 'indicator', 'custom'].includes(area.area)) errors.push(`unsupported chart area '${String(area.area)}'`);
  return errors;
}

export function validateCoreSpiritVisualPoint(point: CoreSpiritVisualPoint): string[] {
  const errors: string[] = [];
  if (!['time', 'bar', 'price', 'percentage', 'screen', 'normalized'].includes(point.space)) errors.push(`unsupported coordinate space '${String(point.space)}'`);
  if (!finite(point.x) || !finite(point.y)) errors.push('visual point coordinates must be finite');
  if (point.space === 'normalized' && (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) errors.push('normalized coordinates must be in [0, 1]');
  if (point.space === 'percentage' && (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100)) errors.push('percentage coordinates must be in [0, 100]');
  return errors;
}

export function validateCoreSpiritVisualPlacement(placement: CoreSpiritVisualPlacement): string[] {
  const errors = [...validateCoreSpiritVisualArea(placement.area)];
  if (placement.version !== CORE_SPIRIT_VISUAL_COORDINATE_VERSION) errors.push('unsupported visual coordinate contract version');
  if (!['time', 'bar', 'price', 'percentage', 'screen', 'normalized'].includes(placement.coordinateSpace)) errors.push(`unsupported placement coordinate space '${String(placement.coordinateSpace)}'`);
  if (placement.range) {
    if (!finite(placement.range.min) || !finite(placement.range.max) || placement.range.min > placement.range.max) errors.push('invalid visual placement range');
  }
  if (placement.clip !== 'area' && placement.clip !== 'none') errors.push(`unsupported visual clipping mode '${String(placement.clip)}'`);
  return errors;
}

export function validateCoreSpiritVisualGeometry(geometry: CoreSpiritVisualGeometry): string[] {
  if (geometry.kind === 'point') return validateCoreSpiritVisualPoint(geometry.point);
  if (geometry.kind === 'line' || geometry.kind === 'box') {
    const errors = [
      ...validateCoreSpiritVisualPoint(geometry.from),
      ...validateCoreSpiritVisualPoint(geometry.to),
    ];
    if (geometry.from.space !== geometry.to.space) errors.push(`${geometry.kind} endpoints must use the same coordinate space`);
    return errors;
  }
  const errors = geometry.points.flatMap(validateCoreSpiritVisualPoint);
  const spaces = new Set(geometry.points.map(point => point.space));
  if (spaces.size > 1) errors.push(`${geometry.kind} points must use one coordinate space per object`);
  if (geometry.points.length < 3) errors.push(`${geometry.kind} requires at least 3 points`);
  if (geometry.points.length > 5000) errors.push(`${geometry.kind} exceeds 5000 point quota`);
  return errors;
}

export function isCoreSpiritVisualArea(value: unknown): value is CoreSpiritVisualArea {
  return Boolean(value && typeof value === 'object' && (value as any).__coreSpiritVisualRef === 'area');
}

export function isCoreSpiritVisualPoint(value: unknown): value is CoreSpiritVisualPoint {
  return Boolean(value && typeof value === 'object' && (value as any).__coreSpiritVisualRef === 'point');
}

export function isCoreSpiritVisualRange(value: unknown): value is CoreSpiritVisualRange {
  return Boolean(value && typeof value === 'object' && (value as any).__coreSpiritVisualRef === 'range');
}

export function isCoreSpiritVisualRelativePosition(value: unknown): value is CoreSpiritVisualRelativePosition {
  return Boolean(value && typeof value === 'object' && (value as any).__coreSpiritVisualRef === 'relative-position');
}

export function toCoreSpiritRuntimeArea(area: CoreSpiritVisualArea): CoreSpiritVisualArea & { __coreSpiritVisualRef: 'area' } {
  return Object.freeze({ ...area, __coreSpiritVisualRef: 'area' });
}

export function toCoreSpiritRuntimePoint(point: CoreSpiritVisualPoint): CoreSpiritVisualPoint & { __coreSpiritVisualRef: 'point' } {
  return Object.freeze({ ...point, __coreSpiritVisualRef: 'point' });
}

export function toCoreSpiritRuntimeRange(range: CoreSpiritVisualRange): CoreSpiritVisualRange & { __coreSpiritVisualRef: 'range' } {
  return Object.freeze({ ...range, __coreSpiritVisualRef: 'range' });
}

export function toCoreSpiritRuntimeRelativePosition(position: CoreSpiritVisualRelativePosition): CoreSpiritVisualRelativePosition & { __coreSpiritVisualRef: 'relative-position' } {
  return Object.freeze({ ...position, __coreSpiritVisualRef: 'relative-position' });
}

export function placementFromRuntimeArgs(args: readonly unknown[]): { placement?: CoreSpiritVisualPlacement; legacyArgs: readonly unknown[] } {
  const area = isCoreSpiritVisualArea(args[1]) ? args[1] : undefined;
  if (!area) return { legacyArgs: args };
  let cursor = 2;
  let when = true;
  let range: CoreSpiritVisualRange | undefined;
  if (typeof args[cursor] === 'boolean') { when = Boolean(args[cursor]); cursor += 1; }
  if (isCoreSpiritVisualRange(args[cursor])) { range = args[cursor] as CoreSpiritVisualRange; cursor += 1; }
  const color = typeof args[cursor] === 'string' ? args[cursor] : undefined;
  if (color !== undefined) cursor += 1;
  const width = typeof args[cursor] === 'number' ? args[cursor] : undefined;
  if (width !== undefined) cursor += 1;
  const title = typeof args[cursor] === 'string' ? args[cursor] : undefined;
  const placement = coreSpiritPlacement(area, 'time', { visible: when, range });
  return { placement, legacyArgs: [args[0], color, width, undefined, title] };
}
