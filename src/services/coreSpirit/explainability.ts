import { coreSpiritChecksum } from './artifact';
import type { CoreSpiritAutomationLifecycleSnapshot } from './automationLifecycle';
import type { StrategyRiskDecision } from './strategyContract';

export const CORE_SPIRIT_EXPLAINABILITY_VERSION = 1 as const;

export type CoreSpiritExplanationFact = {
  id: string;
  label: string;
  value: number | string | boolean | null;
  category: 'market' | 'indicator' | 'model' | 'signal' | 'risk' | 'policy' | 'execution';
  sourceId?: string;
};

export type CoreSpiritExplainabilityStep = {
  id: string;
  stage: 'SIGNAL' | 'LIFECYCLE' | 'RISK' | 'POLICY' | 'EXECUTION';
  status: 'INFO' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUBMITTED';
  label: string;
  reason: string;
  timestamp?: number;
  facts?: readonly CoreSpiritExplanationFact[];
};

export type CoreSpiritExplanationDecision = {
  label: string;
  status: 'INFO' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUBMITTED';
  reason: string;
  policyId?: string;
};

export type CoreSpiritSignalExplanation = {
  version: typeof CORE_SPIRIT_EXPLAINABILITY_VERSION;
  signalId: string;
  sourceId: string;
  runId: string;
  symbol: string;
  timeframe: string;
  barIndex: number;
  timestamp: number;
  title: string;
  reason: string;
  facts: readonly CoreSpiritExplanationFact[];
  decisions: readonly CoreSpiritExplanationDecision[];
  source?: { outputId?: string; line?: number; column?: number };
  decisionTrace: readonly CoreSpiritExplainabilityStep[];
  checksum: string;
};

export type CoreSpiritAutomationExplainability = {
  automationId: string;
  lifecycle: CoreSpiritAutomationLifecycleSnapshot;
  signal?: CoreSpiritSignalExplanation;
  risk?: StrategyRiskDecision;
  policy?: { allowed: boolean; policyId: string; reason: string };
  execution?: { accepted: boolean; executionId?: string; reason?: string };
  decisionTrace: readonly CoreSpiritExplainabilityStep[];
  finalDecision: CoreSpiritExplanationDecision;
};

