import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const fyers = read('./server/marketData/FyersMarketDataTransport.ts');
const quoteClient = read('./services/marketData/BrokerMarketDataClient.ts');
const plane = read('./services/marketData/chartDataPlane.ts');
const velaProvider = read('./TcoVelaDataProvider.ts');
const terminal = read('./services/core/chart/tcoVelaTerminal.ts');
const liveWorkspace = read('./LiveTradingWorkspace.tsx');
const chartOverlay = read('./components/workspace/ChartOverlay.tsx');
const liveChart = read('./components/workspace/LiveChart.tsx');

assert.match(fyers, /function latestExchangeTimestamp\(\.\.\.values: unknown\[\]\)/, 'FYERS should choose a valid exchange timestamp');
assert.equal((fyers.match(/latestExchangeTimestamp\(payload\.last_traded_time, payload\.exch_feed_time\)/g) || []).length, 2, 'both lite and full tick normalizers must choose the freshest exchange timestamp');
assert.doesNotMatch(fyers, /finite\(payload\.last_traded_time \?\? payload\.exch_feed_time\)/, 'a stale non-null last-trade field must not mask a fresher exchange-feed field');
assert.match(quoteClient, /source: 'fyers'/, 'polled broker quotes must follow the same closed-session guard');
assert.match(quoteClient, /Math\.max\(\.\.\.candidates\)/, 'REST quote timestamps must use the freshest valid broker field');
assert.doesNotMatch(quoteClient, /new Date\(\)\.toISOString\(\);[\s\S]{0,200}lastTradeTimestamp/, 'packet arrival must not be used as an exchange trade timestamp');

assert.match(plane, /function tradeTimestamp\(tick: NormalizedMarketTick\)/, 'chart data plane needs a canonical timestamp selector');
assert.match(plane, /return new Date\(Math\.max\(\.\.\.candidates\)\)\.toISOString\(\)/, 'data plane must prefer the newest trusted exchange timestamp');
assert.match(plane, /function isStaleOrClosedCashTick\(/, 'stale and closed-session broker ticks must not mutate bars');
assert.match(plane, /if \(isStaleOrClosedCashTick\(tick, exchangeTimestampMs\)\)/, 'closed-session guard must run before candle reconciliation');
assert.match(velaProvider, /event\.type !== 'snapshot' && event\.type !== 'tick'/, 'only real bar/history events should reach the Vela OHLC subscription');

assert.doesNotMatch(terminal, /'panels'/, 'Vela side-panel icon cluster must not be rendered beside duplicate TCO panel shortcuts');
assert.match(liveWorkspace, /renderer\.applyFeature\('settings', true\)/, 'the native Vela chart settings gear must remain enabled');
assert.match(liveWorkspace, /renderer\.applyFeature\('timezone', 'Asia\/Kolkata'\)/, 'legacy UTC chart settings should migrate to India exchange time');
assert.match(liveWorkspace, /shouldShowExchangeCountdown/, 'Vela countdown must be gated by a fresh exchange tick in a live session');
assert.doesNotMatch(chartOverlay, /title="Vela chart settings"/, 'TCO must not add a second non-native chart-settings button');
assert.doesNotMatch(liveChart, /openChartSettings/, 'legacy chart overlay must not wire a duplicate settings shortcut');

console.log('FYERS_LIVE_CANDLE_AND_VELA_TOOLBAR_CONTRACT_OK');
