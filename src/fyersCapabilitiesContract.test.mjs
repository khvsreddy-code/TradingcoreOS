import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveFyersCapabilities,
  assertFyersQuoteBatch,
  FyersCapabilityError,
  resolveFyersAdmissionBudget,
} from './server/fyers/core/FyersCapabilities.ts';
import { clampFyersHistoryRange, FYERS_HISTORY_WINDOW_DAYS, fyersHistoryWindowFloorMs } from './server/fyers/core/FyersHistoryWindow.ts';

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

assert.equal(FYERS_HISTORY_WINDOW_DAYS, 7, 'standard FYERS history is capped at one calendar week');
const fixedNow = Date.UTC(2026, 9, 30, 12);
const fyersFloor = fyersHistoryWindowFloorMs(fixedNow);
const clippedRange = clampFyersHistoryRange(fixedNow - 30 * 86_400_000, fixedNow, fixedNow);
assert.equal(clippedRange?.fromMs, fyersFloor, 'older FYERS history is clipped to the seven-day boundary');
assert.equal(clippedRange?.toMs, fixedNow);
assert.equal(clippedRange?.clipped, true);
const exactWeek = clampFyersHistoryRange(fyersFloor, fixedNow, fixedNow);
assert.equal(exactWeek?.fromMs, fyersFloor);
assert.equal(exactWeek?.clipped, false);
const dateOnlyRange = clampFyersHistoryRange('2026-10-24', '2026-10-30', fixedNow);
assert.equal(dateOnlyRange?.fromMs, Date.UTC(2026, 9, 23, 18, 30), 'date-only starts are inclusive at India exchange midnight');
assert.equal(dateOnlyRange?.toMs, fixedNow, 'date-only end dates include the full current trading day without going past now');
assert.equal(clampFyersHistoryRange(fixedNow - 30 * 86_400_000, fixedNow - 20 * 86_400_000, fixedNow), null,
  'a request wholly older than a week is rejected before consuming quota');
