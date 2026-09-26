import type { CoreSpiritMarketBar } from './marketData';
import { CoreSpiritObject } from './types';

type WorkerResult = { outputs: CoreSpiritObject[]; diagnostics: string[]; state?: unknown };

export async function runCoreSpiritInWorker(source: string, bars: CoreSpiritMarketBar[], sourceId: string): Promise<WorkerResult> {
  if (typeof Worker === 'undefined') {
    const { executeCoreSpirit } = await import('./coreSpiritPipeline');
    const result = executeCoreSpirit(source, bars, sourceId);
    return result;
  }
  const worker = new Worker(new URL('./coreSpirit.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    const cleanup = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<any>) => {
      const msg = event.data;
      if (msg?.type === 'result') { cleanup(); resolve({ outputs: msg.outputs || [], diagnostics: msg.diagnostics || [], state: msg.state }); }
      else if (msg?.type === 'error') { cleanup(); reject(new Error(msg.message || 'CoreSpirit worker failed')); }
    };
    worker.onerror = (event) => { cleanup(); reject(new Error(event.message || 'CoreSpirit worker error')); };
    worker.postMessage({ type: 'run', source, sourceId, bars });
  });
}
