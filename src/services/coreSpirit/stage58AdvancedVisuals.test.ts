import { buildCoreSpiritSceneFromAdvancedVisuals, validateCoreSpiritScene } from './visualScene';
import { validateCoreSpiritAdvancedVisual, type CoreSpiritAdvancedVisualObject } from './visualAdvanced';

const grid = (kind: 'heatmap'|'liquidityMap'|'probabilitySurface'|'modelField') => ({ kind, grid: { columns: 2, rows: 2, values: [0.1, 0.2, 0.7, 0.9], normalized: true } } as const);

const visuals: CoreSpiritAdvancedVisualObject[] = [
  { id:'heat:1', sourceId:'stage58', kind:'heatmap', payload:grid('heatmap') },
  { id:'liq:1', sourceId:'stage58', kind:'liquidityMap', payload:grid('liquidityMap'), semanticRole:'liquidity_field' },
  { id:'prob:1', sourceId:'stage58', kind:'probabilitySurface', payload:grid('probabilitySurface'), metadata:{model:'regime-v1',confidence:0.9} },
  { id:'model:1', sourceId:'stage58', kind:'modelField', payload:grid('modelField') },
  { id:'depth:1', sourceId:'stage58', kind:'depthMap', payload:{ kind:'depthMap', levels:[{price:100,bidVolume:500,askVolume:300,imbalance:0.25},{price:101,bidVolume:200,askVolume:700,imbalance:-0.56}] } },
  { id:'volume:1', sourceId:'stage58', kind:'volumeProfile', payload:{ kind:'volumeProfile', bins:[{priceLow:99,priceHigh:100,volume:1000,buyVolume:700,sellVolume:300,valueArea:true},{priceLow:100,priceHigh:101,volume:800,delta:-50}], poc:100, vah:101, val:99 } },
  { id:'foot:1', sourceId:'stage58', kind:'footprint', payload:{ kind:'footprint', rows:[{price:100,bidVolume:500,askVolume:300,imbalance:0.25},{price:101,bidVolume:200,askVolume:700,imbalance:-0.56}], maxAbsDelta:500 } },
  { id:'graph:1', sourceId:'stage58', kind:'structureGraph', payload:{ kind:'structureGraph', nodes:[{id:'a',time:1,price:100,label:'swing high'},{id:'b',time:2,price:95,label:'swing low'},{id:'c',time:3,price:105,label:'breakout'}], edges:[{id:'ab',from:'a',to:'b',type:'pullback'},{id:'bc',from:'b',to:'c',type:'breakout'}] } },
  { id:'regime:1', sourceId:'stage58', kind:'regimeBand', timeRange:{start:1,end:10}, payload:{ kind:'regimeBand', start:1,end:10,regime:'trend',confidence:0.84 } },
  { id:'path:1', sourceId:'stage58', kind:'tradePath', payload:{ kind:'tradePath', path:{points:[{time:1,price:100,side:'buy',quantity:1},{time:2,price:103,side:'flat',pnl:3}],realizedPnl:3}, animation:{clock:'realtime',loop:false} } },
  { id:'replay:1', sourceId:'stage58', kind:'replayTrace', payload:{ kind:'replayTrace', points:[{time:1,price:100},{time:2,price:101}], animation:{clock:'replay',durationMs:500,loop:false} } },
];

for (const visual of visuals) {
  const errors = validateCoreSpiritAdvancedVisual(visual);
  if (errors.length) throw new Error(`${visual.id}: ${errors.join('; ')}`);
}

const scene = buildCoreSpiritSceneFromAdvancedVisuals({ chartId:'chart',symbol:'NIFTY',timeframe:'1m',pane:'main' }, visuals, 'stage58', 1);
const sceneErrors = validateCoreSpiritScene(scene);
if (sceneErrors.length) throw new Error(sceneErrors.join('; '));
for (const id of ['heat:1','liq:1','prob:1','model:1']) if (!scene.nodes.some(node => node.id === id)) throw new Error(`missing advanced grid node ${id}`);
if (scene.nodes.find(n => n.id === 'liq:1')?.layer !== 'liquidity') throw new Error('liquidity map must preserve liquidity semantic layer');
if (scene.nodes.find(n => n.id === 'depth:1')?.layer !== 'depth') throw new Error('depth map must stay on depth layer');
if (scene.nodes.find(n => n.id === 'volume:1')?.layer !== 'volume') throw new Error('volume profile must stay on volume layer');
if (scene.nodes.find(n => n.id === 'graph:1')?.layer !== 'structure') throw new Error('structure graph must stay on structure layer');
if (scene.nodes.find(n => n.id === 'path:1')?.layer !== 'order') throw new Error('trade path must stay on order layer');
if (!scene.nodes.find(n => n.id === 'prob:1')?.interaction?.onHover) throw new Error('advanced metadata must remain inspectable');

const badGrid = { ...visuals[2], payload:{ kind:'probabilitySurface' as const, grid:{columns:2,rows:2,values:[0.1,0.2,0.3]} } };
if (validateCoreSpiritAdvancedVisual(badGrid).length === 0) throw new Error('invalid grid should be rejected');

console.log('STAGE58_ADVANCED_VISUALS_OK');
