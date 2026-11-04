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
assert.ok(live.includes("'market-feed-stale'"), 'stale/reconnecting feed notifications must share one dismissal identity');
assert.ok(live.includes("['stale', 'waiting-tick', 'connecting', 'reconnecting']"), 'feed warning identity must survive transient feed phase changes');
assert.ok(live.includes("const chartStatusDismissKey = `\u0024{localDayKey}|\u0024{chartStatus.symbol.toUpperCase()}|\u0024{chartStatus.timeframe}|\u0024{statusCategory}`;"), 'dismissal must be keyed by instrument/interval/day/status category');
assert.ok(live.includes("localStorage.setItem('tradingcore:chart-status-dismissed:v1', chartStatusDismissKey)"), 'closing the alert must persist its dismissal');
assert.ok(!live.includes('setDismissedChartStatusKey((dismissed) => dismissed && dismissed !== chartStatusDismissKey ?'), 'status phase refreshes must not clear a matching dismissal');

assert.ok(dashboard.includes('Market overview'), 'homepage must present a market overview');
assert.ok(dashboard.includes('Market sentiment'), 'homepage must present measured market breadth/sentiment');
assert.ok(dashboard.includes('Market news'), 'homepage must show sourced market headlines');
assert.ok(dashboard.includes('listPublicIndicatorPublications'), 'homepage must surface the public CoreSpirit script library');
assert.ok(dashboard.includes("scriptKind: 'strategy'"), 'homepage should feature both indicators and strategies');
assert.ok(dashboard.includes('void loadTradingCoreRuntime()') && dashboard.includes('runtime.subscribeMarketData(') && dashboard.includes("runtime.on('TICK_UPDATE', refreshMarket)"), 'dashboard must subscribe to the shared runtime quote feed and refresh without opening the live chart');
assert.ok(dashboard.includes("fetch('/api/news?symbol=financial%20markets'"), 'dashboard must fetch headlines through the server-side feed proxy');

assert.ok(news.includes("url: 'https://in.investing.com/rss/news_25.rss'"), 'India Investing.com RSS must be an approved market-news source');
assert.ok(news.includes("url: 'https://www.moneycontrol.com/rss/marketreports.xml'"), 'Moneycontrol market reports must be an approved news source');
assert.ok(news.includes("url: 'https://www.moneycontrol.com/rss/latestnews.xml'"), 'Moneycontrol latest headlines must remain available');
assert.ok(news.includes("region: 'IN'"), 'news responses must identify the India market region');
assert.ok(news.includes('INDIA_RELEVANCE'), 'market-news results must pass the India relevance filter');
assert.ok(news.includes('Promise.allSettled(FEEDS.map(feed => fetchFeed(feed, topic)))'), 'the India RSS sources must degrade independently when one feed fails');
assert.ok(news.includes('const NEWS_CACHE_TTL_MS = 90_000'), 'news should be cached to avoid refreshing on every render');

assert.ok(provider.includes('const HISTORY_WARM_SUCCESS_TTL_MS = 12 * 60 * 60 * 1000'), 'successful history warming must be throttled');
assert.ok(provider.includes('const HISTORY_WARM_EMPTY_TTL_MS = 30 * 60 * 1000'), 'empty/unavailable history must have a shorter retry cooldown');
assert.ok(live.includes("['1', '3', '5', '10', '15', '30', '60', '120', '240', 'D', 'W', 'M']"), 'active chart history must be warmed for all supported intervals');
assert.ok(provider.includes('.slice(0, 12)'), 'background warming must cap active symbols');
assert.ok(provider.includes('void Promise.all([worker(), worker()])'), 'background warming must use bounded concurrency');

assert.ok(dataPlane.includes('prewarmHistory(limitOverride?: number): Promise<number>'), 'history warming must report returned bar counts');
assert.ok(dataPlane.includes('const requestKey = `${this.key}:initial:${requestedLimit}`;'), 'history backfill must share the existing per-symbol/timeframe request gate');
assert.ok(dataPlane.includes('historyStore.set(this.brokerId, this.instrumentKey, interval, normalized, requestedLimit)'), 'older candles must be retained in the canonical history store');
assert.ok(history.includes("HISTORICAL_SOURCE_POLICY = 'fyers-primary-7d+investiny-2to5y-historical-backfill/v6'"), 'canonical history must enforce the current FYERS plus Investiny source policy');
assert.ok(history.includes("recentHistorySource: 'fyers', olderHistorySource: 'investiny'"), 'FYERS must own recent candles while Investiny supplies older history');
assert.ok(history.includes('FYERS_HISTORY_WINDOW_DAYS'), 'FYERS historical requests must remain bounded to the provider history window');
assert.ok(history.includes('Older-page navigation is Investiny-only'), 'older history pagination must never extend FYERS requests past the recent-data boundary');
assert.ok(history.includes("'NSE:NIFTY50-INDEX': { tvSymbol: 'NIFTY', tvExchange: 'NSE', exchange: 'NSE' }"), 'the default NIFTY 50 chart must have an exact TV history mapping');
assert.ok(history.includes("'BSE:SENSEX-INDEX': { tvSymbol: 'SENSEX', tvExchange: 'BSE', exchange: 'BSE' }"), 'SENSEX must have an exact TV history mapping');
assert.ok(history.includes('HISTORICAL_MAX_BARS = 5_000'), 'history backfill must remain bounded');

console.log('MARKET_DESK_NEWS_DISMISSAL_AND_HISTORY_WARM_CONTRACT_OK');
