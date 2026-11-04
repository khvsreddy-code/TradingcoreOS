/**
 * Bounded first-class CoreScript collection operations.
 *
 * Values stay inside the existing CoreSpirit VM value lane. No prototype
 * reflection, arbitrary property access, native code or host I/O is exposed.
 */
import {
  coreSpiritMatrixAdd,
  coreSpiritMatrixMultiply,
  coreSpiritMatrixScale,
  coreSpiritMatrixTranspose,
  coreSpiritVectorDot,
} from './quantMath';

export const CORE_SCRIPT_MAX_COLLECTION_LENGTH = 16_384;

type MatrixLike = Readonly<{ kind?:string; rows:number; columns:number; data:Float64Array }>;
type VectorLike = Readonly<{ kind?:string; length:number; data:Float64Array }>;

function checkedIndex(value: unknown, length: number, label: string): number {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= length) {
    throw new Error(`${label} index ${String(value)} is outside [0, ${Math.max(0, length - 1)}]`);
  }
  return index;
}

function isMatrix(value: unknown): value is MatrixLike {
  return !!value && typeof value === 'object' &&
    (value as MatrixLike).kind === 'matrix' &&
    Number.isInteger((value as MatrixLike).rows) &&
    Number.isInteger((value as MatrixLike).columns) &&
    (value as MatrixLike).data instanceof Float64Array;
}

function isVector(value: unknown): value is VectorLike {
  return !!value && typeof value === 'object' &&
    (value as VectorLike).kind === 'vector' &&
    Number.isInteger((value as VectorLike).length) &&
    (value as VectorLike).data instanceof Float64Array;
}

export function createCoreScriptArray(values: readonly unknown[]): unknown[] {
  if (values.length > CORE_SCRIPT_MAX_COLLECTION_LENGTH) throw new Error('CoreScript array exceeds the 16,384 element limit');
  return [...values];
}

export function createCoreScriptMap(entries: readonly unknown[]): Map<string, unknown> {
  if (entries.length % 2 !== 0) throw new Error('CoreScript map expects alternating string keys and values');
  if (entries.length / 2 > CORE_SCRIPT_MAX_COLLECTION_LENGTH) throw new Error('CoreScript map exceeds the 16,384 entry limit');
  const result = new Map<string, unknown>();
  for (let index = 0; index < entries.length; index += 2) {
    const key = entries[index];
    if (typeof key !== 'string' || !key.length) throw new Error('CoreScript map keys must be non-empty strings');
    if (result.has(key)) throw new Error(`CoreScript map contains duplicate key '${key}'`);
    result.set(key, entries[index + 1]);
  }
  return result;
}

export function coreScriptCollectionIndex(target: unknown, indexValue: unknown): unknown {
  if (Array.isArray(target)) return target[checkedIndex(indexValue, target.length, 'array')] ?? null;
  if (target instanceof Map) return target.get(String(indexValue)) ?? null;
  if (typeof target === 'string') return target[checkedIndex(indexValue, target.length, 'string')] ?? null;
  if (isVector(target)) return target.data[checkedIndex(indexValue, target.length, 'vector')] ?? null;
  if (isMatrix(target)) {
    const row = checkedIndex(indexValue, target.rows, 'matrix row');
    const values = new Array<number>(target.columns);
    for (let column = 0; column < target.columns; column += 1) values[column] = target.data[row * target.columns + column]!;
    return values;
  }
  throw new Error('Indexing requires an array, map, string, vector or matrix value');
}

export function coreScriptCollectionMember(target: unknown, member: string): unknown {
  if (Array.isArray(target)) {
    if (member === 'length' || member === 'size') return target.length;
    if (member === 'first') return target.length ? target[0] : null;
    if (member === 'last') return target.length ? target[target.length - 1] : null;
  }
  if (target instanceof Map) {
    if (member === 'size' || member === 'length') return target.size;
  }
  if (typeof target === 'string' && member === 'length') return target.length;
  if (isMatrix(target)) {
    if (member === 'rows') return target.rows;
    if (member === 'columns' || member === 'cols') return target.columns;
  }
  if (isVector(target) && member === 'length') return target.length;
  throw new Error(`Collection value does not expose member '${member}'`);
}

export function coreScriptCollectionMethod(target: unknown, method: string, args: readonly unknown[]): unknown {
  if (Array.isArray(target)) {
    switch (method) {
      case 'push': {
        if (target.length + args.length > CORE_SCRIPT_MAX_COLLECTION_LENGTH) throw new Error('CoreScript array exceeds the 16,384 element limit');
        target.push(...args);
        return target.length;
      }
      case 'pop': return target.pop() ?? null;
      case 'shift': return target.shift() ?? null;
      case 'unshift': {
        if (target.length + args.length > CORE_SCRIPT_MAX_COLLECTION_LENGTH) throw new Error('CoreScript array exceeds the 16,384 element limit');
        target.unshift(...args);
        return target.length;
      }
      case 'get': return coreScriptCollectionIndex(target, args[0]);
      case 'set': {
        const index = checkedIndex(args[0], target.length, 'array');
        target[index] = args[1];
        return args[1];
      }
      case 'includes': return target.includes(args[0]);
      case 'indexOf': return target.indexOf(args[0]);
      case 'slice': {
        const start = Math.max(0, Math.floor(Number(args[0] ?? 0)));
        const end = args[1] === undefined ? target.length : Math.max(start, Math.floor(Number(args[1])));
        return target.slice(start, end);
      }
    }
  }

  if (target instanceof Map) {
    const key = String(args[0] ?? '');
    switch (method) {
      case 'get': return target.get(key) ?? null;
      case 'set':
        if (!target.has(key) && target.size >= CORE_SCRIPT_MAX_COLLECTION_LENGTH) throw new Error('CoreScript map exceeds the 16,384 entry limit');
        target.set(key, args[1]);
        return args[1];
      case 'has': return target.has(key);
      case 'delete': return target.delete(key);
      case 'keys': return [...target.keys()];
      case 'values': return [...target.values()];
      case 'entries': return [...target.entries()].map(([entryKey, value]) => [entryKey, value]);
    }
  }

  if (isMatrix(target)) {
    switch (method) {
      case 'get': {
        const row = checkedIndex(args[0], target.rows, 'matrix row');
        const column = checkedIndex(args[1], target.columns, 'matrix column');
        return target.data[row * target.columns + column] ?? null;
      }
      case 'transpose': return coreSpiritMatrixTranspose(target);
      case 'scale': return coreSpiritMatrixScale(target, args[0]);
      case 'add': return coreSpiritMatrixAdd(target, args[0]);
      case 'multiply': return coreSpiritMatrixMultiply(target, args[0]);
    }
  }

  if (isVector(target) && method === 'dot') return coreSpiritVectorDot(target, args[0]);
  throw new Error(`Method '${method}' is not available for this CoreScript collection`);
}
