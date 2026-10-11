import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveFyersCapabilities,
  assertFyersQuoteBatch,
  FyersCapabilityError,
} from './server/fyers/core/FyersCapabilities.ts';

const env = {
  FYERS_API_PLAN_BY_USER: JSON.stringify({
    'prime-user':'prime',
    'standard-user':'standard',
  }),
};
const standard = resolveFyersCapabilities('unknown-user', env);
const configuredStandard = resolveFyersCapabilities('standard-user', env);
const prime = resolveFyersCapabilities('prime-user', env);

assert.equal(standard.plan, 'standard', 'unknown users must fail closed to Standard');
assert.equal(standard.maxQuoteBatch, 50);
assert.equal(configuredStandard.maxQuoteBatch, 50);
assert.equal(prime.plan, 'prime');
assert.equal(prime.maxQuoteBatch, 1_000);
assert.equal(standard.maxStreamSymbols, 50);
assert.equal(prime.maxStreamSymbols, 5_000);
assert.equal(standard.maxTbtSymbols, 1);
assert.equal(prime.maxTbtSymbols, 15);
assert.equal(standard.historyDepth.dailyYears, 5);
assert.equal(standard.historyDepth.intradayYears, 1);
assert.equal(prime.historyDepth.dailyYears, null, 'Prime should not receive an artificial daily-history entitlement cutoff');
assert.equal(prime.historyDepth.intradayYears, null, 'Prime should not receive an artificial intraday-history entitlement cutoff');
assert.equal(standard.secondData, false);
assert.equal(prime.secondData, true);
assert.deepEqual(standard.dataApiRateLimits, { requestsPerSecond:5, requestsPerMinute:50, requestsPerDay:5_000 });
assert.deepEqual(prime.dataApiRateLimits, { requestsPerSecond:10, requestsPerMinute:500, requestsPerDay:500_000 });

assert.doesNotThrow(() => assertFyersQuoteBatch(Array.from({length:50},(_,i)=>String(i)),standard));
assert.throws(
  () => assertFyersQuoteBatch(Array.from({length:51},(_,i)=>String(i)),standard),
  (error) => error instanceof FyersCapabilityError && error.code === 'FYERS_QUOTE_BATCH_LIMIT' && error.limit === 50,
);
assert.doesNotThrow(() => assertFyersQuoteBatch(Array.from({length:1_000},(_,i)=>String(i)),prime));
assert.throws(
  () => assertFyersQuoteBatch(Array.from({length:1_001},(_,i)=>String(i)),prime),
  (error) => error instanceof FyersCapabilityError && error.limit === 1_000,
);
assert.equal(resolveFyersCapabilities('u', {FYERS_API_PLAN_BY_USER:'not-json'}).plan, 'standard');
assert.equal(resolveFyersCapabilities('u', {FYERS_API_PLAN_BY_USER:JSON.stringify({u:'enterprise'})}).plan, 'standard');

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const quoteRoute = read('./server/routes/fyers-market.routes.ts');
const quoteService = read('./server/fyers/market/FyersMarketDataService.ts');
const streamRoute = read('./server/routes/broker-market-data.routes.ts');
const streamTransport = read('./server/marketData/FyersMarketDataTransport.ts');
const apiClient = read('./server/fyers/core/FyersApiClient.ts');
const requestGate = read('./server/brokers/BrokerRequestGate.ts');
const historyRoute = read('./server/routes/fyers-history.routes.ts');

assert.match(quoteRoute, /resolveFyersCapabilities/);
assert.match(quoteRoute, /post\('\/:brokerId\/quotes'/, 'POST quotes must support large symbol batches without URL-length pressure');
assert.match(quoteRoute, /capabilities\.maxQuoteBatch/);
assert.doesNotMatch(quoteRoute, /symbols\.length\s*>\s*50/, 'route code must not duplicate the old fixed quote limit');
assert.match(quoteService, /assertFyersQuoteBatch/, 'the service layer must enforce capability limits too');
assert.match(streamRoute, /capabilities\.maxStreamSymbols/);
assert.match(streamRoute, /post\('\/:brokerId\/market-stream'/, 'large Prime stream subscriptions need a POST transport');
assert.match(streamTransport, /checkSubscriptionCapacity/, 'active subscriptions must be capped as a union, not only per request');
assert.match(apiClient, /budgetKey: 'data'/);
assert.match(apiClient, /maxPerDay: limits\.requestsPerDay/);
assert.match(requestGate, /tco:broker:day:/, 'daily quota must be enforced where shared coordination is configured');
assert.match(historyRoute, /FYERS_HISTORY_DEPTH_LIMIT/);
assert.match(historyRoute, /FYERS_SECONDS_DATA_REQUIRES_PRIME/);

console.log('FYERS_PLAN_CAPABILITIES_CONTRACT_OK');
