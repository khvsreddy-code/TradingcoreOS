import type { CoreSpiritObject } from './types';

const CORE_SPIRIT_OUTPUT_KINDS = new Set([
  'series','marker','label','line','zone','box','band','arrow','shape','polyline','hline',
  'background','barcolor','table','footprint','signal','event','orderIntent','scanCandidate','polygon','customVisual',
]);

type OutputRecord = Record<string, unknown>;

function isRecord(value: unknown): value is OutputRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function optionalFinite(record: OutputRecord, key: string): boolean {
  return record[key] === undefined || finite(record[key]);
}

function nullableFinite(value: unknown): boolean {
  return value === null || finite(value);
}

function hasTime(record: OutputRecord): boolean {
  return finite(record.time);
}

function hasPricePoint(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return finite(value.time) && finite(value.price);
}

function hasRectangle(record: OutputRecord): boolean {
  // Viewport-anchored zones intentionally use +Infinity for the right edge so
  // they span the current chart width. Reject NaN/-Infinity and all other
  // non-finite coordinates; only that explicit domain contract permits it.
  const validRight = finite(record.right) ||
    (record.domain === 'viewport' && record.right === Number.POSITIVE_INFINITY);
  return finite(record.left) && validRight && finite(record.top) && finite(record.bottom);
}

function hasPoints(record: OutputRecord): boolean {
  return Array.isArray(record.points) && record.points.every(point =>
    isRecord(point) && finite(point.time) && finite(point.price),
  );
}

/**
 * Validate the shape documented by each CoreSpirit output kind.
 *
 * Not every drawable is anchored by a top-level `time`: lines use start/end,
 * zones and boxes use left/right/top/bottom, and tables use row/column. Requiring
 * a universal time field rejected valid output from indicators that emit drawings.
 */
export function isCoreSpiritOutput(value: unknown): value is CoreSpiritObject {
  if (!isRecord(value) || typeof value.kind !== 'string' || !CORE_SPIRIT_OUTPUT_KINDS.has(value.kind)) return false;
  const row = value;

  switch (row.kind) {
    case 'series':
      return hasTime(row) && (row.value === null || finite(row.value)) &&
        optionalString(row, 'name') && optionalString(row, 'seriesId');
    case 'marker':
      return hasTime(row) && finite(row.price);
    case 'label':
      return hasTime(row) && finite(row.price) && typeof row.id === 'string' &&
        typeof row.text === 'string' && ['above', 'below', 'inBar', 'price'].includes(String(row.position));
    case 'line':
    case 'arrow':
      return hasPricePoint(row.start) && hasPricePoint(row.end);
    case 'zone':
    case 'box':
      return hasRectangle(row);
    case 'band':
      return hasTime(row) && nullableFinite(row.top) && nullableFinite(row.bottom);
    case 'shape':
      return hasTime(row) && finite(row.price) && typeof row.shape === 'string';
    case 'polyline':
      return typeof row.id === 'string' && hasPoints(row);
    case 'polygon':
      return typeof row.id === 'string' && hasPoints(row) && isRecord(row.geometry);
    case 'hline':
      return typeof row.id === 'string' && finite(row.price);
    case 'background':
    case 'barcolor':
      return hasTime(row) && typeof row.color === 'string' && optionalFinite(row, 'opacity');
    case 'table':
      return typeof row.id === 'string' &&
        ['topLeft','topCenter','topRight','middleLeft','middleCenter','middleRight','bottomLeft','bottomCenter','bottomRight'].includes(String(row.position)) &&
        finite(row.row) && finite(row.column) && typeof row.text === 'string';
    case 'footprint':
      return hasTime(row) && Array.isArray(row.rows) && finite(row.tickSize) && row.tickSize > 0;
    case 'signal':
      return hasTime(row) && typeof row.type === 'string';
    case 'event':
      return hasTime(row) && typeof row.id === 'string' && typeof row.name === 'string';
    case 'orderIntent':
      return hasTime(row) && typeof row.id === 'string' &&
        ['long', 'short', 'flat'].includes(String(row.side)) && finite(row.confidence);
    case 'scanCandidate':
      return typeof row.id === 'string' && optionalFinite(row, 'time') &&
        optionalFinite(row, 'score') && (row.label === undefined || typeof row.label === 'string');
    case 'customVisual':
      return typeof row.id === 'string' && isRecord(row.geometry) && optionalFinite(row, 'time');
    default:
      return false;
  }
}

function optionalString(record: OutputRecord, key: string): boolean {
  return record[key] === undefined || typeof record[key] === 'string';
}

function invalidOutputReason(value: unknown): string {
  if (!isRecord(value)) return 'expected an output object';
  if (typeof value.kind !== 'string') return 'missing string kind';
  if (!CORE_SPIRIT_OUTPUT_KINDS.has(value.kind)) return `unsupported output kind '${value.kind}'`;
  const row = value;
  switch (row.kind) {
    case 'series':
      if (!hasTime(row)) return 'time must be a finite number';
      if (!(row.value === null || finite(row.value))) return 'value must be a finite number or null';
      if (!optionalString(row, 'name') || !optionalString(row, 'seriesId')) return 'name and seriesId must be strings when present';
      break;
    case 'line':
    case 'arrow':
      if (!hasPricePoint(row.start)) return 'start must contain finite time and price numbers';
      if (!hasPricePoint(row.end)) return 'end must contain finite time and price numbers';
      break;
    case 'zone':
    case 'box':
      if (!finite(row.left)) return 'left must be finite';
      if (!(finite(row.right) || (row.domain === 'viewport' && row.right === Number.POSITIVE_INFINITY))) return 'right must be finite (or +Infinity only for domain=viewport)';
      if (!finite(row.top)) return 'top must be finite';
      if (!finite(row.bottom)) return 'bottom must be finite';
      break;
    case 'label':
      if (!hasTime(row)) return 'time must be finite';
      if (!finite(row.price)) return 'price must be finite';
      if (typeof row.id !== 'string') return 'id must be a string';
      if (typeof row.text !== 'string') return 'text must be a string';
      if (!['above', 'below', 'inBar', 'price'].includes(String(row.position))) return 'position must be above, below, inBar, or price';
      break;
    case 'polyline':
    case 'polygon':
      if (typeof row.id !== 'string') return 'id must be a string';
      if (!hasPoints(row)) return 'points must be an array of finite {time, price} points';
      if (row.kind === 'polygon' && !isRecord(row.geometry)) return 'polygon geometry must be an object';
      break;
    default:
      return `fields do not satisfy the ${row.kind} output contract`;
  }
  return `fields do not satisfy the ${row.kind} output contract`;
}

export function requireCoreSpiritOutputs(value: unknown): CoreSpiritObject[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid CoreSpirit worker output payload: expected an array, received ${value === null ? 'null' : typeof value}`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const output = value[index];
    if (!isCoreSpiritOutput(output)) {
      const kind = isRecord(output) && typeof output.kind === 'string' ? ` (${output.kind})` : '';
      throw new Error(`Invalid CoreSpirit worker output payload at output[${index}]${kind}: ${invalidOutputReason(output)}`);
    }
  }
  return value as CoreSpiritObject[];
}
