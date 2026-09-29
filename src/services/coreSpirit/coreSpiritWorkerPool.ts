import type { CoreSpiritMarketBar } from './marketData';
import type { CoreSpiritObject } from './types';
import { isRecord } from '../boundary/brokerApiValidation';
import { requireCoreSpiritOutputs } from './boundaryValidation';

export type CoreSpiritWorkerRunResult = { outputs: CoreSpiritObject[]; diagnostics: string[]; state?: unknown };
type WorkerJob = { source:string; sourceId:string; bars:CoreSpiritMarketBar[]; resolve:(value:CoreSpiritWorkerRunResult)=>void; reject:(reason:unknown)=>void; priority:0|1|2|3|4; };

type WorkerSlot = { worker: Worker; busy: boolean; generation:number; job?: WorkerJob };

function normalizeResult(value: unknown): CoreSpiritWorkerRunResult {
  if (!isRecord(value) || value.type !== 'result') throw new Error('Invalid CoreSpirit worker result envelope');
  const diagnostics = Array.isArray(value.diagnostics) && value.diagnostics.every(item => typeof item === 'string') ? value.diagnostics : [];
  return { outputs: requireCoreSpiritOutputs(value.outputs ?? []), diagnostics, state: value.state };
}

/** Small reusable worker pool. Workers are long-lived so CoreSpirit runs avoid worker creation cost. */
export class CoreSpiritWorkerPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly queue: WorkerJob[] = [];
  private queueCursor = 0;
  private disposed = false;
  private readonly maxWorkers: number;

  constructor(maxWorkers?: number) {
    const hardware = typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 2;
    this.maxWorkers = Math.max(1, Math.min(maxWorkers ?? 2, Math.max(1, hardware - 1)));
  }

  run(source: string, bars: CoreSpiritMarketBar[], sourceId = 'coreSpirit'): Promise<CoreSpiritWorkerRunResult> {
    if (this.disposed) return Promise.reject(new Error('CoreSpirit worker pool disposed'));
    if (typeof Worker === 'undefined') return this.runFallback(source, bars, sourceId);
    return new Promise((resolve, reject) => {
      this.queue.push({ source, sourceId, bars, resolve, reject, priority: sourceId.includes('chart') ? 1 : 3 });
      this.queue.sort((a,b)=>a.priority-b.priority);
      this.dispatch();
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const slot of this.slots.splice(0)) {
      try { slot.job?.reject(new Error('CoreSpirit worker pool disposed')); } catch {}
      try { slot.worker.terminate(); } catch {}
    }
    for (let i = this.queueCursor; i < this.queue.length; i++) this.queue[i].reject(new Error('CoreSpirit worker pool disposed'));
    this.queue.length = 0;
    this.queueCursor = 0;
  }

  private dispatch(): void {
    if (this.disposed) return;
    while (this.queueCursor < this.queue.length) {
      let slot = this.slots.find(candidate => !candidate.busy);
      if (!slot && this.slots.length < this.maxWorkers) slot = this.createSlot();
      if (!slot) return;
      const job = this.queue[this.queueCursor++];
      this.attachJob(slot, job);
      if (this.queueCursor === this.queue.length) { this.queue.length = 0; this.queueCursor = 0; }
    }
  }

  private createSlot(): WorkerSlot {
    const worker = new Worker(new URL('./coreSpirit.worker.ts', import.meta.url), { type:'module' });
    const slot: WorkerSlot = { worker, busy:false, generation:0 };
    this.slots.push(slot);
    return slot;
  }

  private attachJob(slot: WorkerSlot, job: WorkerJob): void {
    slot.busy = true;
    slot.job = job;
    const requestId = `${Date.now().toString(36)}:${++slot.generation}`;
    const cleanup = () => {
      slot.busy = false;
      slot.job = undefined;
      slot.worker.onmessage = null;
      slot.worker.onerror = null;
      this.dispatch();
    };
    slot.worker.onmessage = (event: MessageEvent<unknown>) => {
      const message = event.data;
      if (!isRecord(message) || message.requestId !== requestId) return;
      try {
        if (message.type === 'result') job.resolve(normalizeResult(message));
        else if (message.type === 'error') job.reject(new Error(typeof message.message === 'string' ? message.message : 'CoreSpirit worker failed'));
        else return;
      } catch (error) { job.reject(error); }
      cleanup();
    };
    slot.worker.onerror = (event) => {
      job.reject(new Error(event.message || 'CoreSpirit worker error'));
      try { slot.worker.terminate(); } catch {}
      const index = this.slots.indexOf(slot);
      if (index >= 0) this.slots.splice(index, 1);
      cleanup();
    };
    slot.worker.postMessage({ type:'run', requestId, source, sourceId, bars:job.bars });
  }

  private async runFallback(source: string, bars: CoreSpiritMarketBar[], sourceId: string): Promise<CoreSpiritWorkerRunResult> {
    const { executeCoreSpirit } = await import('./coreSpiritPipeline');
    const result = executeCoreSpirit(source, bars, sourceId);
    return { outputs: result.outputs, diagnostics: result.diagnostics, state: result.state };
  }
}

export const coreSpiritWorkerPool = new CoreSpiritWorkerPool();
