import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeFyersOrderPayload, stampFyersOrderEvent } from './server/fyers/trading/fyersOrderEventNormalizer.ts';
import { toFyersOrderStreamEvent } from './server/fyers/trading/FyersOrderStreamTransport.ts';
import { MarketEventBus } from './server/marketData/MarketEventBus.ts';

const orderFrame = normalizeFyersOrderPayload({
  type: 'orders',
  orders: {
    id: 'ORD-1', symbol: 'NSE:SBIN-EQ', status: 'FILLED', side: 1,
    qty: 2, filledQty: 2, avgPrice: 101.25, orderDateTime: '2026-10-11T09:15:00+05:30',
  },
}, 1, 1_797_095_000_000);
assert.equal(orderFrame.length, 1);
assert.equal(orderFrame[0].type, 'order');
assert.equal(orderFrame[0].data.type, 'OrderUpdate');
assert.equal(orderFrame[0].data.orderId, 'ORD-1');
assert.equal(orderFrame[0].data.sequence, 1);
assert.equal(orderFrame[0].data.source, 'fyers');
assert.equal(orderFrame[0].data.side, 'buy');

const trades = normalizeFyersOrderPayload({
  type: 'trades',
  trades: [{ tradeId: 'TRD-1', orderId: 'ORD-1', symbol: 'NSE:SBIN-EQ', tradePrice: 100.5, tradedQty: 2, side: -1 }],
}, 2, 2_000);
assert.equal(trades.length, 1);
assert.equal(trades[0].type, 'trade');
assert.equal(trades[0].data.type, 'Fill');
assert.equal(trades[0].data.tradeId, 'TRD-1');
assert.equal(trades[0].data.side, 'sell');
assert.equal(trades[0].data.receivedAt, 2_000);

const positions = normalizeFyersOrderPayload({
  type: 'positions',
  positions: [{ id: 'POS-1', symbol: 'NSE:SBIN-EQ', netQty: 3, buyAvg: 99, ltp: 102, pl: 9 }],
}, 3, 3_000);
assert.equal(positions[0].type, 'position');
assert.equal(positions[0].data.type, 'PositionUpdate');
assert.equal(positions[0].data.quantity, 3);
assert.equal(positions[0].data.pnl, 9);

const funds = normalizeFyersOrderPayload({
  type: 'funds',
  funds: { availableBalance: 12_000, usedMargin: 2_000, totalCapital: 14_000 },
}, 4, 4_000);
assert.equal(funds[0].type, 'funds');
assert.equal(funds[0].data.type, 'FundsUpdate');
assert.equal(funds[0].data.available, 12_000);
assert.deepEqual(normalizeFyersOrderPayload({ type: 'futureUnknownFrame', payload: { anything: true } }, 5, 5_000), [],
  'unknown broker frames must not leak as arbitrary objects');

// Stamp metadata without losing the discriminated-union relationship between
// each compatibility tag and its typed canonical domain payload.
const normalizedOrders = [
  stampFyersOrderEvent(orderFrame[0], 11, 11_000),
  stampFyersOrderEvent(trades[0], 12, 12_000),
  stampFyersOrderEvent(positions[0], 13, 13_000),
  stampFyersOrderEvent(funds[0], 14, 14_000),
];
assert.deepEqual(normalizedOrders.map(item => item.type), ['order', 'trade', 'position', 'funds']);
assert.deepEqual(normalizedOrders.map(item => item.data.type), ['OrderUpdate', 'Fill', 'PositionUpdate', 'FundsUpdate']);
assert.deepEqual(normalizedOrders.map(item => item.data.sequence), [11, 12, 13, 14]);
assert.deepEqual(normalizedOrders.map(item => item.data.revision), [11, 12, 13, 14]);
assert.deepEqual(normalizedOrders.map(item => item.data.receivedAt), [11_000, 12_000, 13_000, 14_000]);

