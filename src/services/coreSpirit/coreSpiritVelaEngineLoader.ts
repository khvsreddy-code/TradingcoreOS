import type {
  EngineCapabilities,
  ExecutionHandlers,
  ExecutionRequest,
  ExecutionSession,
  PreparedScript,
  ScriptingEngine,
} from '../core/chart/velaNativeChartKernel';

type CoreSpiritVelaEngineModule = typeof import('../../CoreSpiritVelaEngine');

let enginePromise: Promise<CoreSpiritVelaEngineModule> | undefined;

function loadEngine(): Promise<CoreSpiritVelaEngineModule> {
  enginePromise ??= import('../../CoreSpiritVelaEngine');
  return enginePromise;
}

/**
 * Live-chart boundary for CoreSpirit.
 *
 * Vela can boot, load broker data, render candles and initialize the workspace
 * without downloading the CoreSpirit compiler/runtime. The implementation is
 * fetched only when the Vela scripting engine is actually asked to prepare a
 * CoreSpirit script.
 */
export class LazyCoreSpiritVelaEngine implements ScriptingEngine {
  readonly language = 'corespirit';

  readonly capabilities: EngineCapabilities = {
    streaming: true,
    visibleRange: false,
    inputs: false,
    props: false,
  };

  private inner: ScriptingEngine | null = null;

  async prepare(source: string, instanceId: string): Promise<PreparedScript> {
    if (!this.inner) {
      const { CoreSpiritVelaEngine } = await loadEngine();
      this.inner = new CoreSpiritVelaEngine();
    }
    return this.inner.prepare(source, instanceId);
  }

  execute(req: ExecutionRequest, handlers: ExecutionHandlers): ExecutionSession {
    if (!this.inner) throw new Error('CoreSpirit engine not prepared');
    return this.inner.execute(req, handlers);
  }
}
