/**
 * CoreSpirit automation pipeline — risk is mandatory and lifecycle is explicit.
 *
 * Signal/strategy event -> Automation -> Risk Engine -> Order Intent -> Policy
 * -> Execution Gateway -> Broker host
 *
 * CoreSpirit never owns broker credentials or submits a venue request itself.
 */

import type {
  CoreSpiritStrategyEvent,
  CoreSpiritOrderIntent,
  StrategyRiskDecision,
  StrategyExecutionRequest,
} from './strategyContract';
import type { CoreSpiritEventEnvelope } from './eventSystem';
import { strategyEventToOrderIntent } from './strategyContract';
import { coreSpiritRuntimeOrderToStrategyIntent } from './orderIntent';
import type { CoreSpiritObject } from './types';
import { coreSpiritChecksum } from './artifact';
import { appendExecutionAuthorityRecord, createExecutionAuthority, validateExecutionAuthority, type CoreSpiritOrderIntentAuthority } from './executionAuthority';
import { buildAutomationDecisionTrace, buildSignalExplanation, buildAutomationExplanationRecord, CoreSpiritAutomationExplainabilityStore, type CoreSpiritAutomationExplainability, type CoreSpiritExplanationDecision } from './explainability';
import {
  createAutomationLifecycle,
  isAutomationLive,
  isAutomationExecutionEnabled,
  canAutomationUseCapability,
  transitionAutomationLifecycle,
  type CoreSpiritAutomationLifecycleActor,
  type CoreSpiritAutomationLifecycleSnapshot,
  type CoreSpiritAutomationLifecycleState,
  type CoreSpiritAutomationLifecycleTransition,
} from './automationLifecycle';

export interface CoreSpiritRiskEngine {
  evaluate(
    intent: CoreSpiritOrderIntent,
  ): Promise<StrategyRiskDecision> | StrategyRiskDecision;
}

export interface CoreSpiritPolicyEngine {
  authorize(
    intent: CoreSpiritOrderIntent,
    risk: StrategyRiskDecision,
  ): Promise<{ allowed: boolean; policyId: string; reason: string }>;
}

export interface CoreSpiritExecutionGateway {
  submit(
    request: StrategyExecutionRequest,
  ): Promise<{ accepted: boolean; executionId?: string; reason?: string }>;
}

export interface CoreSpiritAutomationResult {
  event: CoreSpiritStrategyEvent;
  intent: CoreSpiritOrderIntent;
  risk: StrategyRiskDecision;
  policy: { allowed: boolean; policyId: string; reason: string };
  execution?: { accepted: boolean; executionId?: string; reason?: string };
  authority: CoreSpiritOrderIntentAuthority;
  explainability: CoreSpiritAutomationExplainability;
}

export interface CoreSpiritAutomationLimits {
  allowLiveExecution: boolean;
  maxQuantityPerIntent: number;
  automationId?: string;
  lifecycle?: CoreSpiritAutomationLifecycleSnapshot;
  explainabilityStore?: CoreSpiritAutomationExplainabilityStore;
}

export class CoreSpiritAutomationOrchestrator {
  private lifecycle: CoreSpiritAutomationLifecycleSnapshot;
  private readonly explainabilityStore: CoreSpiritAutomationExplainabilityStore;

  constructor(
    private readonly risk: CoreSpiritRiskEngine,
    private readonly policy: CoreSpiritPolicyEngine,
    private readonly execution: CoreSpiritExecutionGateway,
    private readonly limits: CoreSpiritAutomationLimits,
  ) {
    this.lifecycle = limits.lifecycle ?? createAutomationLifecycle(limits.automationId ?? 'corespirit-automation');
    this.explainabilityStore = limits.explainabilityStore ?? new CoreSpiritAutomationExplainabilityStore();
  }

  getExplainabilityStore(): CoreSpiritAutomationExplainabilityStore { return this.explainabilityStore; }

  getExplainability(intentId: string) { return this.explainabilityStore.get(intentId); }

  private recordResult(result: CoreSpiritAutomationResult): CoreSpiritAutomationResult {
    const event = result.event;
    this.explainabilityStore.record(buildAutomationExplanationRecord({
      automationId: this.lifecycle.automationId,
      intentId: result.intent.id,
      eventId: event.id,
      signalId: result.explainability.signal?.signalId,
      sourceId: event.strategyId,
      programChecksum: typeof event.metadata?.programChecksum === 'string' ? event.metadata.programChecksum : undefined,
      symbol: event.symbol,
      timeframe: event.timeframe,
      barIndex: event.barIndex,
      timestamp: event.timestamp,
      decisionTrace: result.explainability.decisionTrace,
      finalDecision: result.explainability.finalDecision,
      authorityChecksum: coreSpiritChecksum(result.authority),
    }));
    return result;
  }

  getLifecycle(): CoreSpiritAutomationLifecycleSnapshot {
    return {
      ...this.lifecycle,
      history: [...this.lifecycle.history],
    };
  }

