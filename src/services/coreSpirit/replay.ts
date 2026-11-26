import type { CoreSpiritMarketBar } from './marketData';
import { CoreSpiritRuntime } from './runtime';
import type { CoreSpiritIrProgram } from './ir';
import { coreSpiritChecksum, makeExecutableArtifact } from './artifact';
import { validateCoreSpiritIr } from './irContract';
import type { CoreSpiritObject } from './types';
import type { CoreSpiritRuntimeState, CoreSpiritRuntimeOptions } from './runtime';
import { CORE_SPIRIT_COMPILER_VERSION, CORE_SPIRIT_IR_VERSION, CORE_SPIRIT_RUNTIME_VERSION } from './VERSION';

export type CoreSpiritReplayDataset = {
  id: string;
  bars: CoreSpiritMarketBar[];
  symbol?: string;
  timeframe?: string;
  source?: string;
  normalizedSource?: string;
  semanticFingerprint?: string;
  dataVersion?: string;
  inputConfiguration?: Readonly<Record<string, unknown>>;
  runtimeConfiguration?: Readonly<Record<string, unknown>>;
  eventSequence?: readonly (string | number)[];
  modelArtifactVersion?: string;
  runtimeOptions?: Pick<CoreSpiritRuntimeOptions, 'timezone'|'maxStepsPerBar'|'stateHistoryLimit'|'maxHistoryBars'|'executionTier'|'resourceBudget'|'inputValues'>;
};

export type CoreSpiritReplayResult = {
  datasetId: string;
  sourceId: string;
  irChecksum: string;
  outputChecksum: string;
  stateChecksum: string;
  traceChecksum: string;
  executionIdentity: CoreSpiritReplayExecutionIdentity;
  executionIdentityChecksum: string;
  outputs: CoreSpiritObject[];
  state: CoreSpiritRuntimeState;
  trace: CoreSpiritReplayTraceEntry[];
};

export type CoreSpiritReplayExecutionIdentity = Readonly<{
  schemaVersion: 1;
  sourceId: string;
  compilerVersion: string;
  irVersion: number;
  runtimeVersion: string;
  sourceHash: string;
  artifactChecksum: string;
  symbol: string;
  timeframe: string;
  dataVersion: string;
  eventSequenceChecksum: string;
  inputConfigurationChecksum: string;
  runtimeConfigurationChecksum: string;
  modelArtifactVersion: string | null;
}>;

export type CoreSpiritReplayTraceEntry = {
  barIndex: number;
  timestamp: number;
  outputCount: number;
  outputChecksum: string;
  stateChecksum: string;
};

export function replayCoreSpirit(ir: CoreSpiritIrProgram, dataset: CoreSpiritReplayDataset, sourceId = ir.sourceId): CoreSpiritReplayResult {
  if (!validateCoreSpiritIr(ir)) throw new Error('Cannot replay invalid CoreSpirit IR');
  const artifact = makeExecutableArtifact(ir, { source:dataset.source ?? '', normalizedSource:dataset.normalizedSource ?? dataset.source ?? '', semanticFingerprint:dataset.semanticFingerprint ?? '' });
  const runtime = new CoreSpiritRuntime({
    sourceId,
    symbol: dataset.symbol,
    timeframe: dataset.timeframe,
    executionMode: 'replay',
    ...(dataset.runtimeOptions ?? {}),
    // Replay identity must be stable across repeated runs; the runtime otherwise
    // generates a time-based runId that would leak into signal metadata.
    runId: `${sourceId}:replay:${dataset.id}`,
  });
  runtime.loadIr(artifact.ir);
  const execution = runtime.executeIr(artifact.ir, dataset.bars);
  const trace = buildTrace(execution.outputs, execution.state, dataset.bars);
  const executionIdentity: CoreSpiritReplayExecutionIdentity = Object.freeze({
    schemaVersion: 1,
    sourceId,
    compilerVersion: CORE_SPIRIT_COMPILER_VERSION,
    irVersion: CORE_SPIRIT_IR_VERSION,
    runtimeVersion: CORE_SPIRIT_RUNTIME_VERSION,
    sourceHash: artifact.abi.sourceHash,
    artifactChecksum: artifact.checksum,
    symbol: dataset.symbol ?? '',
    timeframe: dataset.timeframe ?? '',
    dataVersion: dataset.dataVersion ?? coreSpiritChecksum(dataset.bars),
    eventSequenceChecksum: coreSpiritChecksum(dataset.eventSequence ?? dataset.bars.map((bar, index) => [index, bar.timestamp, bar.open, bar.high, bar.low, bar.close, bar.volume])),
    inputConfigurationChecksum: coreSpiritChecksum(dataset.inputConfiguration ?? dataset.runtimeOptions?.inputValues ?? {}),
    runtimeConfigurationChecksum: coreSpiritChecksum(dataset.runtimeConfiguration ?? { ...(dataset.runtimeOptions ?? {}), executionMode: 'replay' }),
    modelArtifactVersion: dataset.modelArtifactVersion ?? null,
  });
  const executionIdentityChecksum = coreSpiritChecksum(executionIdentity);
  return {
    datasetId: dataset.id,
    sourceId,
    irChecksum: artifact.checksum,
    outputChecksum: coreSpiritChecksum(execution.outputs),
    stateChecksum: coreSpiritChecksum(execution.state),
    traceChecksum: coreSpiritChecksum(trace),
    executionIdentity,
    executionIdentityChecksum,
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
    first.traceChecksum === second.traceChecksum &&
    first.executionIdentityChecksum === second.executionIdentityChecksum;
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
