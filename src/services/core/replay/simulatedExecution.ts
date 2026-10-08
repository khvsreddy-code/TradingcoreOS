import { compileCoreSpirit } from '../../coreSpirit/coreSpiritPipeline';
import { replayCoreSpirit, type CoreSpiritReplayDataset } from '../../coreSpirit/replay';
import type { CoreSpiritIrProgram } from '../../coreSpirit/ir';
import type { CoreSpiritObject } from '../../coreSpirit/types';

export type SimulatedFill = {
  id: string;
  time: number;
  price: number;
  qty: number;
  side: 'Buy' | 'Sell';
  reason: 'entry' | 'exit' | 'reverse' | 'stop' | 'target';
};
export type SimulatedTrade = {
  id: string;
  side: 'long' | 'short';
  qty: number;
  entry: SimulatedFill;
  exit?: SimulatedFill;
  pnl?: number;
  status: 'open' | 'closed';
};
export type SimulatedExecutionState = {
  cash: number;
  equity: number;
  position: number;
  avgPrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
  maxDrawdown: number;
  peakEquity: number;
  currentStop: number | null;
  currentTarget: number | null;
  fills: SimulatedFill[];
  trades: SimulatedTrade[];
};
export type ReplaySimulationReport = {
  datasetId: string;
  sourceId: string;
  initialCapital: number;
  finalEquity: number;
  returnPct: number;
  maxDrawdown: number;
  winRate: number;
  fills: SimulatedFill[];
  trades: SimulatedTrade[];
  outputs: CoreSpiritObject[];
  traceCount: number;
  riskEvents: number;
};

