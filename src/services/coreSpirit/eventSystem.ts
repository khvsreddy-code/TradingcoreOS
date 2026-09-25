/**
 * CoreSpirit native event system — Stage 47.
 *
 * Signals are immutable events. One event can fan out to chart/alert/webhook/
 * automation consumers. CoreSpirit itself never performs network I/O.
 */

import { coreSpiritChecksum } from "./artifact";
import { coreEventBus, type CoreEventBus } from "../core/event/eventBus";
import type { CoreSpiritExecutionMode } from "./types";

export const CORE_SPIRIT_EVENT_ABI_VERSION = 1 as const;

export type CoreSpiritEventType =
  | "coreSpirit.signal"
  | "coreSpirit.alert"
  | "coreSpirit.webhook"
  | "coreSpirit.strategy.entry"
  | "coreSpirit.strategy.exit"
  | "coreSpirit.automation";

export interface CoreSpiritEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  abiVersion: typeof CORE_SPIRIT_EVENT_ABI_VERSION;
  id: string;
  type: CoreSpiritEventType;
  sourceId: string;
  programChecksum?: string;
  runId: string;
  mode: CoreSpiritExecutionMode;
  barIndex: number;
  timestamp: number;
  sequence: number;
  correlationId?: string;
  causationId?: string;
  dedupeKey: string;
  payload: Readonly<TPayload>;
}

export interface CoreSpiritEventConsumer {
  id: string;
  topics: readonly CoreSpiritEventType[];
  priority?: number;
  modes?: readonly CoreSpiritExecutionMode[];
  handle: (event: CoreSpiritEventEnvelope) => void | Promise<void>;
}

export interface CoreSpiritEventDelivery {
  eventId: string;
  consumerId: string;
  dedupeKey: string;
  status: "delivered" | "failed" | "skipped";
  error?: string;
}

export interface CoreSpiritEventDispatchResult {
  event: CoreSpiritEventEnvelope;
  deliveries: readonly CoreSpiritEventDelivery[];
}

export interface CoreSpiritWebhookRule {
  id: string;
  topic: CoreSpiritEventType;
  endpointKey: string;
  include: readonly string[];
}

export interface CoreSpiritWebhookSink {
  deliver(
    endpointKey: string,
    event: CoreSpiritEventEnvelope,
    payload: Readonly<Record<string, unknown>>,
  ): void | Promise<void>;
}

export function createDeterministicCoreSpiritEventId(input: {
  sourceId: string;
  programChecksum?: string;
  runId: string;
  mode: CoreSpiritExecutionMode;
  barIndex: number;
  timestamp: number;
  type: CoreSpiritEventType;
  payload: Readonly<Record<string, unknown>>;
  sequence: number;
}): string {
  const identity = {
    sourceId: input.sourceId,
    programChecksum: input.programChecksum ?? "",
    runId: input.runId,
    mode: input.mode,
    barIndex: input.barIndex,
    timestamp: input.timestamp,
    type: input.type,
    payload: input.payload,
    sequence: input.sequence,
  };
  return `evt:${coreSpiritChecksum(identity)}`;
}

export function createCoreSpiritEvent<T extends Record<string, unknown>>(
  input: Omit<CoreSpiritEventEnvelope<T>, "abiVersion" | "id" | "dedupeKey">,
): CoreSpiritEventEnvelope<T> {
  const id = createDeterministicCoreSpiritEventId(input);
  return {
    abiVersion: CORE_SPIRIT_EVENT_ABI_VERSION,
    ...input,
    id,
    dedupeKey: id,
  };
}

export class CoreSpiritEventBus {
  private readonly consumers = new Map<string, CoreSpiritEventConsumer>();
  private readonly delivered = new Set<string>();
  private sequence = 0;

  constructor(private readonly legacyBus: CoreEventBus = coreEventBus) {}

  register(consumer: CoreSpiritEventConsumer): () => void {
    if (this.consumers.has(consumer.id)) {
      throw new Error(`CoreSpirit event consumer '${consumer.id}' is already registered`);
    }
    this.consumers.set(consumer.id, { ...consumer, priority: consumer.priority ?? 100, handle: consumer.handle.bind(consumer) });
    return () => this.unregister(consumer.id);
  }

