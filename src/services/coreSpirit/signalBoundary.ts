/** CoreSpirit emits signals; TradingCoreOS risk/execution owns orders. */
export type CoreSpiritSignalKind = "BUY" | "SELL" | "LONG" | "SHORT" | "EXIT" | "CUSTOM";
export interface CoreSpiritSignal { id: string; kind: CoreSpiritSignalKind; barIndex: number; timestamp: number; symbol: string; timeframe: string; confidence?: number; metadata?: Readonly<Record<string, string | number | boolean | null | readonly unknown[] | Readonly<Record<string, unknown>>>>; }
export interface OrderProposal { id: string; signalId: string; symbol: string; side: "buy" | "sell"; quantity?: number; reason: string; createdAt: number; }
export interface RiskDecision { proposalId: string; allowed: boolean; reason: string; }
export interface ExecutionRequest { proposalId: string; venue: string; symbol: string; side: "buy" | "sell"; quantity: number; policyId: string; }
export interface CoreSpiritExecutionBoundary { emitSignal(signal: CoreSpiritSignal): void; }
export function signalToOrderProposal(signal: CoreSpiritSignal, side: "buy" | "sell", reason: string, now: number): OrderProposal { return { id: `proposal:${signal.id}`, signalId: signal.id, symbol: signal.symbol, side, reason, createdAt: now }; }


export type CoreSpiritSignalDecisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUBMITTED';
export interface CoreSpiritSignalDecisionStep { stage: 'SIGNAL' | 'RISK' | 'POLICY' | 'EXECUTION'; status: CoreSpiritSignalDecisionStatus; reason: string; timestamp: number; }
export interface CoreSpiritInspectableSignal extends CoreSpiritSignal { reason: string; facts: ReadonlyArray<{ label: string; value: number | string | boolean | null; category: string }>; decisionPath: ReadonlyArray<CoreSpiritSignalDecisionStep>; }
