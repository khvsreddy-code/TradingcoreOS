import { CoreSpiritIrProgram } from './ir';

export type CoreSpiritExecutableArtifact = {
  format: 'coreSpirit-ir';
  version: 1;
  sourceId: string;
  checksum: string;
  instructionCount: number;
  maxLookback: number;
  ir: CoreSpiritIrProgram;
};

/** Stable, dependency-free checksum for cache keys and deterministic artifact identity. */
export function coreSpiritChecksum(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function makeExecutableArtifact(ir: CoreSpiritIrProgram): CoreSpiritExecutableArtifact {
  return {
    format: 'coreSpirit-ir', version: 1, sourceId: ir.sourceId,
    checksum: coreSpiritChecksum(ir), instructionCount: ir.entry.instructions.length,
    maxLookback: ir.maxLookback, ir,
  };
}

export function validateExecutableArtifact(artifact: unknown): artifact is CoreSpiritExecutableArtifact {
  const a = artifact as CoreSpiritExecutableArtifact;
  return Boolean(a && a.format === 'coreSpirit-ir' && a.version === 1 && a.ir?.version === 1 &&
    a.checksum === coreSpiritChecksum(a.ir) && Number.isInteger(a.instructionCount) &&
    a.instructionCount === a.ir.entry.instructions.length && Number.isInteger(a.maxLookback) && a.maxLookback >= 0);
}
