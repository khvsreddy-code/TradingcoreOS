import type { CoreSpiritIrProgram } from './ir';
import { serializeCoreSpiritIr } from './irContract';

export const CORE_SPIRIT_ARTIFACT_IDENTITY_VERSION = 1 as const;

export type CoreSpiritArtifactIdentity = Readonly<{
  version: typeof CORE_SPIRIT_ARTIFACT_IDENTITY_VERSION;
  algorithm: 'SHA-256';
  sourceId: string;
  sourceHash: string;
  irHash: string;
  artifactHash: string;
}>;

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buildCoreSpiritArtifactIdentity(ir: CoreSpiritIrProgram, source = ''): Promise<CoreSpiritArtifactIdentity> {
  const irSerialized = serializeCoreSpiritIr(ir);
  const irHash = await sha256Hex(irSerialized);
  const sourceHash = await sha256Hex(source);
  const artifactHash = await sha256Hex(`${ir.sourceId}\n${irHash}\n${sourceHash}`);
  return Object.freeze({
    version: CORE_SPIRIT_ARTIFACT_IDENTITY_VERSION,
    algorithm: 'SHA-256',
    sourceId: ir.sourceId,
    sourceHash,
    irHash,
    artifactHash,
  });
}