function toScalar(value: unknown): number | string | boolean | null {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

export function explanationFactsFromRuntimeLocals(
  locals: Readonly<Record<string, unknown>> | undefined,
): CoreSpiritExplanationFact[] {
  return Object.entries(locals ?? {})
    .filter(([, value]) => value == null || ['number', 'string', 'boolean'].includes(typeof value))
    .slice(-24)
    .map(([label, value]) => ({
      id: `local:${label}`,
      label,
      value: toScalar(value),
      category: 'indicator' as const,
    }));
}

export function buildSignalExplanation(input: {
  signalId: string;
  sourceId: string;
  runId: string;
  symbol: string;
  timeframe: string;
  barIndex: number;
  timestamp: number;
  type: string;
  reason?: string;
  facts?: readonly CoreSpiritExplanationFact[];
  decisions?: readonly CoreSpiritExplanationDecision[];
  source?: { outputId?: string; line?: number; column?: number };
}): CoreSpiritSignalExplanation {
  const structural = {
    version: CORE_SPIRIT_EXPLAINABILITY_VERSION,
    ...input,
    title: input.type,
    reason: input.reason || `Signal emitted by ${input.sourceId}`,
    facts: input.facts ?? [],
    decisions: input.decisions ?? [{ label: 'Signal', status: 'INFO' as const, reason: input.reason || 'Signal emitted by CoreSpirit' }],
    decisionTrace: [{
      id: `${input.signalId}:signal`,
      stage: 'SIGNAL' as const,
      status: 'INFO' as const,
      label: input.type,
      reason: input.reason || 'Signal emitted by CoreSpirit',
      timestamp: input.timestamp,
      facts: input.facts ?? [],
    }],
  };
  return { ...structural, checksum: coreSpiritChecksum(structural) };
}

export function buildAutomationDecisionTrace(input: {
  signal: CoreSpiritSignalExplanation;
  lifecycle: CoreSpiritAutomationLifecycleSnapshot;
  risk?: StrategyRiskDecision;
  policy?: { allowed: boolean; policyId: string; reason: string };
  execution?: { accepted: boolean; executionId?: string; reason?: string };
  finalDecision: CoreSpiritExplanationDecision;
}): CoreSpiritExplainabilityStep[] {
  const steps: CoreSpiritExplainabilityStep[] = [
    ...input.signal.decisionTrace,
    {
      id: `${input.signal.signalId}:lifecycle`,
      stage: 'LIFECYCLE',
      status: input.lifecycle.state === 'LIVE' ? 'APPROVED' : 'INFO',
      label: `Automation ${input.lifecycle.state}`,
      reason: `automation lifecycle is ${input.lifecycle.state}`,
      timestamp: input.lifecycle.updatedAt,
      facts: [{ id: 'lifecycle', label: 'lifecycle', value: input.lifecycle.state, category: 'execution' }],
    },
  ];
  if (input.risk) {
    steps.push({
      id: `${input.signal.signalId}:risk`,
      stage: 'RISK',
      status: input.risk.allowed ? 'APPROVED' : 'REJECTED',
      label: 'Risk engine',
      reason: input.risk.reason,
      facts: [
        { id: 'risk:allowed', label: 'risk allowed', value: input.risk.allowed, category: 'risk' },
        { id: 'risk:approvedQuantity', label: 'approved quantity', value: input.risk.approvedQuantity ?? null, category: 'risk' },
      ],
    });
  }
  if (input.policy) {
    steps.push({
      id: `${input.signal.signalId}:policy`,
      stage: 'POLICY',
      status: input.policy.allowed ? 'APPROVED' : 'REJECTED',
      label: input.policy.policyId,
      reason: input.policy.reason,
      facts: [{ id: 'policy:allowed', label: 'policy allowed', value: input.policy.allowed, category: 'policy' }],
    });
  }
  if (input.execution) {
    steps.push({
      id: `${input.signal.signalId}:execution`,
      stage: 'EXECUTION',
      status: input.execution.accepted ? 'SUBMITTED' : 'REJECTED',
      label: input.execution.executionId || 'Execution host',
      reason: input.execution.reason || (input.execution.accepted ? 'execution host accepted request' : 'execution host rejected request'),
    });
  }
  steps.push({
    id: `${input.signal.signalId}:final`,
    stage: 'EXECUTION',
    status: input.finalDecision.status,
    label: input.finalDecision.label,
    reason: input.finalDecision.reason,
  });
  return steps;
}

export class CoreSpiritExplainabilityStore {
  private readonly maxItems: number;
  private readonly items = new Map<string, CoreSpiritSignalExplanation>();

  constructor(maxItems = 200) { this.maxItems = Math.max(10, maxItems); }

  clear(): void { this.items.clear(); }

  record(explanation: CoreSpiritSignalExplanation): void {
    this.items.set(explanation.signalId, explanation);
    while (this.items.size > this.maxItems) this.items.delete(this.items.keys().next().value as string);
  }

  get(signalId: string): CoreSpiritSignalExplanation | undefined { return this.items.get(signalId); }

  list(): CoreSpiritSignalExplanation[] { return [...this.items.values()]; }

  latest(): CoreSpiritSignalExplanation | undefined {
    return [...this.items.values()].at(-1);
  }
}


export const CORE_SPIRIT_AUTOMATION_EXPLAINABILITY_VERSION = 1 as const;

export type CoreSpiritAutomationExplanationRecord = {
  version: typeof CORE_SPIRIT_AUTOMATION_EXPLAINABILITY_VERSION;
  automationId: string;
  intentId: string;
  eventId: string;
  signalId?: string;
  sourceId: string;
  programChecksum?: string;
  symbol: string;
  timeframe: string;
  barIndex: number;
  timestamp: number;
  decisionTrace: readonly CoreSpiritExplainabilityStep[];
  finalDecision: CoreSpiritExplanationDecision;
  authorityChecksum: string;
  explanationChecksum: string;
};

export class CoreSpiritAutomationExplainabilityStore {
  private readonly items = new Map<string, CoreSpiritAutomationExplanationRecord>();
  constructor(private readonly maxItems = 500) {}
  record(record: CoreSpiritAutomationExplanationRecord): void {
    this.items.set(record.intentId, record);
    while (this.items.size > Math.max(10, this.maxItems)) this.items.delete(this.items.keys().next().value as string);
  }
  get(intentId: string): CoreSpiritAutomationExplanationRecord | undefined { return this.items.get(intentId); }
  list(automationId?: string): CoreSpiritAutomationExplanationRecord[] {
    const values = [...this.items.values()];
    return automationId ? values.filter(x => x.automationId === automationId) : values;
  }
  latest(automationId?: string): CoreSpiritAutomationExplanationRecord | undefined { return this.list(automationId).at(-1); }
  clear(): void { this.items.clear(); }
}

export function buildAutomationExplanationRecord(input: {
  automationId: string;
  intentId: string;
  eventId: string;
  signalId?: string;
  sourceId: string;
  programChecksum?: string;
  symbol: string;
  timeframe: string;
  barIndex: number;
  timestamp: number;
  decisionTrace: readonly CoreSpiritExplainabilityStep[];
  finalDecision: CoreSpiritExplanationDecision;
  authorityChecksum: string;
}): CoreSpiritAutomationExplanationRecord {
  const base = {
    version: CORE_SPIRIT_AUTOMATION_EXPLAINABILITY_VERSION,
    ...input,
    decisionTrace: input.decisionTrace,
    finalDecision: input.finalDecision,
    authorityChecksum: input.authorityChecksum,
  };
  return { ...base, explanationChecksum: coreSpiritChecksum(base) };
}
