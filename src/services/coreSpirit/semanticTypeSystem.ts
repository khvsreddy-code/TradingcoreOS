/**
 * CoreSpirit semantic value types.
 *
 * `CoreSpiritType` remains the VM-compatible structural type system. This
 * companion algebra carries domain metadata so values such as price and volume
 * are not treated as interchangeable numbers by the compiler.
 */
export type CoreSpiritSemanticAtom =
  | 'number'
  | 'price'
  | 'volume'
  | 'time'
  | 'duration'
  | 'boolean'
  | 'string'
  | 'currency';

export const CORE_SPIRIT_SEMANTIC_SERIES_TYPES = Object.freeze(['series<number>', 'series<price>', 'series<volume>', 'series<time>', 'series<duration>', 'series<currency>', 'series<boolean>', 'series<string>'] as const);

export type CoreSpiritSemanticType = Readonly<{
  kind: 'scalar' | 'series';
  atom: CoreSpiritSemanticAtom;
  unit?: string;
  currency?: string;
  symbol?: string;
  timeframe?: string;
  precision?: number;
  scale?: 'linear' | 'log' | 'percent' | 'indexed';
}>;

export const semanticNumber = (kind: CoreSpiritSemanticType['kind'] = 'scalar', metadata: Omit<CoreSpiritSemanticType, 'kind' | 'atom'> = {}): CoreSpiritSemanticType =>
  Object.freeze({ kind, atom: 'number' as const, ...metadata });

export const semanticSeries = (atom: CoreSpiritSemanticAtom, metadata: Omit<CoreSpiritSemanticType, 'kind' | 'atom'> = {}): CoreSpiritSemanticType =>
  Object.freeze({ kind: 'series' as const, atom, ...metadata });

export const semanticScalar = (atom: CoreSpiritSemanticAtom, metadata: Omit<CoreSpiritSemanticType, 'kind' | 'atom'> = {}): CoreSpiritSemanticType =>
  Object.freeze({ kind: 'scalar' as const, atom, ...metadata });

export function isSemanticNumeric(type: CoreSpiritSemanticType | undefined): boolean {
  return Boolean(type && ['number', 'price', 'volume', 'currency', 'duration', 'time'].includes(type.atom));
}

export function semanticSeriesField(field: string, symbol = 'current', timeframe = 'chart'): CoreSpiritSemanticType {
  switch (field) {
    case 'open':
    case 'high':
    case 'low':
    case 'close':
      return semanticSeries('price', { unit: 'price', symbol, timeframe });
    case 'volume':
      return semanticSeries('volume', { unit: 'volume', symbol, timeframe });
    case 'time':
      return semanticSeries('time', { unit: 'timestamp', symbol, timeframe });
    default:
      return semanticSeries('number', { symbol, timeframe });
  }
}

export function scalarize(type: CoreSpiritSemanticType): CoreSpiritSemanticType {
  return Object.freeze({ ...type, kind: 'scalar' });
}

export function seriesize(type: CoreSpiritSemanticType): CoreSpiritSemanticType {
  return Object.freeze({ ...type, kind: 'series' });
}

/**
 * Semantic arithmetic. Scalar numbers broadcast over a series; domain-mixing
 * addition/subtraction is rejected rather than silently treating both values
 * as dimensionless JavaScript numbers.
 */
export function combineSemanticArithmetic(
  operator: '+' | '-' | '*' | '/' | '%',
  left: CoreSpiritSemanticType,
  right: CoreSpiritSemanticType,
): { type: CoreSpiritSemanticType; error?: string } {
  const resultKind: 'scalar' | 'series' = left.kind === 'series' || right.kind === 'series' ? 'series' : 'scalar';
  const broadcast = (atom: CoreSpiritSemanticAtom, metadata: CoreSpiritSemanticType = left): CoreSpiritSemanticType => Object.freeze({
    kind: resultKind,
    atom,
    unit: metadata.unit,
    currency: metadata.currency,
    symbol: metadata.symbol ?? (resultKind === 'series' ? 'current' : undefined),
    timeframe: metadata.timeframe ?? (resultKind === 'series' ? 'chart' : undefined),
    precision: metadata.precision,
    scale: metadata.scale,
  });
  const error = (message: string) => ({ type: semanticScalar('number'), error: message });

  if (['boolean', 'string'].includes(left.atom) || ['boolean', 'string'].includes(right.atom)) {
    return error(`operator '${operator}' cannot be applied to ${left.atom} and ${right.atom}`);
  }

  const leftNumber = left.atom === 'number';
  const rightNumber = right.atom === 'number';

  if (operator === '+' || operator === '-') {
    if (leftNumber) return { type: broadcast(right.atom, right) };
    if (rightNumber) return { type: broadcast(left.atom, left) };
    if (left.atom === 'time' || right.atom === 'time') {
      if (left.atom === 'time' && right.atom === 'duration') return { type: broadcast('time', left) };
      if (operator === '-' && left.atom === 'time' && right.atom === 'time') return { type: broadcast('duration', { ...left, unit: 'duration' }) };
      return error(`time can only add/subtract duration or subtract another time value`);
    }
    if (left.atom === right.atom) return { type: broadcast(left.atom, left) };
    return error(`semantic domains '${left.atom}' and '${right.atom}' cannot be combined with '${operator}'`);
  }

  if (operator === '*') {
    if (leftNumber) return { type: broadcast(right.atom, right) };
    if (rightNumber) return { type: broadcast(left.atom, left) };
    if ((left.atom === 'price' && right.atom === 'volume') || (left.atom === 'volume' && right.atom === 'price')) {
      return { type: Object.freeze({ kind: resultKind, atom: 'currency', unit: 'notional', symbol: left.symbol ?? right.symbol, timeframe: left.timeframe ?? right.timeframe, currency: left.currency ?? right.currency }) };
    }
    return error(`semantic domains '${left.atom}' and '${right.atom}' cannot be multiplied without an explicit conversion`);
  }

  if (operator === '/') {
    if (rightNumber) return { type: broadcast(left.atom, left) };
    if (leftNumber) return { type: broadcast('number', left) };
    if (left.atom === 'time' || right.atom === 'time') return error(`timestamp division is not a valid semantic operation`);
    if (left.atom === right.atom) return { type: broadcast('number', { ...left, unit: 'ratio' }) };
    if (left.atom === 'currency' && right.atom === 'price') return { type: broadcast('volume', left) };
    if (left.atom === 'currency' && right.atom === 'volume') return { type: broadcast('price', left) };
    return error(`semantic domains '${left.atom}' and '${right.atom}' cannot be divided without an explicit conversion`);
  }

  if (left.atom === right.atom || leftNumber || rightNumber) return { type: broadcast(leftNumber ? right.atom : left.atom, leftNumber ? right : left) };
  return error(`semantic domains '${left.atom}' and '${right.atom}' cannot be combined with '%'`);
}


