import { CoreSpiritVisualSceneGraph } from './visualGraph';
import { coreSpiritTradingSnapshotFromDataset, validateCoreSpiritTradingSnapshot } from './canonicalTradingModel';
import { buildCoreSpiritScene, buildCoreSpiritSceneFromNodes, validateCoreSpiritScene, diffCoreSpiritScenes, type CoreSpiritSceneNode } from './visualScene';
import type { CoreSpiritMarketDataset } from './marketData';
import { CORE_SPIRIT_EXECUTION_GRAPH, CORE_SPIRIT_PLATFORM_PHILOSOPHY } from './architectureContract';
import { CORE_SPIRIT_STAGES, validateCoreSpiritRoadmap } from './coreSpiritRoadmap';

const dataset: CoreSpiritMarketDataset = {
  version: 1,
  id: 'nifty-demo',
  symbol: 'NIFTY',
  timeframe: '1m',
  source: 'synthetic',
  bars: [{ timestamp: '2026-01-01T09:15:00.000Z', open: 100, high: 110, low: 95, close: 105, volume: 1000 }],
};

const snapshot = coreSpiritTradingSnapshotFromDataset(dataset, {
  instrument: { instrumentId: 'nifty', symbol: 'NIFTY', assetClass: 'index', timezone: 'Asia/Kolkata', tickSize: 0.05 },
  session: { id: 'nse-2026-01-01', marketDate: '2026-01-01', timezone: 'Asia/Kolkata', phase: 'open', isOpen: true },
  index: 0,
});
validateCoreSpiritTradingSnapshot(snapshot);
if (CORE_SPIRIT_PLATFORM_PHILOSOPHY.productCenter !== 'trading-system' || CORE_SPIRIT_PLATFORM_PHILOSOPHY.chartCentricity) throw new Error('CoreSpirit must remain trading-system-centric');
if (CORE_SPIRIT_EXECUTION_GRAPH[1] !== 'canonical-model') throw new Error('canonical trading model must sit between data host and language/runtime');
if (validateCoreSpiritRoadmap().length) throw new Error('CoreSpirit roadmap contract is invalid');
const stage18 = CORE_SPIRIT_STAGES.find(stage => stage.id === 18);
if (!stage18 || !stage18.gates.some(gate => gate.id === 'cs18-canonical-model') || !stage18.gates.some(gate => gate.id === 'cs18-scene-graph')) throw new Error('stage 18 is missing the trading-system/scene-graph gates');

const graph = new CoreSpiritVisualSceneGraph('stage56');
const zone = graph.zone({
  id: 'liquidity_1',
  top: 110,
  bottom: 100,
  left: 1,
  right: 2,
  label: 'Liquidity',
  opacity: 0.5,
  semanticRole: 'liquidity',
  onClick: { kind: 'inspect', actionId: 'inspect_zone', params: { id: 'stage56:liquidity_1' } },
});
zone.opacity = 0.82;
zone.label = 'Liquidity 82%';
zone.on_click = { kind: 'openPanel', actionId: 'inspect_zone', params: { id: zone.id } };
const heatmap = graph.heatmap({ id: 'heatmap_1', time: 1, cells: [{ price: 105, intensity: 0.8, side: 'buy' }], onClick: { kind: 'inspect', actionId: 'inspect_heatmap' } });
const volume = graph.volumeProfile({ id: 'volume_1', rows: [{ price: 105, volume: 1000, buyVolume: 650, sellVolume: 350 }] });
const depth = graph.depth({ id: 'depth_1', bids: [{ price: 104, size: 400 }], asks: [{ price: 106, size: 300 }] });
graph.attach(volume.id, zone.id);
graph.attach(heatmap.id, zone.id);

const scene = graph.build({ chartId: 'chart', symbol: 'NIFTY', timeframe: '1m', pane: 'main' }, 1);
if (scene.nodes.length !== 4) throw new Error('visual graph should contain four persistent nodes');
if (!scene.nodes.some(node => node.id === 'stage56:liquidity_1')) throw new Error('visual identity must be stable');
if (scene.nodes.find(node => node.id === 'stage56:liquidity_1')?.layer !== 'liquidity') throw new Error('liquidity semantic must map to liquidity layer');
if (!scene.nodes.find(node => node.id === 'stage56:liquidity_1')?.interaction?.onClick) throw new Error('interaction should be declarative');
if (scene.nodes.find(node => node.id === 'stage56:liquidity_1')?.style?.opacity !== 0.82) throw new Error('visual property update should mutate the existing node');
if (validateCoreSpiritScene(scene).length) throw new Error('valid visual graph should pass validation');

const changed = graph.build({ chartId: 'chart', symbol: 'NIFTY', timeframe: '1m', pane: 'main' }, 2);
const diff = diffCoreSpiritScenes(scene, changed);
if (diff.added.length || diff.removed.length || diff.updated.length !== 0) throw new Error('unchanged visual graph should produce an empty diff');

graph.set('stage56:liquidity_1', { strength: 0.91 });
const updatedScene = graph.build({ chartId: 'chart', symbol: 'NIFTY', timeframe: '1m', pane: 'main' }, 3);
const updatedDiff = diffCoreSpiritScenes(scene, updatedScene);
if (updatedDiff.added.length || updatedDiff.removed.length || updatedDiff.updated.length !== 1) throw new Error('persistent visual update should diff as one update');

const legacyScene = buildCoreSpiritScene({ chartId: 'chart', symbol: 'NIFTY', timeframe: '1m', pane: 'main' }, [
  { kind: 'zone', id: 'legacy-zone', left: 1, right: 2, top: 110, bottom: 100, state: 'active' },
], 'legacy');
if (legacyScene.nodes[0].id !== 'legacy:legacy-zone') throw new Error('legacy zone output must remain compatible');

const badInteractionNode: CoreSpiritSceneNode = {
  id: 'bad', kind: 'panel', layer: 'ui', pane: 'floating', zIndex: 1000,
  visible: true, interactive: true, locked: false, sourceId: 'stage56', payload: {},
  interaction: { onClick: { kind: 'inspect', actionId: 'bad', params: { handler: () => 'x' } } },
};
const badScene = buildCoreSpiritSceneFromNodes({ chartId: 'chart', symbol: 'NIFTY', timeframe: '1m', pane: 'main' }, [badInteractionNode], 1);
if (!validateCoreSpiritScene(badScene).some(error => error.includes('non-serializable function'))) {
  throw new Error('scene graph must reject function closures inside interaction payloads');
}

const cycleA: CoreSpiritSceneNode = { id: 'a', kind: 'panel', layer: 'ui', pane: 'floating', zIndex: 1, visible: true, interactive: false, locked: false, sourceId: 'stage56', payload: {}, parentId: 'b' };
const cycleB: CoreSpiritSceneNode = { id: 'b', kind: 'panel', layer: 'ui', pane: 'floating', zIndex: 1, visible: true, interactive: false, locked: false, sourceId: 'stage56', payload: {}, parentId: 'a' };
const cycleScene = buildCoreSpiritSceneFromNodes({ chartId: 'chart', symbol: 'NIFTY', timeframe: '1m', pane: 'main' }, [cycleA, cycleB], 1);
if (!validateCoreSpiritScene(cycleScene).some(error => error.includes('parent cycle'))) throw new Error('scene graph must reject parent cycles');

console.log('STAGE56_TRADING_SYSTEM_VISUAL_OK');
