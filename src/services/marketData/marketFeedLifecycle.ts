export type FeedLifecyclePhase = 'disconnected' | 'connecting' | 'healthy' | 'stale' | 'recovering' | 'failed';
export type FeedLifecycleReason = 'socket-open' | 'valid-event' | 'heartbeat-timeout' | 'socket-close' | 'recovery-start' | 'recovery-success' | 'recovery-failure' | 'authentication-failure' | 'retire';

export interface FeedLifecycleSnapshot {
  phase: FeedLifecyclePhase;
  generation: number;
  lastEventAt: number | null;
  lastExchangeTimestamp: number | null;
  lastSequence: number | null;
  reconnectCount: number;
  staleForMs: number;
  subscriptionReady: boolean;
  reason: FeedLifecycleReason;
}

export interface FeedLifecycleOptions {
  staleAfterMs?: number;
  now?: () => number;
}

export interface SequencedMarketEvent<T> {
  generation: number;
  receivedAt: number;
  exchangeTimestamp?: number;
  sequence?: number;
  payload: T;
}

/**
 * Per-stream health + generation gate. Transport status alone never establishes
 * health: only a valid event does. Callers own reconnect timers and broker-specific
 * reconciliation. The bounded buffer is a min-heap keyed by market event order,
 * so a late packet cannot evict a newer exchange event when the queue is full.
 */
export class MarketFeedLifecycle<T> {
  private generation = 0;
  private phase: FeedLifecyclePhase = 'disconnected';
  private lastEventAt: number | null = null;
  private lastExchangeTimestamp: number | null = null;
  private lastSequence: number | null = null;
  private reconnectCount = 0;
  private subscriptionReady = false;
  private reason: FeedLifecycleReason = 'retire';
  private readonly staleAfterMs: number;
  private readonly now: () => number;
  private buffer: SequencedMarketEvent<T>[] = [];
  private readonly maxBuffer: number;
  private droppedBufferEvents = 0;

  constructor(options: FeedLifecycleOptions & { maxBufferedEvents?: number } = {}) {
    this.staleAfterMs = Math.max(1, options.staleAfterMs ?? 5000);
    this.now = options.now ?? Date.now;
    this.maxBuffer = Math.max(1, Math.floor(options.maxBufferedEvents ?? 8192));
  }

  private compareBufferedEvents(a: SequencedMarketEvent<T>, b: SequencedMarketEvent<T>): number {
    const timeA = a.exchangeTimestamp ?? a.receivedAt;
    const timeB = b.exchangeTimestamp ?? b.receivedAt;
    return timeA - timeB || (a.sequence ?? 0) - (b.sequence ?? 0);
  }

