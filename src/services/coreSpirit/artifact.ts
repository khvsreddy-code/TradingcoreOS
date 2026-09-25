import { CoreSpiritIrProgram } from './ir';
import { CORE_SPIRIT_IR_FORMAT, CORE_SPIRIT_IR_VERSION, validateCoreSpiritIr, serializeCoreSpiritIr } from './irContract';

export type CoreSpiritExecutableArtifact = {
  format: typeof CORE_SPIRIT_IR_FORMAT;
  version: typeof CORE_SPIRIT_IR_VERSION;
  sourceId: string;
  checksum: string;
  instructionCount: number;
  maxLookback: number;
  ir: CoreSpiritIrProgram;
};

/** Stable, dependency-free checksum for cache keys and deterministic artifact identity. */
export function coreSpiritChecksum(value: unknown): string {
  const text = typeof value === 'object' && value !== null ? JSON.stringify(value) : JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function makeExecutableArtifact(ir: CoreSpiritIrProgram): CoreSpiritExecutableArtifact {
  return {
    format: CORE_SPIRIT_IR_FORMAT, version: CORE_SPIRIT_IR_VERSION, sourceId: ir.sourceId,
    checksum: coreSpiritChecksum(serializeCoreSpiritIr(ir)), instructionCount: ir.entry.instructions.length,
    maxLookback: ir.maxLookback, ir,
  };
}

export function validateExecutableArtifact(artifact: unknown): artifact is CoreSpiritExecutableArtifact {
  const a = artifact as CoreSpiritExecutableArtifact;
  return Boolean(a && a.format === CORE_SPIRIT_IR_FORMAT && a.version === CORE_SPIRIT_IR_VERSION && validateCoreSpiritIr(a.ir) &&
    a.checksum === coreSpiritChecksum(serializeCoreSpiritIr(a.ir)) && Number.isInteger(a.instructionCount) &&
    a.instructionCount === a.ir.entry.instructions.length && Number.isInteger(a.maxLookback) && a.maxLookback >= 0);
}
