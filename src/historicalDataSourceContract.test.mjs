import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const policy = read('src/services/marketData/chartHistoryPolicy.ts');
const service = read('src/server/marketData/HistoricalDataService.ts');
const route = read('src/server/routes/fyers-history.routes.ts');
const legacyRoute = read('src/server/routes/broker-market-data.routes.ts');
const canonical = read('src/server/marketData/canonicalHistoricalData.ts');
const python = read('historical-data-service/app.py');
const runtime = read('src/services/runtime/TradingCoreRuntime.ts');
const historyStore = read('src/services/marketData/HistoryStore.ts');
const chartHistoryNormalization = read('src/services/marketData/chartHistoryNormalization.ts');
const chartDataProvider = read('src/TcoVelaDataProvider.ts');
const fyersClient = read('src/server/fyers/core/FyersApiClient.ts');
const fyersWindow = read('src/server/fyers/core/FyersHistoryWindow.ts');
const brokerAdapter = read('src/server/brokers/adapters/BrokerAdapters.ts');

const initialBlock = policy.match(/export const INITIAL_HISTORY_CANDLES:[\s\S]*?\n};/)?.[0] || '';
const initialValues = [...initialBlock.matchAll(/'[^']+':\s*([0-9_]+)/g)].map(match => Number(match[1].replace(/_/g, '')));
assert.ok(initialValues.length > 0 && initialValues.every(value => value === 5000), 'the canonical history ceiling remains 5,000 bars');
assert.match(policy, /HISTORICAL_DATASET_MAX_BARS\s*=\s*5_000/);

assert.match(service, /HISTORICAL_SOURCE_POLICY\s*=\s*'fyers-primary-7d\+investiny-2to5y-historical-backfill\/v6'/);
assert.match(service, /FYERS_HISTORY_WINDOW_DAYS/);
assert.match(service, /fyersHistoryWindowFloorMs/);
assert.match(service, /fyers-live-and-recent-history-only-7-days/);
assert.match(service, /fyers-only-last-7-days/);
assert.match(service, /Older-page navigation is Investiny-only/);
assert.match(service, /fetchPreferredHistoryPages\('investiny'[\s\S]*boundedRange\.toMs, longFloorMs\)/, 'Investiny page ranges must be clipped to the configured 2–5 year floor before fetch');
assert.match(service, /historicalSourcePriority\(source\) >= historicalSourcePriority\(old\.source\)/);
assert.match(service, /hasVolume && !Number\.isFinite\(parsedVolume\)/);
assert.match(service, /slice\(-HISTORICAL_MAX_BARS\)/);
assert.match(service, /cachedReturnedBars = Math\.max\(0, Number\(completeness\.returnedBars\)/);
assert.doesNotMatch(service, /14 \* 86_400_000|only-14-days|last-14-days|historyWindowDays:\s*14|fyersHistoryWindowDays:\s*14/);

assert.match(fyersWindow, /FYERS_HISTORY_WINDOW_DAYS = 7/);
assert.match(fyersWindow, /FYERS_HISTORY_WINDOW_MS/);
assert.match(fyersWindow, /toMs <= fromMs/);
assert.match(fyersClient, /clampFyersHistoryRange\(/);
assert.match(fyersClient, /base === DATA_BASE && pathOnly === '\/history'/);
assert.match(fyersClient, /combined\.set\('date_format', '0'\)/);

assert.match(brokerAdapter, /const maxLookbackDays = Math\.min\(7,/);
assert.match(brokerAdapter, /const chunkDays = secondsInterval \? 1 : 7/);
assert.match(legacyRoute, /const maxLookbackDays = Math\.min\(7,/);
assert.match(legacyRoute, /const chunkDays = secondsInterval \? 1 : 7/);

assert.match(canonical, /client!\.dataGet<any>\('\/history'/);
assert.match(canonical, /INVESTINY_SYMBOL_MAP/);
assert.match(canonical, /fetchInvestinyHistory/);
assert.match(python, /from investiny import historical_data/);
assert.match(python, /MAX_BARS\s*=\s*5000/);
assert.match(python, /hmac\.compare_digest/);
assert.match(python, /@app\.post\("\/v1\/investiny\/history"\)/);
assert.match(python, /"historical_only": True/);
assert.match(python, /"live_stream_supported": False/);
assert.match(python, /asyncio\.Semaphore\(MAX_WORKERS\)/);

assert.match(route, /loadCanonicalHistoryForUser/);
assert.match(route, /historyCompleteness/);
assert.match(route, /historyExhausted/);
assert.match(route, /Math\.min\(5_000/);
assert.doesNotMatch(route, /liveSeed:\s*true/);
assert.match(runtime, /classifyHistoricalProviderError/);
assert.match(historyStore, /row\.source === 'unknown'/);
assert.match(chartHistoryNormalization, /row\.source === 'unknown'/);
assert.match(chartDataProvider, /Yahoo-delayed chart candles are disabled/);

assert.match(canonical, /withDistributedHistoricalPage/,
  'provider history pages share one Redis-backed distributed single-flight boundary');
assert.match(canonical, /resolveInvestinyAssetMapping/,
  'Investiny IDs are validated against an exact canonical instrument mapping');
assert.match(canonical, /\['investiny', mapping\.instrumentId, mapping\.fyersSymbol, asset\.investingId, timeframe/,
  'Investiny page identity includes the configured asset, timeframe and page range');

console.log('TRADINGCOREOS_HISTORICAL_DATA_SOURCE_POLICY_OK');
