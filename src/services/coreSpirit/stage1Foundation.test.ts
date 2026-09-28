import { CoreSpiritLexer, CoreSpiritSyntaxError } from './lexer';
import { makeCoreSpiritProgram, compileCoreSpirit } from './coreSpiritPipeline';
import { CoreSpiritRuntime } from './runtime';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';

const bars: HistoricalCandle[] = Array.from({ length: 6 }, (_, i) => ({
  timestamp: new Date(Date.UTC(2026, 0, 1, 3, i)).toISOString(),
  open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000 + i,
}));

/** Stage 1 contract checks. Kept dependency-free so it can be run by any TS test runner. */
export function runCoreSpiritStage1FoundationTest(): void {
  const tokens = new CoreSpiritLexer('/* header */ let x = close; // line\n x = x + 1;').tokenize();
  if (!tokens.some(t => t.type === 'let') || !tokens.some(t => t.type === 'equal')) throw new Error('lexer comments/tokenization failed');

  try { new CoreSpiritLexer('/* unterminated').tokenize(); throw new Error('unterminated block comment accepted'); }
  catch (e) { if (!(e instanceof CoreSpiritSyntaxError)) throw e; }

  const source = 'let x = close * 2; plot(x);';
  const compiled = compileCoreSpirit(source, 'stage1');
  if (!compiled.ir || !compiled.artifact) throw new Error('stage1 compile failed');

  const runtime = new CoreSpiritRuntime({ sourceId: 'stage1', stateHistoryLimit: 2048 });
  runtime.loadProgram(makeCoreSpiritProgram(source, 'stage1'));
  const result = runtime.executeIr(compiled.ir, bars);
  if (result.diagnostics.length !== 0) throw new Error(result.diagnostics.join('; '));
  const plots = result.outputs.filter(o => o.kind === 'series');
  if (plots.length !== bars.length || plots[0].value !== 202 || plots[5].value !== 212) throw new Error('chronological execution/output failed');

  const realtime = new CoreSpiritRuntime({ sourceId: 'stage1-realtime' });
  realtime.loadProgram(makeCoreSpiritProgram('let e = ema(close, 2); plot(e);', 'stage1-realtime'));
  realtime.executeBar({ ...bars[0], close: 101 });
  realtime.executeBar({ ...bars[0], close: 103 });
  const committed = realtime.executeBar({ ...bars[1], close: 105 });
  if ((committed.state.seriesState['ema:close:2'] || []).length !== 2) throw new Error('realtime rollback/commit failed');

  const aborter = new AbortController();
  aborter.abort();
  const aborted = new CoreSpiritRuntime({ sourceId: 'stage1-abort', abortSignal: aborter.signal });
  aborted.loadProgram(makeCoreSpiritProgram('plot(close);', 'stage1-abort'));
  try { aborted.executeBar(bars[0]); throw new Error('aborted execution was not stopped'); }
  catch (e) { if (!(e instanceof DOMException) && !String(e).includes('aborted')) throw e; }
}
