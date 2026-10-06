import type {
  EngineCapabilities,
  ExecutionHandlers,
  ExecutionRequest,
  ExecutionSession,
  PreparedScript,
  ScriptingEngine,
} from '../../vendor/vela/src/core/ports/ScriptingEngine';

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

  async prepare(source: string, instanceId: string): Promise<PreparedScript> {
    const { CoreSpiritVelaEngine } = await loadEngine();
    return new CoreSpiritVelaEngine().prepare(source, instanceId);
  }

  async execute(
    req: ExecutionRequest,
    handlers: ExecutionHandlers,
  ): Promise<ExecutionSession> {
    const { CoreSpiritVelaEngine } = await loadEngine();
    return new CoreSpiritVelaEngine().execute(req, handlers);
  }
}