export function compareSemanticTypes(
  operator: '==' | '!=' | '<' | '<=' | '>' | '>=',
  left: CoreSpiritSemanticType,
  right: CoreSpiritSemanticType,
): { compatible: boolean; error?: string } {
  if (left.atom === 'boolean' || right.atom === 'boolean' || left.atom === 'string' || right.atom === 'string') {
    if (operator === '==' || operator === '!=') {
      return { compatible: left.atom === right.atom };
    }
    return { compatible: false, error: `operator '${operator}' requires ordered numeric/time domains` };
  }
  if (left.atom === right.atom || left.atom === 'number' || right.atom === 'number') return { compatible: true };
  if ((left.atom === 'time' && right.atom === 'duration') || (left.atom === 'duration' && right.atom === 'time')) return { compatible: false, error: `cannot compare ${left.atom} and ${right.atom}; convert to a common domain first` };
  return { compatible: false, error: `semantic domains '${left.atom}' and '${right.atom}' cannot be compared with '${operator}'` };
}

export function semanticTypeCompatible(expected: CoreSpiritSemanticType, actual: CoreSpiritSemanticType): boolean {
  if (expected.kind !== actual.kind) return false;
  if (expected.atom !== actual.atom && expected.atom !== 'number' && actual.atom !== 'number') return false;
  if (expected.symbol && actual.symbol && expected.symbol !== actual.symbol) return false;
  if (expected.timeframe && actual.timeframe && expected.timeframe !== actual.timeframe) return false;
  return true;
}

export function semanticTypeForDeclaredName(name: string): CoreSpiritSemanticType | undefined {
  const normalized = name.trim().toLowerCase();
  const direct: Record<string, CoreSpiritSemanticType> = {
    number: semanticScalar('number'), float: semanticScalar('number'), int: semanticScalar('number'),
    boolean: semanticScalar('boolean'), bool: semanticScalar('boolean'), string: semanticScalar('string'),
    price: semanticScalar('price', { unit: 'price' }), volume: semanticScalar('volume', { unit: 'volume' }),
    time: semanticScalar('time', { unit: 'timestamp' }), duration: semanticScalar('duration', { unit: 'duration' }), currency: semanticScalar('currency', { unit: 'notional' }),
  };
  if (direct[normalized]) return direct[normalized];
  const match = normalized.match(/^series<(number|float|int|price|volume|time|duration|currency|boolean|string)>$/);
  if (!match) return undefined;
  const atom = match[1] === 'float' || match[1] === 'int' ? 'number' : match[1] as CoreSpiritSemanticAtom;
  return semanticSeries(atom, { unit: atom === 'price' ? 'price' : atom === 'volume' ? 'volume' : atom === 'time' ? 'timestamp' : atom === 'duration' ? 'duration' : atom === 'currency' ? 'notional' : undefined, symbol: 'current', timeframe: 'chart' });
}

export function semanticTypeToString(type: CoreSpiritSemanticType): string {
  const core = type.kind === 'series' ? `series<${type.atom}>` : type.atom;
  const metadata: string[] = [];
  if (type.symbol) metadata.push(`symbol=${type.symbol}`);
  if (type.timeframe) metadata.push(`tf=${type.timeframe}`);
  if (type.unit) metadata.push(`unit=${type.unit}`);
  if (type.currency) metadata.push(`currency=${type.currency}`);
  if (type.precision != null) metadata.push(`precision=${type.precision}`);
  if (type.scale) metadata.push(`scale=${type.scale}`);
  return metadata.length ? `${core} [${metadata.join(', ')}]` : core;
}