  transitionLifecycle(
    transition: CoreSpiritAutomationLifecycleTransition,
    actor: CoreSpiritAutomationLifecycleActor,
    reason: string,
    now = Date.now(),
  ): CoreSpiritAutomationLifecycleSnapshot {
    this.lifecycle = transitionAutomationLifecycle(this.lifecycle, transition, actor, reason, now);
    return this.getLifecycle();
  }

  async handleRuntimeOrderIntent(
    runtimeIntent: Extract<CoreSpiritObject, { kind: 'orderIntent' }>,
    symbol: string,
    now: number,
    positionId?: string,
  ): Promise<CoreSpiritAutomationResult> {
    const intent: CoreSpiritOrderIntent = coreSpiritRuntimeOrderToStrategyIntent(runtimeIntent, { symbol, requestedAt: now, positionId });
    const event: CoreSpiritStrategyEvent = {
      id: runtimeIntent.id, strategyId: String(runtimeIntent.metadata?.source ?? this.lifecycle.automationId),
      kind: runtimeIntent.side === 'flat' ? 'exit' : 'entry', direction: runtimeIntent.side === 'short' ? 'short' : 'long',
      positionId: positionId ?? `${symbol}:${runtimeIntent.side}`, barIndex: Number(runtimeIntent.metadata?.barIndex ?? 0),
      timestamp: runtimeIntent.time, symbol, timeframe: '', reason: String(runtimeIntent.metadata?.reason ?? 'declarative order intent'),
    };
    return this.handleOrderIntent(intent, event, now);
  }

  async handleStrategyEvent(
    event: CoreSpiritStrategyEvent,
    quantity: number | undefined,
    now: number,
  ): Promise<CoreSpiritAutomationResult> {
    return this.handleOrderIntent(strategyEventToOrderIntent(event, now, quantity), event, now);
  }

