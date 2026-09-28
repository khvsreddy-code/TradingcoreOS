import { CanonicalDataPlane, clearCanonicalDataPlaneRegistry, getCanonicalDataPlane } from '../data/canonicalDataPlane';
import { bindIndicatorInput } from '../data/indicatorDataPlane';
import { bindModelFeature } from '../data/modelDataPlane';
import { ChartInteractionEngine } from './chartInteraction';
import { ChartScene } from './chartScene';
import { ChartScaleModel } from './chartScales';
import { ChartDataEngine } from './chartDataEngine';

clearCanonicalDataPlaneRegistry();
const plane = getCanonicalDataPlane('NIFTY:1m');
plane.replace(Array.from({ length: 1000 }, (_, i) => ({ time: i + 1, open: i, high: i + 2, low: i - 1, close: i + 0.5, volume: i * 2 })));
if (getCanonicalDataPlane('NIFTY:1m') !== plane) throw new Error('registry did not reuse the canonical plane');

const close = plane.read().close;
const indicatorInput = bindIndicatorInput(plane, 'close');
const modelInput = bindModelFeature(plane, 'model-close', 'close');
if (close.buffer !== plane.market.close.buffer) throw new Error('market view is not zero-copy');
if (indicatorInput.values.buffer !== plane.market.close.buffer) throw new Error('indicator input is copying market history');
if (modelInput.values.buffer !== plane.market.close.buffer) throw new Error('model feature is copying market history');
if (indicatorInput.time.buffer !== plane.market.time.buffer) throw new Error('indicator input duplicated timeline');
if (modelInput.timeline.buffer !== plane.market.time.buffer) throw new Error('model feature duplicated timeline');

const chartData = new ChartDataEngine('NIFTY:1m', plane);
chartData.plane.attachConsumer('indicator:test', 'indicator');
chartData.plane.attachConsumer('model:test', 'model');
const kinds = chartData.consumers().map(item => item.kind);
if (!kinds.includes('chart') || !kinds.includes('indicator') || !kinds.includes('model')) throw new Error('shared consumer registry contract failed');

const scene = new ChartScene();
scene.upsert({ id: 'marker', kind: 'marker', layer: 100, visible: true, payload: { bounds: { x: 10, y: 10, width: 20, height: 20 } } });
const interaction = new ChartInteractionEngine();
if (interaction.hitTest(scene, 15, 15)?.id !== 'marker') throw new Error('chart hit testing failed');

const scales = new ChartScaleModel();
scales.setTimeDomain(0, 100); scales.setPriceDomain(100, 200);
const x = scales.xFromTime(25, 1000); const time = scales.timeFromX(x, 1000);
const y = scales.yFromPrice(150, 1000); const price = scales.priceFromY(y, 1000);
if (Math.abs(time - 25) > 1e-8 || Math.abs(price - 150) > 1e-8) throw new Error('scale transforms are not reversible');

console.log('STAGE95_CANONICAL_DATA_PLANE_OK');
console.log('STAGE95_INDICATOR_MODEL_SHARED_HISTORY_OK');
console.log('STAGE95_CHART_INTERACTION_SCALES_OK');
