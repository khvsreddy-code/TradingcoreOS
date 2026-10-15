import type { CoreSpiritDiagnostic } from './semanticAnalyzer';
import type { CoreSpiritCompileResult } from './compiler';
import type { CoreSpiritObject } from './types';
import { CoreSpiritEditorModel } from './editorModel';
import { coreSpiritChartRegistry } from './chartRegistry';
import { buildSignalExplanation, explanationFactsFromRuntimeLocals, type CoreSpiritSignalExplanation } from './explainability';
import { createAutomationLifecycle, type CoreSpiritAutomationLifecycleState } from './automationLifecycle';
import { buildCoreSpiritScene, buildCoreSpiritSceneFromNodes, validateCoreSpiritScene, type CoreSpiritScene } from './visualScene';
import { buildCoreSpiritSceneFromDeclarativeVisuals } from './declarativeVisual';
import type { CoreSpiritWorkspaceState } from './workspaceRuntime';
import type { CoreSpiritUiState } from './uiRuntime';
import { CoreSpiritVisualDebuggerSession, type CoreSpiritVisualDebuggerSnapshot } from './visualDebugger';
import { sha256HexSync } from './artifactIdentity';

export type CoreSpiritIdeRuntimeStatus = 'idle' | 'compiling' | 'running' | 'ready' | 'error';

export interface CoreSpiritIdeAutomationPreview {
  lifecycle: CoreSpiritAutomationLifecycleState;
  signalCount: number;
  orderIntentCount: number;
  riskGate: 'PENDING' | 'NOT_REACHED' | 'APPROVED' | 'REJECTED';
  policyGate: 'PENDING' | 'NOT_REACHED' | 'APPROVED' | 'REJECTED';
  execution: 'PREVIEW_ONLY' | 'BLOCKED' | 'SUBMITTED';
}

export interface CoreSpiritIdeRuntimeSnapshot {
  status: CoreSpiritIdeRuntimeStatus;
  sourceVersion: number;
  target?: { chartId: string; symbol: string; timeframe: string };
  compile?: { irVersion: number; diagnostics: CoreSpiritDiagnostic[] };
  run?: { runId: string; sourceVersion: number; sourceHash: string; artifactHash: string; barsProcessed: number; plotsEmitted: number; signalsEmitted: number; diagnostics: string[] };
  outputs: readonly CoreSpiritObject[];
  scene?: CoreSpiritScene;
  uiState?: CoreSpiritUiState;
  workspaceState?: CoreSpiritWorkspaceState;
  explanations: readonly CoreSpiritSignalExplanation[];
  latestExplanation?: CoreSpiritSignalExplanation;
  automationPreview: CoreSpiritIdeAutomationPreview;
  debugger?: CoreSpiritVisualDebuggerSnapshot;
  error?: string;
}

export class CoreSpiritIdeRuntimeBridge {
  private snapshot: CoreSpiritIdeRuntimeSnapshot = {
    status: 'idle',
    sourceVersion: 0,
    outputs: [],
    explanations: [],
    automationPreview: {
      lifecycle: 'PAPER',
      signalCount: 0,
      orderIntentCount: 0,
      riskGate: 'PENDING',
      policyGate: 'PENDING',
      execution: 'PREVIEW_ONLY',
    },
  };
  private listeners = new Set<(snapshot: CoreSpiritIdeRuntimeSnapshot) => void>();
  private runGeneration = 0;
  private debuggerSession?: CoreSpiritVisualDebuggerSession;

  constructor(private readonly editor: CoreSpiritEditorModel) {}

  getSnapshot(): CoreSpiritIdeRuntimeSnapshot { return { ...this.snapshot, outputs: [...this.snapshot.outputs], explanations: [...this.snapshot.explanations] }; }
  subscribe(listener: (snapshot: CoreSpiritIdeRuntimeSnapshot) => void): () => void { this.listeners.add(listener); listener(this.getSnapshot()); return () => this.listeners.delete(listener); }

