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
const brokerAdapter = read('./server/brokers/adapters/BrokerAdapters.ts');


assert.match(quoteRoute, /resolveFyersCapabilities/);
assert.match(quoteRoute, /post\('\/:brokerId\/quotes'/, 'POST quotes must support large symbol batches without URL-length pressure');
assert.match(quoteRoute, /assertFyersQuoteBatch\(symbols, capabilities\)/, 'the route must defer quote batch validation to the capability layer');
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
assert.match(historyRoute,/client\.dataGet<any>\('\/history'/,'dedicated history requests must use the capability-aware Data API client');
assert.match(historyRoute,/fallbackQuoteCandle\(client/,'history fallback quotes must consume their own Data API quota unit');
assert.match(brokerAdapter,/assertFyersQuoteBatch\(symbols, capabilities\)/,'legacy adapter quotes must share the capability boundary');
assert.match(brokerAdapter,/dataGet<any>\(\s*'\/quotes'/,'legacy adapter quotes must use the shared Data API rate gate');
assert.match(brokerAdapter,/capabilities\.historyDepth/,'legacy adapter history must honor the same depth capabilities');
assert.match(brokerAdapter,/FYERS_SECONDS_DATA_REQUIRES_PRIME/,'legacy adapter must reject Standard seconds-data requests');
assert.match(brokerAdapter,/dataGet<any>\(\s*'\/options-chain-v3'/,'legacy option-chain requests must use the Data API gate');
assert.match(streamRoute,/getOptionChain\(session\.token, symbol, expiryDate, capabilities, session\.userId\)/,'option-chain route must pass plan and stable user quota identity');
assert.match(apiClient,/startsWith\('BROKER_'\)/,'local rate-gate denials must not be retried as provider errors');
assert.match(apiClient,/this\.rateLimitIdentity = String\(rateLimitIdentity \|\| accessToken\)/,'quota counters must use a stable account identity when supplied');
assert.match(apiClient,/withBrokerRequestGate\('fyers', this\.rateLimitIdentity/,'all Data API attempts must share the stable per-user quota bucket');
assert.match(quoteRoute,/capabilities, userId\)/,'the canonical quote client must be keyed by authenticated user, not rotating token');
assert.match(historyRoute,/new FyersApiClient\(accessToken, undefined, capabilities, userId\)/,'history requests must share the same stable quota identity');
assert.match(brokerAdapter,/rateLimitIdentity = accessToken/,'legacy adapter methods must support explicit stable quota identity');
assert.match(streamRoute,/capabilities, session\.userId\)/,'legacy history requests must pass authenticated user identity');

assert.match(requestGate,/TRADINGCORE_DISTRIBUTED_COORDINATION_REQUIRED/,'production can fail closed if shared quota coordination is required');


console.log('FYERS_PLAN_CAPABILITIES_CONTRACT_OK');
