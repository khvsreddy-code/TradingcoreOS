import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SocketOutboundQueue, GatewayOutboundMetrics, type OutboundQueueOptions } from './outbound.js';

class FakeSocket {
  readyState = 1;
  bufferedAmount = 2_000;
  sent: string[] = [];
  closeCode?: number;
  closeReason?: string;

  send(data: string, callback?: (error?: Error) => void): void {
    this.sent.push(data);
    callback?.();
  }

  close(code?: number, reason?: string): void {
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3;
  }
}

function makeQueue(socket: FakeSocket, metrics = new GatewayOutboundMetrics(), overrides: Partial<OutboundQueueOptions> = {}) {
  return new SocketOutboundQueue(socket, metrics, {
    softBufferedBytes: 1_024,
    hardBufferedBytes: 8_192,
    slowClientGraceMs: 1_000,
    flushIntervalMs: 60_000,
    maxReliableMessages: 8,
    maxReliableBytes: 8_192,
    maxMarketKeys: 4,
    maxFramesPerFlush: 64,
    now: () => 1_000,
    ...overrides,
  });
}

{
  const socket = new FakeSocket();
  const metrics = new GatewayOutboundMetrics();
  const queue = makeQueue(socket, metrics);
  for (let i = 0; i < 150; i += 1) {
    queue.enqueueMarket('NSE:NIFTY50-INDEX', JSON.stringify({ type: 'tick', ltp: i }), 32);
  }
  const pressured = queue.snapshot();
  assert.equal(pressured.marketQueueDepth, 1, 'same-symbol price updates collapse to one pending latest value');
  assert.equal(pressured.queueDepth, 1);
  assert.equal(metrics.snapshot().coalescedMarketUpdates, 149);
  assert.equal(metrics.snapshot().droppedMarketUpdates, 149);
  socket.bufferedAmount = 0;
  queue.drain();
  assert.equal(socket.sent.length, 1);
  assert.equal(JSON.parse(socket.sent[0]!).ltp, 149, 'the newest quote must be the one delivered');
  assert.equal(metrics.snapshot().marketFramesSent, 1);
  queue.dispose();
}

{
  const socket = new FakeSocket();
  const metrics = new GatewayOutboundMetrics();
  const queue = makeQueue(socket, metrics);
  const delivered: number[] = [];
  for (let sequence = 1; sequence <= 5; sequence += 1) {
    queue.enqueueReliable(JSON.stringify({ type: 'order', sequence }), 40);
  }
  for (let ltp = 1; ltp <= 10; ltp += 1) {
    queue.enqueueMarket('NIFTY', JSON.stringify({ type: 'tick', ltp }), 24);
  }
  assert.equal(queue.snapshot().reliableQueueDepth, 5);
  assert.equal(queue.snapshot().marketQueueDepth, 1);
  socket.bufferedAmount = 0;
  queue.drain();
  for (const wire of socket.sent) {
    const frame = JSON.parse(wire);
    if (frame.type === 'order') delivered.push(frame.sequence);
  }
  assert.deepEqual(delivered, [1, 2, 3, 4, 5], 'durable events retain strict FIFO sequence');
  assert.equal(socket.sent.length, 6, 'one latest market frame follows the reliable FIFO');
  assert.equal(JSON.parse(socket.sent.at(-1)!).ltp, 10);
  assert.equal(metrics.snapshot().reliableFramesSent, 5);
  assert.equal(metrics.snapshot().marketFramesSent, 1);
  queue.dispose();
}

{
  const socket = new FakeSocket();
  const metrics = new GatewayOutboundMetrics();
  const reasons: string[] = [];
  const queue = makeQueue(socket, metrics, {
    maxReliableMessages: 2,
    onDisconnect: (reason: string) => reasons.push(reason),
  });
  queue.enqueueReliable('order-1', 20);
  queue.enqueueReliable('order-2', 20);
  const accepted = queue.enqueueReliable('order-3', 20);
  assert.equal(accepted, false, 'reliable saturation must close instead of silently dropping or coalescing');
  assert.equal(socket.closeCode, 1013);
  assert.match(socket.closeReason || '', /Slow client/);
  assert.deepEqual(reasons, ['reliable_event_backlog_limit']);
  assert.equal(metrics.snapshot().slowClientDisconnects, 1);
}

