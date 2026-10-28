import type { CoreSpiritObject } from '../../coreSpirit/types';
import { CORE_SPIRIT_VISUAL_ABI_VERSION, CORE_SPIRIT_VELA_COORDINATE_SYSTEM } from './coreSpiritVisualAbi';
import { registerRendererLayer, type RendererLayerArgs } from '../../../../vendor/vela/src/renderers/native/layers';

export const CORE_SPIRIT_VELA_OUTPUT_LAYER_ID = 'tco-corespirit-output';
export const CORE_SPIRIT_VELA_OUTPUT_UNDERLAY_LAYER_ID = 'tco-corespirit-output-underlay';

export type CoreSpiritVelaOutputLayerData = Readonly<{
  /** Legacy frame revision retained for Vela's layer contract. */
  revision: number;
  schemaVersion: typeof CORE_SPIRIT_VISUAL_ABI_VERSION;
  scriptInstanceId: string;
  datasetRevision: number;
  outputRevision: number;
  coordinateSystem: typeof CORE_SPIRIT_VELA_COORDINATE_SYSTEM;
  paneId: string;
  layerRole: 'underlay' | 'overlay';
  visible: boolean;
  drawings: readonly CoreSpiritObject[];
  visuals: readonly CoreSpiritObject[];
  labels: readonly CoreSpiritObject[];
  tables: readonly CoreSpiritObject[];
}>;

function objectValue(value: unknown): Record<string, any> | undefined {
  return value && typeof value === 'object' ? value as Record<string, any> : undefined;
}

function timeMillis(value: unknown): number {
  if (value == null || value === '') return Number.NaN;
  const numeric = typeof value === 'number' ? value : Number(value);
  // Output normalization occurs before a visual reaches this layer. Do not guess
  // seconds vs milliseconds during every paint; that is how mixed-unit shifts survive.
  if (!Number.isFinite(numeric) || Math.abs(numeric) < 100_000_000_000) return Number.NaN;
  return numeric;
}

function timeX(args: RendererLayerArgs, value: unknown): number | null {
  const time = timeMillis(value);
  if (!Number.isFinite(time)) return null;
  const x = args.coords.timeToX(time);
  return Number.isFinite(x) ? x : null;
}

function priceY(args: RendererLayerArgs, value: unknown): number | null {
  const price = Number(value);
  if (!Number.isFinite(price)) return null;
  const y = args.coords.priceToY(price, args.scale, args.bounds);
  return Number.isFinite(y) ? y : null;
}

type MappedPoint = Readonly<{ x: number; y: number }>;

/** Use Vela's shared transforms for time/bar/price, with explicit pixel-space support. */
function visualPoint(args: RendererLayerArgs, raw: unknown): MappedPoint | null {
  const point = objectValue(raw);
  if (!point) return null;
  const x = Number(point.x), y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const space = String(point.space ?? 'time');
  let px: number | null, py: number | null;
  if (space === 'screen') {
    px = x; py = y;
  } else if (space === 'normalized') {
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    px = x * args.coords.width; py = y * args.coords.height;
  } else if (space === 'percentage') {
    if (x < 0 || x > 100 || y < 0 || y > 100) return null;
    px = x * args.coords.width / 100; py = y * args.coords.height / 100;
  } else if (space === 'bar') {
    px = args.coords.logicalToX(x); py = priceY(args, y);
  } else if (space === 'time' || space === 'price') {
    px = timeX(args, x); py = priceY(args, y);
  } else {
    return null;
  }
  if (px == null || py == null || !Number.isFinite(px) || !Number.isFinite(py)) return null;
  return { x: px, y: py };
}

function canvasWidth(args: RendererLayerArgs): number {
  return Math.max(0, args.coords.width);
}

function alpha(ctx: CanvasRenderingContext2D, value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
}

function color(style: Record<string, any>, fallback = '#9b8aff'): string {
  return String(style.color ?? style.fillColor ?? fallback);
}

