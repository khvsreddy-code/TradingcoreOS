import type { CoreSpiritMarketBar } from './marketData';
import { CoreSpiritRuntime } from './runtime';
import type { CoreSpiritIrProgram } from './ir';
import { coreSpiritChecksum, makeExecutableArtifact } from './artifact';
import { validateCoreSpiritIr } from './irContract';
import type { CoreSpiritObject } from './types';
import type { CoreSpiritRuntimeState } from './runtime';

export type CoreSpiritReplayDataset = {
  id: string;
  bars: CoreSpiritMarketBar[];
  symbol?: string;
  timeframe?: string;
};

export type CoreSpiritReplayResult = {
  datasetId: string;
  sourceId: string;
  irChecksum: string;
  outputChecksum: string;
  stateChecksum: string;
  traceChecksum: string;
  outputs: CoreSpiritObject[];
  state: CoreSpiritRuntimeState;
  trace: CoreSpiritReplayTraceEntry[];
};

export type CoreSpiritReplayTraceEntry = {
  barIndex: number;
  timestamp: number;
  outputCount: number;
  outputChecksum: string;
  stateChecksum: string;
};

export function replayCoreSpirit(ir: CoreSpiritIrProgram, dataset: CoreSpiritReplayDataset, sourceId = ir.sourceId): CoreSpiritReplayResult {
  if (!validateCoreSpiritIr(ir)) throw new Error('Cannot replay invalid CoreSpirit IR');
  const artifact = makeExecutableArtifact(ir);
  const runtime = new CoreSpiritRuntime({
    sourceId,
    symbol: dataset.symbol,
    timeframe: dataset.timeframe,
    executionMode: 'replay',
    // Replay identity must be stable across repeated runs; the runtime otherwise
    // generates a time-based runId that would leak into signal metadata.
    runId: `${sourceId}:replay:${dataset.id}`,
  });
  runtime.loadIr(artifact.ir);
  const execution = runtime.executeIr(artifact.ir, dataset.bars);
  const trace = buildTrace(execution.outputs, execution.state, dataset.bars);
  return {
    datasetId: dataset.id,
    sourceId,
    irChecksum: artifact.checksum,
    outputChecksum: coreSpiritChecksum(execution.outputs),
    stateChecksum: coreSpiritChecksum(execution.state),
    traceChecksum: coreSpiritChecksum(trace),
    outputs: execution.outputs,
    state: execution.state,
    trace,
  };
}

export function assertDeterministicReplay(ir: CoreSpiritIrProgram, dataset: CoreSpiritReplayDataset, sourceId = ir.sourceId): { first: CoreSpiritReplayResult; second: CoreSpiritReplayResult } {
  const first = replayCoreSpirit(ir, dataset, sourceId);
  const second = replayCoreSpirit(ir, dataset, sourceId);
  const same = first.irChecksum === second.irChecksum &&
    first.outputChecksum === second.outputChecksum &&
    first.stateChecksum === second.stateChecksum &&
    first.traceChecksum === second.traceChecksum;
  if (!same) throw new Error(`CoreSpirit replay is nondeterministic: ${first.outputChecksum}/${second.outputChecksum}`);
  return { first, second };
}

function buildTrace(outputs: CoreSpiritObject[], state: CoreSpiritRuntimeState, bars: CoreSpiritMarketBar[]): CoreSpiritReplayTraceEntry[] {
  return bars.map((bar, barIndex) => {
    const time = new Date(bar.timestamp).getTime();
    const barOutputs = outputs.filter(output => Number((output as any).time) === time || Number((output as any).metadata?.barIndex) === barIndex);
    return {
      barIndex,
      timestamp: time,
      outputCount: barOutputs.length,
      outputChecksum: coreSpiritChecksum(barOutputs),
      stateChecksum: barIndex === state.barIndex ? coreSpiritChecksum(state) : coreSpiritChecksum({ barIndex, timestamp: time }),
    };
  });
}
