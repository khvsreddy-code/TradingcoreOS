/**
 * One CoreSpirit VM, multiple host execution environments.
 *
 * The VM remains unchanged across historical/replay/realtime execution. The
 * host supplies data, clock semantics, revision/commit behavior and output
 * collection around the same validated executable artifact.
 */
import type { CoreSpiritExecutableArtifact } from './artifact';
import type { CoreSpiritMarketBar, CoreSpiritMarketDataset } from './marketData';
import { CoreSpiritRuntime, type CoreSpiritExecutionResult } from './runtime';
import { assertDeterministicReplay, type CoreSpiritReplayResult } from './replay';
import type { CoreSpiritObject } from './types';
import type { CoreSpiritExecutionTarget } from './executionTarget';

export type CoreSpiritExecutionHostMode = 'historical' | 'replay' | 'realtime';

export interface CoreSpiritHostRunIdentity {
  target?: CoreSpiritExecutionTarget;
  runId: string;
  artifactChecksum: string;
  datasetId: string;
  symbol: string;
  timeframe: string;
  mode: CoreSpiritExecutionHostMode;
}

export interface CoreSpiritHostRunResult {
  identity: CoreSpiritHostRunIdentity;
  outputs: readonly CoreSpiritObject[];
  diagnostics: readonly string[];
  finalState: ReturnType<CoreSpiritRuntime['getState']>;
  outputCount: number;
  reactiveStats: ReturnType<CoreSpiritRuntime['getReactiveExecutionStats']>;
}

export interface CoreSpiritExecutionHost {
  readonly mode: CoreSpiritExecutionHostMode;
  createRuntime(artifact: CoreSpiritExecutableArtifact, identity: CoreSpiritHostRunIdentity): CoreSpiritRuntime;
  run(artifact: CoreSpiritExecutableArtifact, dataset: CoreSpiritMarketDataset, runId: string, target?: CoreSpiritExecutionTarget): CoreSpiritHostRunResult;
}

abstract class BaseCoreSpiritExecutionHost implements CoreSpiritExecutionHost {
  abstract readonly mode: CoreSpiritExecutionHostMode;

  createRuntime(artifact: CoreSpiritExecutableArtifact, identity: CoreSpiritHostRunIdentity): CoreSpiritRuntime {
    const runtime = new CoreSpiritRuntime({
      sourceId: artifact.sourceId,
      symbol: identity.symbol,
      timeframe: identity.timeframe,
      executionMode: this.mode === 'realtime' ? 'realtime' : this.mode,
      executionTarget: identity.target || (this.mode === 'historical' ? 'chart' : this.mode === 'realtime' ? 'chart' : 'replay'),
      runId: identity.runId,
    });
    runtime.loadIr(artifact.ir);
    return runtime;
  }

  run(artifact: CoreSpiritExecutableArtifact, dataset: CoreSpiritMarketDataset, runId: string, target: CoreSpiritExecutionTarget = this.mode === 'historical' ? 'chart' : this.mode === 'realtime' ? 'chart' : 'replay'): CoreSpiritHostRunResult {
    const identity: CoreSpiritHostRunIdentity = {
      runId,
      artifactChecksum: artifact.checksum,
      datasetId: dataset.id,
      symbol: dataset.symbol,
      timeframe: dataset.timeframe,
      mode: this.mode,
      target,
    };
    const runtime = this.createRuntime(artifact, identity);
    const result = runtime.executeIr(artifact.ir, [...dataset.bars]);
    return {
      identity,
      outputs: result.outputs,
      diagnostics: result.diagnostics,
      finalState: result.state,
      outputCount: result.outputs.length,
      reactiveStats: runtime.getReactiveExecutionStats(),
    };
  }
}

export class CoreSpiritHistoricalExecutionHost extends BaseCoreSpiritExecutionHost {
  readonly mode = 'historical' as const;
}

export class CoreSpiritReplayExecutionHost extends BaseCoreSpiritExecutionHost {
  readonly mode = 'replay' as const;

  verifyDeterminism(artifact: CoreSpiritExecutableArtifact, dataset: CoreSpiritMarketDataset): CoreSpiritReplayResult {
    return assertDeterministicReplay(
      artifact.ir,
      { id: dataset.id, bars: dataset.bars as CoreSpiritMarketBar[], symbol: dataset.symbol, timeframe: dataset.timeframe },
      artifact.sourceId,
    ).first;
  }
}

export class CoreSpiritRealtimeExecutionHost {
  readonly mode = 'realtime' as const;

  private runtime?: CoreSpiritRuntime;

  constructor(
    private readonly artifact: CoreSpiritExecutableArtifact,
    private readonly identity: Omit<CoreSpiritHostRunIdentity, 'mode' | 'datasetId' | 'artifactChecksum'> & { datasetId?: string },
  ) {}

  initialize(): void {
    this.runtime = new CoreSpiritRuntime({
      sourceId: this.artifact.sourceId,
      symbol: this.identity.symbol,
      timeframe: this.identity.timeframe,
      executionMode: 'realtime',
      runId: this.identity.runId,
    });
    this.runtime.loadIr(this.artifact.ir);
  }

  private get initializedRuntime(): CoreSpiritRuntime {
    if (!this.runtime) throw new Error('realtime execution host is not initialized');
    return this.runtime;
  }

  revise(bar: CoreSpiritMarketBar): CoreSpiritExecutionResult {
    return this.initializedRuntime.executeBar({ ...bar });
  }

  rollback(): void {
    this.initializedRuntime.rollbackRealtimeBar();
  }

  commit(): void {
    this.initializedRuntime.commitRealtimeBar();
  }

  snapshot() {
    return this.initializedRuntime.getState();
  }

  getRuntime(): CoreSpiritRuntime {
    return this.initializedRuntime;
  }
}
