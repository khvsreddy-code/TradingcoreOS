/**
 * Canonical CoreSpirit platform runtime facade.
 *
 * This is deliberately the only high-level entry point needed by historical
 * charts, replay tooling and the IDE. It compiles once to an executable
 * artifact, then selects a host around the same artifact.
 */
import { CoreSpiritCompiler, type CoreSpiritCompileResult } from './compiler';
import { parseCoreSpirit } from './coreSpiritPipeline';
import { makeExecutableArtifact, type CoreSpiritExecutableArtifact } from './artifact';
import { CoreSpiritHistoricalExecutionHost, CoreSpiritReplayExecutionHost, CoreSpiritRealtimeExecutionHost, type CoreSpiritHostRunResult } from './executionHost';
import { CoreSpiritSignalEngine, type CoreSpiritSignalBatch } from './signalEngine';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import type { CoreSpiritMarketDataset, CoreSpiritMarketBar } from './marketData';
import type { CoreSpiritObject } from './types';
import type { CoreSpiritExecutionTarget } from './executionTarget';
import { CoreSpiritScanner, type CoreSpiritScanRun, type CoreSpiritScanUniverse, type CoreSpiritScannerOptions } from './scanner';
import { planCoreSpiritExecution, type CoreSpiritExecutionPlan, type CoreSpiritExecutionPlannerOptions } from './executionPlanner';

export interface CoreSpiritPlatformCompile {
  result: CoreSpiritCompileResult;
  artifact?: CoreSpiritExecutableArtifact;
}

export interface CoreSpiritPlatformRun extends CoreSpiritHostRunResult {
  artifact: CoreSpiritExecutableArtifact;
  signals: CoreSpiritSignalBatch;
}

export class CoreSpiritPlatformRuntime {
  private readonly compiler = new CoreSpiritCompiler();
  private readonly signals = new CoreSpiritSignalEngine();
  private readonly scanner = new CoreSpiritScanner();

  compile(source: string, sourceId = 'coreSpirit', layer: CoreSpiritProgramLayer = 'script'): CoreSpiritPlatformCompile {
    const result = this.compiler.compileSource(source, sourceId, { layer });
    if (!result.ir || !result.artifact) return { result };
    return { result, artifact: makeExecutableArtifact(result.ir) };
  }

  runHistorical(source: string, dataset: CoreSpiritMarketDataset, options: { sourceId?: string; layer?: CoreSpiritProgramLayer; runId?: string; target?: CoreSpiritExecutionTarget } = {}): CoreSpiritPlatformRun {
    const compiled = this.compile(source, options.sourceId || 'coreSpirit', options.layer || 'script');
    if (!compiled.artifact) throw new Error(compiled.result.diagnostics.map(d => d.message).join('; ') || 'CoreSpirit compilation failed');
    return this.runArtifact(compiled.artifact, dataset, options.runId || `${compiled.artifact.sourceId}:historical`, options.target || 'chart');
  }

  runArtifact(artifact: CoreSpiritExecutableArtifact, dataset: CoreSpiritMarketDataset, runId: string, target: CoreSpiritExecutionTarget = 'chart'): CoreSpiritPlatformRun {
    const host = new CoreSpiritHistoricalExecutionHost();
    const originalRun = host.run(artifact, dataset, runId, target);
    const result = originalRun;

    const signals = this.signals.fromOutputs({
      sourceId: artifact.sourceId,
      programChecksum: artifact.checksum,
      runId,
      mode: 'historical',
      outputs: result.outputs,
    });
    return { ...result, artifact, signals };
  }

  verifyReplay(artifact: CoreSpiritExecutableArtifact, dataset: CoreSpiritMarketDataset) {
    const host = new CoreSpiritReplayExecutionHost();
    return host.verifyDeterminism(artifact, dataset);
  }

  createRealtimeHost(
    artifact: CoreSpiritExecutableArtifact,
    identity: { runId: string; symbol: string; timeframe: string; datasetId?: string },
  ): CoreSpiritRealtimeExecutionHost {
    const host = new CoreSpiritRealtimeExecutionHost(artifact, identity);
    host.initialize();
    return host;
  }

  collectSignals(
    outputs: readonly CoreSpiritObject[],
    artifact: CoreSpiritExecutableArtifact,
    runId: string,
    mode: 'historical' | 'realtime' | 'replay' | 'backtest' | 'historicalTick',
  ): CoreSpiritSignalBatch {
    return this.signals.fromOutputs({ sourceId: artifact.sourceId, programChecksum: artifact.checksum, runId, mode, outputs });
  }

  planExecution(artifact: CoreSpiritExecutableArtifact, options: CoreSpiritExecutionPlannerOptions = {}): CoreSpiritExecutionPlan {
    return planCoreSpiritExecution(artifact.ir, options);
  }

  scanArtifact(artifact: CoreSpiritExecutableArtifact, universe: CoreSpiritScanUniverse, options: CoreSpiritScannerOptions = {}): Promise<CoreSpiritScanRun> {
    return this.scanner.runArtifact(artifact, universe, options);
  }

}

export function datasetFromBars(
  id: string,
  symbol: string,
  timeframe: string,
  bars: readonly CoreSpiritMarketBar[],
): CoreSpiritMarketDataset {
  return { version: 1, id, symbol, timeframe, bars: [...bars], source: 'research' };
}

