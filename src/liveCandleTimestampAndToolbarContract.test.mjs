import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const transport = read('./server/marketData/FyersMarketDataTransport.ts');
const provider = read('./TcoVelaDataProvider.ts');
const terminal = read('./services/core/chart/tcoVelaTerminal.ts');
const overlay = read('./components/workspace/ChartOverlay.tsx');
const liveChart = read('./components/workspace/LiveChart.tsx');
const renderer = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');
const symbolPicker = read('../vendor/vela/src/widget/symbol-picker.ts');

assert.match(transport, /function latestFyersTimestamp\(payload: Record<string, unknown>\)/, 'FYERS timestamps must be normalized through one policy');
assert.match(transport, /payload\.last_traded_time, payload\.exch_feed_time/, 'consider all exchange timestamp fields rather than trusting a stale first field');
assert.match(transport, /return candidates\.length \? Math\.max\(\.\.\.candidates\) : undefined/, 'choose the newest valid exchange timestamp');
assert.equal((transport.match(/const brokerTimestamp = latestFyersTimestamp\(payload\);/g) || []).length, 2, 'both lite and full FYERS feeds must use the timestamp policy');
assert.match(provider, /event\.type !== 'snapshot' && event\.type !== 'tick'/, 'Vela must only patch candles for snapshots and validated candle ticks');
const nativeSidebar = terminal.match(/sidebar:\\s*(\\{[\\s\\S]*?\\n\\s{4}\\}),\\s*topbar:/)?.[1] ?? '';
assert.ok(
  /sidebar:\\s*true/.test(terminal) ||
  ['tco.bookmarks', 'tco.research', 'tco.trading', 'tco.corespirit-code', 'tco.panels', 'objects', 'dataWindow', 'tco.account']
    .every((panel) => nativeSidebar.includes(panel)),
  'TCO application navigation is exposed through Vela native right-sidebar composition',
);
assert.match(terminal, /right:\s*\[\s*'tco\.save-workspace',\s*'alerts'\s*\]/, 'keep the Vela chart topbar compact with Save and Alerts only; app panels are in the sidebar');
assert.doesNotMatch(terminal, /tco\.brand/, 'remove the redundant TRADINGCOREOS × VELA label');
assert.doesNotMatch(terminal, /'panels'|tco\.profile|tco\.broker-connection|'screenshot'/, 'remove the unused icon-only toolbar cluster and extras');
const topbar = terminal.match(/right:\[([\s\S]*?)\],/)?.[1] ?? '';
for (const duplicate of ["'tco.risk',", "'tco.orderbook',", "'tco.options',", "'tco.data-window',", "'tco.vpvr',", "'panels',"]) {
  assert.equal(topbar.includes(duplicate), false, duplicate + ' must not appear as a duplicate topbar control');
}
assert.doesNotMatch(overlay, /title="Vela chart settings"/, 'do not create a custom replacement for Vela native settings gear');
assert.doesNotMatch(liveChart, /openChartSettings/, 'legacy chart must not wire a custom duplicate settings button');
assert.match(renderer, /private settingsEnabled = true/, 'Vela native chart settings gear must remain enabled');
assert.match(renderer, /btn\.addEventListener\('pointerdown', \(event\) => event\.stopPropagation\(\)\)/, 'native settings gear must not bubble presses into chart gestures');
assert.match(renderer, /this\.openSettingsDialog\(\)/, 'native gear must invoke Vela chart settings');
assert.match(symbolPicker, /'Options'/, 'symbol picker must offer an Options market tab');
assert.match(symbolPicker, /queryTokens = q\.match/, 'symbol picker must match compact contracts by query tokens');
assert.match(provider, /Options:\s*\['NSE_FO', 'BSE_FO'\]/, 'Options market must query FYERS derivative masters');
assert.match(provider, /\? 'option'/, 'option symbols must not be mislabeled as indices');

console.log('LIVE_CANDLE_TIMESTAMP_AND_TOOLBAR_CONTRACT_OK');
