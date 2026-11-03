import type { CoreSpiritBarPhase, CoreSpiritExecutionMode } from './types';
import type { CoreSpiritCausality, CoreSpiritLookahead, CoreSpiritRepaintSafetyReport } from './repaintSafety';

export type CoreSpiritOutputSemantics = Readonly<{
  version: 1;
  barPhase: CoreSpiritBarPhase;
  executionMode: CoreSpiritExecutionMode;
  isRealtime: boolean;
  isConfirmed: boolean;
  causality: CoreSpiritCausality;
  lookahead: CoreSpiritLookahead;
  realtimeSafe: boolean | 'unknown';
  backtestLiveEquivalent: boolean | 'unknown';
}>;

export type CoreSpiritExecutionSemanticsInput = Readonly<{
  barPhase: CoreSpiritBarPhase;
  executionMode: CoreSpiritExecutionMode;
  isRealtime: boolean;
  isConfirmed: boolean;
}>;

/** Attach static causality evidence to the host-authoritative bar phase. */
export function createCoreSpiritOutputSemantics(
  input: CoreSpiritExecutionSemanticsInput,
  report?: CoreSpiritRepaintSafetyReport,
): CoreSpiritOutputSemantics {
  const causality = report?.causality ?? 'unknown';
  const lookahead = report?.lookahead ?? 'unknown';
  const realtimeSafe = report?.realtimeSafe ?? 'unknown';
  const backtestLiveEquivalent = report?.backtestLiveEquivalent ?? 'unknown';
  const confirmed = input.barPhase === 'historical' || input.barPhase === 'confirmed' || input.barPhase === 'correction' || input.barPhase === 'replay';
  return Object.freeze({
    version: 1,
    barPhase: input.barPhase,
    executionMode: input.executionMode,
    isRealtime: input.isRealtime,
    isConfirmed: input.isConfirmed && (input.barPhase === 'confirmed' || input.barPhase === 'historical' || input.barPhase === 'correction' || input.barPhase === 'replay'),
    causality,
    lookahead,
    realtimeSafe,
    backtestLiveEquivalent: confirmed ? backtestLiveEquivalent : false,
  });
}

/**
 * Broker-side effects require a closed realtime bar and proven static causality.
 * Missing/unknown repaint evidence intentionally fails closed.
 */
export function canCoreSpiritSubmitConfirmedLiveIntent(
  semantics: CoreSpiritOutputSemantics | undefined,
): boolean {
  return Boolean(semantics
    && semantics.barPhase === 'confirmed'
    && semantics.executionMode === 'realtime'
    && semantics.isRealtime
    && semantics.isConfirmed
    && semantics.causality === 'causal'
    && semantics.lookahead === 'false'
    && semantics.realtimeSafe === true);
}

export function coreSpiritOutputSemanticsFromMetadata(metadata: Record<string, unknown> | undefined): CoreSpiritOutputSemantics | undefined {
  const raw = metadata?.coreSpiritExecution;
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const phases: readonly string[] = ['historical', 'forming', 'confirmed', 'correction', 'replay'];
  const modes: readonly string[] = ['historical', 'realtime', 'replay', 'backtest', 'historicalTick'];
  if (value.version !== 1 || !phases.includes(String(value.barPhase)) || !modes.includes(String(value.executionMode))) return undefined;
  const causalityValues: readonly string[] = ['causal', 'noncausal', 'future-dependent', 'repainting', 'unknown'];
  const lookaheadValues: readonly string[] = ['false', 'true', 'unknown'];
  if (!causalityValues.includes(String(value.causality)) || !lookaheadValues.includes(String(value.lookahead))) return undefined;
  if (typeof value.isRealtime !== 'boolean' || typeof value.isConfirmed !== 'boolean') return undefined;
  if (value.realtimeSafe !== true && value.realtimeSafe !== false && value.realtimeSafe !== 'unknown') return undefined;
  if (value.backtestLiveEquivalent !== true && value.backtestLiveEquivalent !== false && value.backtestLiveEquivalent !== 'unknown') return undefined;
  return value as unknown as CoreSpiritOutputSemantics;
}
