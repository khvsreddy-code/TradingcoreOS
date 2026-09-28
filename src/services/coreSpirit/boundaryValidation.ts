import type { CoreSpiritObject } from './types';

const CORE_SPIRIT_OUTPUT_KINDS = new Set([
  'series','marker','label','line','zone','box','band','arrow','shape','polyline','hline',
  'background','barcolor','table','footprint','signal','event','orderIntent','scanCandidate','polygon','customVisual',
]);

export function isCoreSpiritOutput(value: unknown): value is CoreSpiritObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.kind === 'string' && CORE_SPIRIT_OUTPUT_KINDS.has(row.kind) && Number.isFinite(Number(row.time));
}

export function requireCoreSpiritOutputs(value: unknown): CoreSpiritObject[] {
  if (!Array.isArray(value) || !value.every(isCoreSpiritOutput)) throw new Error('Invalid CoreSpirit worker output payload');
  return value;
}