  unregister(id: string): void {
    this.consumers.delete(id);
  }

  listConsumers(): string[] {
    return [...this.consumers.keys()].sort();
  }

  nextSequence(preferred?: number): number {
    const next = preferred ?? this.sequence + 1;
    this.sequence = Math.max(this.sequence, next);
    return next;
  }

  async publish<T extends Record<string, unknown>>(
    event: CoreSpiritEventEnvelope<T>,
  ): Promise<CoreSpiritEventDispatchResult> {
    this.nextSequence(event.sequence);

    const consumers = [...this.consumers.values()]
      .filter(consumer => consumer.topics.includes(event.type))
      .filter(consumer => !consumer.modes || consumer.modes.includes(event.mode))
      .sort((a, b) => (a.priority! - b.priority!) || a.id.localeCompare(b.id));

    const deliveries: CoreSpiritEventDelivery[] = [];

    // Sequential delivery preserves deterministic consumer ordering.
    for (const consumer of consumers) {
      const deliveryKey = `${event.dedupeKey}:${consumer.id}`;
      if (this.delivered.has(deliveryKey)) {
        deliveries.push({
          eventId: event.id,
          consumerId: consumer.id,
          dedupeKey: deliveryKey,
          status: "skipped",
        });
        continue;
      }

      try {
        await consumer.handle(event);
        this.delivered.add(deliveryKey);
        deliveries.push({
          eventId: event.id,
          consumerId: consumer.id,
          dedupeKey: deliveryKey,
          status: "delivered",
        });
      } catch (error) {
        deliveries.push({
          eventId: event.id,
          consumerId: consumer.id,
          dedupeKey: deliveryKey,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { event, deliveries };
  }

  /**
   * Compatibility bridge for TradingCoreOS's existing event bus.
   * The new CoreSpirit bus remains the source-of-truth event contract.
   */
  bridgeSignalToLegacyBus(event: CoreSpiritEventEnvelope): void {
    if (event.type !== "coreSpirit.signal") return;
    const payload = event.payload;
    this.legacyBus.emit("script.signal", {
      scriptId: event.sourceId,
      time: event.timestamp,
      type: String(payload.type ?? "SIGNAL"),
      metadata: payload,
      sequence: event.sequence,
    });
  }

  clearDeliveryHistory(): void {
    this.delivered.clear();
  }
}

export function createSignalEvent(input: {
  sourceId: string;
  programChecksum?: string;
  runId: string;
  mode: CoreSpiritExecutionMode;
  barIndex: number;
  timestamp: number;
  sequence: number;
  type: string;
  metadata?: Readonly<Record<string, unknown>>;
}): CoreSpiritEventEnvelope {
  return createCoreSpiritEvent({
    type: "coreSpirit.signal",
    sourceId: input.sourceId,
    programChecksum: input.programChecksum,
    runId: input.runId,
    mode: input.mode,
    barIndex: input.barIndex,
    timestamp: input.timestamp,
    sequence: input.sequence,
    payload: {
      type: input.type,
      ...(input.metadata ?? {}),
    },
  });
}

export function projectWebhookPayload(
  event: CoreSpiritEventEnvelope,
  include: readonly string[],
): Readonly<Record<string, unknown>> {
  const source: Record<string, unknown> = {
    eventId: event.id,
    eventType: event.type,
    sourceId: event.sourceId,
    runId: event.runId,
    mode: event.mode,
    barIndex: event.barIndex,
    timestamp: event.timestamp,
    sequence: event.sequence,
    ...event.payload,
  };
  if (include.length === 0) return source;
  return Object.fromEntries(include.filter(key => key in source).map(key => [key, source[key]]));
}

export class CoreSpiritWebhookConsumer implements CoreSpiritEventConsumer {
  readonly topics = ["coreSpirit.signal"] as const;
  readonly priority = 200;

  constructor(
    public readonly id: string,
    private readonly rule: CoreSpiritWebhookRule,
    private readonly sink: CoreSpiritWebhookSink,
  ) {}

  async handle(event: CoreSpiritEventEnvelope): Promise<void> {
    const payload = projectWebhookPayload(event, this.rule.include);
    await this.sink.deliver(this.rule.endpointKey, event, payload);
  }
}
