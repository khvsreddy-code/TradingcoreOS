import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritRuntime } from './runtime';
import { CoreSpiritVisualSceneGraph } from './visualGraph';
import { coreSpiritObjectToSceneNode, buildCoreSpiritSceneFromNodes } from './visualScene';
import { buildCoreSpiritInspection } from './visualMetadata';

const source = `
let panel = ui.panel("Market Structure");
panel.number("ATR", atr(14));
panel.button("Recalculate", recalibrate);
panel.toggle("Show Liquidity", true, toggle_liquidity);
panel.slider("Sensitivity", 1, 10, 5, set_sensitivity);
let resistance = 25200;
line(time, resistance, time, resistance, meta("strength", 87, "touches", 6, "volume", 184000, "source", "market_structure"));
`;

const parsed = new CoreSpiritParser(source).parseDetailed();
if (parsed.diagnostics.length) throw new Error(`parse diagnostics: ${JSON.stringify(parsed.diagnostics)}`);
const compiled = new CoreSpiritCompiler().compile(parsed.ast, 'stage57', { layer:'script' });
if (!compiled.ir || compiled.diagnostics.some(d => d.severity === 'error')) throw new Error(`compile diagnostics: ${JSON.stringify(compiled.diagnostics)}`);

const runtime = new CoreSpiritRuntime({ sourceId:'stage57', symbol:'NIFTY', timeframe:'5m', layer:'script' });
runtime.loadIr(compiled.ir);
const result = runtime.executeBar({ timestamp:'2026-01-01T09:15:00.000Z', open:25180, high:25220, low:25170, close:25205, volume:100000 });
if (result.diagnostics.length) throw new Error(`runtime diagnostics: ${result.diagnostics.join('; ')}`);
const ui = runtime.getUiState();
if (ui.panels.length !== 1 || ui.panels[0].controls.length !== 4) throw new Error('expected one panel with four controls');
if (!ui.panels[0].controls.some(c => c.kind === 'button' && c.actionId === 'recalibrate')) throw new Error('button action reference missing');
const action = runtime.dispatchUiEvent({ panelId: ui.panels[0].id, controlId: ui.panels[0].controls.find(c => c.kind === 'toggle')!.id, kind:'toggle', value:false });
if (!action || action.actionId !== 'toggle_liquidity') throw new Error('UI action dispatch failed');

const lineOutput = result.outputs.find((x): x is Extract<typeof result.outputs[number], {kind:'line'}> => x.kind === 'line');
if (!lineOutput?.metadata || lineOutput.metadata.strength !== 87) throw new Error('language metadata call did not reach visual output');
const line = { kind:'line' as const, id:'resistance', start:{time:1,price:25200}, end:{time:2,price:25200}, metadata:{strength:87, touches:6, volume:184000, source:'market_structure', confirmed:true} };
const node = coreSpiritObjectToSceneNode(line as any, 'stage57', 0);
if (!node.metadata || node.metadata.strength !== 87) throw new Error('visual metadata missing from scene node');
if (!node.interactive || node.interaction?.onHover?.actionId !== 'visual.inspect') throw new Error('metadata did not produce inspect-on-hover');
const inspection = buildCoreSpiritInspection('Resistance', node.metadata);
if (inspection.rows.length !== 5) throw new Error('inspection rows missing');

const graph = new CoreSpiritVisualSceneGraph('stage57');
const z = graph.zone({ id:'liquidity_1', top:25200, bottom:25160, semanticRole:'liquidity', metadata:{strength:87, touches:6} });
z.opacity = 0.42;
const snapshot = graph.snapshot({ chartId:'chart', symbol:'NIFTY', timeframe:'5m', pane:'main' }, 1);
if (snapshot.layerCounts.liquidity !== 1 || !snapshot.scene.nodes[0].metadata) throw new Error('visual graph metadata/layer contract failed');

console.log('STAGE57_INTERACTIVE_UI_METADATA_OK');
