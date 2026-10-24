import type { CoreSpiritOrderIntent, CoreSpiritStrategyEvent, StrategyRiskDecision } from '../../coreSpirit/strategyContract';
import type { SimulationAction, SimulationIntent, SimulationOrderType, SimulationSide } from './strategySimulator';

export type SimulationExecutionTerms = Readonly<{
  type?: SimulationOrderType;
  limitPrice?: number;
  stopPrice?: number;
  timeInForceBars?: number;
}>;

export type CoreSpiritSimulationIntentRecord = Readonly<{
  event: CoreSpiritStrategyEvent;
  intent: CoreSpiritOrderIntent;
  decision: StrategyRiskDecision;
  sequence: number;
  execution?: SimulationExecutionTerms;
  /** Position snapshot at this signal boundary; required for an exit/flat intent. */
  currentPositionQuantity?: number;
}>;

/** Converts host-reviewed CoreSpirit events to simulation actions; never submits broker orders. */
export function coreSpiritIntentsToSimulationActions(records: readonly CoreSpiritSimulationIntentRecord[]): SimulationAction[] {
  if (!Array.isArray(records) || records.length > 1_000_000) throw new Error('CoreSpirit simulation intents must be a bounded array.');
  return records.map((record): SimulationAction => {
    const { event, intent, decision, execution } = record;
    if (!event || !intent || !decision || !Number.isSafeInteger(event.timestamp) ||
        !Number.isSafeInteger(record.sequence) || record.sequence < 0 ||
        !String(event.id ?? '').trim() || !String(intent.id ?? '').trim() ||
        intent.strategyEventId !== event.id || intent.symbol !== event.symbol ||
        decision.orderIntentId !== intent.id) {
      throw new Error('CoreSpirit event, order intent, and risk decision identities must match.');
    }
    const isExit = event.kind === 'exit' || intent.direction === 'flat' || intent.side === 'flat';
    const position = record.currentPositionQuantity;
    let side: SimulationSide | undefined = intent.side === 'buy' || intent.side === 'sell' ? intent.side : undefined;
    let quantity: number | undefined;
    if (isExit) {
      if (!Number.isFinite(position) || Number(position) === 0) {
        return { kind:'reject', signalTimeMs:event.timestamp, sequence:record.sequence, orderId:intent.id,
          signalId:event.id, symbol:event.symbol, side, reason:'Exit intent has no open position in the signal-time position snapshot.' };
      }
      if (!side) side = Number(position) > 0 ? 'sell' : 'buy';
      const maxExit = Math.abs(Number(position));
      const approved = decision.approvedQuantity == null ? maxExit : Number(decision.approvedQuantity);
      quantity = Math.min(maxExit, approved);
    } else {
      quantity = decision.approvedQuantity ?? intent.quantity;
    }
    if (!decision.allowed) {
      return { kind:'reject', signalTimeMs:event.timestamp, sequence:record.sequence, orderId:intent.id,
        signalId:event.id, symbol:event.symbol, side, reason:decision.reason || 'Risk engine rejected the strategy intent.' };
    }
    if (!side || !Number.isFinite(quantity) || Number(quantity) <= 0) {
      return { kind:'reject', signalTimeMs:event.timestamp, sequence:record.sequence, orderId:intent.id,
        signalId:event.id, symbol:event.symbol, side, reason:'Risk-approved intent has no resolved executable side or positive quantity.' };
    }
    const simIntent: SimulationIntent = Object.freeze({
      orderId:intent.id, signalId:event.id, symbol:event.symbol, side,
      type:execution?.type ?? 'market', quantity:Number(quantity),
      ...(execution?.limitPrice != null ? { limitPrice:execution.limitPrice } : {}),
      ...(execution?.stopPrice != null ? { stopPrice:execution.stopPrice } : {}),
      stopLossPrice:intent.stop ?? null, takeProfitPrice:intent.target ?? null,
      ...(execution?.timeInForceBars != null ? { timeInForceBars:execution.timeInForceBars } : {}),
      tag:intent.reason || event.reason,
    });
    return { kind:'submit', signalTimeMs:event.timestamp, sequence:record.sequence, intent:simIntent,
      reason:intent.reason || event.reason || 'CoreSpirit strategy event' };
  });
}
