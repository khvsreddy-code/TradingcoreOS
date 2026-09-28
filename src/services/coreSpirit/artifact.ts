import { CoreSpiritIrProgram } from './ir';
import { CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION } from './VERSION';
import { buildCoreSpiritArtifactIdentity, type CoreSpiritArtifactIdentity } from './artifactIdentity';
import { CORE_SPIRIT_IR_FORMAT, CORE_SPIRIT_IR_VERSION, validateCoreSpiritIr, serializeCoreSpiritIr } from './irContract';

export type CoreSpiritExecutableArtifact = {
  schemaVersion: typeof CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION;
  format: typeof CORE_SPIRIT_IR_FORMAT;
  version: typeof CORE_SPIRIT_IR_VERSION;
  sourceId: string;
  checksum: string;
  instructionCount: number;
  maxLookback: number;
  ir: CoreSpiritIrProgram;
};

function canonicalCoreSpiritJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalCoreSpiritJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalCoreSpiritJson(object[key])}`).join(',')}}`;
}

/** Stable, dependency-free canonical checksum for fast local cache keys. */
export function coreSpiritChecksum(value: unknown): string {
  const text = canonicalCoreSpiritJson(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}


export function makeExecutableArtifact(ir: CoreSpiritIrProgram): CoreSpiritExecutableArtifact {
  return {
    schemaVersion: CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION,
    format: CORE_SPIRIT_IR_FORMAT, version: CORE_SPIRIT_IR_VERSION, sourceId: ir.sourceId,
    checksum: coreSpiritChecksum(serializeCoreSpiritIr(ir)), instructionCount: ir.entry.instructions.length,
    maxLookback: ir.maxLookback, ir,
  };
}

export async function makeExecutableArtifactIdentity(ir: CoreSpiritIrProgram, source = ''): Promise<CoreSpiritArtifactIdentity> {
  return buildCoreSpiritArtifactIdentity(ir, source);
}

export function validateExecutableArtifact(artifact: unknown): artifact is CoreSpiritExecutableArtifact {
  const a = artifact as CoreSpiritExecutableArtifact;
  return Boolean(a && (Number(a.schemaVersion) === 1 || a.schemaVersion === CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION) && a.format === CORE_SPIRIT_IR_FORMAT && a.version === CORE_SPIRIT_IR_VERSION && validateCoreSpiritIr(a.ir) &&
    a.checksum === coreSpiritChecksum(serializeCoreSpiritIr(a.ir)) && Number.isInteger(a.instructionCount) &&
    a.instructionCount === a.ir.entry.instructions.length && Number.isInteger(a.maxLookback) && a.maxLookback >= 0);
}
