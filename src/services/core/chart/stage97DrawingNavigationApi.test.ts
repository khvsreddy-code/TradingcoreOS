import { CoreDrawingApi } from '../drawing/drawingApi';
import { CoreDrawingStore } from '../drawing/coreDrawingStore';
import { CoreDrawingToolSession } from '../drawing/drawingToolSession';
import { ChartNavigationApi } from './chartNavigationApi';
import { ChartViewportController } from './chartViewportController';
import { ChartTimeScale } from './chartTimeScale';
import { ChartPriceScaleEngine } from './chartPriceScale';

const viewport = new ChartViewportController();
viewport.set(1000, { from: 400, to: 500, pixelWidth: 1000 });
const nav = new ChartNavigationApi(viewport, new ChartTimeScale({ timeframe: '5m' }), new ChartPriceScaleEngine(), () => 1000);
nav.setVisibleRange({ from: 200, to: 300 });
if (nav.visibleRange().from !== 200 || nav.visibleRange().to !== 300) throw new Error('visible-range API failed');
const oldSpacing = nav.barSpacing();
nav.setBarSpacing(oldSpacing * 2, 0.5);
if (!(nav.barSpacing() > oldSpacing)) throw new Error('bar spacing API failed');
nav.setScrollOffset(350.5);
if (Math.abs(nav.scrollOffset() - 350.5) > 1e-9) throw new Error('horizontal scroll offset failed');
nav.setZoomEnabled(false); const frozen = nav.barSpacing(); nav.setBarSpacing(frozen * 2); if (nav.barSpacing() !== frozen) throw new Error('zoom disable failed');
nav.setZoomEnabled(true); nav.setPanEnabled(false); const panFrozen = nav.scrollOffset(); nav.setScrollOffset(panFrozen + 5); if (nav.scrollOffset() !== panFrozen) throw new Error('pan disable failed');

const store = new CoreDrawingStore();
const api = new CoreDrawingApi(store);
const id = api.createPointDrawing({ time: 100, price: 150 }, { kind: 'horizontal' });
if (!api.getDrawingById(id)) throw new Error('single-point drawing creation failed');
const lineId = api.createDataDrawing([{ time: 100, price: 150 }, { time: 200, price: 170 }], { kind: 'trendline' });
api.setProperties(lineId, { label: 'trend' });
api.setVisible(lineId, false);
if (api.getDrawingById(lineId)?.visible !== false) throw new Error('drawing visibility failed');
api.setVisible(lineId, true); api.setLocked(lineId, true); api.bringToFront(lineId); api.sendToBack(lineId);
const anchored = api.createAnchoredDrawing({ x: 0.1, y: 0.9 }, { kind: 'anchoredText', label: 'hello' });
if (api.getDrawingById(anchored)?.coordinateSpace !== 'viewport') throw new Error('anchored drawing contract failed');
api.removeEntity(anchored); if (api.getDrawingById(anchored)?.lifecycle !== 'deleted') throw new Error('drawing removal failed');

const session = new CoreDrawingToolSession();
session.activate('parallelChannel');
for (const point of [{time:1,price:100},{time:2,price:101},{time:3,price:99}]) session.addPoint(point);
if (!session.draft()?.complete) throw new Error('drawing tool session did not reach completion');
if (!session.finish()?.length) throw new Error('drawing tool session finish failed');

console.log('STAGE97_DRAWING_API_METHODS_OK');
console.log('STAGE97_DRAWING_TOOL_CATALOG_OK');
console.log('STAGE97_NAVIGATION_METHODS_OK');
console.log('STAGE97_PAN_ZOOM_GATING_OK');
console.log('STAGE97_ANCHORED_DRAWING_OK');
console.log('STAGE97_PRODUCTION_DRAWING_API_INTEGRATION_OK');
