import { compileCoreSpirit, makeCoreSpiritProgram } from './coreSpiritPipeline';
import { CoreSpiritRuntime } from './runtime';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';

const bars: HistoricalCandle[] = Array.from({ length: 40 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 3, i)).toISOString(),
  open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000 + i,
}));

export function runCoreSpiritStage123DeepContractTest(): void {
  const source = `indicator("Deep") { overlay: true }\nfast = ema(close, 5)\nslow = ema(close, 5)\nplot fast\nplot slow\nif fast crossesAbove slow { signal "UP" }`;
  const compiled = compileCoreSpirit(source, 'deep-contract');
  if (compiled.diagnostics.some(d => d.severity === 'error')) throw new Error(compiled.diagnostics.map(d => d.message).join('; '));
  if (!compiled.ir || compiled.ir.maxLookback !== 0) throw new Error('unexpected lookback contract');

  const runtime = new CoreSpiritRuntime({ sourceId: 'deep-contract', stateHistoryLimit: 8, maxOutputsPerBar: 20, executionMode: 'historical', runId: 'deep-1' });
  runtime.loadProgram(makeCoreSpiritProgram(source, 'deep-contract'));
  const result = runtime.executeIr(compiled.ir, bars);
  if (result.diagnostics.length) throw new Error(result.diagnostics.join('; '));
  const plots = result.outputs.filter(x => x.kind === 'series');
  if (plots.length !== bars.length * 2) throw new Error('plot lifecycle contract failed');
  const ids = new Set(plots.map(x => x.kind === 'series' ? x.seriesId : ''));
  if (ids.size !== 2) throw new Error('plot identity is not stable across bars');

  const warm = result.outputs.filter(x => x.kind === 'series' && x.value == null);
  if (warm.length === 0) throw new Error('indicator warmup/null contract failed');

  const ctx = runtime.getExecutionContext();
  if (ctx.mode !== 'historical' || ctx.runId !== 'deep-1') throw new Error('execution context contract failed');

  const bad = compileCoreSpirit('let x = missing(1);', 'bad');
  if (!bad.diagnostics.some(d => d.code === 'UNKNOWN_FUNCTION')) throw new Error('typed diagnostics missing');
}
