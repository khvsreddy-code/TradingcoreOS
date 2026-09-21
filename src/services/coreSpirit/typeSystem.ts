export type CoreSpiritType =
  | 'number'
  | 'boolean'
  | 'string'
  | 'null'
  | 'series<number>'
  | 'series<boolean>'
  | 'series<string>'
  | 'unknown';

export const isNumericType = (type: CoreSpiritType) => type === 'number' || type === 'series<number>';
export const isBooleanType = (type: CoreSpiritType) => type === 'boolean' || type === 'series<boolean>';
export const isStringType = (type: CoreSpiritType) => type === 'string' || type === 'series<string>';

export function compatible(expected: CoreSpiritType, actual: CoreSpiritType): boolean {
  if (expected === 'unknown' || actual === 'unknown' || expected === actual) return true;
  if (expected === 'number' && actual === 'series<number>') return true;
  if (expected === 'boolean' && actual === 'series<boolean>') return true;
  if (expected === 'string' && actual === 'series<string>') return true;
  if (expected === 'null' && actual !== 'string') return true;
  return false;
}

export function joinTypes(a: CoreSpiritType, b: CoreSpiritType): CoreSpiritType {
  if (a === b) return a;
  if (a === 'null') return b;
  if (b === 'null') return a;
  if (a === 'number' && b === 'series<number>') return 'series<number>';
  if (b === 'number' && a === 'series<number>') return 'series<number>';
  if (a === 'boolean' && b === 'series<boolean>') return 'series<boolean>';
  if (b === 'boolean' && a === 'series<boolean>') return 'series<boolean>';
  return 'unknown';
}