// The shared event bus receives canonical DomainMarketEvent values. The
// client-facing order stream envelope is a separate, explicit edge mapping.
const streamEnvelopes = normalizedOrders.map(item => toFyersOrderStreamEvent(item.data));
assert.deepEqual(streamEnvelopes.map(item => item.type), ['order', 'trade', 'position', 'funds']);
assert.deepEqual(streamEnvelopes.map(item => item.data), normalizedOrders.map(item => item.data));
const orderDeliveryBus = new MarketEventBus();
const executionDomainEvents = [];
const auditDomainEvents = [];
orderDeliveryBus.subscribe(event => executionDomainEvents.push(event), { consumers: ['execution'] });
orderDeliveryBus.subscribe(event => auditDomainEvents.push(event), { consumers: ['audit'] });
for (const item of normalizedOrders) orderDeliveryBus.publish(item.data);
const expectedOrderDomainTypes = ['OrderUpdate', 'Fill', 'PositionUpdate', 'FundsUpdate'];
assert.deepEqual(executionDomainEvents.map(event => event.type), expectedOrderDomainTypes);
assert.deepEqual(auditDomainEvents.map(event => event.type), expectedOrderDomainTypes);
assert.ok(executionDomainEvents.every(event => !Object.hasOwn(event, 'data')),
  'domain consumers receive canonical events, never nested transport envelopes');
assert.equal(orderDeliveryBus.subscriberCount, 2);

const bus = new MarketEventBus();
const quoteEvents = [];
const chartEvents = [];
const depthEvents = [];
const genericEvents = [];
bus.subscribe(event => quoteEvents.push(event), { consumers: ['quote'] });
bus.subscribe(event => chartEvents.push(event), { consumers: ['chart'] });
bus.subscribe(event => depthEvents.push(event), { consumers: ['orderbook'] });
bus.subscribe(event => genericEvents.push(event));
const baseMeta = { sequence: 1, timestamp: 1000, receivedAt: 1100, symbol: 'NSE:SBIN-EQ', source: 'fyers', revision: 1 };
bus.publish({ ...baseMeta, type: 'Quote', ltp: 100 });
bus.publish({ ...baseMeta, type: 'MarketTick', ltp: 101 });
bus.publish({ ...baseMeta, type: 'DepthSnapshot', bids: [{ price: 100, quantity: 10 }], asks: [] });
bus.publish({ ...baseMeta, type: 'Fill', tradeId: 'TRD-2', orderId: 'ORD-2', price: 100, quantity: 1, side: 'buy' });
assert.deepEqual(quoteEvents.map(event => event.type), ['Quote'], 'LTP-only consumers must not receive full ticks/depth');
assert.deepEqual(chartEvents.map(event => event.type), ['MarketTick'], 'chart consumers must not receive quote/depth-only frames');
assert.deepEqual(depthEvents.map(event => event.type), ['DepthSnapshot'], 'orderbook consumers must not receive full ticks or account fills');
assert.deepEqual(genericEvents.map(event => event.type), ['Quote', 'MarketTick', 'Fill'],
  'unfiltered consumers must not receive high-volume depth frames without explicit opt-in');
assert.equal(bus.subscriberCount, 4);
bus.publish({ ...baseMeta, type: 'MarketTick', ltp: 102 });
assert.equal(chartEvents.length, 2);
assert.equal(bus.subscriberCount, 4, 'publishing must not create hidden retained subscriptions');

const read = (path) => fs.readFileSync(path, 'utf8');
const transport = read('src/server/marketData/FyersMarketDataTransport.ts');
const marketTypes = read('src/types/market.ts');
const domainTypes = read('src/types/market-events.ts');
const orderTransport = read('src/server/fyers/trading/FyersOrderStreamTransport.ts');
const orderNormalizer = read('src/server/fyers/trading/fyersOrderEventNormalizer.ts');
const eventBus = read('src/server/marketData/MarketEventBus.ts');
const streamRoute = read('src/server/routes/broker-market-data.routes.ts');
const orderRoute = read('src/server/routes/fyers-order-stream.routes.ts');
const gateway = read('realtime-gateway/server.ts');

assert.match(transport, /FyersDataFeedClass = 'lite' \| 'full' \| 'depth'/);
assert.match(transport, /sessionKey\(userId: string, feedClass: FyersDataFeedClass\)/);
assert.match(transport, /session\.feedClass === 'lite' \? 'lite'/);
assert.match(transport, /session\.feedClass === 'depth' \? 'DepthUpdate'/);
assert.match(transport, /session\.subscriptions\.get\(listener\)/,
  'each consumer must only receive symbols it subscribed to');