  private siftUp(index: number): void {
    let child = index;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (this.compareBufferedEvents(this.buffer[parent]!, this.buffer[child]!) <= 0) break;
      [this.buffer[parent], this.buffer[child]] = [this.buffer[child]!, this.buffer[parent]!];
      child = parent;
    }
  }

  private siftDown(index: number): void {
    let parent = index;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (left < this.buffer.length &&
          this.compareBufferedEvents(this.buffer[left]!, this.buffer[smallest]!) < 0) smallest = left;
      if (right < this.buffer.length &&
          this.compareBufferedEvents(this.buffer[right]!, this.buffer[smallest]!) < 0) smallest = right;
      if (smallest === parent) return;
      [this.buffer[parent], this.buffer[smallest]] = [this.buffer[smallest]!, this.buffer[parent]!];
      parent = smallest;
    }
  }

  private isValidBufferedEvent(event: SequencedMarketEvent<T>): boolean {
    return Number.isFinite(event.receivedAt) && event.receivedAt > 0
      && (event.exchangeTimestamp == null || (Number.isFinite(event.exchangeTimestamp) && event.exchangeTimestamp > 0))
      && (event.sequence == null || (Number.isSafeInteger(event.sequence) && event.sequence >= 0));
  }

  beginConnection(): number {
    this.generation += 1;
    this.phase = this.reconnectCount ? 'recovering' : 'connecting';
    this.subscriptionReady = false;
    this.reason = 'socket-open';
    this.lastSequence = null;
    // A new socket generation must not spend buffer capacity on retired packets.
    this.buffer = [];
    return this.generation;
  }

  markSocketOpen(generation: number): boolean {
    if (generation !== this.generation) return false;
    this.subscriptionReady = true;
    this.phase = this.lastEventAt === null ? 'connecting' : 'recovering';
    this.reason = 'socket-open';
    return true;
  }

  accept(event: SequencedMarketEvent<T>): boolean {
    if (event.generation !== this.generation || !this.isValidBufferedEvent(event)) return false;
    if (event.sequence != null && this.lastSequence != null && event.sequence <= this.lastSequence) return false;
    if (event.exchangeTimestamp != null && this.lastExchangeTimestamp != null &&
        event.exchangeTimestamp < this.lastExchangeTimestamp) return false;
    this.lastEventAt = event.receivedAt;
    if (event.exchangeTimestamp != null) this.lastExchangeTimestamp = event.exchangeTimestamp;
    if (event.sequence != null) this.lastSequence = event.sequence;
    this.phase = 'healthy';
    this.reason = 'valid-event';
    this.reconnectCount = 0;
    return true;
  }

  enqueue(event: SequencedMarketEvent<T>): boolean {
    if (event.generation !== this.generation || !this.isValidBufferedEvent(event)) return false;

    if (this.buffer.length < this.maxBuffer) {
      this.buffer.push(event);
      this.siftUp(this.buffer.length - 1);
      return true;
    }

    // Root is the oldest retained event. A late arrival is dropped rather than
    // evicting a newer market event; a newer arrival replaces the root in O(log n).
    this.droppedBufferEvents += 1;
    if (this.compareBufferedEvents(event, this.buffer[0]!) <= 0) return false;
    this.buffer[0] = event;
    this.siftDown(0);
    return true;
  }

  drain(): SequencedMarketEvent<T>[] {
    const items = this.buffer;
    this.buffer = [];
    return items.filter(item => item.generation === this.generation)
      .sort((a, b) => this.compareBufferedEvents(a, b));
  }

  markStale(reason: FeedLifecycleReason = 'heartbeat-timeout'): void {
    if (this.phase === 'failed' || this.phase === 'disconnected') return;
    this.phase = 'stale';
    this.reason = reason;
  }

  socketClosed(generation: number): boolean {
    if (generation !== this.generation) return false;
    this.phase = 'recovering';
    this.subscriptionReady = false;
    this.reconnectCount += 1;
    this.reason = 'socket-close';
    return true;
  }

  beginRecovery(generation: number): boolean {
    if (generation !== this.generation) return false;
    this.phase = 'recovering';
    this.subscriptionReady = false;
    this.reason = 'recovery-start';
    return true;
  }

  finishRecovery(generation: number, success: boolean): boolean {
    if (generation !== this.generation) return false;
    if (success) {
      this.phase = this.lastEventAt === null ? 'connecting' : 'healthy';
      this.subscriptionReady = true;
      this.reason = 'recovery-success';
    } else {
      this.phase = 'stale';
      this.reason = 'recovery-failure';
    }
    return true;
  }

  authenticationFailed(generation: number): boolean {
    if (generation !== this.generation) return false;
    this.phase = 'failed';
    this.subscriptionReady = false;
    this.reason = 'authentication-failure';
    return true;
  }

  retire(): void {
    this.generation += 1;
    this.phase = 'disconnected';
    this.subscriptionReady = false;
    this.reason = 'retire';
    this.buffer = [];
  }

  snapshot(at = this.now()): FeedLifecycleSnapshot {
    return {
      phase: this.phase,
      generation: this.generation,
      lastEventAt: this.lastEventAt,
      lastExchangeTimestamp: this.lastExchangeTimestamp,
      lastSequence: this.lastSequence,
      reconnectCount: this.reconnectCount,
      staleForMs: this.lastEventAt === null ? 0 : Math.max(0, at - this.lastEventAt),
      subscriptionReady: this.subscriptionReady,
      reason: this.reason,
    };
  }

  isStale(at = this.now()): boolean {
    return this.phase !== 'failed' && this.phase !== 'disconnected'
      && (this.lastEventAt === null ? this.phase !== 'connecting' : at - this.lastEventAt >= this.staleAfterMs);
  }

  get droppedEvents(): number {
    return this.droppedBufferEvents;
  }
}