function finite(v: unknown, fallback = 0): number { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function barTime(bar: any): number { const n = Number(bar.timestamp); const t = Number.isFinite(n) ? (n > 1e12 ? n : n * 1000) : Date.parse(String(bar.timestamp)); return Number.isFinite(t) ? t : 0; }
function outputTime(o: CoreSpiritObject): number { return finite((o as any).time); }

function intentQty(intent: any, state: SimulatedExecutionState, entryPrice: number): number {
  const sizing = intent.sizing;
  if (sizing?.kind === 'quantity') return Math.max(0, Math.floor(finite(sizing.value)));
  if (sizing?.kind === 'all') return Math.abs(state.position);
  if (sizing?.kind === 'riskPercent') {
    const budget = Math.max(0, state.equity) * Math.max(0, finite(sizing.value)) / 100;
    const stop = finite(intent.stop, NaN);
    const riskPerUnit = Number.isFinite(stop) ? Math.abs(entryPrice - stop) : 0;
    if (riskPerUnit > 0) return Math.max(0, Math.floor(budget / riskPerUnit));
    return 1;
  }
  if (intent.metadata?.quantity != null) return Math.max(0, Math.floor(finite(intent.metadata.quantity)));
  return 1;
}

function markEquity(state: SimulatedExecutionState, close: number): void {
  state.unrealizedPnl = state.position > 0 ? (close - state.avgPrice) * state.position : state.position < 0 ? (state.avgPrice - close) * Math.abs(state.position) : 0;
  state.equity = state.cash + (state.position * close);
  state.peakEquity = Math.max(state.peakEquity, state.equity);
  state.maxDrawdown = Math.max(state.maxDrawdown, state.peakEquity - state.equity);
}

function closePosition(state: SimulatedExecutionState, price: number, time: number, index: number, reason: SimulatedFill['reason']): boolean {
  if (state.position === 0) return false;
  const qty = Math.abs(state.position);
  const side: SimulatedFill['side'] = state.position > 0 ? 'Sell' : 'Buy';
  const fill: SimulatedFill = { id: 'sim-' + index + '-' + state.fills.length, time, price, qty, side, reason };
  state.fills.push(fill);
  if (side === 'Sell') state.cash += price * qty;
  else state.cash -= price * qty;
  const trade = state.trades.at(-1);
  const pnl = state.position > 0 ? (price - state.avgPrice) * qty : (state.avgPrice - price) * qty;
  state.realizedPnl += pnl;
  if (trade) { trade.exit = fill; trade.pnl = pnl; trade.status = 'closed'; }
  state.position = 0;
  state.avgPrice = 0;
  state.currentStop = null;
  state.currentTarget = null;
  markEquity(state, price);
  return true;
}

function executeIntent(state: SimulatedExecutionState, intent: any, bar: any, index: number): void {
  const time = barTime(bar);
  const entryPrice = Math.max(0.000001, finite(intent.metadata?.price, bar.close));
  const desiredSide = intent.side === 'long' ? 1 : intent.side === 'short' ? -1 : 0;
  if (desiredSide === 0) { closePosition(state, entryPrice, time, index, 'exit'); return; }

  const qty = intentQty(intent, state, entryPrice);
  if (qty <= 0) return;

  if (state.position !== 0 && Math.sign(state.position) !== desiredSide) {
    closePosition(state, entryPrice, time, index, 'reverse');
  }

  const fillSide: SimulatedFill['side'] = desiredSide > 0 ? 'Buy' : 'Sell';
  const oldAbs = Math.abs(state.position);
  const nextAbs = oldAbs + qty;
  const fill: SimulatedFill = { id: 'sim-' + index + '-' + state.fills.length, time, price: entryPrice, qty, side: fillSide, reason: 'entry' };
  state.fills.push(fill);
  if (fillSide === 'Buy') state.cash -= entryPrice * qty;
  else state.cash += entryPrice * qty;
  state.avgPrice = oldAbs === 0 ? entryPrice : ((state.avgPrice * oldAbs) + (entryPrice * qty)) / nextAbs;
  state.position += desiredSide * qty;
  if (oldAbs === 0) {
    state.trades.push({ id: 'sim-trade-' + index + '-' + state.trades.length, side: desiredSide > 0 ? 'long' : 'short', qty, entry: fill, status: 'open' });
  }
  const stop = finite(intent.stop, NaN);
  const target = finite(intent.target, NaN);
  state.currentStop = Number.isFinite(stop) && stop > 0 ? stop : state.currentStop;
  state.currentTarget = Number.isFinite(target) && target > 0 ? target : state.currentTarget;
  markEquity(state, entryPrice);
}

function triggerRiskExit(state: SimulatedExecutionState, bar: any, index: number): number {
  if (state.position === 0) return 0;
  const high = finite(bar.high, finite(bar.close));
  const low = finite(bar.low, finite(bar.close));
  const time = barTime(bar);
  let risk = 0;
  if (state.position > 0) {
    // Conservative same-bar ambiguity: stop wins when both levels trade inside one candle.
    if (state.currentStop != null && low <= state.currentStop) { closePosition(state, state.currentStop, time, index, 'stop'); risk++; }
    else if (state.currentTarget != null && high >= state.currentTarget) { closePosition(state, state.currentTarget, time, index, 'target'); risk++; }
  } else {
    if (state.currentStop != null && high >= state.currentStop) { closePosition(state, state.currentStop, time, index, 'stop'); risk++; }
    else if (state.currentTarget != null && low <= state.currentTarget) { closePosition(state, state.currentTarget, time, index, 'target'); risk++; }
  }
  return risk;
}

export function simulateReplayStrategy(ir: CoreSpiritIrProgram, dataset: CoreSpiritReplayDataset, initialCapital = 100000): ReplaySimulationReport {
  if (!(initialCapital > 0)) throw new Error('Replay initial capital must be positive');
  const replay = replayCoreSpirit(ir, dataset, ir.sourceId);
  const state: SimulatedExecutionState = {
    cash: initialCapital, equity: initialCapital, position: 0, avgPrice: 0, realizedPnl: 0, unrealizedPnl: 0,
    maxDrawdown: 0, peakEquity: initialCapital, currentStop: null, currentTarget: null, fills: [], trades: [],
  };
  const intents = replay.outputs
    .filter((o): o is any => o.kind === 'orderIntent')
    .sort((a, b) => outputTime(a) - outputTime(b));
  let intentCursor = 0;
  let riskEvents = 0;
  for (let i = 0; i < dataset.bars.length; i += 1) {
    const bar = dataset.bars[i] as any;
    riskEvents += triggerRiskExit(state, bar, i);
    const time = barTime(bar);
    while (intentCursor < intents.length && outputTime(intents[intentCursor]) <= time) {
      executeIntent(state, intents[intentCursor], bar, i);
      intentCursor += 1;
    }
    markEquity(state, finite(bar.close));
  }
  const closed = state.trades.filter(trade => trade.status === 'closed' && trade.pnl != null);
  const wins = closed.filter(trade => finite(trade.pnl) > 0).length;
  return {
    datasetId: dataset.id, sourceId: ir.sourceId, initialCapital, finalEquity: state.equity,
    returnPct: (state.equity / initialCapital - 1) * 100, maxDrawdown: state.maxDrawdown,
    winRate: closed.length ? wins / closed.length : 0, fills: state.fills, trades: state.trades,
    outputs: replay.outputs, traceCount: replay.trace.length, riskEvents,
  };
}

export function simulateReplayStrategyFromSource(source: string, dataset: CoreSpiritReplayDataset, sourceId = 'tco-replay-strategy', initialCapital = 100000): ReplaySimulationReport {
  const compiled = compileCoreSpirit(source, sourceId);
  const error = compiled.diagnostics?.find(x => x.severity === 'error');
  if (!compiled.ir || error) throw new Error(error?.message || 'CoreSpirit strategy compilation failed');
  return simulateReplayStrategy(compiled.ir, dataset, initialCapital);
}