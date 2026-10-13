import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const transport = read('./server/marketData/FyersMarketDataTransport.ts');
const provider = read('./TcoVelaDataProvider.ts');
const terminal = read('./services/core/chart/tcoVelaTerminal.ts');
const overlay = read('./components/workspace/ChartOverlay.tsx');
const liveChart = read('./components/workspace/LiveChart.tsx');
const renderer = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');

assert.match(transport, /function latestFyersTimestamp\(payload: Record<string, unknown>\)/, 'FYERS timestamps must be normalized through one policy');
assert.match(transport, /payload\.last_traded_time, payload\.exch_feed_time/, 'consider all exchange timestamp fields rather than trusting a stale first field');
assert.match(transport, /return candidates\.length \? Math\.max\(\.\.\.candidates\) : undefined/, 'choose the newest valid exchange timestamp');
assert.equal((transport.match(/const brokerTimestamp = latestFyersTimestamp\(payload\);/g) || []).length, 2, 'both lite and full FYERS feeds must use the timestamp policy');
assert.match(provider, /event\.type !== 'snapshot' && event\.type !== 'tick'/, 'Vela must only patch candles for snapshots and validated candle ticks');
assert.match(terminal, /'tco\.watchlist'[\s\S]*'tco\.positions'[\s\S]*'alerts'[\s\S]*'panels'/, 'retain the primary TCO navigation while reducing icon-only toolbar clutter');
const topbar = terminal.match(/right:\[([\s\S]*?)\],/)?.[1] ?? '';
for (const duplicate of ["'tco.risk',", "'tco.orderbook',", "'tco.options',", "'tco.data-window',", "'tco.vpvr',"]) {
  assert.equal(topbar.includes(duplicate), false, duplicate + ' must not be duplicated in the topbar');
}
assert.doesNotMatch(overlay, /title="Vela chart settings"/, 'do not create a custom replacement for Vela native settings gear');
assert.doesNotMatch(liveChart, /openChartSettings/, 'legacy chart must not wire a custom duplicate settings button');
assert.match(renderer, /private settingsEnabled = true/, 'Vela native chart settings gear must remain enabled');

console.log('LIVE_CANDLE_TIMESTAMP_AND_TOOLBAR_CONTRACT_OK');
