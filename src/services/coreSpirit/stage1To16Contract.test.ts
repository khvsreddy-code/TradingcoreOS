import { CORE_SPIRIT_STAGES, validateCoreSpiritRoadmap } from './coreSpiritRoadmap';
import { CORE_SPIRIT_STANDARD_LIBRARY } from './standardLibrary';
import { CORE_SPIRIT_IR_OPCODES } from './irContract';
import { CORE_SPIRIT_DEFAULT_SANDBOX, validateCoreSpiritSandboxPolicy } from './sandboxPolicy';
import { CORE_SPIRIT_LIFECYCLE_RULES } from './executionProtocol';
import { extractCoreSpiritSourceMetadata } from './sourceMetadata';
import { compileCoreSpirit } from './coreSpiritPipeline';
import { CoreSpiritRuntime } from './runtime';
import { assertDeterministicReplay } from './replay';
import { strategyEventToOrderIntent, type CoreSpiritStrategyEvent } from './strategyContract';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';

const killerSource = `strategy("EMA + RSI Cross")\n\ninput fast = 20\ninput slow = 50\ninput rsiLength = 14\n\nemaFast = ema(close, fast)\nemaSlow = ema(close, slow)\nr = rsi(close, rsiLength)\n\nplot(emaFast)\nplot(emaSlow)\n\nlongSignal = crossover(emaFast, emaSlow) and r > 50\nshortSignal = crossunder(emaFast, emaSlow) and r < 50\n\nsignal(longSignal, "LONG")\nsignal(shortSignal, "SHORT")`;

const bars: HistoricalCandle[] = Array.from({ length: 30 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 8, 25, 3, i * 5)).toISOString(),
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i + (i % 4 === 0 ? 2 : 0),
  volume: 1000 + i * 20,
}));

export function runCoreSpiritStage1To16ContractTest(): void {
  const roadmapErrors = validateCoreSpiritRoadmap();
  if (roadmapErrors.length) throw new Error(roadmapErrors.join('; '));
  if (CORE_SPIRIT_STAGES.length !== 16) throw new Error('stage count must remain exactly 16');

  if (CORE_SPIRIT_STANDARD_LIBRARY.length !== 30) throw new Error('core stdlib must remain 30 primitives');
  if (!CORE_SPIRIT_IR_OPCODES.includes('loadSeries') || !CORE_SPIRIT_IR_OPCODES.includes('emit')) throw new Error('stable IR opcode contract incomplete');
  if (validateCoreSpiritSandboxPolicy(CORE_SPIRIT_DEFAULT_SANDBOX).length) throw new Error('default sandbox policy invalid');
  if (!CORE_SPIRIT_LIFECYCLE_RULES.realtimeRevisionRequiresRollbackOfPriorRevision) throw new Error('realtime rollback rule missing');

  const metadata = extractCoreSpiritSourceMetadata(killerSource);
  if (metadata.kind !== 'strategy' || metadata.name !== 'EMA + RSI Cross') throw new Error('strategy metadata was not recognized');

  const compiled = compileCoreSpirit(killerSource, 'cs-golden-ema-rsi');
  if (!compiled.ir || compiled.diagnostics.some(d => d.severity === 'error')) {
    throw new Error(`killer example did not compile: ${compiled.diagnostics.map(d => d.message).join('; ')}`);
  }

  const dataset = { id: 'cs-golden-dataset', bars, symbol: 'NSE:NIFTY50', timeframe: '5m' };
  const replay = assertDeterministicReplay(compiled.ir, dataset, 'cs-golden-ema-rsi');
  if (replay.first.outputChecksum !== replay.second.outputChecksum) throw new Error('golden replay output nondeterminism');
  if (replay.first.stateChecksum !== replay.second.stateChecksum) throw new Error('golden replay state nondeterminism');
  if (replay.first.traceChecksum !== replay.second.traceChecksum) throw new Error('golden replay trace nondeterminism');

  // Historical is the reference; committed realtime must converge to it.
  const historicalRuntime = new CoreSpiritRuntime({ sourceId: 'cs-golden-historical', symbol: 'NSE:NIFTY50', timeframe: '5m', executionMode: 'historical' });
  const historical = historicalRuntime.executeIr(compiled.ir, bars);
  const realtimeRuntime = new CoreSpiritRuntime({ sourceId: 'cs-golden-realtime', symbol: 'NSE:NIFTY50', timeframe: '5m', executionMode: 'realtime' });
  realtimeRuntime.loadIr(compiled.ir);
  const realtimeOutputs: any[] = [];
  for (const bar of bars) {
    const result = realtimeRuntime.executeBar(bar);
    if (!result.state.barState.isRealtime || result.state.barState.isConfirmed) throw new Error('golden realtime revision is not provisional');
    realtimeOutputs.push(...result.outputs);
    realtimeRuntime.commitRealtimeBar();
    if (!realtimeRuntime.getExecutionFrame()?.isConfirmed) throw new Error('golden realtime commit did not confirm');
  }
  const normalize = (xs: any[]) => xs.map(x => ({ kind: x.kind, time: x.time, value: x.value ?? null, type: x.type ?? null }));
  if (JSON.stringify(normalize(historical.outputs)) !== JSON.stringify(normalize(realtimeOutputs))) throw new Error('golden realtime committed outputs diverged from historical');

  // Strategy boundary: an entry event becomes an order intent only outside CoreSpirit execution.
  const entryEvent: CoreSpiritStrategyEvent = {
    id: 'event:golden:1', strategyId: 'ema-rsi-cross', kind: 'entry', direction: 'long',
    positionId: 'ema-rsi-cross:long', barIndex: 20, timestamp: bars[20].timestamp ? Date.parse(bars[20].timestamp) : 0,
    symbol: 'NSE:NIFTY50', timeframe: '5m', reason: 'EMA crossover with RSI > 50',
  };
  const intent = strategyEventToOrderIntent(entryEvent, entryEvent.timestamp + 1, 1);
  if (intent.side !== 'buy' || intent.strategyEventId !== entryEvent.id) throw new Error('strategy event did not map to a platform order intent correctly');
}

console.log('STAGE1_16_ARCHITECTURE_OK');
