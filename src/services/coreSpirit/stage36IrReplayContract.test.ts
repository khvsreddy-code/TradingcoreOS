import { compileCoreSpirit } from './coreSpiritPipeline';
import { assertDeterministicReplay } from './replay';
import { validateCoreSpiritIr, CORE_SPIRIT_IR_OPCODES } from './irContract';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';

const bars: HistoricalCandle[] = Array.from({length: 12}, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 8, 25, 3, i * 5)).toISOString(),
  open: 100 + i,
  high: 102 + i,
  low: 99 + i,
  close: 101 + i + (i % 3 === 0 ? 1 : 0),
  volume: 1000 + i * 100,
}));

export function runCoreSpiritStage36IrReplayContractTest(): void {
  const compiled = compileCoreSpirit('let fast = ema(close, 3); let slow = sma(close, 5); plot(fast); plot(slow); if crossover(fast, slow) { signal("UP") }', 'stage36');
  if (!compiled.ir || compiled.diagnostics.some(d => d.severity === 'error')) throw new Error('stage36 compile failed');
  if (!validateCoreSpiritIr(compiled.ir)) throw new Error('stage36 IR rejected by stable contract');
  if (!compiled.ir.entry.instructions.every(i => (CORE_SPIRIT_IR_OPCODES as readonly string[]).includes(i.op))) throw new Error('stage36 contains an unknown opcode');

  const { first, second } = assertDeterministicReplay(compiled.ir, { id:'stage36-dataset', bars, symbol:'TEST', timeframe:'5m' }, 'stage36');
  if (first.outputChecksum !== second.outputChecksum) throw new Error('replay outputs are not deterministic');
  if (first.stateChecksum !== second.stateChecksum) throw new Error('replay state is not deterministic');
  if (first.traceChecksum !== second.traceChecksum) throw new Error('replay trace is not deterministic');
  if (first.trace.length !== bars.length) throw new Error('replay trace does not cover every bar');
}
