/**
 * Deterministic Pine v6 string built-ins.
 * Inputs and outputs are bounded by Pine's documented 40,960-character limit.
 */
const PINE_MAX_STRING_LENGTH = 40_960;
const PINE_MAX_SPLIT_ITEMS = 16_384;
type PineStringExecution = Readonly<{ handled: boolean; value?: unknown }>;

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new TypeError(name + ' expects a string argument');
  if (value.length > PINE_MAX_STRING_LENGTH) throw new RangeError(name + ' exceeds Pine string length limit');
  return value;
}
function boundedString(value: string, name: string): string {
  if (value.length > PINE_MAX_STRING_LENGTH) throw new RangeError(name + ' result exceeds Pine string length limit');
  return value;
}
function defaultNumberString(value: number): string {
  if (!Number.isFinite(value)) return Number.isNaN(value) ? 'na' : value > 0 ? 'Infinity' : '-Infinity';
  if (Object.is(value, -0)) return '0';
  return String(Number(value.toFixed(8)));
}
function formatNumber(value: number, pattern: string): string {
  if (!Number.isFinite(value)) return defaultNumberString(value);
  const percent = pattern.endsWith('%');
  const body = percent ? pattern.slice(0, -1) : pattern;
  if (!/[#0]/.test(body)) throw new Error('Unsupported Pine number format pattern: ' + pattern);
  const decimal = body.includes('.') ? body.slice(body.lastIndexOf('.') + 1) : '';
  const digits = decimal.replace(/[^#0]/g, '');
  const maximumFractionDigits = Math.min(20, digits.length);
  const minimumFractionDigits = Math.min(maximumFractionDigits, (digits.match(/0/g) ?? []).length);
  const integerPattern = body.split('.')[0] ?? '';
  return new Intl.NumberFormat('en-US', {
    useGrouping: integerPattern.includes(','),
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(percent ? value * 100 : value) + (percent ? '%' : '');
}
function pineStringify(value: unknown): string {
  if (value == null) return 'na';
  if (typeof value === 'string') return boundedString(value, 'str.tostring');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return defaultNumberString(value);
  if (Array.isArray(value)) return '[' + value.map(pineStringify).join(', ') + ']';
  if (value instanceof Map) return '{' + [...value.entries()].map(([key,item]) => pineStringify(key) + '=' + pineStringify(item)).join(', ') + '}';
  return String(value);
}
function formatPineString(format: string, values: readonly unknown[]): string {
  const openBrace = '\u0001';
  const closeBrace = '\u0002';
  const shielded = format.replace(/'\{/g, openBrace).replace(/\}'/g, closeBrace);
  const output = shielded.replace(/\{(\d+)(?:,number,([^}]+))?\}/g, (_match, rawIndex: string, numberPattern?: string) => {
    const index = Number(rawIndex);
    if (!Number.isSafeInteger(index) || index < 0 || index >= values.length) {
      throw new RangeError('str.format placeholder index ' + rawIndex + ' has no matching argument');
    }
    const value = values[index];
    if (numberPattern !== undefined) {
      if (typeof value !== 'number') throw new TypeError('str.format number placeholder requires a numeric value');
      return formatNumber(value, numberPattern);
    }
    return pineStringify(value);
  }).replaceAll(openBrace, '{').replaceAll(closeBrace, '}');
  return boundedString(output, 'str.format');
}
function execute(name: string, args: readonly unknown[]): unknown {
  switch (name) {
    case 'pine.str.length': return Array.from(requireString(args[0], name)).length;
    case 'pine.str.lower': return boundedString(requireString(args[0], name).toLowerCase(), name);
    case 'pine.str.upper': return boundedString(requireString(args[0], name).toUpperCase(), name);
case 'pine.str.trim': return boundedString(requireString(args[0], name).trim(), name);
    case 'pine.str.substring': {
      const source = Array.from(requireString(args[0], name));
      const rawStart = Number(args[1]);
      const rawEnd = args[2] === undefined ? source.length : Number(args[2]);
      if (!Number.isInteger(rawStart) || !Number.isInteger(rawEnd)) throw new TypeError(name + ' indexes must be integers');
      const start = Math.max(0, Math.min(source.length, rawStart));
      const end = Math.max(start, Math.min(source.length, rawEnd));
      return boundedString(source.slice(start, end).join(''), name);
    }
    case 'pine.str.replace':
    case 'pine.str.replace_all': {
      const source = requireString(args[0], name);
      const target = requireString(args[1], name);
      const replacement = requireString(args[2], name);
      if (target.length === 0) return source;
      return boundedString(name === 'pine.str.replace' ? source.replace(target, replacement) : source.split(target).join(replacement), name);
    }
    case 'pine.str.split': {
      const parts = requireString(args[0], name).split(requireString(args[1], name));
      if (parts.length > PINE_MAX_SPLIT_ITEMS) throw new RangeError(name + ' exceeds Pine collection length limit');
      return parts.map(part => boundedString(part, name));
    }
    case 'pine.str.contains': return requireString(args[0], name).includes(requireString(args[1], name));
    case 'pine.str.startswith': return requireString(args[0], name).startsWith(requireString(args[1], name));
    case 'pine.str.endswith': return requireString(args[0], name).endsWith(requireString(args[1], name));
    case 'pine.str.pos': {
      const source = requireString(args[0], name);
      const index = source.indexOf(requireString(args[1], name));
      return index < 0 ? null : Array.from(source.slice(0, index)).length;
    }
    case 'pine.str.repeat': {
      const source = requireString(args[0], name);
      const count = Number(args[1]);
      const separator = args[2] === undefined ? '' : requireString(args[2], name);
      if (!Number.isSafeInteger(count) || count < 0) throw new RangeError(name + ' repeat count must be a non-negative integer');
      if (count === 0 || source.length === 0) return '';
      const projected = source.length * count + separator.length * Math.max(0, count - 1);
      if (!Number.isSafeInteger(projected) || projected > PINE_MAX_STRING_LENGTH) throw new RangeError(name + ' result exceeds Pine string length limit');
      return boundedString(new Array(count).fill(source).join(separator), name);
    }
    case 'pine.str.tonumber': {
      const source = requireString(args[0], name);
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(source)) return null;
      const value = Number(source);
      return Number.isFinite(value) ? value : null;
    }
    case 'pine.str.tostring': {
      const value = args[0];
      if (typeof value === 'number' && typeof args[1] === 'string') return boundedString(formatNumber(value, args[1]), name);
      return boundedString(pineStringify(value), name);
    }
    case 'pine.str.format': return formatPineString(requireString(args[0], name), args.slice(1));
    default: return undefined;
  }
}
const PINE_STRING_BUILTINS = new Set([
  'pine.str.length','pine.str.lower','pine.str.upper','pine.str.trim','pine.str.substring',
  'pine.str.replace','pine.str.replace_all','pine.str.split','pine.str.contains',
  'pine.str.startswith','pine.str.endswith','pine.str.pos','pine.str.repeat',
  'pine.str.tonumber','pine.str.tostring','pine.str.format',
]);
export function executeCoreSpiritPineStringBuiltin(name: string, args: readonly unknown[]): PineStringExecution {
  if (!PINE_STRING_BUILTINS.has(name)) return Object.freeze({ handled: false });
  return Object.freeze({ handled: true, value: execute(name,args) });
}
