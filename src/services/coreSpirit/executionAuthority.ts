/**
 * CoreSpirit execution authority — the non-bypassable order boundary.
 *
 * Source code can produce facts/signals/intents. Only the host-owned control
 * plane may move an intent through RISK -> POLICY -> EXECUTION.
 */
export const CORE_SPIRIT_EXECUTION_AUTHORITY_VERSION = 1 as const;

export type CoreSpiritExecutionAuthorityStage =
  | 'SIGNAL'
  | 'AUTOMATION'
  | 'ORDER_INTENT'
  | 'RISK'
  | 'POLICY'
  | 'EXECUTION';

export type CoreSpiritExecutionDisposition =
  | 'NOT_APPLICABLE'
  | 'PENDING_RISK'
  | 'RISK_REJECTED'
  | 'RISK_APPROVED'
  | 'POLICY_REJECTED'
  | 'READY_FOR_EXECUTION'
  | 'PAPER_SIMULATION'
  | 'SUBMITTED'
  | 'EXECUTION_REJECTED';

export interface CoreSpiritExecutionAuthorityRecord {
  version: typeof CORE_SPIRIT_EXECUTION_AUTHORITY_VERSION;
  stage: CoreSpiritExecutionAuthorityStage;
  disposition: CoreSpiritExecutionDisposition;
  timestamp: number;
  reason: string;
  actor: 'core-spirit' | 'risk-engine' | 'policy-engine' | 'execution-host';
  correlationId: string;
}

export interface CoreSpiritOrderIntentAuthority {
  version: typeof CORE_SPIRIT_EXECUTION_AUTHORITY_VERSION;
  intentId: string;
  sourceId: string;
  sourceLayer: 'strategy' | 'automation';
  automationId: string;
  lifecycleState: 'CREATED' | 'VALIDATED' | 'PAPER' | 'ARMED' | 'LIVE' | 'PAUSED' | 'STOPPED';
  side: 'buy' | 'sell' | 'flat';
  quantity?: number;
  createdAt: number;
  disposition: CoreSpiritExecutionDisposition;
  history: readonly CoreSpiritExecutionAuthorityRecord[];
}

export const CORE_SPIRIT_EXECUTION_PATH = Object.freeze([
  'SIGNAL',
  'AUTOMATION',
  'ORDER_INTENT',
  'RISK',
  'POLICY',
  'EXECUTION',
] as const);

export function createExecutionAuthority(
  input: Omit<CoreSpiritOrderIntentAuthority, 'version' | 'disposition' | 'history'>,
): CoreSpiritOrderIntentAuthority {
  const record: CoreSpiritExecutionAuthorityRecord = {
    version: CORE_SPIRIT_EXECUTION_AUTHORITY_VERSION,
    stage: 'ORDER_INTENT',
    disposition: 'PENDING_RISK',
    timestamp: input.createdAt,
    reason: `proposed order intent created in lifecycle ${input.lifecycleState}; risk gate is mandatory`,
    actor: 'core-spirit',
    correlationId: input.intentId,
  };
  return { ...input, version: CORE_SPIRIT_EXECUTION_AUTHORITY_VERSION, disposition: record.disposition, history: [record] };
}

export function appendExecutionAuthorityRecord(
  authority: CoreSpiritOrderIntentAuthority,
  record: Omit<CoreSpiritExecutionAuthorityRecord, 'version' | 'correlationId'>,
): CoreSpiritOrderIntentAuthority {
  return {
    ...authority,
    disposition: record.disposition,
    history: [
      ...authority.history,
      { ...record, version: CORE_SPIRIT_EXECUTION_AUTHORITY_VERSION, correlationId: authority.intentId },
    ],
  };
}

export function validateExecutionAuthority(authority: CoreSpiritOrderIntentAuthority): string[] {
  const errors: string[] = [];
  if (authority.version !== CORE_SPIRIT_EXECUTION_AUTHORITY_VERSION) errors.push('unsupported execution authority version');
  if (!authority.intentId) errors.push('intentId is required');
  if (!authority.sourceId) errors.push('sourceId is required');
  if (!authority.automationId) errors.push('automationId is required');
  if (authority.sourceLayer !== 'strategy' && authority.sourceLayer !== 'automation') errors.push('execution authority source layer cannot be direct script/model');
  const riskApprovalIndex = authority.history.findIndex(
    x => x.stage === 'RISK' && x.disposition === 'RISK_APPROVED',
  );
  const policyApprovalIndex = authority.history.findIndex(
    x => x.stage === 'POLICY' && x.disposition === 'READY_FOR_EXECUTION',
  );
  const executionIndex = authority.history.findIndex(x => x.stage === 'EXECUTION');
  if (authority.lifecycleState === 'LIVE' && riskApprovalIndex < 0) {
    errors.push('LIVE execution cannot exist without a risk approval record');
  }
  if ((authority.disposition === 'SUBMITTED' || authority.disposition === 'EXECUTION_REJECTED') && riskApprovalIndex < 0) {
    errors.push('execution cannot occur without a risk approval record');
  }
  if (authority.disposition === 'SUBMITTED' && policyApprovalIndex < 0) {
    errors.push('submitted execution requires policy approval record');
  }
  if (policyApprovalIndex >= 0 && riskApprovalIndex >= 0 && policyApprovalIndex < riskApprovalIndex) {
    errors.push('policy approval cannot precede risk approval');
  }
  if (executionIndex >= 0 && policyApprovalIndex >= 0 && executionIndex < policyApprovalIndex) {
    errors.push('execution cannot precede policy approval');
  }
  return errors;
}
