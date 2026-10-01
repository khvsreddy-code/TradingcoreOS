import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const appearance = read('src/services/coreSpirit/indicatorAppearance.ts');
const schema = read('src/services/coreSpirit/indicatorSettingsSchema.ts');
const live = read('src/components/workspace/LiveChart.tsx');
const incremental = read('src/services/marketData/incrementalIndicatorEngine.ts');
const coordinator = read('src/services/marketData/chartComputeCoordinator.ts');
const facade = read('src/services/core/chart/velaChartFacade.ts');
const renderer = read('vendor/vela/src/renderers/native/NativeRenderer.ts');
const markerModel = read('vendor/vela/src/core/model/series.ts');
const tracker = read('TRADINGCORE_REPAIR_TRACKER.md');
const buildTracker = read('docs/CORESPIRIT_BUILD_TRACKER.md');
const schemaDoc = read('docs/INDICATOR_SETTINGS_SCHEMA.md');

assert(exists('src/services/coreSpirit/indicatorAppearance.ts'), 'indicator appearance module missing');
for (const token of ['IndicatorLineAppearance','IndicatorFillAppearance','IndicatorMarkerAppearance','IndicatorLevelAppearance','IndicatorPaneAppearance']) assert(appearance.includes(token), `appearance contract missing ${token}`);
for (const token of ['zoomMinBars','zoomMaxBars','timeframes','gradientColor','glowStrength']) assert(appearance.includes(token), `line presentation field missing ${token}`);
for (const token of ['upperColor','lowerColor','conditional','bullishColor','bearishColor']) assert(appearance.includes(token), `fill presentation field missing ${token}`);
for (const token of ['shape','size','position','text','textSize','offset']) assert(appearance.includes(token), `marker presentation field missing ${token}`);
for (const token of ['extension','labelPlacement']) assert(appearance.includes(token), `level presentation field missing ${token}`);
for (const token of ['mode','scale','scaleMode','min','max','auto','inverted']) assert(appearance.includes(token), `pane presentation field missing ${token}`);
assert(appearance.includes('export function buildIndicatorAppearanceSnapshot'), 'appearance snapshot builder missing');
assert(!appearance.includes("../marketData/") && !appearance.includes("indicatorEngine"), 'appearance module imports calculation code');

assert(schema.includes('INDICATOR_SETTINGS_SCHEMA_VERSION = 3'), 'settings schema is not v3');
assert(schema.includes("'multi-select'"), 'multi-select settings field missing');
for (const token of ['appearance.line.color','appearance.fill.enabled','appearance.marker.shape','appearance.levels.extension','appearance.pane.mode']) assert(schema.includes(token), `schema appearance path missing ${token}`);
assert(schema.includes('buildIndicatorComputationSignature'), 'schema computation signature builder missing');

assert(incremental.includes("buildIndicatorComputationSignature"), 'incremental runtime does not use canonical computation signature');
assert(coordinator.includes("buildIndicatorComputationSignature"), 'worker coordinator does not use canonical computation signature');
assert(coordinator.includes('const compute = active.map') && !coordinator.includes('...config,\n    id: `shared-${index}`'), 'worker payload still spreads appearance-heavy IndicatorConfig');

const computeEffect = live.match(/useEffect\(\(\)=>\{[^\n]*renderStudies\(candles\.current\);requestIndicatorWorker\(candles\.current\);[^\n]*\},\[indicatorComputeKey,[^\n]+\]\);/);
assert(computeEffect, 'computation effect is not keyed by indicatorComputeKey');
assert(!computeEffect[0].includes('indicatorAppearanceKey'), 'appearance key can still invalidate computation effect');
assert(/useEffect\(\(\)=>\{[^\n]*applyIndicatorAppearanceOnly\(\)[^\n]*\},\[indicatorAppearanceKey\]\);/.test(live), 'appearance-only effect missing');
assert(live.includes('indicatorFillMap') && live.includes('addFillBetweenSeries'), 'channel fill presentation is not wired');
assert(live.includes('setPaneAppearance'), 'pane presentation is not wired to live chart');
assert(live.includes('textSize:a.marker.textSize') && live.includes('offset:a.marker.offset'), 'marker text size/offset is not propagated');

assert(facade.includes('setPaneAppearance') && facade.includes('addFillBetweenSeries'), 'Vela facade presentation bridge missing');
assert(facade.includes('setIndicatorFills') && facade.includes('setIndicatorSeriesPoints'), 'Vela facade lacks renderer-only fill mutation calls');
assert(renderer.includes('setIndicatorFills') && renderer.includes('setIndicatorSeriesPoints') && renderer.includes('configurePaneAppearance'), 'NativeRenderer presentation bridge missing');
assert(markerModel.includes('textSize?: number') && markerModel.includes('offset?: number'), 'Vela marker model lacks rich marker metadata');

for (const token of ['TC-PERF-50','TC-PERF-51','TC-PERF-52','TC-PERF-53','TC-PERF-54','TC-PERF-55','TC-PERF-56']) assert(tracker.includes(token), `tracker item missing: ${token}`);
for (const token of ['v110 indicator appearance schema v2','buildIndicatorComputationSignature','appearance-only fields','worker payload','Vela renderer-only fill']) assert(buildTracker.includes(token) || schemaDoc.includes(token), `documentation marker missing: ${token}`);
console.log('TCO_V110_INDICATOR_APPEARANCE_CONTRACT_OK');
console.log('TCO_V110_INCREMENTAL_APPEARANCE_ISOLATION_OK');
