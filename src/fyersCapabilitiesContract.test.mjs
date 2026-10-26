import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveFyersCapabilities,
  assertFyersQuoteBatch,
  FyersCapabilityError,
  resolveFyersAdmissionBudget,
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
assert.equal(standard.maxStreamSymbols, 100, 'Standard FYERS data socket supports 100 symbols');
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
assert.deepEqual(standard.userInfoApiRateLimits, { requestsPerSecond:10, requestsPerMinute:200, requestsPerDay:100_000 });
assert.deepEqual(standard.transactionApiRateLimits, { requestsPerSecond:10, requestsPerMinute:200, requestsPerDay:100_000 });
assert.deepEqual(prime.userInfoApiRateLimits, { requestsPerSecond:10, requestsPerMinute:500, requestsPerDay:500_000 });
assert.deepEqual(prime.transactionApiRateLimits, { requestsPerSecond:10, requestsPerMinute:500, requestsPerDay:500_000 });
assert.deepEqual(resolveFyersAdmissionBudget(standard, 'data'), { category:'data', requestsPerSecond:4, requestsPerMinute:40, requestsPerDay:4_000, safetyMargin:0.2 });
assert.deepEqual(resolveFyersAdmissionBudget(standard, 'user-info'), { category:'user-info', requestsPerSecond:8, requestsPerMinute:160, requestsPerDay:80_000, safetyMargin:0.2 });
assert.deepEqual(resolveFyersAdmissionBudget(prime, 'transactions'), { category:'transactions', requestsPerSecond:8, requestsPerMinute:400, requestsPerDay:400_000, safetyMargin:0.2 });

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
const server = read('../server.ts');
const historyRoute = read('./server/routes/fyers-history.routes.ts');
const historyDataRoute = read('./server/routes/broker-market-data.routes.ts');
const canonicalHistory = read('./server/marketData/canonicalHistoricalData.ts');
const brokerAdapter = read('./server/brokers/adapters/BrokerAdapters.ts');
const accountRoute = read('./server/routes/fyers-account.routes.ts');
const accountService = read('./server/fyers/core/FyersAccountService.ts');
const legacyHistoryRoute = read('./server/routes/broker-market-data.routes.ts');
const marketTransport = read('./server/marketData/FyersMarketDataTransport.ts');
const quotaTelemetry = read('./server/fyers/core/FyersQuotaTelemetry.ts');

assert.match(legacyHistoryRoute, /symbols\.length > capabilities\.maxStreamSymbols/, 'the live subscription route uses the verified plan socket cap');
assert.match(legacyHistoryRoute, /capabilities\.maxStreamSymbols, feedClass/, 'each shared stream passes the account plan cap into the transport');
assert.match(marketTransport, /maxSymbols = DEFAULT_FYERS_CAPABILITIES\.maxStreamSymbols/, 'the socket transport defaults to the official Standard symbol allowance');
assert.match(marketTransport, /capacity\.limit/, 'socket subscriptions enforce the unique active-symbol budget');

const orderGateway = read('./server/trading/fyersOrderExecution.ts');
const tradingRoute = read('./server/routes/trading.routes.ts');


