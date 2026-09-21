import { CoreDrawing, CoreDrawingPoint } from './coreDrawing';

export type ScreenPoint = { x: number; y: number };
export type CoordinateAdapter = {
  timeToX: (time: number) => number | null;
  priceToY: (price: number) => number | null;
  xToTime: (x: number) => number | null;
  yToPrice: (y: number) => number | null;
};
export type DrawingHandle = { drawingId: string; index: number; point: ScreenPoint };
export type DrawingHit = { drawingId: string; distance: number; handle?: DrawingHandle };

const dist = (a: ScreenPoint, b: ScreenPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (p: CoreDrawingPoint, c: CoordinateAdapter): ScreenPoint | null => {
  const x = c.timeToX(p.time), y = c.priceToY(p.price);
  return x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y) ? null : { x, y };
};
const segmentDistance = (p: ScreenPoint, a: ScreenPoint, b: ScreenPoint) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx + (p.y-a.y)*dy) / (dx*dx + dy*dy)));
  return dist(p, { x: a.x + t*dx, y: a.y + t*dy });
};

function segments(d: CoreDrawing, c: CoordinateAdapter): Array<[ScreenPoint, ScreenPoint]> {
  const p = d.points.map(x => point(x, c)).filter(Boolean) as ScreenPoint[];
  if (p.length < 2) return [];
  if (['trendline','arrow','priceRange','dateRange','measure','brush','highlighter'].includes(d.kind))
    return p.slice(1).map((x,i) => [p[i], x]);
  if (['rectangle','ellipse'].includes(d.kind)) return [[p[0],{x:p[1].x,y:p[0].y}],[{x:p[1].x,y:p[0].y},p[1]],[p[1],{x:p[0].x,y:p[1].y}],[{x:p[0].x,y:p[1].y},p[0]]];
  if (d.kind === 'parallelChannel' && p.length >= 3) return [[p[0],p[1]],[p[0],p[2]],[p[1],{x:p[1].x + (p[2].x-p[0].x),y:p[1].y+(p[2].y-p[0].y)}]];
  return [[p[0],p[1]]];
}

export function drawingHandles(drawing: CoreDrawing, adapter: CoordinateAdapter): DrawingHandle[] {
  return drawing.points.map((p,index) => {
    const screen = point(p, adapter);
    return screen ? { drawingId: drawing.id, index, point: screen } : null;
  }).filter(Boolean) as DrawingHandle[];
}

export function hitTestDrawing(drawing: CoreDrawing, cursor: ScreenPoint, adapter: CoordinateAdapter, tolerance = 8): DrawingHit | null {
  if (drawing.lifecycle !== 'active') return null;
  const handles = drawingHandles(drawing, adapter);
  const handle = handles.find(h => dist(h.point, cursor) <= tolerance);
  if (handle) return { drawingId: drawing.id, distance: dist(handle.point, cursor), handle };
  let best = Infinity;
  for (const [a,b] of segments(drawing, adapter)) best = Math.min(best, segmentDistance(cursor,a,b));
  return best <= tolerance ? { drawingId: drawing.id, distance: best } : null;
}

export function hitTestDrawings(drawings: CoreDrawing[], cursor: ScreenPoint, adapter: CoordinateAdapter, tolerance = 8): DrawingHit | null {
  let best: DrawingHit | null = null;
  for (let i = drawings.length - 1; i >= 0; i--) {
    const hit = hitTestDrawing(drawings[i], cursor, adapter, tolerance);
    if (hit && (!best || hit.distance < best.distance)) best = hit;
  }
  return best;
}

export function moveDrawingHandle(drawing: CoreDrawing, index: number, screen: ScreenPoint, adapter: CoordinateAdapter): CoreDrawing | null {
  const time = adapter.xToTime(screen.x), price = adapter.yToPrice(screen.y);
  if (time == null || price == null || !Number.isFinite(time) || !Number.isFinite(price) || index < 0 || index >= drawing.points.length) return null;
  const points = drawing.points.map((p,i) => i === index ? { time, price } : p);
  return { ...drawing, points, updatedAt: Date.now() };
}

export type SnapCandidate = { time: number; price: number; kind: 'ohlc' | 'candle' | 'manual' };

/** Snap a data coordinate to nearby candidates when they are within screen tolerance. */
export function snapDataPoint(point: CoreDrawingPoint, candidates: SnapCandidate[], adapter: CoordinateAdapter, tolerance = 8): CoreDrawingPoint {
  const px = adapter.timeToX(point.time), py = adapter.priceToY(point.price);
  if (px == null || py == null) return point;
  let best: {candidate: SnapCandidate; distance:number}|null=null;
  for(const candidate of candidates){
    const x=adapter.timeToX(candidate.time), y=adapter.priceToY(candidate.price);
    if(x==null||y==null)continue;
    const distance=Math.hypot(x-px,y-py);
    if(distance<=tolerance&&(!best||distance<best.distance))best={candidate,distance};
  }
  return best ? {time:best.candidate.time,price:best.candidate.price} : point;
}