function drawRect(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, obj: Record<string, any>): void {
  const viewport = obj.domain === 'viewport';
  const left = viewport ? 0 : timeX(args, obj.left);
  const right = viewport ? canvasWidth(args) : timeX(args, obj.right);
  const top = priceY(args, obj.top);
  const bottom = priceY(args, obj.bottom);
  if (left == null || right == null || top == null || bottom == null) return;
  const x = Math.min(left, right), y = Math.min(top, bottom);
  const width = Math.abs(right - left), height = Math.abs(bottom - top);
  const st = objectValue(obj.style) ?? {};
  const opacity = alpha(ctx, st.fillOpacity ?? st.opacity ?? 0.14);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = String(st.fillColor ?? st.color ?? '#2563eb');
  ctx.fillRect(x, y, width, height);
  ctx.restore();
  const border = st.borderColor ?? st.color;
  if (border) {
    ctx.save();
    ctx.globalAlpha = alpha(ctx, st.opacity);
    ctx.strokeStyle = String(border);
    ctx.lineWidth = Math.max(1, Number(st.borderWidth ?? st.lineWidth ?? 1));
    ctx.setLineDash(st.lineStyle === 1 ? [6, 4] : st.lineStyle === 2 ? [2, 3] : []);
    ctx.strokeRect(x, y, width, height);
    ctx.restore();
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, obj: Record<string, any>): void {
  const x1 = timeX(args, obj.start?.time), y1 = priceY(args, obj.start?.price);
  const x2 = timeX(args, obj.end?.time), y2 = priceY(args, obj.end?.price);
  if (x1 == null || y1 == null || x2 == null || y2 == null) return;
  const st = objectValue(obj.style) ?? {};
  const stroke = color(st);
  const width = Math.max(1, Math.min(8, Number(st.lineWidth ?? 2)));
  const head = Math.max(5, width * 3);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = stroke; ctx.fillStyle = stroke; ctx.lineWidth = width;
  ctx.globalAlpha = alpha(ctx, st.opacity);
  ctx.setLineDash(st.lineStyle === 1 ? [6, 4] : st.lineStyle === 2 ? [2, 3] : []);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawShape(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, obj: Record<string, any>): void {
  const x = timeX(args, obj.time), y = priceY(args, obj.price);
  if (x == null || y == null) return;
  const st = objectValue(obj.style) ?? {};
  const kind = String(obj.shape ?? st.shape ?? 'circle');
  const radius = Math.max(2, Math.min(18, Number(st.size ?? 6)));
  ctx.save();
  ctx.globalAlpha = alpha(ctx, st.opacity);
  ctx.fillStyle = String(st.fillColor ?? st.background ?? st.color ?? '#9b8aff');
  ctx.strokeStyle = String(st.borderColor ?? st.color ?? '#9b8aff');
  ctx.lineWidth = Math.max(1, Number(st.borderWidth ?? st.lineWidth ?? 1));
  ctx.beginPath();
  if (kind === 'square') ctx.rect(x - radius, y - radius, radius * 2, radius * 2);
  else if (kind === 'diamond') { ctx.moveTo(x, y - radius * 1.3); ctx.lineTo(x + radius, y); ctx.lineTo(x, y + radius * 1.3); ctx.lineTo(x - radius, y); ctx.closePath(); }
  else if (['triangleUp', 'triangleDown', 'triangleup', 'triangledown', 'arrowUp', 'arrowDown'].includes(kind)) {
    const isDown = kind.toLowerCase().includes('down');
    if (kind === 'arrowUp' || kind === 'arrowDown') {
      const direction = isDown ? 1 : -1;
      ctx.moveTo(x, y + direction * radius * 1.45);
      ctx.lineTo(x + radius * 0.72, y + direction * radius * 0.2);
      ctx.lineTo(x + radius * 0.28, y + direction * radius * 0.2);
      ctx.lineTo(x + radius * 0.28, y - direction * radius);
      ctx.lineTo(x - radius * 0.28, y - direction * radius);
      ctx.lineTo(x - radius * 0.28, y + direction * radius * 0.2);
      ctx.lineTo(x - radius * 0.72, y + direction * radius * 0.2);
      ctx.closePath();
    } else {
      const sign = isDown ? 1 : -1;
      ctx.moveTo(x, y + sign * radius);
      ctx.lineTo(x + radius, y - sign * radius);
      ctx.lineTo(x - radius, y - sign * radius);
      ctx.closePath();
    }
  } else if (kind === 'cross') {
    ctx.moveTo(x - radius, y); ctx.lineTo(x + radius, y);
    ctx.moveTo(x, y - radius); ctx.lineTo(x, y + radius);
  } else if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const pointRadius = i % 2 ? radius * 0.45 : radius;
      const px = x + Math.cos(angle) * pointRadius, py = y + Math.sin(angle) * pointRadius;
      if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (kind === 'cross') ctx.stroke(); else { ctx.fill(); ctx.stroke(); }
  const text = String(st.text ?? obj.text ?? '');
  if (text) {
    ctx.font = `${st.fontStyle === 'italic' ? 'italic ' : ''}${st.fontWeight ?? '600'} ${Math.max(8, Number(st.fontSize ?? 10))}px ${st.fontFamily ?? 'sans-serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = String(st.textColor ?? '#fff');
    ctx.fillText(text, x, y + radius + 9);
  }
  ctx.restore();
}

function drawPolyline(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, obj: Record<string, any>, closed = false): void {
  const points = Array.isArray(obj.points) ? obj.points : [];
  if (points.length < 2) return;
  const mapped = points.map((point: Record<string, any>) => ({
    x: timeX(args, point.time ?? point.x),
    y: priceY(args, point.price ?? point.y),
  }));
  if (mapped.some(p => p.x == null || p.y == null)) return;
  const st = objectValue(obj.style) ?? {};
  ctx.save(); ctx.strokeStyle = color(st); ctx.lineWidth = Math.max(1, Math.min(8, Number(st.lineWidth ?? 2)));
  ctx.globalAlpha = alpha(ctx, st.opacity);
  ctx.setLineDash(st.lineStyle === 1 ? [6, 4] : st.lineStyle === 2 ? [2, 3] : []);
  ctx.beginPath();
  ctx.moveTo(mapped[0]!.x!, mapped[0]!.y!);
  for (let i = 1; i < mapped.length; i++) ctx.lineTo(mapped[i]!.x!, mapped[i]!.y!);
  if (closed || obj.closed) {
    ctx.closePath();
    ctx.fillStyle = String(st.fillColor ?? 'rgba(155,138,255,0.12)');
    ctx.fill();
  }
  ctx.stroke(); ctx.restore();
}

function drawHLine(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, obj: Record<string, any>): void {
  const y = priceY(args, obj.price);
  if (y == null) return;
  const st = objectValue(obj.style) ?? {};
  ctx.save(); ctx.strokeStyle = color(st); ctx.lineWidth = Math.max(1, Number(st.lineWidth ?? 1));
  ctx.globalAlpha = alpha(ctx, st.opacity);
  ctx.setLineDash(st.lineStyle === 1 ? [6, 4] : st.lineStyle === 2 ? [2, 3] : []);
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasWidth(args), y); ctx.stroke();
  if (st.text) {
    ctx.setLineDash([]); ctx.fillStyle = color(st); ctx.font = '11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(String(st.text), 4, y - 2);
  }
  ctx.restore();
}

function drawBarTint(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, obj: Record<string, any>): void {
  const x = timeX(args, obj.time);
  if (x == null) return;
  const st = objectValue(obj.style) ?? {};
  const explicitRight = obj.kind === 'background' && obj.metadata?.endTime != null
    ? timeX(args, obj.metadata.endTime)
    : null;
  const width = Math.max(1, args.coords.pxPerBar());
  const left = explicitRight == null ? x - width / 2 : Math.min(x, explicitRight);
  const right = explicitRight == null ? x + width / 2 : Math.max(x, explicitRight);
  ctx.save();
  ctx.globalAlpha = alpha(ctx, obj.opacity ?? st.opacity ?? 0.18);
  ctx.fillStyle = String(obj.color ?? st.fillColor ?? st.color ?? 'rgba(56,189,248,0.12)');
  ctx.fillRect(left, 0, Math.max(1, right - left), args.coords.height);
  ctx.restore();
}

function drawBands(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, bands: readonly Record<string, any>[]): void {
  const grouped = new Map<string, Record<string, any>[]>();
  for (const band of bands) {
    const key = String(band.id ?? 'band');
    const list = grouped.get(key) ?? [];
    list.push(band);
    grouped.set(key, list);
  }
  for (const items of grouped.values()) {
    items.sort((a, b) => timeMillis(a.time) - timeMillis(b.time));
    const mapped = items.flatMap(item => {
      const x = timeX(args, item.time);
      const top = item.top == null ? null : priceY(args, item.top);
      const bottom = item.bottom == null ? null : priceY(args, item.bottom);
      return x == null || top == null || bottom == null ? [] : [{ x, top, bottom, item }];
    });
    if (!mapped.length) continue;
    const style = objectValue(mapped[0]!.item.style) ?? {};
    if (mapped.length === 1) {
      const point = mapped[0]!;
      const width = Math.max(1, args.coords.pxPerBar());
      ctx.save();
      ctx.globalAlpha = alpha(ctx, style.fillOpacity ?? style.opacity ?? 0.18);
      ctx.fillStyle = String(style.fillColor ?? style.color ?? '#60a5fa');
      ctx.fillRect(point.x - width / 2, Math.min(point.top, point.bottom), width, Math.abs(point.top - point.bottom));
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.beginPath();
    mapped.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.top) : ctx.lineTo(point.x, point.top));
    for (let index = mapped.length - 1; index >= 0; index--) ctx.lineTo(mapped[index]!.x, mapped[index]!.bottom);
    ctx.closePath();
    const ys = mapped.flatMap(point => [point.top, point.bottom]);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    if (style.fillColor2 && style.fillColor && maxY > minY) {
      const gradient = ctx.createLinearGradient(0, minY, 0, maxY);
      gradient.addColorStop(0, String(style.fillColor));
      gradient.addColorStop(1, String(style.fillColor2));
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = String(style.fillColor ?? style.color ?? '#60a5fa');
    ctx.globalAlpha = alpha(ctx, style.fillOpacity ?? style.opacity ?? 0.18);
    ctx.fill();
    ctx.globalAlpha = alpha(ctx, style.opacity);
    ctx.strokeStyle = String(style.color ?? style.fillColor ?? '#60a5fa');
    ctx.lineWidth = Math.max(1, Number(style.lineWidth ?? 1));
    ctx.beginPath();
    mapped.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.top) : ctx.lineTo(point.x, point.top));
    ctx.stroke();
    ctx.beginPath();
    mapped.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.bottom) : ctx.lineTo(point.x, point.bottom));
    ctx.stroke();
    ctx.restore();
  }
}

function drawFootprint(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, obj: Record<string, any>): void {
  const x = timeX(args, obj.time);
  const rows = Array.isArray(obj.rows) ? obj.rows : [];
  if (x == null || !rows.length) return;
  const width = Math.max(5, Math.min(36, args.coords.bodySpacing() || 8));
  const maximum = Math.max(1, ...rows.map((row: Record<string, any>) => Number(row.totalVolume ?? (Number(row.buyVolume) + Number(row.sellVolume)) ?? 0)));
  const rowHeight = Math.max(2, Math.min(9, width / Math.max(1, Math.min(rows.length, 7))));
  ctx.save();
  for (const row of rows) {
    const y = priceY(args, row.price);
    if (y == null) continue;
    const buy = Math.max(0, Number(row.buyVolume ?? 0));
    const sell = Math.max(0, Number(row.sellVolume ?? 0));
    const total = Math.max(1, buy + sell);
    const h = rowHeight;
    ctx.fillStyle = '#16a34a'; ctx.globalAlpha = 0.18 + 0.72 * buy / total;
    ctx.fillRect(x - width, y - h / 2, width * Math.max(0.04, buy / maximum), h);
    ctx.fillStyle = '#dc2626'; ctx.globalAlpha = 0.18 + 0.72 * sell / total;
    ctx.fillRect(x, y - h / 2, width * Math.max(0.04, sell / maximum), h);
    ctx.globalAlpha = 0.95; ctx.fillStyle = String((args.theme as any).foreground ?? '#fff');
    ctx.font = '9px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(String(Math.round(buy - sell)), x + width * Math.max(0.04, sell / maximum) + 2, y);
  }
  const poc = Number(obj.poc);
  if (Number.isFinite(poc)) { const y = priceY(args, poc); if (y != null) { ctx.globalAlpha = 0.9; ctx.strokeStyle = '#facc15'; ctx.beginPath(); ctx.moveTo(x - width, y); ctx.lineTo(x + width, y); ctx.stroke(); } }
  ctx.restore();
}

function labelPadding(style: Record<string, any>): { x: number; y: number } {
  const explicitX = Number(style.paddingX), explicitY = Number(style.paddingY);
  if (Number.isFinite(explicitX) || Number.isFinite(explicitY)) {
    return {
      x: Math.max(0, Math.min(40, Number.isFinite(explicitX) ? explicitX : 6)),
      y: Math.max(0, Math.min(40, Number.isFinite(explicitY) ? explicitY : 3)),
    };
  }
  const raw = style.padding;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const value = Math.max(0, Math.min(40, raw));
    return { x: value, y: value };
  }
  if (typeof raw === 'string') {
    const values = raw.trim().split(/\\s+/).map(value => Number.parseFloat(value));
    if (values.length && values.every(Number.isFinite)) {
      const y = Math.max(0, Math.min(40, values[0]!));
      const x = Math.max(0, Math.min(40, values[1] ?? y));
      return { x, y };
    }
  }
  return { x: 6, y: 3 };
}

function drawLabel(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, obj: Record<string, any>): void {
  const x = timeX(args, obj.time), y = priceY(args, obj.price);
  if (x == null || y == null) return;
  const st = objectValue(obj.style) ?? {};
  const fontSize = Math.max(8, Math.min(32, Number(st.fontSize ?? 12)));
  const padding = labelPadding(st);
  ctx.save();
  ctx.font = `${st.fontStyle === 'italic' ? 'italic ' : ''}${st.fontWeight ?? '600'} ${fontSize}px ${st.fontFamily ?? 'sans-serif'}`;
  ctx.textAlign = st.textAlign === 'left' ? 'left' : st.textAlign === 'right' ? 'right' : 'center';
  ctx.textBaseline = 'middle';
  const text = String(obj.text ?? '');
  const metrics = ctx.measureText(text);
  const width = metrics.width + padding.x * 2, height = fontSize + padding.y * 2;
  const offset = obj.position === 'above' ? -height / 2 - 6 : obj.position === 'below' ? height / 2 + 6 : 0;
  const left = ctx.textAlign === 'left' ? x : ctx.textAlign === 'right' ? x - width : x - width / 2;
  ctx.globalAlpha = alpha(ctx, st.opacity);
  ctx.fillStyle = String(st.background ?? '#2563eb');
  if (st.shape === 'pill' && typeof ctx.roundRect === 'function') {
    ctx.beginPath(); ctx.roundRect(left, y + offset - height / 2, width, height, height / 2); ctx.fill();
  } else {
    ctx.fillRect(left, y + offset - height / 2, width, height);
  }
  ctx.strokeStyle = String(st.borderColor ?? st.border ?? 'rgba(255,255,255,0.18)');
  ctx.lineWidth = 1;
  if (st.shape === 'pill' && typeof ctx.roundRect === 'function') {
    ctx.beginPath(); ctx.roundRect(left, y + offset - height / 2, width, height, height / 2); ctx.stroke();
  } else {
    ctx.strokeRect(left, y + offset - height / 2, width, height);
  }
  ctx.fillStyle = String(st.color ?? st.textColor ?? '#fff');
  ctx.fillText(text, ctx.textAlign === 'left' ? left + padding.x : ctx.textAlign === 'right' ? left + width - padding.x : x, y + offset);
  ctx.restore();
}

function drawTables(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, tables: readonly Record<string, any>[]): void {
  if (!tables.length) return;
  const grouped = new Map<string, Record<string, any>[]>();
  for (const table of tables) { const list = grouped.get(String(table.position)) ?? []; list.push(table); grouped.set(String(table.position), list); }
  const margin = 8;
  for (const [position, cells] of grouped) {
    const columns = Math.max(0, ...cells.map(cell => Number(cell.column ?? 0)));
    const rows = Math.max(0, ...cells.map(cell => Number(cell.row ?? 0)));
    const fontSize = Math.max(8, ...cells.map(cell => Number(cell.style?.fontSize ?? 11)));
    ctx.save(); ctx.font = `${fontSize}px ${cells.some(cell => cell.style?.fontWeight === 'bold') ? 'sans-serif' : 'monospace'}`;
    const widths = Array.from({ length: columns + 1 }, (_, col) => Math.max(24, ...cells.filter(cell => Number(cell.column) === col).map(cell => ctx.measureText(String(cell.text ?? '')).width + 12)));
    const rowHeight = fontSize + 10;
    const totalWidth = widths.reduce((sum, value) => sum + value, 0), totalHeight = (rows + 1) * rowHeight;
    let left = position.endsWith('Right') ? canvasWidth(args) - totalWidth - margin : position.endsWith('Center') ? (canvasWidth(args) - totalWidth) / 2 : margin;
    let top = position.startsWith('bottom') ? args.coords.height - totalHeight - margin : position.startsWith('middle') ? (args.coords.height - totalHeight) / 2 : margin;
    const background = String(cells[0]?.style?.background ?? 'rgba(15,23,42,0.88)');
    ctx.fillStyle = background; ctx.globalAlpha = 0.96; ctx.fillRect(left, top, totalWidth, totalHeight);
    ctx.strokeStyle = String(cells[0]?.style?.border ?? 'rgba(255,255,255,0.14)'); ctx.strokeRect(left, top, totalWidth, totalHeight);
    for (const cell of cells) {
      const col = Math.max(0, Math.floor(Number(cell.column ?? 0))), row = Math.max(0, Math.floor(Number(cell.row ?? 0)));
      const x = left + widths.slice(0, col).reduce((sum, value) => sum + value, 0);
      const y = top + row * rowHeight;
      ctx.fillStyle = String(cell.style?.color ?? '#fff');
      ctx.font = `${cell.style?.fontWeight ?? '500'} ${fontSize}px sans-serif`;
      ctx.textAlign = cell.style?.align === 'right' ? 'right' : cell.style?.align === 'center' ? 'center' : 'left';
      ctx.textBaseline = 'middle';
      const tx = ctx.textAlign === 'left' ? x + 6 : ctx.textAlign === 'right' ? x + widths[col]! - 6 : x + widths[col]! / 2;
      ctx.fillText(String(cell.text ?? ''), tx, y + rowHeight / 2, Math.max(8, widths[col]! - 12));
    }
    ctx.restore();
  }
}

function drawMappedShape(ctx: CanvasRenderingContext2D, point: MappedPoint, style: Record<string, any>): void {
  const radius = Math.max(2, Math.min(18, Number(style.size ?? 6)));
  const kind = String(style.shape ?? 'circle');
  ctx.save();
  ctx.globalAlpha = alpha(ctx, style.opacity);
  ctx.fillStyle = String(style.fillColor ?? style.background ?? style.color ?? '#9b8aff');
  ctx.strokeStyle = String(style.borderColor ?? style.color ?? '#9b8aff');
  ctx.lineWidth = Math.max(1, Number(style.borderWidth ?? style.lineWidth ?? 1));
  ctx.beginPath();
  if (kind === 'square') ctx.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  else if (kind === 'diamond') { ctx.moveTo(point.x, point.y - radius * 1.3); ctx.lineTo(point.x + radius, point.y); ctx.lineTo(point.x, point.y + radius * 1.3); ctx.lineTo(point.x - radius, point.y); ctx.closePath(); }
  else if (kind === 'cross') { ctx.moveTo(point.x - radius, point.y); ctx.lineTo(point.x + radius, point.y); ctx.moveTo(point.x, point.y - radius); ctx.lineTo(point.x, point.y + radius); }
  else ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  if (kind === 'cross') ctx.stroke(); else { ctx.fill(); ctx.stroke(); }
  ctx.restore();
}

function drawMappedLine(ctx: CanvasRenderingContext2D, from: MappedPoint, to: MappedPoint, style: Record<string, any>): void {
  ctx.save();
  ctx.strokeStyle = String(style.color ?? '#9b8aff');
  ctx.lineWidth = Math.max(1, Math.min(8, Number(style.lineWidth ?? 2)));
  ctx.globalAlpha = alpha(ctx, style.opacity);
  ctx.setLineDash(style.lineStyle === 1 ? [6, 4] : style.lineStyle === 2 ? [2, 3] : []);
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.restore();
}

function drawCustomVisual(ctx: CanvasRenderingContext2D, args: RendererLayerArgs, obj: Record<string, any>): void {
  const geometry = objectValue(obj.geometry);
  if (!geometry) return;
  const style = objectValue(obj.style) ?? {};
  if (geometry.kind === 'point') {
    const point = visualPoint(args, geometry.point);
    if (point) drawMappedShape(ctx, point, style);
  } else if (geometry.kind === 'line' || geometry.kind === 'box') {
    const from = visualPoint(args, geometry.from), to = visualPoint(args, geometry.to);
    if (!from || !to) return;
    if (geometry.kind === 'line') drawMappedLine(ctx, from, to, style);
    else {
      const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
      const width = Math.abs(to.x - from.x), height = Math.abs(to.y - from.y);
      ctx.save();
      ctx.globalAlpha = alpha(ctx, style.fillOpacity ?? style.opacity ?? 0.14);
      ctx.fillStyle = String(style.fillColor ?? style.color ?? '#2563eb');
      ctx.fillRect(x, y, width, height);
      ctx.globalAlpha = alpha(ctx, style.opacity);
      ctx.strokeStyle = String(style.borderColor ?? style.color ?? '#2563eb');
      ctx.lineWidth = Math.max(1, Number(style.borderWidth ?? style.lineWidth ?? 1));
      ctx.strokeRect(x, y, width, height);
      ctx.restore();
    }
  } else if (geometry.kind === 'polygon' && Array.isArray(geometry.points)) {
    const points = geometry.points.map((point: unknown) => visualPoint(args, point));
    if (points.length < 3 || points.some(point => point == null)) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0]!.x, points[0]!.y);
    for (let index = 1; index < points.length; index++) ctx.lineTo(points[index]!.x, points[index]!.y);
    ctx.closePath();
    ctx.fillStyle = String(style.fillColor ?? 'rgba(155,138,255,0.12)');
    ctx.globalAlpha = alpha(ctx, style.fillOpacity ?? style.opacity ?? 0.12);
    ctx.fill();
    ctx.globalAlpha = alpha(ctx, style.opacity);
    ctx.strokeStyle = String(style.color ?? style.borderColor ?? '#9b8aff');
    ctx.lineWidth = Math.max(1, Number(style.lineWidth ?? 1));
    ctx.stroke();
    ctx.restore();
  }
}

export function paintCoreSpiritVelaOutputLayer(
  ctx: CanvasRenderingContext2D,
  args: RendererLayerArgs,
  data: CoreSpiritVelaOutputLayerData,
): void {
  ctx.save();
  ctx.setTransform(args.coords.dpr, 0, 0, args.coords.dpr, 0, 0);
  ctx.clearRect(0, 0, canvasWidth(args), args.coords.height);
  // Explicit pane-local clip: oversized zone/footprint/custom geometry can never
  // bleed into the time axis, price scale or a neighboring pane.
  ctx.beginPath();
  ctx.rect(0, 0, canvasWidth(args), Math.max(0, args.coords.height));
  ctx.clip();

  const allVisuals = [...data.drawings, ...data.visuals] as readonly Record<string, any>[];
  if (data.layerRole === 'underlay') {
    // Range fills live below the data canvas; candles and native price lines keep
    // their natural contrast instead of being covered by a same-z overlay canvas.
    for (const obj of allVisuals) {
      if (obj.kind === 'background' || obj.kind === 'barcolor') drawBarTint(ctx, args, obj);
      else if (obj.kind === 'zone' && obj.domain === 'viewport') drawRect(ctx, args, obj);
    }
    drawBands(ctx, args, data.visuals.filter((item): item is Extract<CoreSpiritObject, { kind: 'band' }> => item.kind === 'band') as readonly Record<string, any>[]);
    ctx.restore();
    return;
  }

  // The overlay layer contains only detailed objects that belong above the data
  // canvas: footprint/market structure geometry and custom authored primitives.
  for (const obj of allVisuals) {
    if (obj.kind === 'background' || obj.kind === 'barcolor' || obj.kind === 'band' ||
        (obj.kind === 'zone' && obj.domain === 'viewport')) continue;
    if (obj.kind === 'line') continue; // ordinary lines are Vela-native drawing collections
    if (obj.kind === 'zone' || obj.kind === 'box') drawRect(ctx, args, obj);
    else if (obj.kind === 'arrow') drawArrow(ctx, args, obj);
    else if (obj.kind === 'shape') drawShape(ctx, args, obj);
    else if (obj.kind === 'polyline' || obj.kind === 'polygon') drawPolyline(ctx, args, obj, obj.kind === 'polygon');
    else if (obj.kind === 'hline') drawHLine(ctx, args, obj);
    else if (obj.kind === 'footprint') drawFootprint(ctx, args, obj);
    else if (obj.kind === 'customVisual') drawCustomVisual(ctx, args, obj);
  }
  for (const label of data.labels) drawLabel(ctx, args, label as unknown as Record<string, any>);
  drawTables(ctx, args, data.tables as readonly Record<string, any>[]);
  ctx.restore();
}

function registerCoreSpiritVelaOutputLayer(
  id: string,
  placement: 'below-data' | 'above-data',
  layerRole: 'underlay' | 'overlay',
): void {
  registerRendererLayer({
    id,
    placement,
    create() {
      let canvas: HTMLCanvasElement | undefined;
      return {
        mount(nextCanvas: HTMLCanvasElement) { canvas = nextCanvas; },
        render(args: RendererLayerArgs) {
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const data = args.data as CoreSpiritVelaOutputLayerData | undefined;
          if (!data ||
              data.schemaVersion !== CORE_SPIRIT_VISUAL_ABI_VERSION ||
              data.coordinateSystem !== CORE_SPIRIT_VELA_COORDINATE_SYSTEM ||
              typeof data.scriptInstanceId !== 'string' || !data.scriptInstanceId.trim() ||
              !Number.isSafeInteger(data.datasetRevision) || data.datasetRevision < 0 ||
              !Number.isSafeInteger(data.outputRevision) || data.outputRevision < 0 ||
              !Number.isSafeInteger(data.revision) || data.revision < 0 ||
              typeof data.paneId !== 'string' || !data.paneId.trim() ||
              data.layerRole !== layerRole ||
              data.visible !== true) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
          }
          paintCoreSpiritVelaOutputLayer(ctx, args, data);
        },
        destroy() { canvas = undefined; },
      };
    },
  });
}

registerCoreSpiritVelaOutputLayer(CORE_SPIRIT_VELA_OUTPUT_LAYER_ID, 'above-data', 'overlay');
registerCoreSpiritVelaOutputLayer(CORE_SPIRIT_VELA_OUTPUT_UNDERLAY_LAYER_ID, 'below-data', 'underlay');
