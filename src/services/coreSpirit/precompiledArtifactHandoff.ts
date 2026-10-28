import { validateExecutableArtifact, type CoreSpiritExecutableArtifact } from './artifact';
import { sha256HexSync } from './artifactIdentity';

/**
 * Short-lived, one-shot handoff between the CoreSpirit dock's compiler and
 * Vela's scripting-engine prepare() call. Vela's public external-indicator
 * entry point persists source, not VM artifacts, so this cache deliberately
 * stays out of serialized chart/undo state.
 */
export type CoreSpiritPrecompiledArtifactIdentity = Readonly<{
  sourceHash: string;
  artifactHash: string;
}>;

type HandoffEntry = Readonly<{
  source: string;
  sourceHash: string;
  artifactHash: string;
  expiresAt: number;
  artifact: CoreSpiritExecutableArtifact;
}>;

const MAX_HANDOFFS = 16;
const HANDOFF_TTL_MS = 30_000;
const handoffs = new Map<string, HandoffEntry>();

function exactSourceHash(source: string): string {
  return sha256HexSync(String(source));
}

/** Stage only an integrity-checked artifact for the exact source that was compiled. */
export function stageCoreSpiritPrecompiledArtifact(
  source: string,
  artifact: CoreSpiritExecutableArtifact,
): CoreSpiritPrecompiledArtifactIdentity {
  const exactSource = String(source);
  if (!validateExecutableArtifact(artifact)) {
    throw new Error('CoreSpirit cannot hand off an invalid executable artifact.');
  }
  const sourceHash = exactSourceHash(exactSource);
  const artifactHash = artifact.abi?.artifactHash;
  if (!artifactHash || artifact.abi?.sourceHash !== sourceHash) {
    throw new Error('CoreSpirit compiled artifact does not match the exact editor source. Compile the current source again.');
  }

  // Replacing the same source hash makes the newest validated artifact win.
  handoffs.delete(sourceHash);
  handoffs.set(sourceHash, Object.freeze({
    source: exactSource,
    sourceHash,
    artifactHash,
    expiresAt: Date.now() + HANDOFF_TTL_MS,
    artifact,
  }));
  while (handoffs.size > MAX_HANDOFFS) {
    const oldest = handoffs.keys().next().value;
    if (oldest === undefined) break;
    handoffs.delete(oldest);
  }
  return Object.freeze({ sourceHash, artifactHash });
}

/**
 * Consume once and re-check every identity field before the runtime may use it.
 * A miss, expiry, changed source or invalid payload falls back to normal compile.
 */
export function consumeCoreSpiritPrecompiledArtifact(
  source: string,
): CoreSpiritExecutableArtifact | undefined {
  const exactSource = String(source);
  const sourceHash = exactSourceHash(exactSource);
  const entry = handoffs.get(sourceHash);
  if (!entry) return undefined;
  handoffs.delete(sourceHash);

  if (entry.expiresAt < Date.now() ||
      entry.source !== exactSource ||
      entry.sourceHash !== sourceHash ||
      entry.artifactHash !== entry.artifact.abi?.artifactHash ||
      entry.artifact.abi?.sourceHash !== sourceHash ||
      !validateExecutableArtifact(entry.artifact)) {
    return undefined;
  }
  return entry.artifact;
}
