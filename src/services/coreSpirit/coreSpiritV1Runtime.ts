/**
 * CoreSpirit v1 converged runtime.
 *
 * This is an orchestration contract, not a second VM:
 * - compiler produces one executable artifact;
 * - existing execution hosts run that artifact;
 * - the existing reactive runtime performs execution/reuse;
 * - the existing scene graph projects outputs;
 * - deterministic replay verifies repeated artifact + dataset execution.
 *
 * The purpose is to make the v1 end state explicit and reusable by chart,
 * replay, historical and realtime hosts without duplicating execution logic.
 */
import type { CoreSpiritExecutableArtifact } from './artifact';
import {
  CoreSpiritHistoricalExecutionHost,
  CoreSpiritRealtimeExecutionHost,
  CoreSpiritReplayExecutionHost,
  type CoreSpiritHostRunResult,
} from './executionHost';
import type { CoreSpiritMarketBar, CoreSpiritMarketDataset } from './marketData';
import type { CoreSpiritRuntime, CoreSpiritRuntimeState } from './runtime';
import type { CoreSpiritObject } from './types';
import {
  buildCoreSpiritScene,
  type CoreSpiritScene,
  type CoreSpiritSceneIdentity,
} from './visualScene';
import {
  CoreSpiritRealtimeVisualEngine,
} from './visualRealtimeEngine';
import { CoreSpiritSignalEngine, type CoreSpiritSignalBatch } from './signalEngine';
import { CoreSpiritEventEngine, type CoreSpiritEventBatch } from './eventEngine';
import type { CoreSpiritExecutionTarget } from './executionTarget';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import { CoreSpiritPlatformRuntime } from './platformRuntime';
import { assertDeterministicReplay, type CoreSpiritReplayResult } from './replay';
import { summarizeCoreSpiritScene, summarizeCoreSpiritVisualUpdate, summarizeCoreSpiritVisualPatch, type CoreSpiritVisualSummary, type CoreSpiritVisualUpdate } from './visualProjection';

export type CoreSpiritV1RunMode = 'historical' | 'replay' | 'realtime';

export interface CoreSpiritV1SceneOptions {
  chartId?: string;
  pane?: CoreSpiritSceneIdentity['pane'];
}

export interface CoreSpiritV1RunResult {
  artifact: CoreSpiritExecutableArtifact;
  mode: 'historical' | 'replay';
  host: CoreSpiritHostRunResult;
  visuals: CoreSpiritVisualSummary;
  signals: CoreSpiritSignalBatch;
  events: CoreSpiritEventBatch;
  reactiveStats: CoreSpiritHostRunResult['reactiveStats'];
  deterministic?: boolean;
  replay?: CoreSpiritReplayResult;
}

export interface CoreSpiritV1RealtimeRevision {
  outputs: readonly CoreSpiritObject[];
  state: CoreSpiritRuntimeState;
  visuals: CoreSpiritVisualSummary;
  visualUpdate: CoreSpiritVisualUpdate;
  signals: CoreSpiritSignalBatch;
  events: CoreSpiritEventBatch;
  reactiveStats: ReturnType<CoreSpiritRuntime['getReactiveExecutionStats']>;
}

export interface CoreSpiritV1RealtimeSnapshot {
  runtimeState: CoreSpiritRuntimeState;
  visuals: CoreSpiritVisualSummary;
  committedVisuals: CoreSpiritVisualSummary;
  lifecycle: 'idle' | 'evaluating' | 'committed';
}

function sceneIdentity(
  artifact: CoreSpiritExecutableArtifact,
  dataset: CoreSpiritMarketDataset,
  options: CoreSpiritV1SceneOptions = {},
): CoreSpiritSceneIdentity {
  return {
    chartId: options.chartId || `${artifact.sourceId}:${dataset.id}`,
    symbol: dataset.symbol,
    timeframe: dataset.timeframe,
    pane: options.pane || 'main',
  };
}

