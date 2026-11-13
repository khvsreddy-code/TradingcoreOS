export type OutboundLane = 'market' | 'reliable';

export interface OutboundSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string, callback?: (error?: Error) => void): void;
  close(code?: number, reason?: string): void;
}

export type OutboundQueueOptions = Readonly<{
  softBufferedBytes?: number;
  hardBufferedBytes?: number;
  slowClientGraceMs?: number;
  flushIntervalMs?: number;
  maxReliableMessages?: number;
  maxReliableBytes?: number;
  maxMarketKeys?: number;
  maxMarketBytes?: number;
  maxFramesPerFlush?: number;
  now?: () => number;
  onDisconnect?: (reason: string) => void;
  onFrameWritten?: (lane: OutboundLane, queueDelayMs: number) => void;
}>;

type OutboundFrame = {
  data: string;
  byteLength: number;
  enqueuedAt: number;
  lane: OutboundLane;
};

const DEFAULTS = Object.freeze({
  softBufferedBytes: 512 * 1024,
  hardBufferedBytes: 2 * 1024 * 1024,
  slowClientGraceMs: 4_000,
  flushIntervalMs: 20,
  maxReliableMessages: 256,
  maxReliableBytes: 1024 * 1024,
  maxMarketKeys: 128,
  maxMarketBytes: 1024 * 1024,
  maxFramesPerFlush: 64,
});

function estimateWireBytes(data: string): number {
  // UTF-16 code units * 3 is a conservative UTF-8 upper bound without a
  // per-recipient Buffer/TextEncoder allocation. The gateway computes exact
  // Buffer.byteLength once and passes it on the common fan-out path.
  return Math.max(1, data.length * 3);
}

export type OutboundClientSnapshot = Readonly<{
  queueDepth: number;
  reliableQueueDepth: number;
  marketQueueDepth: number;
  queuedReliableBytes: number;
  queuedMarketBytes: number;
  bufferedAmount: number;
  slowForMs: number;
  closed: boolean;
}>;

export class GatewayOutboundMetrics {
  private counters = {
    marketFramesSent: 0,
    reliableFramesSent: 0,
    coalescedMarketUpdates: 0,
    droppedMarketUpdates: 0,
    slowClientDisconnects: 0,
    sendErrors: 0,
    fanoutSamples: 0,
    fanoutDispatchMsTotal: 0,
    fanoutDispatchMsMax: 0,
    socketWriteSamples: 0,
    socketWriteMsTotal: 0,
    socketWriteMsMax: 0,
  };

  private readonly perUser = new Map<string, {
    dispatchSamples: number;
    dispatchMsTotal: number;
    dispatchMsMax: number;
    lastDispatchMs: number;
    writeSamples: number;
    writeMsTotal: number;
    writeMsMax: number;
    lastSeenAt: number;
  }>();

  recordSent(lane: OutboundLane): void {
    if (lane === 'market') this.counters.marketFramesSent += 1;
    else this.counters.reliableFramesSent += 1;
  }

  recordCoalescedMarketUpdate(): void {
    this.counters.coalescedMarketUpdates += 1;
    this.counters.droppedMarketUpdates += 1;
  }

  recordDroppedMarketUpdate(): void {
    this.counters.droppedMarketUpdates += 1;
  }

  recordSlowClientDisconnect(): void {
    this.counters.slowClientDisconnects += 1;
  }

  recordSendError(): void {
    this.counters.sendErrors += 1;
  }

  recordFanoutDispatch(userKey: string, elapsedMs: number): void {
    const value = Math.max(0, Number(elapsedMs) || 0);
    this.counters.fanoutSamples += 1;
    this.counters.fanoutDispatchMsTotal += value;
    this.counters.fanoutDispatchMsMax = Math.max(this.counters.fanoutDispatchMsMax, value);
    const user = this.touchUser(userKey);
    user.dispatchSamples += 1;
    user.dispatchMsTotal += value;
    user.dispatchMsMax = Math.max(user.dispatchMsMax, value);
    user.lastDispatchMs = value;
  }