  async handleOrderIntent(
    intent: CoreSpiritOrderIntent,
    event: CoreSpiritStrategyEvent,
    now: number,
  ): Promise<CoreSpiritAutomationResult> {
    const lifecycleState = this.lifecycle.state;
    const authority = createExecutionAuthority({
      intentId: intent.id,
      sourceId: event.strategyId,
      sourceLayer: 'strategy',
      automationId: this.lifecycle.automationId,
      lifecycleState,
      side: intent.side,
      quantity: intent.quantity,
      createdAt: now,
    });
    const signalExplanation = buildSignalExplanation({
      signalId: event.id,
      sourceId: event.strategyId,
      runId: event.id,
      symbol: event.symbol,
      timeframe: event.timeframe,
      barIndex: event.barIndex,
      timestamp: event.timestamp,
      type: event.kind === 'entry' ? (event.direction === 'long' ? 'LONG' : 'SHORT') : 'EXIT',
      reason: event.reason,
    });

    const explain = (finalDecision: CoreSpiritExplanationDecision, risk?: StrategyRiskDecision, policy?: { allowed: boolean; policyId: string; reason: string }, execution?: { accepted: boolean; executionId?: string; reason?: string }): CoreSpiritAutomationExplainability => {
      const decisionTrace = buildAutomationDecisionTrace({ signal: signalExplanation, lifecycle: this.getLifecycle(), risk, policy, execution, finalDecision });
      const signal = { ...signalExplanation, decisionTrace, checksum: coreSpiritChecksum({ ...signalExplanation, decisionTrace }) };
      return { automationId: this.lifecycle.automationId, lifecycle: this.getLifecycle(), signal, risk, policy, execution, decisionTrace, finalDecision };
    };

    const blockedResult = (reason: string): CoreSpiritAutomationResult => ({
      event,
      intent,
      risk: { orderIntentId: intent.id, allowed: false, reason },
      policy: { allowed: false, policyId: 'lifecycle-blocked', reason },
      authority: appendExecutionAuthorityRecord(authority, { stage: 'ORDER_INTENT', disposition: 'NOT_APPLICABLE', timestamp: now, reason, actor: 'core-spirit' }),
      explainability: explain({ label: 'Automation', status: 'REJECTED', reason }),
    });

    if (!isAutomationExecutionEnabled(lifecycleState)) {
      return this.recordResult(blockedResult(`automation lifecycle ${lifecycleState} does not permit execution`));
    }

    let authorityAfterRisk = appendExecutionAuthorityRecord(authority, { stage: 'RISK', disposition: 'PENDING_RISK', timestamp: now, reason: 'risk evaluation required', actor: 'risk-engine' });
    const risk = await this.risk.evaluate(intent);
    authorityAfterRisk = appendExecutionAuthorityRecord(authorityAfterRisk, {
      stage: 'RISK',
      disposition: risk.allowed ? 'RISK_APPROVED' : 'RISK_REJECTED',
      timestamp: now,
      reason: risk.reason,
      actor: 'risk-engine',
    });
    if (!risk.allowed) {
      return this.recordResult({ event, intent, risk, policy: { allowed: false, policyId: 'risk-denied', reason: risk.reason }, authority: authorityAfterRisk, explainability: explain({ label: 'Risk', status: 'REJECTED', reason: risk.reason }, risk) });
    }

    const approvedQuantity = risk.approvedQuantity ?? intent.quantity;
    if (approvedQuantity === undefined || approvedQuantity <= 0) {
      const reason = 'risk engine did not approve a positive quantity';
      return this.recordResult({ event, intent: { ...intent, quantity: approvedQuantity }, risk, policy: { allowed: false, policyId: 'quantity-invalid', reason }, authority: authorityAfterRisk, explainability: explain({ label: 'Risk quantity', status: 'REJECTED', reason }, risk) });
    }
    if (approvedQuantity > this.limits.maxQuantityPerIntent) {
      const reason = 'quantity exceeds automation limit';
      return this.recordResult({ event, intent: { ...intent, quantity: approvedQuantity }, risk, policy: { allowed: false, policyId: 'quantity-cap', reason }, authority: authorityAfterRisk, explainability: explain({ label: 'Risk quantity', status: 'REJECTED', reason }, risk) });
    }

    const approvedIntent = { ...intent, quantity: approvedQuantity };
    const policy = await this.policy.authorize(approvedIntent, risk);
    let authorityAfterPolicy = appendExecutionAuthorityRecord(authorityAfterRisk, { stage: 'POLICY', disposition: policy.allowed ? 'READY_FOR_EXECUTION' : 'POLICY_REJECTED', timestamp: now, reason: policy.reason, actor: 'policy-engine' });
    if (!policy.allowed) {
      return this.recordResult({ event, intent: approvedIntent, risk, policy, authority: authorityAfterPolicy, explainability: explain({ label: 'Policy', status: 'REJECTED', reason: policy.reason, policyId: policy.policyId }, risk, policy) });
    }

    if (!canAutomationUseCapability(this.lifecycle.state, 'live-execute') || !this.limits.allowLiveExecution || !isAutomationLive(this.lifecycle.state)) {
      authorityAfterPolicy = appendExecutionAuthorityRecord(authorityAfterPolicy, { stage: 'EXECUTION', disposition: 'PAPER_SIMULATION', timestamp: now, reason: !isAutomationLive(this.lifecycle.state) ? `lifecycle ${this.lifecycle.state} does not permit live submission` : 'host live-execution guard is disabled', actor: 'execution-host' });
      return this.recordResult({ event, intent: approvedIntent, risk, policy, authority: authorityAfterPolicy, explainability: explain({ label: 'Execution', status: 'APPROVED', reason: 'Intent is risk/policy approved but remains outside broker execution in this lifecycle' }, risk, policy) });
    }

    const validationErrors = validateExecutionAuthority(authorityAfterPolicy);
    if (validationErrors.length) throw new Error(`execution authority contract invalid: ${validationErrors.join('; ')}`);
    const executionRequest: StrategyExecutionRequest = { orderIntentId: approvedIntent.id, venue: 'host-selected', symbol: approvedIntent.symbol, side: approvedIntent.side, quantity: approvedQuantity, policyId: policy.policyId };
    const execution = await this.execution.submit(executionRequest);
    const finalAuthority = appendExecutionAuthorityRecord(authorityAfterPolicy, { stage: 'EXECUTION', disposition: execution.accepted ? 'SUBMITTED' : 'EXECUTION_REJECTED', timestamp: now, reason: execution.reason || (execution.accepted ? 'execution host accepted request' : 'execution host rejected request'), actor: 'execution-host' });
    return this.recordResult({ event, intent: approvedIntent, risk, policy, execution, authority: finalAuthority, explainability: explain({ label: 'Execution', status: execution.accepted ? 'SUBMITTED' : 'REJECTED', reason: execution.reason || (execution.accepted ? 'submitted to host execution gateway' : 'execution host rejected request') }, risk, policy, execution) });
  }
}

/**
 * Adapter shape for event-bus consumers. The event payload must be turned into a
 * typed strategy event before reaching the risk engine.
 */
export function strategyEventFromEnvelope(
  event: CoreSpiritEventEnvelope,
): CoreSpiritStrategyEvent {
  const p = event.payload;
  const kind = String(p.kind ?? p.eventKind ?? 'entry') === 'exit' ? 'exit' : 'entry';
  const direction = String(p.direction ?? 'long') === 'short' ? 'short' : 'long';
  return {
    id: event.id,
    strategyId: String(p.strategyId ?? event.sourceId),
    kind,
    direction,
    positionId: String(p.positionId ?? `${event.sourceId}:${direction}`),
    barIndex: event.barIndex,
    timestamp: event.timestamp,
    symbol: String(p.symbol ?? ''),
    timeframe: String(p.timeframe ?? ''),
    reason: String(p.reason ?? p.type ?? 'CoreSpirit strategy event'),
    metadata: Object.fromEntries(
      Object.entries(p).filter(([, value]) =>
        value === null || ['string', 'number', 'boolean'].includes(typeof value),
      ) as Array<[string, string | number | boolean | null]>,
    ),
  };
}

export type { CoreSpiritAutomationLifecycleState };
