import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const live = read('src/LiveTradingWorkspace.tsx');
const topology = read('src/services/core/chart/tcoVelaTerminal.ts');
const chrome = read('src/services/core/chart/tcoVelaChrome.ts');
const settingsDialog = read('vendor/vela/src/renderers/native/chrome/SettingsDialog.ts');
const drawingSettingsPanel = read('vendor/vela/src/renderers/native/drawings/DrawingSettingsPanel.ts');
const drawingDefaults = read('vendor/vela/src/core/drawings/defaults.ts');
const drawingPriceAction = read('vendor/vela/src/core/drawings/priceAction.ts');
const drawingController = read('vendor/vela/src/core/drawings/DrawingController.ts');
const drawingRegistry = read('vendor/vela/src/core/drawings/registry.ts');
const workspaceState = read('vendor/vela/src/state/document.ts');
const upstream = read('vendor/vela/UPSTREAM.md');
const topbar = read('vendor/vela/src/widget/topbar.ts');
const wheel = read('vendor/vela/src/widget/alt-wheel.ts');
const provider = read('src/TcoVelaDataProvider.ts');
const plane = read('src/services/marketData/chartDataPlane.ts');
const theme = read('src/theme/theme.ts');
const picker = read('vendor/vela/src/widget/symbol-picker.ts');
const chartCell = read('vendor/vela/src/workspace/ChartCell.ts');

assert(/const queryLayout = new URLSearchParams\(window\.location\.search\)/.test(live));
assert(/const initialLayout = .*defaults\.layout/.test(live));
assert(live.includes("layout: initialLayout"));
assert(!live.includes('tco-live-shell'), 'restore the original TradingCoreOS live page shell instead of wrapping it with a new app header');
assert(!live.includes('TradingCoreOS navigation'), 'the live page should retain the previous layout without the added navigation rail');
assert(!live.includes('Workspace options'), 'the live page should not add the new workspace menu to the original UI');
assert(topology.includes("'tco.chart-settings'"), 'native Vela chart settings must be reachable from the live topbar');
assert(chrome.includes("renderer.openSettings();"), 'the chart-settings action must open Vela’s native settings dialog');
assert(settingsDialog.includes('vela-sd-desktop-shell'), 'desktop chart settings should use the wide Vela settings layout');
assert(settingsDialog.includes('vela-sd-preview-heading') && settingsDialog.includes('Appearance preview'), 'chart settings should include the reference appearance preview');
assert(settingsDialog.includes("doneBtn.textContent = 'Done'") && settingsDialog.includes('Changes apply instantly'), 'chart settings should provide the native-style footer actions');
assert(settingsDialog.includes('this.emit({ candles: { upColor: v } })') && settingsDialog.includes('this.emit({ timeScale: { timezone: v } })'), 'the visual redesign must preserve functional Vela setting handlers');
assert(settingsDialog.includes('vela-sd-symbol-grid') && settingsDialog.includes('vela-sd-card-animation'), 'Symbol settings should use the two-column card layout');
assert(chrome.includes("label:'Research', icon:'search', iconOnly:false"), 'restore the original TradingCoreOS toolbar labels');
assert(chrome.includes("label:'Automation', icon:'replay', iconOnly:false"), 'restore the original Automation toolbar action');
assert(chrome.includes("label: 'Watchlist', icon: 'star', iconOnly: false"), 'restore the original Watchlist toolbar label');
assert(!chrome.includes('registerWidgetAttachment(healthAttachment)'), 'do not reserve chart height with the custom bottom health strip');
assert(topology.includes('animations:{ zoom:true, pan:true, liveBar:false }'), 'Vela zoom and pan animations should follow the supplied reference UI');
assert(topology.includes("'tco.watchlist'"));
assert(chrome.includes("registerSidePanel(journalPanel)"), "journal should remain registered as a dockable panel");
assert(topology.includes("'panelDock'"), "workspace topology must expose Vela panel chrome");
assert(!topology.includes("'tco.brand'"));
assert(!live.includes("'quant'"));
assert(!chrome.includes("TradingCoreOS × Vela"), 'remove the redundant TradingCoreOS × Vela topbar label');
assert(topology.includes("shell:'VelaWorkspace'"));
assert(topology.includes("'tco.research'"));
assert(topology.includes("'tco.automation'"));
assert(topology.includes("'tco.trading'"));
assert(topology.includes('bottombar:false'), 'live Vela terminal must use the topbar-only command surface');
assert(chrome.includes("id: 'tco.chart-settings'") || chrome.includes("id: 'tco.chart-settings'"), 'native Vela chart settings must be available from the topbar');
assert(chrome.includes("id: 'tco.watchlist'") || chrome.includes("id:'tco.watchlist'"));
assert(chrome.includes("id: 'tco.journal'") || chrome.includes("id:'tco.journal'"));
assert(!chrome.includes("id: 'tco.panels'"), 'remove redundant panels shortcut');
assert(chrome.includes("title: 'Watchlist'") || chrome.includes("title:'Watchlist'"));
assert(chrome.includes("id: 'tco.corespirit-code'"), 'CoreSpirit Studio must be exposed inside the live Vela workspace');
assert(picker.includes("Options: ['option', 'derivative', 'options']"), 'Options market tab must include option contracts');
assert(chartCell.includes('chart.addNativeIndicatorAsync(type)'), 'picker-selected lazy Vela indicators must use the async native API');
assert(topbar.includes("b.dataset.actionId = action.id"));
assert(wheel.includes("#7c5cff"));
assert(theme.includes("accent: '#d3ebf4'"));
assert.equal((provider.match(/export class TcoVelaDataProvider implements DataProvider/g) ?? []).length, 1,
  "the Vela data provider must have one canonical implementation");
