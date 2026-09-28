import {
  CORE_SPIRIT_RENDERER_ABI_VERSION,
  coreSpiritRendererRegistry,
  type CoreSpiritRendererTarget,
} from './visualRenderer';
import {
  CoreSpiritEventBus,
  CoreSpiritWebhookConsumer,
  createSignalEvent,
  type CoreSpiritEventEnvelope,
  type CoreSpiritWebhookSink,
} from './eventSystem';
import { buildCoreSpiritScene, diffCoreSpiritScenes } from './visualScene';

async function main(): Promise<void> {
  const renderer = coreSpiritRendererRegistry.create('headless');
  const target: CoreSpiritRendererTarget = {
    id: 'chart-1',
    width: 1200,
    height: 700,
    devicePixelRatio: 2,
  };
  renderer.mount(target);

  const sceneA = buildCoreSpiritScene(
    { chartId: 'chart-1', symbol: 'NSE:NIFTY50', timeframe: '5m', pane: 'main' },
    [{
      kind: 'line',
      id: 'major_resistance',
      start: { time: 1000, price: 25180 },
      end: { time: 2000, price: 25180 },
      style: { lineWidth: 2 },
    } as any],
    'demo',
    1,
  );

  const frameA = renderer.render(sceneA);
  if (frameA.abiVersion !== CORE_SPIRIT_RENDERER_ABI_VERSION) throw new Error('renderer ABI contract failed');

  const sceneB = buildCoreSpiritScene(
    sceneA.identity,
    [{
      kind: 'line',
      id: 'major_resistance',
      start: { time: 1000, price: 25200 },
      end: { time: 2000, price: 25200 },
      style: { lineWidth: 3 },
    } as any],
    'demo',
    2,
  );

  const diff = diffCoreSpiritScenes(sceneA, sceneB);
  const frameB = renderer.applyDiff(diff, sceneB);
  if (frameB.commands.length !== 1 || frameB.commands[0].op !== 'upsert') {
    throw new Error('renderer diff contract failed');
  }

  const bus = new CoreSpiritEventBus();
  const received: string[] = [];
  const eventConsumer = (id: string, priority: number) => ({
    id,
    priority,
    topics: ['coreSpirit.signal'] as const,
    handle: (event: CoreSpiritEventEnvelope) => {
      received.push(`${id}:${String(event.payload.type)}`);
    },
  });

  bus.register(eventConsumer('chart', 10));
  bus.register(eventConsumer('alert', 20));

  const delivered = await bus.publish(createSignalEvent({
    sourceId: 'ema-rsi',
    programChecksum: 'artifact:abc',
    runId: 'replay-1',
    mode: 'replay',
    barIndex: 100,
    timestamp: 2000,
    sequence: 1,
    type: 'LONG',
    metadata: { confidence: 0.84 },
  }));

  if (delivered.deliveries.filter((d) => d.status === 'delivered').length !== 2) {
    throw new Error('event fan-out contract failed');
  }
  if (received.join('|') !== 'chart:LONG|alert:LONG') {
    throw new Error('event ordering contract failed');
  }

  const duplicate = await bus.publish(delivered.event);
  if (duplicate.deliveries.filter((d) => d.status === 'skipped').length !== 2) {
    throw new Error('event idempotency contract failed');
  }

  const webhookCalls: string[] = [];
  const sink: CoreSpiritWebhookSink = {
    deliver: async (endpointKey, event, payload) => {
      webhookCalls.push(`${endpointKey}:${event.id}:${String(payload.type)}`);
    },
  };

  const webhookBus = new CoreSpiritEventBus();
  webhookBus.register(new CoreSpiritWebhookConsumer(
    'webhook:trade_signal',
    {
      id: 'trade_signal',
      topic: 'coreSpirit.signal',
      endpointKey: 'trade_signal',
      include: ['symbol', 'side', 'price', 'confidence'],
    },
    sink,
  ));

  const whEvent = createSignalEvent({
    sourceId: 'ema-rsi',
    programChecksum: 'artifact:abc',
    runId: 'live-1',
    mode: 'realtime',
    barIndex: 101,
    timestamp: 3000,
    sequence: 2,
    type: 'LONG',
    metadata: {
      symbol: 'NSE:NIFTY50',
      side: 'BUY',
      price: 25143.2,
      confidence: 0.84,
    },
  });

  const whResult = await webhookBus.publish(whEvent);
  if (whResult.deliveries[0].status !== 'delivered' || webhookCalls.length !== 1) {
    throw new Error('webhook consumer contract failed');
  }

  renderer.dispose();
  console.log('STAGE46_47_RENDERER_EVENT_BUS_OK');
}

void main().catch((error) => {
  console.error(error);
  throw error;
});
