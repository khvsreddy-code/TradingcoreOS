/**
 * Evidence-based CoreScript capability maturity.
 *
 * This registry deliberately does not infer support from catalog labels or successful parsing.
 * Callers must supply evidence from the actual compiler/runtime/research/release stages.
 */
export const CORESCRIPT_CAPABILITY_STAGES = [
  'parsed',
  'semantically-valid',
  'executable',
  'incremental',
  'research-validated',
  'production-ready',
] as const;

export type CoreScriptCapabilityStage = typeof CORESCRIPT_CAPABILITY_STAGES[number];
export type CoreScriptCapabilityState = 'passed' | 'failed' | 'unknown' | 'not-applicable';

export type CoreScriptCapabilityEvidence = Readonly<{
  stage: CoreScriptCapabilityStage;
  state: CoreScriptCapabilityState;
  evidence?: string;
  checkedAt?: string;
  reason?: string;
}>;

export type CoreScriptCapabilityReport = Readonly<{
  featureId: string;
  languageVersion: number;
  stages: readonly CoreScriptCapabilityEvidence[];
  highestVerifiedStage: CoreScriptCapabilityStage | null;
  releaseEligible: boolean;
}>;

const rank = new Map<CoreScriptCapabilityStage, number>(
  CORESCRIPT_CAPABILITY_STAGES.map((stage, index) => [stage, index]),
);

/**
 * Build a conservative report. A stage is verified only if it and every earlier stage
 * have explicit passing evidence. A later isolated "pass" cannot leapfrog missing proof.
 */
export function buildCoreScriptCapabilityReport(input: {
  featureId: string;
  languageVersion: number;
  evidence: readonly CoreScriptCapabilityEvidence[];
}): CoreScriptCapabilityReport {
  if (!input.featureId.trim()) throw new Error('featureId is required');
  if (!Number.isInteger(input.languageVersion) || input.languageVersion < 1) {
    throw new Error('languageVersion must be a positive integer');
  }

  const byStage = new Map<CoreScriptCapabilityStage, CoreScriptCapabilityEvidence>();
  for (const item of input.evidence) {
    if (!rank.has(item.stage)) throw new Error('Unknown CoreScript capability stage');
    if (byStage.has(item.stage)) throw new Error('Duplicate evidence for stage: ' + item.stage);
    if (item.state === 'passed' && !item.evidence?.trim()) {
      throw new Error('Passing evidence requires a non-empty evidence reference: ' + item.stage);
    }
    byStage.set(item.stage, Object.freeze({ ...item }));
  }

  const stages = CORESCRIPT_CAPABILITY_STAGES.map((stage) => byStage.get(stage) ??
    Object.freeze({ stage, state: 'unknown' as const, reason: 'No stage-specific evidence supplied.' }));

  let highestVerifiedStage: CoreScriptCapabilityStage | null = null;
  for (const stage of stages) {
    if (stage.state !== 'passed') break;
    highestVerifiedStage = stage.stage;
  }

  return Object.freeze({
    featureId: input.featureId.trim(),
    languageVersion: input.languageVersion,
    stages: Object.freeze(stages),
    highestVerifiedStage,
    releaseEligible: highestVerifiedStage === 'production-ready',
  });
}