assert.equal((provider.match(/else void activeBrokerId\(\)\.then\(attach\)\.catch\(\(\) => undefined\);/g) ?? []).length, 2,
  "both Vela live-subscription forms must attach if broker restore completes after subscribe");
assert(!provider.includes("if (!brokerId) return () => {};"),
  "a cold-start subscription must not become a permanent no-op before broker restore");
assert.equal((provider.match(/tradingCoreRuntime\.on\('BROKER_CONNECTED', syncBroker\)/g) ?? []).length, 2,
  "row and columnar subscriptions must recover when a broker is connected after chart mount");
assert.equal((provider.match(/tradingCoreRuntime\.on\('BROKER_DISCONNECTED', syncBroker\)/g) ?? []).length, 2,
  "row and columnar subscriptions must detach stale broker streams after disconnect");

assert(provider.includes("const cached = plane.readCanonical()"), "Vela TCO provider must inspect shared canonical cache first");
assert(provider.includes("return EMPTY_COLUMNAR_BARS"), "cold Vela column load must yield to progressive history");
assert(provider.includes("plane.ensureReadyHistory(firstPaintBars)"), "cold Vela history must use the shared ChartDataPlane history path");
assert(!/await Promise\.all\(\[brokerReady,\s*defaultsPromise\]\)/.test(live),
  "Vela workspace mount must not block first paint on broker session restoration");
assert(live.includes("void brokerReady.then(() => {"),
  "common-symbol history warm-up should begin after the workspace is already mounted");
assert.equal((provider.match(/else void activeBrokerId\(\)\.then\(attach\)\.catch\(\(\) => undefined\);/g) ?? []).length, 2,
  "both columnar and row subscriptions must attach after asynchronous broker restoration");
assert(!provider.includes("if (!brokerId) return () => {};"),
  "a subscription created before broker restoration must not become a permanent no-op");

assert(!provider.includes("tradingCoreRuntime.getHistoricalDataColumns"), "Vela provider must not bypass the shared history cache");

assert(plane.includes("columns.time.length === 0"));


// Vela 0.8.4 provenance and API surface must stay aligned with the official rebase.
assert(upstream.includes('**0.8.4**') && upstream.includes('850fa1f431e2065e9b0074c4b0555a48a2999eaf'),
  'the vendored Vela provenance must identify official 0.8.4');
// Keep the Vela 0.8.4 drawing experience: live-edit/cancel panel, reusable styles, and timeframe filtering.
assert(drawingSettingsPanel.includes('export class DrawingSettingsPanel'), 'Vela 0.8.4 drawing settings panel must be present');
assert(drawingSettingsPanel.includes('this.showOnFold(b)') && drawingSettingsPanel.includes('saveTemplate?.(name)'),
  'drawing settings must retain timeframe visibility and saved-style actions');
assert(drawingSettingsPanel.includes("actions.preview?.(null)"), 'drawing style preview must be clearable on cancel/close');
assert(drawingDefaults.includes('captureToolDefaults') && drawingDefaults.includes('sanitizeToolTemplates') && drawingDefaults.includes('builtinToolTemplates'),
  'drawing defaults and style templates must use Vela 0.8.4 defaults contracts');
assert(drawingController.includes('setToolDefaults') && drawingController.includes('setToolTemplates'),
  'the drawing controller must expose tool-default and template persistence');
assert(workspaceState.includes('DrawingToolsState') && workspaceState.includes('drawingTools') && workspaceState.includes('defaults') && workspaceState.includes('templates'),
  'drawing defaults/templates must be represented in workspace-persisted state');
assert(drawingPriceAction.includes('gapState') && drawingPriceAction.includes('blockState') && drawingPriceAction.includes('liquidityState'),
  'Vela 0.8.4 price-action analysis must include FVG, order-block and liquidity state');
assert(drawingRegistry.includes('fairvaluegap') && drawingRegistry.includes('orderblock') && drawingRegistry.includes('liquidity'),
  'the drawing registry must expose all 0.8.4 price-action tools');
console.log('TRADINGCORE_V132_VELA_WORKSPACE_UX_AND_CANDLE_FALLBACK_CONTRACT_OK');