assert.match(transport, /const tokenChanged = session\.accessToken !== accessToken/,
  'rotated broker tokens must restart the shared socket');
assert.match(transport, /if \(tokenChanged && session\.socket\) this\.restartSocket\(key, session\)/);
assert.match(transport, /feedClass === 'depth' && !depthBids\.length && !depthAsks\.length/,
  'depth sockets must drop empty/non-depth frames');
assert.match(transport, /feedClass === 'full' && ltp === undefined/,
  'full-tick sockets must not leak depth-only/informational frames');
assert.match(transport, /checkSubscriptionCapacity\(userId, symbols, maxSymbols, \[\], quotaIdentity\)/,
  'stream capacity must be enforced across every socket sharing the resolved FYERS account identity');
assert.match(transport, /const domainEvent = buildDomainEvent\(tick, session\.feedClass\)/);
assert.match(transport, /marketEventBus\.publish\(domainEvent\)/);
assert.match(transport, /if \(feedClass === 'lite'\) \{[\s\S]*?type: 'Quote'/);
assert.match(eventBus, /export class MarketEventBus/);
assert.match(eventBus, /if \(!entry\.consumers \|\| !routesToConsumer\(event, entry\.consumers\)\) continue/,
  'depth fanout must require an explicit eligible consumer class');
assert.match(orderTransport, /private static publishDomainEvent\(session: Session, event: DomainMarketEvent\)/);
assert.match(orderTransport, /marketEventBus\.publish\(event\)/,
  'durably reduced canonical domain events must be published directly to the shared bus');
assert.doesNotMatch(orderTransport, /marketEventBus\.publish\(event\.data\)/,
  'the normalizer compatibility wrapper must never be published as a domain event');
assert.match(orderTransport, /toFyersOrderStreamEvent\(event\)/,
  'the client-facing envelope is mapped separately at the transport edge');
assert.match(orderTransport, /stampFyersOrderEvent\(item, \+\+session\.sequence, frame\.receivedAt\)/);
assert.match(orderTransport, /FyersOrderStateEngine\.applyNormalized\(userId, stamped, 'websocket'\)/,
  'broker events must pass through the idempotent state engine before publication');
assert.doesNotMatch(orderTransport, /as FyersNormalizedOrderEvent/,
  'the live reducer must preserve discriminated event types without widening casts');
assert.match(orderNormalizer, /export function stampFyersOrderEvent/);
assert.doesNotMatch(orderTransport, /as DomainMarketEvent/, 'normalized order events must satisfy the domain union without unsafe casts');
assert.match(marketTypes, /domainEvent\?: DomainMarketEvent/);
for (const type of ['MarketTick', 'Quote', 'DepthSnapshot', 'DepthDelta', 'Trade', 'OrderUpdate', 'Fill', 'PositionUpdate', 'FundsUpdate']) {
  assert.ok(domainTypes.includes(`type: '${type}'`), `missing domain event type ${type}`);
}
assert.match(domainTypes, /sequence: number/);
assert.match(domainTypes, /receivedAt: number/);
assert.match(domainTypes, /brokerTimestamp\?: number/);
assert.match(domainTypes, /revision: number/);
assert.match(orderTransport, /normalizeFyersOrderPayload/);
assert.doesNotMatch(orderTransport, /data: any/,
  'the broker order socket must not expose raw any payloads');
assert.doesNotMatch(orderTransport, /data: payload/);
assert.match(streamRoute, /feed_class/);
assert.match(streamRoute, /\['lite', 'full', 'depth'\]/);
assert.match(orderRoute, /event: FyersOrderStreamEvent/);
assert.doesNotMatch(orderRoute, /event:any/);
assert.match(gateway, /marketListener=\(event:MarketFeedEvent\)/);
assert.match(gateway, /orderListener=\(event:FyersOrderStreamEvent\)/);
assert.doesNotMatch(gateway, /marketListener=\(event:any\)/);
assert.doesNotMatch(gateway, /orderListener=\(event:any\)/);

console.log('FYERS_MULTI_CLASS_DOMAIN_EVENTS_CONTRACT_OK');
