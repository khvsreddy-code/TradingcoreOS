import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeFyersOrderPayload } from './server/fyers/trading/fyersOrderEventNormalizer.ts';

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

const read = (path) => fs.readFileSync(path, 'utf8');
const transport = read('src/server/marketData/FyersMarketDataTransport.ts');
const marketTypes = read('src/types/market.ts');
const domainTypes = read('src/types/market-events.ts');
const orderTransport = read('src/server/fyers/trading/FyersOrderStreamTransport.ts');
const orderNormalizer = read('src/server/fyers/trading/fyersOrderEventNormalizer.ts');
const streamRoute = read('src/server/routes/broker-market-data.routes.ts');
const orderRoute = read('src/server/routes/fyers-order-stream.routes.ts');

assert.match(transport, /FyersDataFeedClass = 'lite' \| 'full' \| 'depth'/);
assert.match(transport, /sessionKey\(userId: string, feedClass: FyersDataFeedClass\)/);
assert.match(transport, /session\.feedClass === 'lite' \? 'lite'/);
assert.match(transport, /session\.feedClass === 'depth' \? 'DepthUpdate'/);
assert.match(transport, /session\.subscriptions\.get\(listener\)/,
  'each consumer must only receive symbols it subscribed to');
assert.match(transport, /checkSubscriptionCapacity\(userId, symbols, maxSymbols\)/);
assert.match(transport, /domainEvent: buildDomainEvent\(tick, session\.feedClass\)/);
assert.match(marketTypes, /domainEvent\?: DomainMarketEvent/);
for (const type of ['MarketTick', 'Quote', 'DepthSnapshot', 'DepthDelta', 'Trade', 'OrderUpdate', 'Fill', 'PositionUpdate', 'FundsUpdate']) {
  assert.match(domainTypes, new RegExp('type: \' ' + type + '\''));
}
assert.match(domainTypes, /sequence: number/);
assert.match(domainTypes, /receivedAt: number/);
assert.match(domainTypes, /brokerTimestamp\?: number/);
assert.match(domainTypes, /revision: number/);
assert.match(orderTransport, /normalizeFyersOrderPayload/);
assert.doesNotMatch(orderTransport, /data: any/,
  'the broker order socket must not expose raw any payloads');
assert.doesNotMatch(orderTransport, /data: payload/);
assert.match(orderNormalizer, /Unknown payloads are deliberately dropped/);
assert.match(streamRoute, /feed_class/);
assert.match(streamRoute, /\['lite', 'full', 'depth'\]/);
assert.match(orderRoute, /event: FyersOrderStreamEvent/);
assert.doesNotMatch(orderRoute, /event:any/);

console.log('FYERS_MULTI_CLASS_DOMAIN_EVENTS_CONTRACT_OK');