  recordSocketWrite(userKey: string, elapsedMs: number): void {
    const value = Math.max(0, Number(elapsedMs) || 0);
    this.counters.socketWriteSamples += 1;
    this.counters.socketWriteMsTotal += value;
    this.counters.socketWriteMsMax = Math.max(this.counters.socketWriteMsMax, value);
    const user = this.touchUser(userKey);
    user.writeSamples += 1;
    user.writeMsTotal += value;
    user.writeMsMax = Math.max(user.writeMsMax, value);
  }

  private touchUser(userKey: string) {
    let user = this.perUser.get(userKey);
    if (!user) {
      user = {
        dispatchSamples: 0, dispatchMsTotal: 0, dispatchMsMax: 0, lastDispatchMs: 0,
        writeSamples: 0, writeMsTotal: 0, writeMsMax: 0, lastSeenAt: Date.now(),
      };
    } else {
      this.perUser.delete(userKey);
      user.lastSeenAt = Date.now();
    }
    this.perUser.set(userKey, user);
    while (this.perUser.size > 256) {
      const oldest = this.perUser.keys().next().value;
      if (oldest === undefined) break;
      this.perUser.delete(oldest);
    }
    return user;
  }

  snapshot() {
    const perUserFanoutLatency = [...this.perUser.entries()].map(([userKey, value]) => Object.freeze({
      userKey,
      dispatchSamples: value.dispatchSamples,
      dispatchAverageMs: value.dispatchSamples ? value.dispatchMsTotal / value.dispatchSamples : 0,
      dispatchMaxMs: value.dispatchMsMax,
      lastDispatchMs: value.lastDispatchMs,
      socketWriteSamples: value.writeSamples,
      socketWriteAverageMs: value.writeSamples ? value.writeMsTotal / value.writeSamples : 0,
      socketWriteMaxMs: value.writeMsMax,
      lastSeenAt: value.lastSeenAt,
    }));
    return Object.freeze({
      ...this.counters,
      fanoutDispatchAverageMs: this.counters.fanoutSamples
        ? this.counters.fanoutDispatchMsTotal / this.counters.fanoutSamples : 0,
      socketWriteAverageMs: this.counters.socketWriteSamples
        ? this.counters.socketWriteMsTotal / this.counters.socketWriteSamples : 0,
      trackedUsers: perUserFanoutLatency.length,
      perUserFanoutLatency: Object.freeze(perUserFanoutLatency),
    });
  }
}

export const gatewayOutboundMetrics = new GatewayOutboundMetrics();

/**
 * Per-WebSocket bounded outbound scheduler.
 *
 * Market quote frames are latest-value by instrument. Reliable frames are
 * strict FIFO and are never coalesced. If the reliable lane cannot be bounded
 * safely, the connection is explicitly closed with 1013 rather than silently
 * dropping a state transition.
 */
export class SocketOutboundQueue {
  private readonly reliableQueue: OutboundFrame[] = [];
  private readonly marketPending = new Map<string, OutboundFrame>();
  private readonly options: Required<Omit<OutboundQueueOptions, 'onDisconnect' | 'onFrameWritten'>> &
    Pick<OutboundQueueOptions, 'onDisconnect' | 'onFrameWritten'>;
  private reliableBytes = 0;
  private marketBytes = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private slowSince?: number;
  private closed = false;

  constructor(
    private readonly socket: OutboundSocket,
    private readonly metrics: GatewayOutboundMetrics = gatewayOutboundMetrics,
    options: OutboundQueueOptions = {},
  ) {
    this.options = {
      ...DEFAULTS,
      ...options,
      now: options.now ?? (() => Date.now()),
      onDisconnect: options.onDisconnect,
      onFrameWritten: options.onFrameWritten,
    };
    if (this.options.hardBufferedBytes <= this.options.softBufferedBytes) {
      throw new Error('hardBufferedBytes must be greater than softBufferedBytes');
    }
  }