export class CoreSpiritV1RealtimeSession {
  private readonly visual: CoreSpiritRealtimeVisualEngine;
  private readonly signals = new CoreSpiritSignalEngine();
  private readonly events = new CoreSpiritEventEngine();

  constructor(
    private readonly artifact: CoreSpiritExecutableArtifact,
    private readonly host: CoreSpiritRealtimeExecutionHost,
    private readonly identity: CoreSpiritSceneIdentity,
    private readonly runId: string,
  ) {
    this.visual = new CoreSpiritRealtimeVisualEngine(identity);
  }

  revise(bar: CoreSpiritMarketBar): CoreSpiritV1RealtimeRevision {
    const result = this.host.revise(bar);
    const revision = Number(result.state.barState.revision);
    this.visual.begin(revision);
    const scene = buildCoreSpiritScene(identityFromState(this.identity, result.state.barState.symbol || this.identity.symbol, result.state.barState.timeframe || this.identity.timeframe), result.outputs, this.artifact.sourceId, revision);
    const diff = this.visual.apply(scene);
    const patch = this.visual.drainPatches().at(-1);
    const signals = this.signals.fromOutputs({
      sourceId: this.artifact.sourceId,
      programChecksum: this.artifact.checksum,
      runId: this.runId,
      mode: 'realtime',
      outputs: result.outputs,
    });
    const events = this.events.fromOutputs({
      sourceId: this.artifact.sourceId,
      programChecksum: this.artifact.checksum,
      runId: this.runId,
      mode: 'realtime',
      outputs: result.outputs,
    });
    return {
      outputs: result.outputs,
      state: result.state,
      visuals: summarizeCoreSpiritScene(scene),
      visualUpdate: summarizeCoreSpiritVisualUpdate(diff, patch),
      signals,
      events,
      reactiveStats: this.host.getRuntime().getReactiveExecutionStats(),
    };
  }

  commit(): void {
    this.host.commit();
    this.visual.commit();
  }

  rollback(): CoreSpiritVisualUpdate {
    this.host.rollback();
    return summarizeCoreSpiritVisualPatch(this.visual.rollback());
  }

  drainVisualUpdates(): CoreSpiritVisualUpdate[] {
    return this.visual.drainPatches().map((patch) => Object.freeze({
      version: 1,
      revision: patch.revision,
      previousRevision: patch.previousRevision,
      added: patch.added.length,
      updated: patch.updated.length,
      removed: patch.removed.length,
      structuralReset: patch.structuralReset,
      checksum: patch.sceneChecksum,
    }));
  }

  snapshot(): CoreSpiritV1RealtimeSnapshot {
    return {
      runtimeState: this.host.getRuntime().getState(),
      visuals: summarizeCoreSpiritScene(this.visual.getWorkingScene()),
      committedVisuals: summarizeCoreSpiritScene(this.visual.getCommittedScene()),
      lifecycle: this.host.getRuntime().getRealtimeLifecycle(),
    };
  }

  getRuntime() {
    return this.host.getRuntime();
  }
}

function identityFromState(
  identity: CoreSpiritSceneIdentity,
  symbol: string,
  timeframe: string,
): CoreSpiritSceneIdentity {
  return { ...identity, symbol, timeframe };
}

export class CoreSpiritV1Runtime {
  private readonly platform = new CoreSpiritPlatformRuntime();
  private readonly signals = new CoreSpiritSignalEngine();
  private readonly events = new CoreSpiritEventEngine();

  compile(
    source: string,
    sourceId = 'coreSpirit-v1',
    layer: CoreSpiritProgramLayer = 'script',
  ): CoreSpiritExecutableArtifact {
    const compiled = this.platform.compile(source, sourceId, layer);
    if (!compiled.artifact) {
      throw new Error(
        compiled.result.diagnostics.map(diagnostic => diagnostic.message).join('; ') ||
        'CoreSpirit v1 compilation failed',
      );
    }
    return compiled.artifact;
  }

