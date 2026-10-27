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
  return finite(record.left) && finite(record.right) && finite(record.top) && finite(record.bottom);
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

export function requireCoreSpiritOutputs(value: unknown): CoreSpiritObject[] {
  if (!Array.isArray(value) || !value.every(isCoreSpiritOutput)) {
    throw new Error('Invalid CoreSpirit worker output payload');
  }
  return value;
}