  enqueueReliable(data: string, byteLength = estimateWireBytes(data)): boolean {
    if (this.closed) return false;
    const size = Math.max(1, Math.floor(byteLength));
    if (
      this.reliableQueue.length >= this.options.maxReliableMessages ||
      this.reliableBytes + size > this.options.maxReliableBytes
    ) {
      this.disconnectSlow('reliable_event_backlog_limit');
      return false;
    }
    this.reliableQueue.push({
      data, byteLength: size, enqueuedAt: this.options.now(), lane: 'reliable',
    });
    this.reliableBytes += size;
    this.drain();
    return !this.closed;
  }

  enqueueMarket(instrumentKey: string, data: string, byteLength = estimateWireBytes(data)): boolean {
    if (this.closed) return false;
    const key = String(instrumentKey || '').trim();
    if (!key) return false;
    const size = Math.max(1, Math.floor(byteLength));
    const prior = this.marketPending.get(key);
    if (size > this.options.maxMarketBytes) {
      this.metrics.recordDroppedMarketUpdate();
      return false;
    }

    // Preserve the previous quote for this symbol if the replacement itself
    // cannot fit. For a new symbol, evict oldest pending quotes until both
    // key-count and byte budgets are satisfied.
    if (prior && this.marketBytes - prior.byteLength + size > this.options.maxMarketBytes) {
      this.metrics.recordDroppedMarketUpdate();
      return false;
    }
    if (!prior) {
      while (
        this.marketPending.size > 0 &&
        (this.marketPending.size >= this.options.maxMarketKeys ||
          this.marketBytes + size > this.options.maxMarketBytes)
      ) {
        const oldestKey = this.marketPending.keys().next().value;
        if (oldestKey === undefined) break;
        const oldest = this.marketPending.get(oldestKey);
        if (oldest) this.marketBytes = Math.max(0, this.marketBytes - oldest.byteLength);
        this.marketPending.delete(oldestKey);
        this.metrics.recordDroppedMarketUpdate();
      }
    }
    if (prior) {
      this.marketBytes = Math.max(0, this.marketBytes - prior.byteLength);
      this.metrics.recordCoalescedMarketUpdate();
      this.marketPending.delete(key);
    }
    if (this.marketPending.size >= this.options.maxMarketKeys || this.marketBytes + size > this.options.maxMarketBytes) {
      this.metrics.recordDroppedMarketUpdate();
      return false;
    }
    this.marketPending.set(key, {
      data, byteLength: size, enqueuedAt: this.options.now(), lane: 'market',
    });
    this.marketBytes += size;
    this.drain();
    return !this.closed;
  }

  /** Remove queued quote snapshots for symbols the client has unsubscribed from. */
  retainMarketKeys(symbols: readonly string[]): void {
    const keep = new Set(symbols.map(value => String(value).trim()).filter(Boolean));
    for (const [key, frame] of this.marketPending) {
      if (keep.has(key)) continue;
      this.marketPending.delete(key);
      this.marketBytes = Math.max(0, this.marketBytes - frame.byteLength);
      this.metrics.recordDroppedMarketUpdate();
    }
  }

  clearMarket(): void {
    if (!this.marketPending.size) return;
    for (let i = 0; i < this.marketPending.size; i += 1) this.metrics.recordDroppedMarketUpdate();
    this.marketPending.clear();
    this.marketBytes = 0;
  }

