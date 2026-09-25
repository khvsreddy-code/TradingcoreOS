/**
 * CoreSpirit's static type algebra.
 *
 * Runtime values are still represented by JavaScript numbers/strings/booleans,
 * but the compiler keeps the distinction between a value on the current bar
 * and a historical series. `number` remains a compatibility alias for the
 * numeric scalar family used by the existing v1 IR.
 */
export type CoreSpiritScalarType =
  | 'int'
  | 'float'
  | 'number'
  | 'boolean'
  | 'string'
  | 'null';

export type CoreSpiritType =
  | CoreSpiritScalarType
  | 'series<int>'
  | 'series<float>'
  | 'series<number>'
  | 'series<boolean>'
  | 'series<string>'
  | `array<${string}>`
  | `udt:${string}`
  | 'unknown';

export type CoreSpiritNumericScalar = 'int' | 'float' | 'number';
export type CoreSpiritSeriesType =
  | 'series<int>'
  | 'series<float>'
  | 'series<number>'
  | 'series<boolean>'
  | 'series<string>';

export const isNumericScalarType = (type: CoreSpiritType): type is CoreSpiritNumericScalar =>
  type === 'int' || type === 'float' || type === 'number';

export const isSeriesType = (type: CoreSpiritType): type is CoreSpiritSeriesType =>
  type.startsWith('series<') && type.endsWith('>');

export const isNumericType = (type: CoreSpiritType): boolean =>
  isNumericScalarType(type) ||
  type === 'series<int>' ||
  type === 'series<float>' ||
  type === 'series<number>';

export const isBooleanType = (type: CoreSpiritType): boolean =>
  type === 'boolean' || type === 'series<boolean>';

export const isStringType = (type: CoreSpiritType): boolean =>
  type === 'string' || type === 'series<string>';

export const isNullableType = (type: CoreSpiritType): boolean =>
  type === 'null' || type === 'unknown' || type.endsWith('>');

export function seriesOf(type: CoreSpiritType): CoreSpiritType {
  if (type === 'int' || type === 'float' || type === 'number') return `series<${type}>` as CoreSpiritType;
  if (type === 'boolean' || type === 'string') return `series<${type}>` as CoreSpiritType;
  if (isSeriesType(type)) return type;
  return 'unknown';
}

export function elementType(type: CoreSpiritType): CoreSpiritType {
  if (!isSeriesType(type)) return 'unknown';
  return type.slice('series<'.length, -1) as CoreSpiritType;
}

export function normalizeDeclaredType(typeName: string): CoreSpiritType {
  const name = typeName.trim();
  if (name === 'bool' || name === 'boolean') return 'boolean';
  if (name === 'float') return 'float';
  if (name === 'int') return 'int';
  if (name === 'number') return 'number';
  if (name === 'string') return 'string';
  if (name === 'null' || name === 'na') return 'null';
  if (name === 'series<float>') return 'series<float>';
  if (name === 'series<int>') return 'series<int>';
  if (name === 'series<number>') return 'series<number>';
  if (name === 'series<boolean>') return 'series<boolean>';
  if (name === 'series<string>') return 'series<string>';
  if (name.startsWith('array<') && name.endsWith('>')) return name as CoreSpiritType;
  return `udt:${name}`;
}

/**
 * `number` is intentionally a broad numeric scalar type. It preserves the
 * existing public API while allowing explicitly declared `int`/`float` values.
 */
export function compatible(expected: CoreSpiritType, actual: CoreSpiritType): boolean {
  if (expected === 'unknown' || actual === 'unknown') return true;
  if (expected === actual) return true;

  // Missing values can flow through typed calculations; runtime represents
  // them as null and chart output treats them as warm-up whitespace.
  if (actual === 'null') return true;

  if (expected === 'number') return isNumericType(actual);
  if (expected === 'float') return actual === 'int' || actual === 'float' || actual === 'number';
  if (expected === 'series<number>') return actual === 'series<int>' || actual === 'series<float>' || actual === 'series<number>';
  if (expected === 'series<float>') return actual === 'series<int>' || actual === 'series<float>' || actual === 'series<number>';

  // Builtins such as plot/signal accept the current-bar value produced from a
  // series expression. This is a deliberate scalar-from-series coercion.
  if (expected === 'boolean') return actual === 'series<boolean>';
  if (expected === 'string') return actual === 'series<string>';

  if (expected === 'series<boolean>') return actual === 'boolean';
  if (expected === 'series<string>') return actual === 'string';
  if (expected === 'series<int>') return actual === 'int';

  return false;
}

export function joinTypes(a: CoreSpiritType, b: CoreSpiritType): CoreSpiritType {
  if (a === 'null') return b;
  if (b === 'null') return a;
  if (a === b) return a;

  const aSeries = isSeriesType(a);
  const bSeries = isSeriesType(b);
  if (aSeries || bSeries) {
    const ae = aSeries ? elementType(a) : a;
    const be = bSeries ? elementType(b) : b;
    const joined = joinScalarTypes(ae, be);
    return joined === 'unknown' ? 'unknown' : seriesOf(joined);
  }

  return joinScalarTypes(a, b);
}

function joinScalarTypes(a: CoreSpiritType, b: CoreSpiritType): CoreSpiritType {
  if (a === 'null') return b;
  if (b === 'null') return a;
  if (a === b) return a;

  if (isNumericScalarType(a) && isNumericScalarType(b)) {
    if (a === 'number' || b === 'number') return 'number';
    return 'float';
  }

  if ((a === 'boolean' && b === 'boolean') || (a === 'string' && b === 'string')) return a;
  return 'unknown';
}

export function isAssignable(expected: CoreSpiritType, actual: CoreSpiritType): boolean {
  return compatible(expected, actual);
}
