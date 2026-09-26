/**
 * CoreSpirit automation pipeline — Stage 52.
 *
 * A signal is an event. The automation layer may convert it into an order
 * intent, but Risk/Policy/Execution remain host-controlled services.
 */

import type {
  CoreSpiritStrategyEvent,
  CoreSpiritOrderIntent,
  StrategyRiskDecision,
  StrategyExecutionRequest,
} from "./strategyContract";
import type { CoreSpiritEventEnvelope } from "./eventSystem";
import { strategyEventToOrderIntent } from "./strategyContract";

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
}

export interface CoreSpiritAutomationLimits {
  allowLiveExecution: boolean;
  maxQuantityPerIntent: number;
}

export class CoreSpiritAutomationOrchestrator {
  constructor(
    private readonly risk: CoreSpiritRiskEngine,
    private readonly policy: CoreSpiritPolicyEngine,
    private readonly execution: CoreSpiritExecutionGateway,
    private readonly limits: CoreSpiritAutomationLimits,
  ) {}

  async handleStrategyEvent(
    event: CoreSpiritStrategyEvent,
    quantity: number | undefined,
    now: number,
  ): Promise<CoreSpiritAutomationResult> {
    const intent = strategyEventToOrderIntent(event, now, quantity);

    const risk = await this.risk.evaluate(intent);
    if (!risk.allowed) {
      return {
        event,
        intent,
        risk,
        policy: { allowed: false, policyId: "risk-denied", reason: risk.reason },
      };
    }

    const approvedQuantity = risk.approvedQuantity ?? intent.quantity;
    if (approvedQuantity === undefined || approvedQuantity <= 0) {
      return {
        event,
        intent: { ...intent, quantity: approvedQuantity },
        risk,
        policy: { allowed: false, policyId: "quantity-invalid", reason: "risk engine did not approve a positive quantity" },
      };
    }

    if (approvedQuantity > this.limits.maxQuantityPerIntent) {
      return {
        event,
        intent: { ...intent, quantity: approvedQuantity },
        risk,
        policy: { allowed: false, policyId: "quantity-cap", reason: "quantity exceeds automation limit" },
      };
    }

    const policy = await this.policy.authorize(
      { ...intent, quantity: approvedQuantity },
      risk,
    );

    if (!policy.allowed) {
      return {
        event,
        intent: { ...intent, quantity: approvedQuantity },
        risk,
        policy,
      };
    }

    if (!this.limits.allowLiveExecution) {
      return {
        event,
        intent: { ...intent, quantity: approvedQuantity },
        risk,
        policy,
      };
    }

    const executionRequest: StrategyExecutionRequest = {
      orderIntentId: intent.id,
      venue: "host-selected",
      symbol: intent.symbol,
      side: intent.side,
      quantity: approvedQuantity,
      policyId: policy.policyId,
    };

    const execution = await this.execution.submit(executionRequest);

    return {
      event,
      intent: { ...intent, quantity: approvedQuantity },
      risk,
      policy,
      execution,
    };
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
  const kind = String(p.kind ?? p.eventKind ?? "entry") === "exit" ? "exit" : "entry";
  const direction = String(p.direction ?? "long") === "short" ? "short" : "long";
  return {
    id: event.id,
    strategyId: String(p.strategyId ?? event.sourceId),
    kind,
    direction,
    positionId: String(p.positionId ?? `${event.sourceId}:${direction}`),
    barIndex: event.barIndex,
    timestamp: event.timestamp,
    symbol: String(p.symbol ?? ""),
    timeframe: String(p.timeframe ?? ""),
    reason: String(p.reason ?? p.type ?? "CoreSpirit strategy event"),
    metadata: Object.fromEntries(
      Object.entries(p).filter(([, value]) =>
        value === null || ["string", "number", "boolean"].includes(typeof value),
      ) as Array<[string, string | number | boolean | null]>,
    ),
  };
}
