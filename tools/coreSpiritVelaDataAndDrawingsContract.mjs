import assert from 'node:assert/strict';
import { CoreSpiritVelaEngine } from '../src/CoreSpiritVelaEngine.ts';
import { CORE_SPIRIT_DRAWING_TOOL_CATALOG } from '../src/services/core/chart/velaDrawingCatalog.ts';
import { defaultToolbar } from '../vendor/vela/src/core/drawings/toolbar.ts';
import { drawingTypes, loadAdvancedDrawingCatalog } from '../vendor/vela/src/core/drawings/registry.ts';

const velaBars = [
  { time: 1791350000000, open: 22650, high: 22680, low: 22640, close: 22670, volume: 1200 },
  { time: 1791350300000, open: 22670, high: 22690, low: 22660, close: 22680, volume: 1300 },
];
const engine = new CoreSpiritVelaEngine();
const prepared = await engine.prepare(`show line(close)`, 'vela-data-boundary');
let model = 0;
let error = '';
engine.execute({
  prepared,
  market:{symbol:'NSE:NIFTY50-INDEX',timeframe:'5m'},
  bars:velaBars,
  mode:'static'
},{onModel:()=>{model+=1},onDone:()=>{},onError:(e)=>{error=e.message;}});
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(error,'');
assert.equal(model,1);
await loadAdvancedDrawingCatalog();
const registered = new Set(drawingTypes().map(type => type.type));
const toolbar = defaultToolbar();
const toolbarTypes = new Set(toolbar.groups.flatMap(group => group.tools.map(tool => tool.type)));
assert.ok(CORE_SPIRIT_DRAWING_TOOL_CATALOG.length >= 70);
assert.ok(CORE_SPIRIT_DRAWING_TOOL_CATALOG.every(type => registered.has(type)), 'every TCO drawing catalog type must exist in Vela registry');
assert.ok(CORE_SPIRIT_DRAWING_TOOL_CATALOG.every(type => toolbarTypes.has(type)), 'every TCO drawing catalog type must be reachable from the Vela toolbar');
assert.equal(toolbar.groups.length, 8, 'the toolbar exposes the dedicated Price Action group');
const priceActionGroup = toolbar.groups.find(group => group.id === 'price-action');
assert.ok(priceActionGroup, 'Price Action must be directly accessible as a top-level drawing group');
for (const type of ['fairvaluegap', 'orderblock', 'liquidity']) {
  assert.ok(priceActionGroup.tools.some(tool => tool.type === type), `Price Action group is missing ${type}`);
}
assert.ok(CORE_SPIRIT_DRAWING_TOOL_CATALOG.includes('fibretracement'));
assert.ok(CORE_SPIRIT_DRAWING_TOOL_CATALOG.includes('gartley'));
assert.ok(CORE_SPIRIT_DRAWING_TOOL_CATALOG.includes('elliottimpulse'));
assert.ok(CORE_SPIRIT_DRAWING_TOOL_CATALOG.includes('fixedrangevp'));
console.log('CORESPIRIT_VELA_DATA_AND_DRAWINGS_CONTRACT_OK');
