import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const live = read('src/LiveTradingWorkspace.tsx');
const dashboard = read('src/pages/DashboardPage.tsx');
const provider = read('src/TcoVelaDataProvider.ts');
const dataPlane = read('src/services/marketData/chartDataPlane.ts');
const news = read('src/server/routes/news.routes.ts');
const history = read('src/server/marketData/HistoricalDataService.ts');

assert.ok(live.includes("tradingcore:chart-status-dismissed:v1"), 'notification dismissal must survive chart renders and page reloads');
assert.ok(live.includes("const chartStatusDismissKey = `\u0024{localDayKey}|\u0024{chartStatus.symbol.toUpperCase()}|\u0024{chartStatus.timeframe}|\u0024{statusCategory}`;"), 'dismissal must be keyed by instrument/interval/day/status category');
assert.ok(live.includes("localStorage.setItem('tradingcore:chart-status-dismissed:v1', chartStatusDismissKey)"), 'closing the alert must persist its dismissal');
assert.ok(!live.includes('setDismissedChartStatusKey((dismissed) => dismissed && dismissed !== chartStatusDismissKey ?'), 'status phase refreshes must not clear a matching dismissal');

assert.ok(dashboard.includes('Market overview'), 'homepage must present a market overview');
assert.ok(dashboard.includes('Market sentiment'), 'homepage must present measured market breadth/sentiment');
assert.ok(dashboard.includes('Market news'), 'homepage must show sourced market headlines');
assert.ok(dashboard.includes('listPublicIndicatorPublications'), 'homepage must surface the public CoreSpirit script library');
assert.ok(dashboard.includes('tradingCoreRuntime.subscribeMarketData'), 'dashboard must receive market quotes even before the live chart is opened');
assert.ok(dashboard.includes("fetch('/api/news?symbol=financial%20markets'"), 'dashboard must fetch headlines through the server-side feed proxy');

assert.ok(news.includes('https://feeds.finance.yahoo.com/rss/2.0/headline'), 'Yahoo Finance RSS should be the primary news source');
assert.ok(news.includes("provider: 'Yahoo Finance RSS'"), 'news response should identify Yahoo as the primary source');
assert.ok(news.includes('fetchGdelt(key)'), 'existing GDELT news should remain a fallback');
assert.ok(news.includes('const NEWS_CACHE_TTL_MS = 90_000'), 'news should be cached to avoid refreshing on every render');

assert.ok(provider.includes('const HISTORY_WARM_SUCCESS_TTL_MS = 12 * 60 * 60 * 1000'), 'successful history warming must be throttled');
assert.ok(provider.includes('const HISTORY_WARM_EMPTY_TTL_MS = 30 * 60 * 1000'), 'empty/unavailable history must have a shorter retry cooldown');
assert.ok(live.includes("['1', '3', '5', '10', '15', '30', '60', '120', '240', 'D', 'W', 'M']"), 'active chart history must be warmed for all supported intervals');
assert.ok(provider.includes('.slice(0, 12)'), 'background warming must cap active symbols');
assert.ok(provider.includes('void Promise.all([worker(), worker()])'), 'background warming must use bounded concurrency');

assert.ok(dataPlane.includes('prewarmHistory(limitOverride?: number): Promise<number>'), 'history warming must report returned bar counts');
assert.ok(dataPlane.includes('const requestKey = `${this.key}:initial:${requestedLimit}`;'), 'history backfill must share the existing per-symbol/timeframe request gate');
assert.ok(dataPlane.includes('historyStore.set(this.brokerId, this.instrumentKey, interval, normalized, requestedLimit)'), 'older candles must be retained in the canonical history store');
assert.ok(history.includes("fyers-three-sessions+tvdatafeed-older-5000/v1"), 'older candles must keep using the configured TV-datafeed/FYERS source policy');
assert.ok(history.includes('HISTORICAL_MAX_BARS = 5_000'), 'history backfill must remain bounded');

console.log('MARKET_DESK_NEWS_DISMISSAL_AND_HISTORY_WARM_CONTRACT_OK');
