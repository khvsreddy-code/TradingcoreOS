import { coreSpiritChecksum, type CoreSpiritExecutableArtifact } from './artifact';
import { CoreSpiritRuntime, type CoreSpiritRuntimeState } from './runtime';
import { buildSignalExplanation, type CoreSpiritSignalExplanation } from './explainability';
import type { CoreSpiritMarketBar } from './marketData';
import type { CoreSpiritObject } from './types';
import type {
  CoreSpiritDebuggerSnapshot,
  DebuggerBarSnapshot,
  DebuggerFrame,
  DebuggerIrStep,
  DebuggerOutput,
  DebuggerSourceLocation,
  DebuggerStateEntry,
} from './debuggerContract';

export const CORE_SPIRIT_VISUAL_DEBUGGER_VERSION = 1 as const;

export type CoreSpiritDebuggerSourceHighlight = DebuggerSourceLocation & {
  reason: 'signal' | 'output' | 'instruction' | 'current-bar';
  text?: string;
};

export type CoreSpiritVisualDebuggerSnapshot = CoreSpiritDebuggerSnapshot & {
  visualDebuggerVersion: typeof CORE_SPIRIT_VISUAL_DEBUGGER_VERSION;
  selectedBarIndex: number;
  selectedTimestamp: number;
  sourceHighlight?: CoreSpiritDebuggerSourceHighlight;
  explanations: readonly CoreSpiritSignalExplanation[];
  executionPath: readonly DebuggerIrStep[];
  traceChecksum: string;
};

export type CoreSpiritVisualDebuggerOptions = {
  artifact: CoreSpiritExecutableArtifact;
  bars: readonly CoreSpiritMarketBar[];
  symbol: string;
  timeframe: string;
  sourceText?: string;
  sourceId?: string;
  maxCachedBars?: number;
};

function scalar(value: unknown): number | boolean | string | null {
  if (value == null) return null;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value;
  return String(value);
}

function stateEntries(state: CoreSpiritRuntimeState): DebuggerStateEntry[] {
  const out: DebuggerStateEntry[] = [];
  const bar = state.barState;
  out.push(
    { name: 'open', value: Number((bar as any).open ?? NaN) || null },
    { name: 'high', value: Number((bar as any).high ?? NaN) || null },
    { name: 'low', value: Number((bar as any).low ?? NaN) || null },
    { name: 'close', value: Number((bar as any).close ?? NaN) || null },
    { name: 'volume', value: Number((bar as any).volume ?? NaN) || null },
  );
  for (const [name, value] of Object.entries(state.locals)) {
    out.push({ name, value: scalar(value) });
  }
  return out;
}

function barSnapshot(bar: CoreSpiritMarketBar, barIndex: number, state: CoreSpiritRuntimeState): DebuggerBarSnapshot {
  const timestamp = new Date(bar.timestamp).getTime();
  return {
    barIndex,
    timestamp,
    symbol: state.barState.symbol,
    timeframe: state.barState.timeframe,
    mode: state.barState.mode === 'replay' || state.barState.mode === 'realtime' ? state.barState.mode : 'historical',
    confirmed: state.barState.isConfirmed,
    revision: state.barState.revision,
    values: [
      { name: 'open', value: Number(bar.open) },
      { name: 'high', value: Number(bar.high) },
      { name: 'low', value: Number(bar.low) },
      { name: 'close', value: Number(bar.close) },
      { name: 'volume', value: Number(bar.volume) },
      ...Object.entries(state.locals).map(([name, value]) => ({ name, value: scalar(value) })),
    ],
  };
}

function sourceForPc(artifact: CoreSpiritExecutableArtifact, pc: number): DebuggerSourceLocation | undefined {
  const entries = artifact.ir.sourceMap.entries.filter(entry => entry.instruction <= pc);
  const entry = entries.at(-1);
  if (!entry) return undefined;
  return { line: entry.line, column: entry.column, length: Math.max(1, entry.end - entry.start) };
}

function sourceTextAt(sourceText: string | undefined, location: DebuggerSourceLocation | undefined): string | undefined {
  if (!sourceText || !location) return undefined;
  const line = sourceText.replace(/\r/g, '').split('\n')[location.line - 1];
  return line == null ? undefined : line;
}

function lastItem<T>(items: readonly T[]): T | undefined { return items.length ? items[items.length - 1] : undefined; }

function outputsAtBar(outputs: readonly CoreSpiritObject[], barIndex: number, timestamp: number): DebuggerOutput[] {
  return outputs
    .filter(output => Number((output as any).time) === timestamp || Number((output as any).metadata?.barIndex) === barIndex)
    .map(output => {
      if (output.kind === 'signal') { const signal = output as Extract<CoreSpiritObject, { kind: 'signal' }>; return { kind: 'signal' as const, name: signal.type, message: String(signal.metadata?.reason ?? 'Signal emitted') }; }
      if (output.kind === 'series') return { kind: 'plot' as const, name: output.name ?? output.seriesId, value: output.value };
      if (output.kind === 'label') return { kind: 'label' as const, name: output.id, message: output.text };
      return { kind: 'diagnostic' as const, name: output.kind, message: 'CoreSpirit runtime output' };
    });
}