  runHistorical(
    artifact: CoreSpiritExecutableArtifact,
    dataset: CoreSpiritMarketDataset,
    options: { runId?: string; target?: CoreSpiritExecutionTarget; scene?: CoreSpiritV1SceneOptions } = {},
  ): CoreSpiritV1RunResult {
    const runId = options.runId || `${artifact.sourceId}:historical`;
    const host = new CoreSpiritHistoricalExecutionHost();
    const hostResult = host.run(artifact, dataset, runId, options.target || 'chart');
    return this.finishRun(artifact, dataset, hostResult, 'historical', options.scene, false);
  }

  runReplay(
    artifact: CoreSpiritExecutableArtifact,
    dataset: CoreSpiritMarketDataset,
    options: { runId?: string; scene?: CoreSpiritV1SceneOptions } = {},
  ): CoreSpiritV1RunResult {
    const runId = options.runId || `${artifact.sourceId}:replay`;
    const host = new CoreSpiritReplayExecutionHost();
    const hostResult = host.run(artifact, dataset, runId, 'replay');
    const replay = host.verifyDeterminism(artifact, dataset);
    return this.finishRun(artifact, dataset, hostResult, 'replay', options.scene, true, replay);
  }

  createRealtimeSession(
    artifact: CoreSpiritExecutableArtifact,
    identity: { runId: string; symbol: string; timeframe: string; datasetId?: string },
    scene: CoreSpiritV1SceneOptions = {},
  ): CoreSpiritV1RealtimeSession {
    const host = new CoreSpiritRealtimeExecutionHost(artifact, {
      runId: identity.runId,
      symbol: identity.symbol,
      timeframe: identity.timeframe,
      target: 'chart',
    });
    host.initialize();
    return new CoreSpiritV1RealtimeSession(
      artifact,
      host,
      {
        chartId: scene.chartId || `${artifact.sourceId}:${identity.runId}`,
        symbol: identity.symbol,
        timeframe: identity.timeframe,
        pane: scene.pane || 'main',
      },
      identity.runId,
    );
  }

  private finishRun(
    artifact: CoreSpiritExecutableArtifact,
    dataset: CoreSpiritMarketDataset,
    host: CoreSpiritHostRunResult,
    mode: 'historical' | 'replay',
    sceneOptions?: CoreSpiritV1SceneOptions,
    deterministic?: boolean,
    replay?: CoreSpiritReplayResult,
  ): CoreSpiritV1RunResult {
    const scene = buildCoreSpiritScene(
      sceneIdentity(artifact, dataset, sceneOptions),
      host.outputs,
      artifact.sourceId,
      host.finalState.barState.revision,
    );
    const signals = this.signals.fromOutputs({
      sourceId: artifact.sourceId,
      programChecksum: artifact.checksum,
      runId: host.identity.runId,
      mode,
      outputs: host.outputs,
    });
    const events = this.events.fromOutputs({
      sourceId: artifact.sourceId,
      programChecksum: artifact.checksum,
      runId: host.identity.runId,
      mode,
      outputs: host.outputs,
    });
    return {
      artifact,
      mode,
      host,
      visuals: summarizeCoreSpiritScene(scene),
      signals,
      events,
      reactiveStats: host.reactiveStats,
      deterministic,
      replay,
    };
  }
}

/**
 * Determinism helper for v1 acceptance suites. It intentionally delegates to
 * the established replay executor, so it cannot create a second semantic path.
 */
export function assertCoreSpiritV1Determinism(
  artifact: CoreSpiritExecutableArtifact,
  dataset: CoreSpiritMarketDataset,
): CoreSpiritReplayResult {
  return assertDeterministicReplay(
    artifact.ir,
    {
      id: dataset.id,
      bars: dataset.bars as CoreSpiritMarketBar[],
      symbol: dataset.symbol,
      timeframe: dataset.timeframe,
    },
    artifact.sourceId,
  ).first;
}