  compile(sourceVersion = this.editor.getVersion()): CoreSpiritIdeRuntimeSnapshot {
    this.patch({ status: 'compiling', sourceVersion, error: undefined });
    const result = this.editor.compile();
    this.patch({
      status: result.ir ? 'ready' : 'error',
      compile: { irVersion: result.ir?.version ?? 1, diagnostics: result.diagnostics },
      sourceVersion,
      error: result.ir ? undefined : 'CoreSpirit compilation failed',
    });
    return this.getSnapshot();
  }

  async runActiveChart(source:string,sourceId='coreSpirit-ide',prepared?:CoreSpiritCompileResult):Promise<CoreSpiritIdeRuntimeSnapshot>{
    const sourceVersion = this.editor.getVersion();
    if (source !== this.editor.getSource()) {
      this.patch({ status: 'error', sourceVersion, error: 'Run cancelled: the editor source does not match the requested source revision.' });
      return this.getSnapshot();
    }
    const compiled=prepared ?? this.editor.compile();
    const expectedSourceHash = sha256HexSync(source);
    if (compiled.artifact && compiled.artifact.abi.sourceHash !== expectedSourceHash) {
      this.patch({ status: 'error', sourceVersion, error: 'Run cancelled: compiled artifact belongs to a different source revision. Compile the current editor contents and run again.' });
      return this.getSnapshot();
    }
    const errors = compiled.diagnostics.filter(d => d.severity === 'error');
    if (errors.length || !compiled.ir) {
      this.patch({ status: 'error', compile: { irVersion: compiled.ir?.version ?? 1, diagnostics: compiled.diagnostics }, error: 'Fix compile errors before running.' });
      return this.getSnapshot();
    }
    const target = coreSpiritChartRegistry.getActive();
    if (!target) {
      this.patch({ status: 'error', error: 'No active chart is registered.' });
      return this.getSnapshot();
    }
    const generation = ++this.runGeneration;
    const runId = `${sourceId}:run:${generation}`;
    const chartBars = target.getBars ? [...target.getBars()] : [];
    this.debuggerSession = compiled.artifact && chartBars.length ? new CoreSpiritVisualDebuggerSession({ artifact: compiled.artifact, bars: chartBars, symbol: target.symbol, timeframe: target.timeframe, sourceText: source, sourceId }) : undefined;
    this.patch({ status: 'running', sourceVersion, target: { chartId: target.chartId, symbol: target.symbol, timeframe: target.timeframe }, error: undefined });
    try {
      const result = target.updateCode && compiled.artifact
        ? await target.updateCode(source,compiled.artifact,sourceId)
        : await target.run(source, sourceId);
      if (generation !== this.runGeneration) return this.getSnapshot();
      if (sourceVersion !== this.editor.getVersion() || source !== this.editor.getSource()) {
        this.patch({ status: 'idle', sourceVersion: this.editor.getVersion(), outputs: [], scene: undefined, run: undefined, error: 'Run result discarded because the script changed while it was executing. Run the current revision to refresh outputs.' });
        return this.getSnapshot();
      }
      const outputs = [...(result.outputs ?? [])];
      const identity = { chartId: target.chartId, symbol: target.symbol, timeframe: target.timeframe, pane: 'main' as const };
      const outputScene = buildCoreSpiritScene(identity, outputs, sourceId, generation);
      const workspaceScene = result.state?.workspaceState ? buildCoreSpiritSceneFromDeclarativeVisuals(identity, result.state.workspaceState.visuals.specs, sourceId, generation) : undefined;
      const scene = workspaceScene
        ? buildCoreSpiritSceneFromNodes(identity, [...outputScene.nodes, ...workspaceScene.nodes], generation)
        : outputScene;
      const sceneErrors = validateCoreSpiritScene(scene);
      if (sceneErrors.length) throw new Error(`CoreSpirit scene validation failed: ${sceneErrors.join('; ')}`);
      const signalOutputs = outputs.filter((x): x is Extract<CoreSpiritObject, { kind: 'signal' }> => x.kind === 'signal');
      const intentOutputs = outputs.filter((x): x is Extract<CoreSpiritObject, { kind: 'orderIntent' }> => x.kind === 'orderIntent');
      const explanations = signalOutputs.map((signal, index) => {
        const metadata = signal.metadata ?? {};
        const factsRaw = Array.isArray(metadata.explanationFacts) ? metadata.explanationFacts : [];
        const facts = factsRaw.length ? factsRaw as any : explanationFactsFromRuntimeLocals(metadata.runtimeLocals as Record<string, unknown> | undefined);
        return buildSignalExplanation({
          signalId: String(metadata.signalId ?? `${sourceId}:signal:${index}:${signal.time}`),
          sourceId,
          runId,
          symbol: target.symbol,
          timeframe: target.timeframe,
          barIndex: Number(metadata.barIndex ?? 0),
          timestamp: signal.time,
          type: String(signal.type),
          reason: typeof metadata.reason === 'string' ? metadata.reason : `Signal ${String(signal.type)} emitted by CoreSpirit`,
          facts,
          decisions: [{ label: 'Signal', status: 'INFO', reason: typeof metadata.reason === 'string' ? metadata.reason : `Signal ${String(signal.type)} emitted` }],
          source: { outputId: typeof metadata.outputId === 'string' ? metadata.outputId : undefined },
        });
      });
      this.patch({
        status: result.diagnostics.length ? 'error' : 'ready',
        run: { runId, sourceVersion, sourceHash: expectedSourceHash, artifactHash: compiled.artifact?.abi.artifactHash ?? compiled.artifact?.checksum ?? '', barsProcessed: result.barsProcessed, plotsEmitted: result.plotsEmitted, signalsEmitted: result.signalsEmitted, diagnostics: result.diagnostics },
        outputs,
        scene,
        uiState: result.state?.uiState,
        workspaceState: result.state?.workspaceState,
        explanations,
        latestExplanation: explanations.at(-1),
        automationPreview: {
          lifecycle: 'PAPER',
          signalCount: signalOutputs.length,
          orderIntentCount: intentOutputs.length,
          riskGate: intentOutputs.length ? 'PENDING' : signalOutputs.length ? 'NOT_REACHED' : 'PENDING',
          policyGate: 'PENDING',
          execution: 'PREVIEW_ONLY',
        },
      });
    } catch (error) {
      this.patch({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
    return this.getSnapshot();
  }

  inspectDebugBar(barIndex: number): CoreSpiritIdeRuntimeSnapshot {
    if (!this.debuggerSession) { this.patch({ error: 'Visual debugger is not available until an active chart run has completed.' }); return this.getSnapshot(); }
    try { this.patch({ debugger: this.debuggerSession.inspectBar(barIndex), error: undefined }); }
    catch (error) { this.patch({ error: error instanceof Error ? error.message : String(error) }); }
    return this.getSnapshot();
  }

  clear(): void {
    this.snapshot = {
      status: 'idle', sourceVersion: this.editor.getVersion(), outputs: [], scene: undefined, uiState: undefined, workspaceState: undefined, explanations: [],
      automationPreview: { lifecycle: 'PAPER', signalCount: 0, orderIntentCount: 0, riskGate: 'PENDING', policyGate: 'PENDING', execution: 'PREVIEW_ONLY' },
    };
    this.emit();
  }

  private patch(partial: Partial<CoreSpiritIdeRuntimeSnapshot>): void { this.snapshot = { ...this.snapshot, ...partial }; this.emit(); }
  private emit(): void { const next = this.getSnapshot(); for (const listener of this.listeners) listener(next); }
}

export function createCoreSpiritIdePreviewLifecycle(automationId = 'corespirit-ide-preview') {
  const created = createAutomationLifecycle(automationId);
  return created;
}
