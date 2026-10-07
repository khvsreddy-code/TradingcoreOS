import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');

const provider = read('src/TcoVelaDataProvider.ts');
assert.equal(provider.includes('Promise.race'), false);
assert.equal(provider.includes('getMarketQuotes'), false);
assert.match(provider, /canonical FYERS history available/);
assert.match(provider, /getBarsProgressive[\\s\\S]*ensureReadyHistory/);

const historyRoute = read('src/server/routes/fyers-history.routes.ts');
assert.equal(historyRoute.includes('https://api-t1.fyers.in/data/history?'), false);
assert.match(historyRoute, /new FyersApiClient\\(accessToken\\)/);
assert.equal(historyRoute.includes('fallbackQuoteCandle'), false);
assert.equal(historyRoute.includes('withBrokerRequestGate'), false);

const gate = read('src/server/brokers/BrokerRequestGate.ts');
assert.match(gate, /'fyers-data': \\{ minIntervalMs: 250, maxPerMinute: 45 \\}/);
assert.equal(read('src/services/core/chart/ChartRuntimeController.ts').includes('seedLiveCandle?.('), false);
const client = read('src/server/fyers/core/FyersApiClient.ts');
assert.match(client, /base === DATA_BASE \\? 'fyers-data' : 'fyers'/);

console.log('[p0-vela-fyers] PASS');
