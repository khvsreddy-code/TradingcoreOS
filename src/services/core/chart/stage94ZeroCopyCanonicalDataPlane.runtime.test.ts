import { MarketDataStore } from './chartDataModel';
import { updateLodIndex, createLodIndex } from './chartLevelOfDetail';
import { ChartGpuCandleBuffer } from './chartGpuBuffer';
import { IndicatorStore } from './derivedDataStores';

const source = new MarketDataStore('NIFTY:1m');
source.replace(Array.from({ length: 5000 }, (_, i) => ({
  time: i + 1, open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: i * 10,
  oi: i * 2, bid: 100.4 + i, ask: 100.6 + i, bidVolume: i, askVolume: i + 1, trades: i * 3, session: 1,
})));

if (source.timelineKey !== 'NIFTY:1m') throw new Error('canonical timeline key missing');
const views = source.views();
if (views.close[42] !== 142.5) throw new Error('zero-copy close view mismatch');
source.close[42] = 9000;
if (Number(views.close[42]) !== 9000) throw new Error('columnar views are not sharing backing storage');
if (!Number.isFinite(views.oi[42]) || views.bid[42] >= views.ask[42]) throw new Error('extended market fields missing');

const indicator = new IndicatorStore(source);
indicator.set('zscore', new Float64Array([1, 2, 3]), 10);
if (indicator.time.buffer !== source.time.buffer) throw new Error('derived store does not borrow canonical timeline backing storage');
if (indicator.get('zscore')?.[10] !== 1) throw new Error('derived series write mismatch');

const lod = createLodIndex();
updateLodIndex(source, lod, { from: 0, to: source.length, pixelWidth: 1200 });
const capacityBefore = lod.capacity;
const bucketCountBefore = lod.count;
source.updateLast({ time: 5000, open: 4999, high: 10050, low: 4998, close: 10000, volume: 123 });
updateLodIndex(source, lod, { from: 0, to: source.length, pixelWidth: 1200 });
if (lod.capacity !== capacityBefore) throw new Error('realtime update unexpectedly reallocated LOD capacity');
if (lod.count !== bucketCountBefore) throw new Error('realtime update changed LOD topology unexpectedly');
if (lod.dirtyToBucket - lod.dirtyFromBucket > 2) throw new Error('realtime LOD update touched excessive buckets');

const gpu = new ChartGpuCandleBuffer();
gpu.sync(lod);
const gpuCapacity = gpu.capacity;
source.updateLast({ time: 5000, open: 9999, high: 10060, low: 9998, close: 10050, volume: 555 });
updateLodIndex(source, lod, { from: 0, to: source.length, pixelWidth: 1200 });
gpu.sync(lod);
if (gpu.capacity !== gpuCapacity) throw new Error('GPU candle buffer reallocated on ordinary realtime update');
if (gpu.count !== lod.count) throw new Error('GPU candle count mismatch');
if (gpu.data[(gpu.count - 1) * gpu.stride + 4] !== 10050) throw new Error('retained GPU candle buffer did not receive the updated close');

console.log('STAGE94_ZERO_COPY_CANONICAL_DATA_PLANE_OK');
console.log('STAGE94_INCREMENTAL_LOD_OK');
console.log('STAGE94_RETAINED_GPU_BUFFER_OK');