export class CoreSpiritVisualDebuggerSession {
  private readonly cache = new Map<number, CoreSpiritVisualDebuggerSnapshot>();
  private readonly maxCachedBars: number;

  constructor(private readonly options: CoreSpiritVisualDebuggerOptions) {
    this.maxCachedBars = Math.max(4, options.maxCachedBars ?? 32);
  }

  listBars(): Array<{ barIndex: number; timestamp: number }> {
    return this.options.bars.map((bar, barIndex) => ({ barIndex, timestamp: new Date(bar.timestamp).getTime() }));
  }

  inspectTimestamp(timestamp: number): CoreSpiritVisualDebuggerSnapshot {
    let selected = 0;
    let distance = Number.POSITIVE_INFINITY;
    this.options.bars.forEach((bar, index) => {
      const next = Math.abs(new Date(bar.timestamp).getTime() - timestamp);
      if (next < distance) { distance = next; selected = index; }
    });
    return this.inspectBar(selected);
  }

  inspectBar(barIndex: number): CoreSpiritVisualDebuggerSnapshot {
    const bounded = Math.max(0, Math.min(this.options.bars.length - 1, Math.floor(barIndex)));
    const cached = this.cache.get(bounded);
    if (cached) return cached;
    if (!this.options.bars.length) throw new Error('visual debugger requires at least one market bar');

    const runtime = new CoreSpiritRuntime({
      symbol: this.options.symbol,
      timeframe: this.options.timeframe,
      sourceId: this.options.sourceId ?? this.options.artifact.sourceId,
      executionMode: 'replay',
      executionTarget: 'replay',
      runId: `${this.options.artifact.sourceId}:debug:${bounded}`,
    });
    runtime.loadIr(this.options.artifact.ir);
    const execution = runtime.executeIr(this.options.artifact.ir, this.options.bars.slice(0, bounded + 1));
    const selectedBar = this.options.bars[bounded];
    const timestamp = new Date(selectedBar.timestamp).getTime();
    const rawTrace = runtime.getDebugTrace();
    const irTrace: DebuggerIrStep[] = rawTrace.flatMap(step => { const pc = Number(step.pc); if (!Number.isFinite(pc)) return []; const source = step.source && typeof step.source === 'object' ? step.source as DebuggerSourceLocation : sourceForPc(this.options.artifact, pc); return [{ ...step, pc, opcode: String(step.opcode ?? ''), args: Array.isArray(step.args) ? step.args : [], source } as DebuggerIrStep]; });
    const lastEmit = [...irTrace].reverse().find(step => step.opcode === 'emit');
    const lastCall = [...irTrace].reverse().find(step => step.opcode === 'call');
    const source = lastEmit?.source
      ?? lastCall?.source
      ?? sourceForPc(this.options.artifact, lastItem(irTrace)?.pc ?? 0);
    const explanationOutputs = execution.outputs.filter((output): output is Extract<CoreSpiritObject, { kind: 'signal' }> => output.kind === 'signal' && (Number(output.time) === timestamp || Number(output.metadata?.barIndex) === bounded));
    const explanations = explanationOutputs.map((signal, index) => buildSignalExplanation({
      signalId: String(signal.metadata?.signalId ?? `${this.options.artifact.sourceId}:debug:${bounded}:${index}`),
      sourceId: this.options.artifact.sourceId,
      runId: `${this.options.artifact.sourceId}:debug:${bounded}`,
      symbol: this.options.symbol,
      timeframe: this.options.timeframe,
      barIndex: bounded,
      timestamp,
      type: String(signal.type),
      reason: typeof signal.metadata?.reason === 'string' ? signal.metadata.reason : `Signal ${String(signal.type)} emitted`,
      facts: Array.isArray(signal.metadata?.explanationFacts) ? signal.metadata?.explanationFacts as any : stateEntries(execution.state).map(entry => ({ id:`debug:${entry.name}`, label:entry.name, value:entry.value, category:'indicator' as const })),
      source: { line: source?.line, column: source?.column },
    }));
    const outputs = outputsAtBar(execution.outputs, bounded, timestamp);
    const frame: DebuggerFrame = {
      bar: barSnapshot(selectedBar, bounded, execution.state),
      source,
      ir: lastEmit ?? lastItem(irTrace),
      state: stateEntries(execution.state),
      outputs,
    };
    const sourceHighlight = source ? { ...source, reason: explanationOutputs.length ? 'signal' as const : outputs.length ? 'output' as const : 'current-bar' as const, text: sourceTextAt(this.options.sourceText, source) } : undefined;
    const snapshot: CoreSpiritVisualDebuggerSnapshot = {
      version: 1,
      visualDebuggerVersion: CORE_SPIRIT_VISUAL_DEBUGGER_VERSION,
      programChecksum: this.options.artifact.checksum,
      bar: frame.bar,
      frames: [frame],
      selectedBarIndex: bounded,
      selectedTimestamp: timestamp,
      sourceHighlight,
      explanations,
      executionPath: irTrace,
      traceChecksum: coreSpiritChecksum({ barIndex: bounded, irTrace, state: execution.state, outputs }),
    };
    this.cache.set(bounded, snapshot);
    while (this.cache.size > this.maxCachedBars) this.cache.delete(this.cache.keys().next().value as number);
    return snapshot;
  }

  clearCache(): void { this.cache.clear(); }
}