assert.throws(() => clampFyersHistoryRange('', fixedNow, fixedNow), /valid increasing range/);

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
assert.match(streamTransport, /session\.quotaIdentity === quotaIdentity/, 'the active WebSocket symbol union is scoped to the actual FYERS account, not a TradingCore login');
assert.match(streamTransport, /quotaIdentity = _userId/, 'the backwards-compatible capacity helper defaults to a stable caller identity when no account key is supplied');
assert.match(streamTransport, /session\.userId === userId && session\.quotaIdentity !== quotaIdentity/, 'switching the authenticated user to another broker account retires prior-account sockets before admitting new symbols');
assert.match(streamRoute, /session\.quotaIdentity/, 'market-stream admission passes the resolved FYERS account identity into the shared capacity gate');
assert.match(apiClient, /const budgetKey = category === 'data' \? 'data' : 'account'/, "Data has its own pool while User Info and Transactions share the provider's combined account/API ceiling");
assert.match(brokerAdapter, /budgetKey: 'account'/, 'OAuth token exchange shares the combined User Info + Transactions budget instead of creating a third independent bucket');
assert.match(apiClient, /recordFyersQuotaAttempt\(category, this\.capabilities\.plan, pathOnly\)/, 'quota telemetry retains the precise API category even when admission shares a provider pool');
assert.match(apiClient, /isRetryableNetworkError/, 'transient network failures receive bounded retry handling on safe requests');
assert.match(apiClient, /retryableNetworkError/, 'network retries are limited to retry-safe API operations');
assert.match(apiClient, /maxPerDay: budget\.requestsPerDay/);
assert.ok(apiClient.includes('clampFyersHistoryRange('), 'ordinary Data API history requests pass through the seven-day boundary');
assert.ok(apiClient.includes("pathOnly.toLowerCase().includes('history')"), 'the central policy covers direct and legacy history callers, including historical endpoint variants');
assert.match(requestGate, /tco:broker:day:/, 'daily quota must be enforced where shared coordination is configured');
assert.match(historyDataRoute, /FYERS_SECONDS_DATA_REQUIRES_PRIME/, 'the legacy history endpoint must gate seconds data by server-resolved plan');
assert.match(historyDataRoute, /Math\.min\(2_000/, 'the direct history endpoint must enforce the per-request 2,000-bar ceiling');
assert.match(historyDataRoute, /fetchFyersHistoryTarget\(session\.token, symbol, interval, limit, capabilities, session\.quotaIdentity\)/, 'legacy history must pass the resolved plan and broker-account quota identity');
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
assert.match(apiClient,/Stable FYERS account or application identity is required for quota enforcement/,'FYERS clients reject absent stable broker/application quota identity');
assert.match(apiClient,/withBrokerRequestGate\('fyers', this\.rateLimitIdentity/,'all Data API attempts must share the stable broker-account quota bucket');
assert.match(quoteRoute,/new FyersApiClient\(EncryptionService\.decrypt\(session\.accessTokenEncrypted\), undefined, capabilities, resolveFyersQuotaIdentity\(session\.clientCode\)\)/,'quote routes share the FYERS account-level quota');
assert.match(canonicalHistory,/resolveFyersQuotaIdentity\(session\.clientCode\)/,'canonical history resolves one shared FYERS account identity');
assert.match(canonicalHistory,/withDistributedHistoricalPage/,'canonical history shares provider pages through distributed single-flight');
assert.match(canonicalHistory,/new FyersApiClient\(accessToken, undefined, capabilities, quotaIdentity\)/,'canonical history shares quota across TradingCore users connected to the same FYERS account');
assert.match(brokerAdapter,/Authenticated TradingCore user identity is required for FYERS quota enforcement/,'legacy adapter requests must reject absent user identity instead of using rotating tokens');
assert.doesNotMatch(brokerAdapter,/rateLimitIdentity\s*=\s*accessToken/,'no legacy adapter may fall back to access-token quota identity');
assert.match(streamRoute,/session\.quotaIdentity/, 'legacy market-stream requests use the same broker-account identity as the REST quota gate');

assert.match(requestGate,/process\.env\.NODE_ENV === 'production'/,'production always requires distributed quota coordination');
assert.match(requestGate,/TRADINGCORE_DISTRIBUTED_COORDINATION_REQUIRED === 'true'/,'the explicit production safety flag must require shared coordination');
assert.match(server,/TRADINGCORE_DISTRIBUTED_COORDINATION_REQUIRED === 'true'/,'readiness recognizes the explicit fail-closed coordination setting');
assert.match(server,/checks\.coordination && checks\.coordinationReachable/,'readiness must fail when shared Redis is missing or unreachable');
assert.match(server,/checks\.coordinationReachable = coordinationReachable/,'readiness reports the result of the concurrent shared-coordination probe');
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
assert.match(quotaTelemetry,/scope: 'process-local telemetry; admission authority is ' \+ coordinationAuthorityLabel\(\)/,'telemetry remains process-local while identifying the configured shared admission backend');
assert.match(quotaTelemetry,/`http-\$\{Math\.trunc\(status\)\}`/,'quota telemetry records the exact provider HTTP status instead of only broad status classes');
assert.match(quotaTelemetry,/`local-gate-\$\{status\}`/,'quota telemetry preserves local gate denial status codes separately from provider responses');
assert.match(accountRoute,/new FyersApiClient\(EncryptionService\.decrypt\(s\.accessTokenEncrypted\),undefined,capabilities,resolveFyersQuotaIdentity\(s\.clientCode\)\)/,'account endpoints share the FYERS account-level quota');
assert.match(orderGateway,/rateLimitIdentity: quotaIdentity/,'fixed-IP order execution uses the account-wide quota identity while retaining per-user risk/account partitioning');
assert.match(orderGateway,/accountKey: createHash\('sha256'\)\.update\(quotaIdentity\)\.digest\('hex'\)/,'the execution gateway account limiter is bound to the same broker-account identity it verifies');
assert.match(orderGateway,/quotaPlan: resolveFyersCapabilities\(userId\)\.plan/,'fixed-IP order execution forwards only server-resolved FYERS plan entitlements');
assert.match(brokerAdapter,/resolveFyersQuotaIdentity\(session\?\.clientCode\)/,'legacy broker adapter requests use the stored FYERS account identity');
assert.match(brokerAdapter,/resolveFyersQuotaIdentity\(undefined\)/,'OAuth token exchange uses one application-level quota bucket before the broker account is known');
assert.match(legacyHistoryRoute,/resolveFyersQuotaIdentity\(session\.clientCode\)/,'legacy direct history requests use the FYERS account identity');
assert.match(tradingRoute,/req\.fyersQuotaIdentity = resolveFyersQuotaIdentity\(session\.clientCode\)/,'manual orders receive the shared FYERS account quota identity');
assert.match(tradingRoute,/FyersMarketDataTransport\.subscribe\(req\.tradingCoreUserId!, req\.accessToken, instrumentKeys, write, undefined, undefined, undefined, undefined, req\.fyersQuotaIdentity\)/,'legacy trading-route WebSocket admission shares the FYERS account-wide stream-symbol capacity');
assert.match(tradingRoute,/placeFyersOrderViaFixedIpGateway\(req\.accessToken, orderPayload, idempotencyKey, userId, req\.fyersQuotaIdentity\)/,'FYERS orders use the fixed-IP gateway with the broker-account quota identity');


console.log('FYERS_PLAN_CAPABILITIES_CONTRACT_OK');
