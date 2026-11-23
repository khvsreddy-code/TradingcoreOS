import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const ticket = read('./components/workspace/CompactOrderTicket.tsx');
const chrome = read('./services/core/chart/tcoVelaChrome.ts');
const runtime = read('./services/runtime/TradingCoreRuntime.ts');
const adapter = read('./services/brokers/BrokerAdapter.ts');
const watchlist = chrome.slice(chrome.indexOf("id: 'tco.bookmarks'"), chrome.indexOf("const healthPanel"));

for (const token of ['Order type', 'Product', 'Quantity', 'BUY', 'SELL', 'Risk controls', 'Review order', 'Confirm {side}']) {
  assert.ok(ticket.includes(token), 'compact ticket is missing ' + token);
}
assert.ok(ticket.includes('setReviewOpen(true)') && ticket.includes('data-testid="order-review"'),
  'order entry uses a distinct review state before submission');
assert.ok(ticket.includes('onClick={() => void submit()}'));
assert.ok(ticket.includes("Connect a broker before submitting an order."));
assert.ok(ticket.includes('Spot indices and unclassified symbols cannot be sent as order instruments'));
assert.ok(ticket.includes('Choose a listed contract…'), 'an index is not silently converted into a tradable derivative');
assert.ok(ticket.includes('quantityValue % lotSize'), 'lot-size multiples are enforced');
assert.ok(ticket.includes('tick size'), 'price increments are validated against the instrument tick');
assert.ok(ticket.includes('Stop loss and target must be on the correct side'));
assert.ok(ticket.includes('Broker-calculated on order'), 'required margin is not fabricated in the browser');
assert.ok(ticket.includes('BrokerAdapterRegistry.getAdapter(brokerId)?.capabilities.supportsBracketOrders === true'),
  'attached exits are only sent when the selected broker advertises bracket-order support');
assert.ok(ticket.includes("tradingCoreRuntime.subscribeTicks([nativeKey], refresh)"),
  'the selected option premium subscribes using the broker-native contract key');
assert.ok(ticket.includes('selectedOptionQuote?.symbol === nativeKey'),
  'an old option stream cannot bleed into a newly selected contract');
assert.ok(ticket.includes('overflow-y-auto overscroll-contain'),
  'the compact ticket remains usable on short workspace viewports');
assert.ok(ticket.includes('I have independently verified the current price with my broker.'));
assert.ok(ticket.includes('instrumentId: instrument.id'));
assert.ok(ticket.includes('instrument_token: instrument.brokerInstrumentKey || instrument.symbol'));
assert.ok(ticket.includes('tradingCoreRuntime.placeOrder(request)'));
assert.ok(ticket.includes("orderType === 'Market' || orderType === 'SL-M'"),
  'stop-market orders must not send a limit price');
assert.ok(runtime.includes('public async getOptionChain'));
assert.ok(runtime.includes('instrumentId: instrument.id'));
assert.ok(adapter.includes('instrumentId?: string;'));
assert.ok(watchlist.includes('LIVE') && watchlist.includes('DELAYED') && watchlist.includes('STALE'),
  'watchlist rows expose data health rather than a connection-only dot');

console.log('COMPACT_ORDER_TICKET_CONTRACT_OK');