assert.match(quoteRoute, /resolveFyersCapabilities/);
assert.match(quoteRoute, /post\('\/:brokerId\/quotes'/, 'POST quotes must support large symbol batches without URL-length pressure');
assert.match(quoteRoute, /assertFyersQuoteBatch\(batch, capabilities\)/, 'each provider batch must be validated against the verified plan');
assert.match(quoteRoute, /symbols\.slice\(start, start \+ capabilities\.maxQuoteBatch\)/, 'large watchlists must be split into provider-sized quote batches');
assert.match(quoteRoute, /for \(let start = 0; start < symbols\.length; start \+= capabilities\.maxQuoteBatch\)/, 'quote batches must be submitted sequentially instead of as a request burst');
assert.match(quoteRoute, /maxSymbolsPerRequest = capabilities\.plan === 'prime' \? 5_000 : 200/, 'one public request must have a bounded total symbol budget');
assert.doesNotMatch(quoteRoute, /symbols\.length\s*>\s*50/, 'route code must not duplicate the old fixed quote limit');
assert.match(quoteService, /assertFyersQuoteBatch/, 'the service layer must enforce capability limits too');
assert.match(quoteService, /QUOTE_CACHE_TTL_MS = 1_500/, 'recent quote responses are reused briefly to reduce duplicate reads');
assert.match(quoteService, /quoteRequestsInFlight/, 'identical concurrent quote batches share one upstream request');
assert.match(quoteService, /QUOTE_IN_FLIGHT_MAX_ENTRIES = 512/, 'quote deduplication remains bounded during multi-user bursts');
assert.match(quoteService, /withCallerAbort\(sharedRequest, signal\)/, 'one caller abort cannot cancel a shared in-flight request for other consumers');
assert.match(streamRoute, /capabilities\.maxStreamSymbols/);
assert.match(streamRoute, /post\('\/:brokerId\/market-stream'/, 'large Prime stream subscriptions need a POST transport');
assert.match(streamTransport, /checkSubscriptionCapacity/, 'active subscriptions must be capped as a union, not only per request');
assert.match(apiClient, /const budgetKey = category === 'data' \? 'data' : 'account'/, "Data has its own pool while User Info and Transactions share the provider's combined account/API ceiling");
assert.match(brokerAdapter, /budgetKey: 'account'/, 'OAuth token exchange shares the combined User Info + Transactions budget instead of creating a third independent bucket');
assert.match(apiClient, /recordFyersQuotaAttempt\(category, this\.capabilities\.plan, pathOnly\)/, 'quota telemetry retains the precise API category even when admission shares a provider pool');
assert.match(apiClient, /isRetryableNetworkError/, 'transient network failures receive bounded retry handling on safe requests');
assert.match(apiClient, /retryableNetworkError/, 'network retries are limited to retry-safe API operations');
assert.match(apiClient, /maxPerDay: budget\.requestsPerDay/);
assert.match(requestGate, /tco:broker:day:/, 'daily quota must be enforced where shared coordination is configured');
assert.match(historyDataRoute, /FYERS_SECONDS_DATA_REQUIRES_PRIME/, 'the legacy history endpoint must gate seconds data by server-resolved plan');
assert.match(historyDataRoute, /Math\.min\(2_000/, 'the direct history endpoint must enforce the per-request 2,000-bar ceiling');
assert.match(historyDataRoute, /fetchFyersHistoryTarget\(session\.token, symbol, interval, limit, capabilities, session\.userId\)/, 'legacy history must pass the resolved plan and stable user ID');
assert.match(legacyHistoryRoute, /rateLimitIdentity: string/, 'legacy history helper APIs require an explicit stable identity');
assert.match(legacyHistoryRoute, /API_LATENCY_BUDGET_MS\.history, 'interactive'/, 'user-requested legacy history uses interactive admission priority');
assert.match(read('./server/fyers/market/FyersMarketDataService.ts'), /API_LATENCY_BUDGET_MS\.history, 'interactive'/, 'the shared FYERS history service prioritizes visible chart requests');
assert.doesNotMatch(legacyHistoryRoute, /rateLimitIdentity\s*=\s*accessToken/, 'legacy history must never fall back to rotating access-token quota identity');
assert.match(canonicalHistory, /client!\.dataGet<any>\('\/history'/, 'canonical history requests must use the capability-aware Data API client');
assert.match(canonicalHistory, /fallbackQuoteSnapshot\(client!/, 'only initial empty history may fetch a quote snapshot');
assert.match(brokerAdapter,/assertFyersQuoteBatch\(symbols, capabilities\)/,'legacy adapter quotes must share the capability boundary');
assert.match(brokerAdapter,/dataGet<any>\(\s*'\/quotes'/,'legacy adapter quotes must use the shared Data API rate gate');
assert.match(brokerAdapter,/capabilities\.historyDepth/,'legacy adapter history must honor the same depth capabilities');
assert.doesNotMatch(brokerAdapter,/Promise\.all\(ranges\.map/, 'legacy history pages must not fan out concurrently and expire while waiting for quota admission');
assert.match(brokerAdapter,/if \(byTimestamp\.size >= requestedLimit\) break/, 'legacy history stops once the requested newest-bar target is met');
assert.match(brokerAdapter,/FYERS_SECONDS_DATA_REQUIRES_PRIME/,'legacy adapter must reject Standard seconds-data requests');
assert.match(brokerAdapter,/dataGet<any>\(\s*'\/options-chain-v3'/,'legacy option-chain requests must use the Data API gate');
assert.match(streamRoute,/getOptionChain\(session\.token, symbol, expiryDate, capabilities, session\.userId\)/,'option-chain route must pass plan and stable user quota identity');
assert.match(apiClient,/startsWith\('BROKER_'\)/,'local rate-gate denials must not be retried as provider errors');
assert.match(apiClient,/Authenticated TradingCore user identity is required for FYERS quota enforcement/,'FYERS clients must not default to rotating access-token identities');
assert.match(apiClient,/withBrokerRequestGate\('fyers', this\.rateLimitIdentity/,'all Data API attempts must share the stable per-user quota bucket');
assert.match(quoteRoute,/new FyersApiClient\(EncryptionService\.decrypt\(session\.accessTokenEncrypted\), undefined, capabilities, userId\)/,'the dedicated quote client must be keyed by authenticated user, not rotating token');
assert.match(canonicalHistory,/new FyersApiClient\(accessToken, undefined, capabilities, userId\)/,'canonical history requests must share the same stable quota identity');
assert.match(brokerAdapter,/Authenticated TradingCore user identity is required for FYERS quota enforcement/,'legacy adapter requests must reject absent user identity instead of using rotating tokens');
assert.doesNotMatch(brokerAdapter,/rateLimitIdentity\s*=\s*accessToken/,'no legacy adapter may fall back to access-token quota identity');
assert.match(streamRoute,/capabilities, session\.userId\)/,'legacy history requests must pass authenticated user identity');

assert.match(requestGate,/process\.env\.NODE_ENV === 'production'/,'production always requires distributed quota coordination');
assert.match(requestGate,/TRADINGCORE_DISTRIBUTED_COORDINATION_REQUIRED === 'true'/,'the explicit production safety flag must require shared coordination');
assert.match(server,/TRADINGCORE_DISTRIBUTED_COORDINATION_REQUIRED === 'true'/,'readiness recognizes the explicit fail-closed coordination setting');
assert.match(server,/checks\.coordination && checks\.coordinationReachable/,'readiness must fail when shared Redis is missing or unreachable');
assert.match(server,/coordinationReachable = checks\.coordinationRequired \? await sharedBrokerCoordinationHealthy\(\)/,'readiness checks the configured shared Redis or Supabase Postgres coordinator');
assert.match(requestGate,/BROKER_COORDINATION_UNAVAILABLE/,'configured Redis outages must fail closed as 503 responses');
assert.match(requestGate,/BROKER_COORDINATION_LOCK_TIMEOUT/,'shared quota lock waits are bounded');
assert.match(requestGate,/lockDeadline = Date\.now\(\) \+ 3_000/,'a contention storm cannot hold a request indefinitely');
assert.match(accountService,/apiRequest\('\/orders',[\s\S]*category: 'user-info'/,'read-only order book requests consume the User Info quota');
assert.match(accountService,/apiRequest\('\/tradebook',[\s\S]*category: 'user-info'/,'read-only trade book requests consume the User Info quota');
assert.match(brokerAdapter,/fyersFetch\('\/orders', accessToken, \{\}, rateLimitIdentity, 'user-info'\)/,'legacy read-only order-book calls consume User Info quota');
assert.match(brokerAdapter,/priority: 'interactive'/,'legacy account reads and order mutations receive interactive quota priority');
assert.match(brokerAdapter,/fyersFetch\('\/tradebook', accessToken, \{\}, rateLimitIdentity, 'user-info'\)/,'legacy read-only trade-book calls consume User Info quota');
assert.match(accountService,/API_LATENCY_BUDGET_MS\.account, 'user-info'/,'margin calculation consumes the User Info quota');
assert.match(legacyHistoryRoute,/datasetComplete: false/,'legacy history responses do not imply full dataset completeness');
assert.match(legacyHistoryRoute,/providerPageLimit: 2_000/,'legacy history responses disclose the provider request ceiling');

assert.match(requestGate,/tco:broker:priority-minute:noninteractive/,'background/normal requests reserve quota for interactive traffic');
assert.match(requestGate,/tco:broker:priority-minute:background/,'background requests have an independent smaller quota');
assert.match(apiClient,/retry-after/,'Retry-After header support exists');
assert.match(apiClient,/recordFyersQuotaAttempt/,'every upstream HTTP attempt is counted');
assert.match(apiClient,/recordFyersQuotaDenial/,'local quota denials are observable');
assert.match(quotaTelemetry,/scope: 'process-local; admission authority is shared Redis'/,'telemetry states its process-local scope and does not misrepresent itself as global');
assert.match(quotaTelemetry,/`http-\$\{Math\.trunc\(status\)\}`/,'quota telemetry records the exact provider HTTP status instead of only broad status classes');
assert.match(quotaTelemetry,/`local-gate-\$\{status\}`/,'quota telemetry preserves local gate denial status codes separately from provider responses');
assert.match(accountRoute,/new FyersApiClient\(EncryptionService\.decrypt\(s\.accessTokenEncrypted\),undefined,capabilities,userId\)/,'account endpoints use stable authenticated identity and server-resolved capabilities');
assert.match(orderGateway,/rateLimitIdentity: userId/,'fixed-IP order execution carries the authenticated user identity to the external quota authority');
assert.match(orderGateway,/quotaPlan: resolveFyersCapabilities\(userId\)\.plan/,'fixed-IP order execution forwards only server-resolved FYERS plan entitlements');
assert.match(tradingRoute,/placeFyersOrderViaFixedIpGateway\(req\.accessToken, orderPayload, idempotencyKey, userId\)/,'FYERS orders use the fixed-IP gateway with the authenticated user quota identity');


console.log('FYERS_PLAN_CAPABILITIES_CONTRACT_OK');