  /** Public for deterministic contract tests; production calls it from its scheduler. */
  drain(): void {
    if (this.closed) return;
    if (this.socket.readyState !== 1) {
      this.dispose();
      return;
    }

    const now = this.options.now();
    const buffered = Math.max(0, Number(this.socket.bufferedAmount) || 0);
    if (buffered >= this.options.hardBufferedBytes) {
      this.disconnectSlow('websocket_buffer_hard_limit');
      return;
    }
    if (buffered >= this.options.softBufferedBytes) {
      this.slowSince ??= now;
      if (now - this.slowSince >= this.options.slowClientGraceMs) {
        this.disconnectSlow('websocket_backpressure_timeout');
        return;
      }
      this.scheduleDrain();
      return;
    }
    this.slowSince = undefined;

    let sent = 0;
    while (sent < this.options.maxFramesPerFlush && !this.closed) {
      const currentBuffered = Math.max(0, Number(this.socket.bufferedAmount) || 0);
      if (currentBuffered >= this.options.hardBufferedBytes) {
        this.disconnectSlow('websocket_buffer_hard_limit');
        return;
      }
      if (currentBuffered >= this.options.softBufferedBytes) {
        this.slowSince ??= this.options.now();
        break;
      }

      const frame = this.nextFrame();
      if (!frame) break;
      if (currentBuffered + frame.byteLength > this.options.hardBufferedBytes) {
        if (frame.lane === 'reliable') {
          this.disconnectSlow('single_reliable_frame_exceeds_socket_budget');
          return;
        }
        this.metrics.recordDroppedMarketUpdate();
        continue;
      }
      this.sendFrame(frame);
      sent += 1;
    }

    if (this.hasPending() || this.socket.bufferedAmount >= this.options.softBufferedBytes) {
      this.scheduleDrain();
    } else {
      this.clearTimer();
    }
  }

  snapshot(): OutboundClientSnapshot {
    const slowForMs = this.slowSince === undefined ? 0 : Math.max(0, this.options.now() - this.slowSince);
    return Object.freeze({
      queueDepth: this.reliableQueue.length + this.marketPending.size,
      reliableQueueDepth: this.reliableQueue.length,
      marketQueueDepth: this.marketPending.size,
      queuedReliableBytes: this.reliableBytes,
      queuedMarketBytes: this.marketBytes,
      bufferedAmount: Math.max(0, Number(this.socket.bufferedAmount) || 0),
      slowForMs,
      closed: this.closed,
    });
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearTimer();
    this.reliableQueue.length = 0;
    this.marketPending.clear();
    this.reliableBytes = 0;
    this.marketBytes = 0;
  }

  private hasPending(): boolean {
    return this.reliableQueue.length > 0 || this.marketPending.size > 0;
  }

  private nextFrame(): OutboundFrame | undefined {
    const reliable = this.reliableQueue.shift();
    if (reliable) {
      this.reliableBytes = Math.max(0, this.reliableBytes - reliable.byteLength);
      return reliable;
    }
    const first = this.marketPending.entries().next();
    if (first.done) return undefined;
    const [key, frame] = first.value;
    this.marketPending.delete(key);
    this.marketBytes = Math.max(0, this.marketBytes - frame.byteLength);
    return frame;
  }

  private sendFrame(frame: OutboundFrame): void {
    try {
      this.socket.send(frame.data, (error?: Error) => {
        if (error) {
          this.metrics.recordSendError();
          this.disconnectTransport('websocket_send_failed');
          return;
        }
        this.metrics.recordSent(frame.lane);
        const delay = Math.max(0, this.options.now() - frame.enqueuedAt);
        try { this.options.onFrameWritten?.(frame.lane, delay); } catch { /* telemetry must not break a socket */ }
      });
    } catch {
      this.metrics.recordSendError();
      this.disconnectTransport('websocket_send_failed');
    }
  }

  private disconnectSlow(reason: string): void {
    if (this.closed) return;
    this.metrics.recordSlowClientDisconnect();
    this.closed = true;
    this.clearTimer();
    this.reliableQueue.length = 0;
    this.marketPending.clear();
    this.reliableBytes = 0;
    this.marketBytes = 0;
    try { this.options.onDisconnect?.(reason); } catch { /* logging cannot block closure */ }
    try { this.socket.close(1013, 'Slow client; reconnect to resume realtime state'); } catch { /* socket already gone */ }
  }

  private disconnectTransport(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.clearTimer();
    this.reliableQueue.length = 0;
    this.marketPending.clear();
    this.reliableBytes = 0;
    this.marketBytes = 0;
    try { this.options.onDisconnect?.(reason); } catch { /* logging cannot block closure */ }
    try { this.socket.close(1011, 'Realtime transport write failed'); } catch { /* socket already gone */ }
  }

  private scheduleDrain(): void {
    if (this.timer || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.drain();
    }, this.options.flushIntervalMs);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
