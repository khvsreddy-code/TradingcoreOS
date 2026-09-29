/** CoreSpirit resource/capability limits. The VM must remain sandboxed and quota-limited. */
export type CoreSpiritCapability = 'marketData' | 'alert' | 'webhook' | 'ai' | 'drawing' | 'strategySignal';

export interface CoreSpiritSandboxPolicy {
  maxInstructionsPerBar: number;
  maxOutputsPerBar: number;
  maxHistoryBars: number;
  maxStateEntries: number;
  maxSourceBytes: number;
  maxArtifactInstructions: number;
  allowedCapabilities: readonly CoreSpiritCapability[];
}

export const CORE_SPIRIT_DEFAULT_SANDBOX: Readonly<CoreSpiritSandboxPolicy> = Object.freeze({
  maxInstructionsPerBar: 10000,
  maxOutputsPerBar: 10000,
  maxHistoryBars: 60000,
  maxStateEntries: 10000,
  maxSourceBytes: 256 * 1024,
  maxArtifactInstructions: 10000,
  allowedCapabilities: ['drawing', 'strategySignal'] as const,
});

export function validateCoreSpiritSandboxPolicy(policy: CoreSpiritSandboxPolicy): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(policy.maxInstructionsPerBar) || policy.maxInstructionsPerBar < 100) errors.push('maxInstructionsPerBar must be >= 100');
  if (!Number.isInteger(policy.maxOutputsPerBar) || policy.maxOutputsPerBar < 100) errors.push('maxOutputsPerBar must be >= 100');
  if (!Number.isInteger(policy.maxHistoryBars) || policy.maxHistoryBars < 1) errors.push('maxHistoryBars must be positive');
  if (!Number.isInteger(policy.maxStateEntries) || policy.maxStateEntries < 1) errors.push('maxStateEntries must be positive');
  if (!Number.isInteger(policy.maxSourceBytes) || policy.maxSourceBytes < 1024) errors.push('maxSourceBytes must be >= 1024');
  if (!Number.isInteger(policy.maxArtifactInstructions) || policy.maxArtifactInstructions < 1) errors.push('maxArtifactInstructions must be positive');
  return errors;
}
