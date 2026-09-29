/**
 * Canonical CoreSpirit order-intent surface.
 *
 * User-facing AUTOMATE syntax describes one intent shape. Direction, sizing,
 * protective levels and tags are data on that intent; execution authority is
 * still granted only by the host-owned RISK -> POLICY -> EXECUTION pipeline.
 */

import type { CoreSpiritObject } from './types';
import type { CoreSpiritOrderIntent } from './strategyContract';

export type CoreSpiritOrderDirection = 'long' | 'short' | 'flat';

export type CoreSpiritOrderSizing =
  | { kind: 'quantity'; value: number }
  | { kind: 'riskPercent'; value: number }
  | { kind: 'all' };

export type CoreSpiritOrderSurfaceSide = 'long' | 'short' | 'exit';

export interface CoreSpiritDeclarativeOrderSpec {
  side: CoreSpiritOrderSurfaceSide;
  sizing: CoreSpiritOrderSizing;
  stop?: number | null;
  target?: number | null;
  tag?: string;
}

export function normalizeCoreSpiritOrderDirection(side: string): CoreSpiritOrderDirection {
  const value = side.trim().toLowerCase();
  if (value === 'exit' || value === 'flat') return 'flat';
  if (value === 'short' || value === 'sell') return 'short';
  return 'long';
}

export function normalizeCoreSpiritOrderSizing(kind: string, value?: number): CoreSpiritOrderSizing {
  const normalized = kind.trim().toLowerCase();
  if (normalized === 'all') return { kind: 'all' };
  if (normalized === 'risk' || normalized === 'riskpercent' || normalized === 'risk_percent') {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 100) {
      throw new Error('order risk sizing must be > 0 and <= 100 percent');
    }
    return { kind: 'riskPercent', value: Number(value) };
  }
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    throw new Error('order quantity sizing must be a positive number');
  }
  return { kind: 'quantity', value: Number(value) };
}

export function createCoreSpiritOrderIntent(
  spec: CoreSpiritDeclarativeOrderSpec,
  input: { id: string; time: number; sourceId: string; barIndex: number; mode: string; runId: string },
): Extract<CoreSpiritObject, { kind: 'orderIntent' }> {
  const side = normalizeCoreSpiritOrderDirection(spec.side);
  const sizing = spec.sizing;
  return {
    kind: 'orderIntent',
    id: input.id,
    time: input.time,
    side,
    confidence: 1,
    stop: spec.stop ?? null,
    target: spec.target ?? null,
    tag: spec.tag,
    sizing,
    metadata: {
      source: input.sourceId,
      barIndex: input.barIndex,
      mode: input.mode,
      runId: input.runId,
      intentModel: 'universal-order-intent',
      sizingKind: sizing.kind,
      sizingValue: 'value' in sizing ? sizing.value : null,
      quantity: sizing.kind === 'quantity' ? sizing.value : undefined,
    },
  };
}

export function coreSpiritRuntimeOrderToStrategyIntent(
  intent: Extract<CoreSpiritObject, { kind: 'orderIntent' }>,
  input: { symbol: string; positionId?: string; requestedAt: number },
): CoreSpiritOrderIntent {
  const side = intent.side === 'long' ? 'buy' : intent.side === 'short' ? 'sell' : 'flat';
  return {
    id: intent.id,
    strategyEventId: intent.id,
    symbol: input.symbol,
    side,
    direction: intent.side,
    quantity: intent.sizing?.kind === 'quantity' ? intent.sizing.value : undefined,
    sizing: intent.sizing,
    stop: intent.stop,
    target: intent.target,
    positionId: input.positionId ?? `${input.symbol}:${intent.side}`,
    requestedAt: input.requestedAt,
    reason: typeof intent.metadata?.reason === 'string' ? intent.metadata.reason : 'CoreSpirit declarative order intent',
  };
}
