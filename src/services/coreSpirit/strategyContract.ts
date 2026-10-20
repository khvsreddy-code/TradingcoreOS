/**
 * CoreSpirit Strategy Contract — Stage 38
 *
 * Strategy code describes intent/events. It does not submit broker orders.
 *
 * CoreSpirit -> Strategy Event -> Risk Engine -> Order Intent -> Execution
 */

import type { CoreSpiritOrderSizing } from './orderIntent';
import type { CoreSpiritExecutionMode } from './types';

export const CORE_SPIRIT_STRATEGY_VERSION = 1 as const;

export type StrategyEventKind = "entry" | "exit";

export interface CoreSpiritStrategyDescriptor {
  version: typeof CORE_SPIRIT_STRATEGY_VERSION;
  id: string;
  name: string;
  sourceProgramChecksum: string;
}

export interface CoreSpiritStrategyEvent {
  id: string;
  strategyId: string;
  kind: StrategyEventKind;
  direction: "long" | "short";
  positionId: string;
  barIndex: number;
  timestamp: number;
  symbol: string;
  timeframe: string;
  /** Trusted host event context used to suppress live broker effects during history/replay. */
  executionMode?: CoreSpiritExecutionMode;
  reason: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CoreSpiritOrderIntent {
  id: string;
  strategyEventId: string;
  symbol: string;
  side: "buy" | "sell" | "flat";
  direction: "long" | "short" | "flat";
  quantity?: number;
  sizing?: CoreSpiritOrderSizing;
  stop?: number | null;
  target?: number | null;
  positionId: string;
  requestedAt: number;
  reason: string;
}

export interface StrategyRiskDecision {
  orderIntentId: string;
  allowed: boolean;
  reason: string;
  approvedQuantity?: number;
}

export interface StrategyExecutionRequest {
  orderIntentId: string;
  venue: string;
  symbol: string;
  side: "buy" | "sell" | "flat";
  quantity: number;
  policyId: string;
}

export interface CoreSpiritStrategyBoundary {
  emitEntry(event: CoreSpiritStrategyEvent): void;
  emitExit(event: CoreSpiritStrategyEvent): void;
  // Deliberately no broker/order methods.
}

export function strategyEventToOrderIntent(
  event: CoreSpiritStrategyEvent,
  now: number,
  quantity?: number,
): CoreSpiritOrderIntent {
  const side =
    event.kind === "entry"
      ? event.direction === "long" ? "buy" : "sell"
      : event.direction === "long" ? "sell" : "buy";

  return {
    id: `intent:${event.id}`,
    strategyEventId: event.id,
    symbol: event.symbol,
    side,
    direction: event.kind === 'exit' ? 'flat' : event.direction,
    quantity,
    sizing: quantity !== undefined ? { kind: 'quantity', value: quantity } : { kind: 'all' },
    positionId: event.positionId,
    requestedAt: now,
    reason: event.reason,
  };
}
