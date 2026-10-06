import { CoreSpiritIrProgram } from './ir';
import { CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION } from './VERSION';
import { buildCoreSpiritArtifactIdentity, type CoreSpiritArtifactIdentity } from './artifactIdentity';
import {
  buildCoreSpiritArtifactAbi,
  type CoreSpiritArtifactAbi,
} from './artifactAbi';
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
  abi: CoreSpiritArtifactAbi;
};

export type CoreSpiritArtifactBuildContext = Readonly<{
  source?: string;
  normalizedSource?: string;
  semanticFingerprint?: string;
}>;

function canonicalCoreSpiritJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalCoreSpiritJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalCoreSpiritJson(object[key])}`).join(',')}}`;
}

/** Legacy fast checksum retained for compatibility with old worker/artifact callers. */
export function coreSpiritChecksum(value: unknown): string {
  const text = canonicalCoreSpiritJson(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function makeExecutableArtifact(
  ir: CoreSpiritIrProgram,
  context: CoreSpiritArtifactBuildContext = {},
): CoreSpiritExecutableArtifact {
  const identity = buildCoreSpiritArtifactIdentity(
    ir,
    context.source ?? '',
    context.normalizedSource ?? context.source ?? '',
    context.semanticFingerprint ?? '',
  );
  const abi = buildCoreSpiritArtifactAbi(ir, identity);

  return {
    schemaVersion: CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION,
    format: CORE_SPIRIT_IR_FORMAT,
    version: CORE_SPIRIT_IR_VERSION,
    sourceId: ir.sourceId,
    checksum: coreSpiritChecksum(serializeCoreSpiritIr(ir)),
    instructionCount: ir.entry.instructions.length,
    maxLookback: ir.maxLookback,
    ir,
    abi,
  };
}

export function makeCoreSpiritProgramArtifactIdentity(
  ir: CoreSpiritIrProgram,
  source = '',
  normalizedSource = source,
  semanticFingerprint = '',
): Promise<CoreSpiritArtifactIdentity> {
  return buildCoreSpiritArtifactIdentity(ir, source, normalizedSource, semanticFingerprint) as unknown as Promise<CoreSpiritArtifactIdentity>;
}

export function validateExecutableArtifact(artifact: unknown): artifact is CoreSpiritExecutableArtifact {
  const a = artifact as CoreSpiritExecutableArtifact & { abi?: unknown };
  const structural = Boolean(
    a &&
    (Number(a.schemaVersion) === 1 || Number(a.schemaVersion) === CORE_SPIRIT_ARTIFACT_SCHEMA_VERSION) &&
    a.format === CORE_SPIRIT_IR_FORMAT &&
    a.version === CORE_SPIRIT_IR_VERSION &&
    validateCoreSpiritIr(a.ir) &&
    a.checksum === coreSpiritChecksum(serializeCoreSpiritIr(a.ir)) &&
    Number.isInteger(a.instructionCount) &&
    a.instructionCount === a.ir.entry.instructions.length &&
    Number.isInteger(a.maxLookback) &&
    a.maxLookback >= 0,
  );
  if (!structural) return false;
  return a.abi ? validateCoreSpiritArtifactAbi(a.abi, a.ir) : Number(a.schemaVersion) === 1;
}

export function artifactIdentityFromArtifact(artifact: CoreSpiritExecutableArtifact): CoreSpiritArtifactIdentity | undefined {
  if (!artifact.abi) return undefined;
  return Object.freeze({
    version: 1,
    algorithm: 'SHA-256',
    sourceId: artifact.sourceId,
    sourceHash: artifact.abi.sourceHash,
    normalizedHash: artifact.abi.normalizedHash,
    semanticHash: artifact.abi.semanticHash,
    programHash: artifact.abi.programHash,
    irHash: artifact.abi.irHash,
    artifactHash: artifact.abi.artifactHash,
  });
}