{
  const socket = new FakeSocket();
  const metrics = new GatewayOutboundMetrics();
  let now = 1_000;
  const queue = makeQueue(socket, metrics, {
    slowClientGraceMs: 500,
    now: () => now,
  });
  queue.enqueueReliable('order-queued', 40);
  assert.equal(socket.closeCode, undefined, 'soft pressure receives a bounded drain grace period');
  now = 1_600;
  queue.drain();
  assert.equal(socket.closeCode, 1013, 'a socket stuck above the soft watermark must eventually be disconnected');
  assert.equal(metrics.snapshot().slowClientDisconnects, 1);
}
 
{
  const socket = new FakeSocket();
  const metrics = new GatewayOutboundMetrics();
  const queue = makeQueue(socket, metrics, {
    hardBufferedBytes: 8_192,
    softBufferedBytes: 1_024,
    now: (() => { let now = 1_000; return () => now; })(),
  });
  socket.bufferedAmount = 9_000;
  queue.enqueueMarket('BANKNIFTY', '{"type":"tick"}', 32);
  assert.equal(socket.closeCode, 1013, 'hard socket buffer limit must disconnect immediately');
  assert.equal(metrics.snapshot().slowClientDisconnects, 1);
}

{
  const socket = new FakeSocket();
  const metrics = new GatewayOutboundMetrics();
  const queue = makeQueue(socket, metrics, { maxMarketBytes: 64 });
  assert.equal(queue.enqueueMarket('OVERSIZED', 'x'.repeat(30), 90), false,
    'an oversized market frame must not exceed the per-client market byte budget');
  assert.equal(queue.snapshot().marketQueueDepth, 0);
  queue.enqueueMarket('NIFTY', 'small', 24);
  queue.enqueueMarket('BANKNIFTY', 'other', 24);
  assert.equal(queue.snapshot().queuedMarketBytes, 48);
  assert.equal(queue.enqueueMarket('SENSEX', 'third', 24), true);
  assert.equal(queue.snapshot().queuedMarketBytes, 48);
  assert.equal(queue.snapshot().marketQueueDepth, 2, 'byte pressure evicts the oldest pending instrument quote');
  queue.dispose();
}

{
  const socket = new FakeSocket();
  const metrics = new GatewayOutboundMetrics();
  const queue = makeQueue(socket, metrics);
  queue.enqueueMarket('NIFTY', 'one', 8);
  queue.retainMarketKeys([]);
  assert.equal(queue.snapshot().marketQueueDepth, 0, 'removed subscriptions cannot receive stale queued ticks');
  assert.equal(metrics.snapshot().droppedMarketUpdates, 1);
  queue.dispose();
}

{
  const metrics = new GatewayOutboundMetrics();
  metrics.recordFanoutDispatch('user-hash-1', 3);
  metrics.recordFanoutDispatch('user-hash-1', 5);
  metrics.recordSocketWrite('user-hash-1', 7);
  const snapshot = metrics.snapshot();
  assert.equal(snapshot.fanoutSamples, 2);
  assert.equal(snapshot.fanoutDispatchAverageMs, 4);
  assert.equal(snapshot.perUserFanoutLatency[0]!.dispatchMaxMs, 5);
  assert.equal(snapshot.perUserFanoutLatency[0]!.socketWriteAverageMs, 7);
}

// Guard the gateway integration: serialize once outside the recipient loop and
// route durable and latest-value lanes independently.
const gatewaySource = readFileSync(new URL('./server.ts', import.meta.url), 'utf8');
const serializationAt = gatewaySource.indexOf('JSON.stringify(payload.event)');
const recipientLoopAt = gatewaySource.indexOf('for(const connectionId of ids)');
assert.ok(serializationAt >= 0 && recipientLoopAt > serializationAt, 'event serialization must happen before the per-socket loop');
assert.equal((gatewaySource.match(/JSON\.stringify\(payload\.event\)/g) || []).length, 1, 'broadcast must serialize each event exactly once');
assert.match(gatewaySource, /connection\.outbound\.enqueueMarket\(/);
assert.match(gatewaySource, /connection\.outbound\.enqueueReliable\(/);
assert.doesNotMatch(gatewaySource, /for\s*\([^)]*connectionId[^)]*\)\s*\{[^}]*JSON\.stringify\(payload\.event\)/s);

console.log('REALTIME_GATEWAY_OUTBOUND_BACKPRESSURE_OK');
