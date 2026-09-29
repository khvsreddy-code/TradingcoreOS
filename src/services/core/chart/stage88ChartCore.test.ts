import { ColumnarCandleStore } from './chartDataModel';
import { reduceCandlesForPixels } from './chartLevelOfDetail';
import { ChartScene } from './chartScene';

const store = new ColumnarCandleStore();
const rows = Array.from({ length: 5000 }, (_, i) => ({ time: i + 1, open: i, high: i + 2, low: i - 1, close: i + .5, volume: i * 10 }));
store.replace(rows);
if (store.length !== 5000) throw new Error('columnar store length mismatch');
const reduced = reduceCandlesForPixels(rows, 1200);
if (reduced.length >= rows.length) throw new Error('LOD reduction did not reduce a dense series');
if (Math.max(...reduced.map(x=>x.high)) !== Math.max(...rows.map(x=>x.high))) throw new Error('LOD high extreme was lost');
if (Math.min(...reduced.map(x=>x.low)) !== Math.min(...rows.map(x=>x.low))) throw new Error('LOD low extreme was lost');

const scene = new ChartScene();
scene.upsert({ id:'candles', kind:'candles', layer:1, visible:true, payload:{ revision:store.revision } });
if (scene.dirtyNodes().length !== 1) throw new Error('scene dirty-node contract failed');
scene.markClean('candles');
if (scene.dirtyNodes().length !== 0) throw new Error('scene clean-node contract failed');
console.log('STAGE88_CHART_CORE_OK');
