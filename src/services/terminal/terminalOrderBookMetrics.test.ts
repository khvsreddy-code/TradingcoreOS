import assert from 'node:assert/strict';
import { calculateTerminalOrderBookDepth } from './terminalOrderBookMetrics.js';

const metrics = calculateTerminalOrderBookDepth(
  [
    { price: 100, quantity: 120, orders: 4 },
    { price: 99.95, quantity: 80, orders: 2 },
    { price: 99.9, quantity: 0, orders: 0 },
  ],
  [
    { price: 100.05, quantity: 50, orders: 3 },
    { price: 100.1, quantity: 50, orders: 1 },
  ],
  8,
);
assert.equal(metrics.bidQuantity, 200);
assert.equal(metrics.askQuantity, 100);
assert.ok(Math.abs((metrics.imbalancePercent ?? 0) - 100 / 3) < 1e-9);
assert.equal(metrics.bidLevels, 2);
assert.equal(metrics.askLevels, 2);
assert.equal(metrics.bidOrders, 6);
assert.equal(metrics.askOrders, 4);
assert.equal(metrics.bestBid, 100);
assert.equal(metrics.bestAsk, 100.05);
assert.ok(Math.abs((metrics.spread ?? 0) - 0.05) < 1e-10);

const limited = calculateTerminalOrderBookDepth(
  Array.from({ length: 10 }, (_, index) => ({ price: 100 - index, quantity: 10, orders: 1 })),
  Array.from({ length: 10 }, (_, index) => ({ price: 101 + index, quantity: 1, orders: 1 })),
  8,
);
assert.equal(limited.bidQuantity, 80, 'only displayed bid levels contribute');
assert.equal(limited.askQuantity, 8, 'only displayed ask levels contribute');
assert.equal(limited.bidLevels, 8);
assert.equal(limited.askLevels, 8);

const empty = calculateTerminalOrderBookDepth(undefined, undefined);
assert.equal(empty.imbalancePercent, null, 'missing depth must not be represented as neutral 0%');
assert.equal(empty.bestBid, null);
assert.equal(empty.bestAsk, null);
assert.equal(empty.spread, null);

const malformed = calculateTerminalOrderBookDepth(
  [{ price: Number.NaN, quantity: -10 }, { price: 99, quantity: 10 }],
  [{ price: 100, quantity: Number.POSITIVE_INFINITY }],
);
assert.equal(malformed.bidQuantity, 10);
assert.equal(malformed.askQuantity, 0);
assert.equal(malformed.bidLevels, 1);
assert.equal(malformed.imbalancePercent, 100);
assert.equal(malformed.bestAsk, null);
assert.equal(malformed.spread, null, 'invalid ask prices must not fabricate a spread');

console.log('TERMINAL_ORDER_BOOK_DEPTH_METRICS_OK');
