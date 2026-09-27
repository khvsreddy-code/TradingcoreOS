/**
 * CoreSpirit event engine.
 *
 * Converts runtime EVENT outputs into immutable native event envelopes.
 * Routing remains host-owned; this layer creates deterministic event identity
 * and preserves declared destinations as data.
 */
import { coreSpiritChecksum } from './artifact';
import {
  createNamedCoreSpiritEvent,
  type CoreSpiritEventEnvelope,
} from './eventSystem';
import type { CoreSpiritExecutionMode, CoreSpiritObject } from './types';

export const CORE_SPIRIT_EVENT_ENGINE_VERSION = 1 as const;

export interface CoreSpiritEventBatch {
  version: typeof CORE_SPIRIT_EVENT_ENGINE_VERSION;
  events: readonly CoreSpiritEventEnvelope[];
  checksum: string;
}

export class CoreSpiritEventEngine {
  private sequence = 0;

  reset(): void {
    this.sequence = 0;
  }

  fromOutputs(options: {
    sourceId: string;
    programChecksum: string;
    runId: string;
    mode: CoreSpiritExecutionMode;
    outputs: readonly CoreSpiritObject[];
  }): CoreSpiritEventBatch {
    const events: CoreSpiritEventEnvelope[] = [];
    for (const output of options.outputs) {
      if (output.kind !== 'event') continue;
      const sequence = ++this.sequence;
      events.push(createNamedCoreSpiritEvent({
        sourceId: options.sourceId,
        programChecksum: options.programChecksum,
        runId: options.runId,
        mode: options.mode,
        barIndex: Number(output.metadata?.barIndex ?? -1),
        timestamp: Number(output.time),
        sequence,
        name: output.name,
        destinations: output.destinations,
        metadata: output.metadata,
      }));
    }
    return Object.freeze({
      version: CORE_SPIRIT_EVENT_ENGINE_VERSION,
      events: Object.freeze(events),
      checksum: coreSpiritChecksum(events),
    });
  }
}
