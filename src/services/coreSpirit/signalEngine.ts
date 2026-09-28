/**
 * Signal engine: converts VM output into immutable, deduplicable signal events.
 * It does not own risk or execution and never calls a broker adapter.
 */
import { coreSpiritChecksum } from './artifact';
import type { CoreSpiritExecutionMode, CoreSpiritObject } from './types';

export const CORE_SPIRIT_SIGNAL_ENGINE_VERSION = 1 as const;

export interface CoreSpiritSignalEnvelope {
  version: typeof CORE_SPIRIT_SIGNAL_ENGINE_VERSION;
  eventId: string;
  sourceId: string;
  programChecksum: string;
  runId: string;
  mode: CoreSpiritExecutionMode;
  barIndex: number;
  timestamp: number;
  sequence: number;
  dedupeKey: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface CoreSpiritSignalBatch {
  readonly events: readonly CoreSpiritSignalEnvelope[];
  readonly checksum: string;
}

export class CoreSpiritSignalEngine {
  private sequence = 0;
  private readonly seen = new Set<string>();

  reset(): void {
    this.sequence = 0;
    this.seen.clear();
  }

  fromOutputs(options: {
    sourceId: string;
    programChecksum: string;
    runId: string;
    mode: CoreSpiritExecutionMode;
    outputs: readonly CoreSpiritObject[];
  }): CoreSpiritSignalBatch {
    const events: CoreSpiritSignalEnvelope[] = [];
    for (let i = 0; i < options.outputs.length; i++) {
      const output = options.outputs[i];
      if (output.kind !== 'signal') continue;
      const barIndex = Number(output.metadata?.barIndex ?? -1);
      const timestamp = Number(output.time);
      const payload = Object.freeze({
        type: output.type,
        ...(output.metadata ?? {}),
      });
      const dedupeKey = coreSpiritChecksum({
        sourceId: options.sourceId,
        programChecksum: options.programChecksum,
        runId: options.mode === 'realtime' ? options.runId : 'dataset-run',
        mode: options.mode,
        barIndex,
        timestamp,
        type: output.type,
        payload,
      });
      if (this.seen.has(dedupeKey)) continue;
      this.seen.add(dedupeKey);
      const sequence = ++this.sequence;
      events.push(Object.freeze({
        version: CORE_SPIRIT_SIGNAL_ENGINE_VERSION,
        eventId: `${options.sourceId}:signal:${barIndex}:${timestamp}:${sequence}`,
        sourceId: options.sourceId,
        programChecksum: options.programChecksum,
        runId: options.runId,
        mode: options.mode,
        barIndex,
        timestamp,
        sequence,
        dedupeKey,
        payload,
      }));
    }
    return Object.freeze({ events: Object.freeze(events), checksum: coreSpiritChecksum(events) });
  }
}
