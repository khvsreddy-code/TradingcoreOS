import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime } from './runtime';
import { validateCoreSpiritDeclarativeVisual, buildCoreSpiritSceneFromDeclarativeVisuals } from './declarativeVisual';
import { validateCoreSpiritVisualApp } from './visualApp';
import { validateCoreSpiritRoadmap, CORE_SPIRIT_STAGES } from './coreSpiritRoadmap';

const source = `
app.create("Market Structure", "market-structure");
app.chart("main", "main", "price");
app.panel("left", "watchlist", "watchlist", "Watchlist");
app.panel("right", "orderbook", "orderbook", "Order Book");
app.panel("bottom", "trade_log", "trade-log", "Trade Log");
app.overlay("market_structure", "marketStructure");
app.bind("signal.selected", "open_signal_inspector");
visual.liquidityZone("liquidity_1", 25100, 25140, 82, "right", meta("strength", 82, "source", "market_structure"));
visual.line("resistance", time, 25200, time, 25200, meta("touches", 6, "volume", 184000));
`;

const parsed = new CoreSpiritParser(source).parseDetailed();
if (parsed.diagnostics.length) throw new Error(`parse diagnostics: ${JSON.stringify(parsed.diagnostics)}`);
const compiled = new CoreSpiritCompiler().compile(parsed.ast, 'stage60', { layer:'script' });
if (!compiled.ir || compiled.diagnostics.some(d => d.severity === 'error')) throw new Error(`compile diagnostics: ${JSON.stringify(compiled.diagnostics)}`);

const runtime = new CoreSpiritRuntime({ sourceId:'stage60', symbol:'NIFTY', timeframe:'5m', layer:'script' });
runtime.loadIr(compiled.ir);
const result = runtime.executeBar({ timestamp:'2026-01-01T09:15:00.000Z', open:25180, high:25220, low:25170, close:25205, volume:100000 });
if (result.diagnostics.length) throw new Error(`runtime diagnostics: ${result.diagnostics.join('; ')}`);

const workspace = runtime.getWorkspaceState();
if (workspace.visuals.specs.length !== 2) throw new Error('declarative visual state should contain two specs');
const liquidity = workspace.visuals.specs.find(spec => spec.id === 'liquidity_1');
if (!liquidity || liquidity.kind !== 'liquidity_zone' || liquidity.properties.strength !== 82) throw new Error('liquidity zone declarative state is incorrect');
if (validateCoreSpiritDeclarativeVisual(liquidity).length) throw new Error('valid declarative visual should validate');

const scene = runtime.getDeclarativeVisualScene({ chartId:'chart', symbol:'NIFTY', timeframe:'5m', pane:'main' }, 1);
if (scene.nodes.length !== 2) throw new Error('declarative visuals should lower into the existing scene graph');
if (scene.nodes.find(node => node.id === 'stage60:liquidity_1')?.layer !== 'liquidity') throw new Error('liquidity zone semantic layer was lost');
if (scene.nodes.find(node => node.id === 'stage60:resistance')?.metadata?.touches !== 6) throw new Error('visual metadata was lost during declarative lowering');

if (!workspace.app) throw new Error('visual app manifest missing');
if (workspace.app.widgets.length !== 5) throw new Error('visual app should contain chart + four workspace projections');
if (workspace.app.bindings.length !== 1 || workspace.app.bindings[0].actionId !== 'open_signal_inspector') throw new Error('app action binding missing');
if (validateCoreSpiritVisualApp(workspace.app).length) throw new Error('visual app manifest should validate');

const stage25 = CORE_SPIRIT_STAGES.find(stage => stage.id === 25);
const stage26 = CORE_SPIRIT_STAGES.find(stage => stage.id === 26);
if (!stage25 || !stage26) throw new Error('roadmap stages 25-26 missing');
if (validateCoreSpiritRoadmap().length) throw new Error('roadmap must validate at 26 stages');
if (!stage25.gates.some(g => g.id === 'cs25-semantic-state')) throw new Error('stage 25 semantic-state gate missing');
if (!stage26.gates.some(g => g.id === 'cs26-workspace')) throw new Error('stage 26 workspace gate missing');

console.log('STAGE60_DECLARATIVE_VISUAL_APP_OK');
