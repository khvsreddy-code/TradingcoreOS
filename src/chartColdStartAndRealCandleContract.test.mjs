import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const plane = read('./services/marketData/chartDataPlane.ts');
const runtime = read('./services/core/chart/ChartRuntimeController.ts');
const brokerClient = read('./services/marketData/BrokerMarketDataClient.ts');
const fyersTransport = read('./server/marketData/FyersMarketDataTransport.ts');
const overlay = read('./components/workspace/ChartOverlay.tsx');
const css = read('./index.css');

const start = plane.match(/private start\(\): void \{([\s\S]*?)\n  \}/)?.[1] ?? '';
assert.ok(start, 'ChartDataPlane.start() must remain present');
assert.doesNotMatch(start, /void\s+this\.ensureHistory\(\)/, 'subscription must not start object history before the fast columnar loader');
assert.match(plane, /ensureReady\(limit\?: number\): Promise<HistoricalCandle\[]> \{\s*return this\.ensureReadyColumns\(limit\)\.catch/);
assert.match(plane, /type: 'quote'/, 'quote-only updates need a non-candle event type');
assert.match(plane, /if \(!hasHistory \|\| tradeTimestamp\(tick\) == null\)/, 'no-history and receive-time-only ticks must not create bars');
assert.match(plane, /function tradeTimestamp\(/, 'candle time must come from a trade timestamp');
assert.match(plane, /ensureReadyHistory\(limitOverride\?: number\): Promise<HistoricalCandle\[]> \{\s*return this\.ensureReady\(limitOverride\);/, 'legacy Vela call sites must also enter the typed-first loader');
assert.match(plane, /if \(!Number\.isFinite\(timestampMs\) \|\| timestampMs <= 0\) return/, 'invalid trade times must never be replaced by receive time');
assert.doesNotMatch(runtime, /seedLiveCandle/, 'a single quote must not be rendered as a historical candle');
assert.match(runtime, /timezoneKey='tradingcore:vela-timezone:v1'/, 'IST timezone default and user choice persistence are required');
assert.match(runtime, /applyFeature\('countdown',false\)/, 'non-session-aware countdown must be disabled in TCO');
assert.match(overlay, /openChartSettings/, 'right rail must expose native Vela settings');
assert.match(overlay, /title="Vela chart settings"/, 'settings button must be visible and accessible');
assert.match(overlay, /<BarChart3/, 'indicator action must have a visible icon');
assert.match(overlay, /<Sparkles/, 'AI action must have a visible icon');
assert.match(overlay, /<Volume2/, 'volume action must have a visible icon');
assert.match(css, /color: #a7b4c9/, 'toolbar controls must have readable contrast');
assert.doesNotMatch(brokerClient, /return Number\.isFinite\(parsed\) \? new Date\(parsed\)\.toISOString\(\) : new Date\(\)\.toISOString\(\)/, 'quote reception cannot be substituted for missing trade time');
assert.match(fyersTransport, /brokerTimestamp !== undefined[^\n]*lastTradeTimestamp/, 'FYERS must not invent a trade timestamp when the broker omits it');

console.log('CHART_COLD_START_AND_REAL_CANDLE_CONTRACT_OK');
