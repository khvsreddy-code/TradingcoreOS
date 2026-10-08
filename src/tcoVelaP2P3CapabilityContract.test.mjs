import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

const tradingUi = read('./services/core/chart/tcoVelaTradingUi.ts');
const tradingInteractions = read('./services/core/chart/tcoVelaTradingInteractions.ts');
const marketVisuals = read('./services/core/chart/tcoVelaMarketVisuals.ts');
const researchUi = read('./services/core/chart/tcoVelaResearchUi.ts');
const aiContext = read('./services/core/chart/tcoVelaAiContext.ts');
const simulator = read('./services/core/replay/simulatedExecution.ts');
const liveWorkspace = read('./LiveTradingWorkspace.tsx');
const sidePanel = read('../vendor/vela/src/widget/side-panel.ts');
const contributions = read('../vendor/vela/src/widget/contributions.ts');
const panelDock = read('../vendor/vela/src/widget/panel-dock.ts');

const contextActions = tradingUi.match(/target:'context:body'/g) ?? [];
assert.ok(contextActions.length >= 3, 'price-aware context actions must be registered');
assert.match(tradingUi, /ctx\.pointer\?\.paneKind==='price'/);
assert.match(tradingUi, /tradingCoreRuntime\.placeOrder\(/);
assert.match(tradingUi, /window\.confirm\(/, 'live order action must require explicit confirmation');
assert.match(tradingInteractions, /renderer\.onClick/);
assert.match(tradingInteractions, /drawingsInteractive/);
assert.match(tradingInteractions, /renderer\.supports\?/);
assert.match(tradingInteractions, /crosshairOverride/);

for (const id of ['tco-orderflow-heatmap','tco-market-profile','tco-liquidity-heatmap','tco-footprint','tco-delta','tco-renko','tco-range']) assert.match(marketVisuals, new RegExp("id:'"+id+"'"));
for (const id of ['tco-footprint','tco-delta','tco-renko','tco-range']) assert.match(marketVisuals, new RegExp("registerChartType\\("+"chartType\\('"+id+"'"));
for (const id of ['tco-orderflow-heatmap','tco-market-profile','tco-liquidity-heatmap']) assert.match(marketVisuals, new RegExp("registerNativeIndicator\\("+"nativeDescriptor\\(\\s*'"+id+"'"));

assert.match(liveWorkspace, /tcoVelaMarketVisuals/);
assert.match(liveWorkspace, /tcoVelaTradingUi/);
assert.match(liveWorkspace, /tcoVelaResearchUi/);
for (const id of ['tco.quick-order.topbar','tco.native-ta.topbar','tco.ai-analysis.action','tco.replay-sim.action']) assert.match(liveWorkspace, new RegExp(id.replaceAll('.', '\\.') ));

assert.match(sidePanel, /maximizable\?: boolean/);
assert.match(sidePanel, /setMaximized\(maximized: boolean\)/);
assert.match(sidePanel, /data-maximized/);
assert.match(panelDock, /maximizable: desc\.maximizable/);
assert.match(panelDock, /setMaximized: \(on\) => panel\.setMaximized\(on\)/);
assert.match(contributions, /maximizable\?: boolean/);
assert.match(contributions, /setMaximized\?:/);

assert.match(aiContext, /chart\.renderer\.dataWindowReadout/);
assert.match(aiContext, /chart\.inspect\(\)/);
assert.match(aiContext, /presentNativeIndicators/);
assert.match(researchUi, /buildVelaAiContext/);
assert.match(researchUi, /simulateReplayStrategyFromSource/);
assert.match(simulator, /replayCoreSpirit/);
assert.match(simulator, /kind==='orderIntent'/);
assert.match(researchUi, /No broker order API is called from this panel/);

console.log('TCO_VELA_P2_P3_CAPABILITY_CONTRACT_OK');