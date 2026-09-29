import { ChartViewportController } from './chartViewportController';
import { ChartTimeScale, createWeekdaySessionCalendar, parseTimeframeSeconds } from './chartTimeScale';
import { ChartPriceScaleEngine } from './chartPriceScale';
import { ChartScaleModel } from './chartScales';

const viewport = new ChartViewportController();
viewport.set(1000, { from: 100, to: 200, pixelWidth: 1000, devicePixelRatio: 2 });
if (viewport.get().firstVisibleBar !== 100 || viewport.get().lastVisibleBar !== 199) throw new Error('viewport visible-bar contract failed');
if (Math.abs(viewport.get().pixelsPerBar - 10) > 1e-12) throw new Error('viewport pixelsPerBar contract failed');
if (Math.abs(viewport.barIndexToX(150) - 500) > 1e-9 || Math.abs(viewport.xToBarIndex(500) - 150) > 1e-9) throw new Error('bar/pixel transform is not reversible');
if (viewport.get().devicePixelRatio !== 2) throw new Error('device-pixel-ratio contract failed');
viewport.panByPixels(1000, 125);
if (Math.abs(viewport.xToBarIndex(0) - 112.5) > 1e-9) throw new Error('fractional scroll pan contract failed');
viewport.zoom(2, 1000, 0.5);
if (!(viewport.get().pixelsPerBar > 10 && viewport.get().to - viewport.get().from < 100)) throw new Error('zoom contract failed');

const times = new Float64Array([
  Date.parse('2026-09-25T13:30:00Z') / 1000,
  Date.parse('2026-09-25T13:35:00Z') / 1000,
  Date.parse('2026-09-28T13:30:00Z') / 1000,
]);
const calendar = createWeekdaySessionCalendar({ timezone: 'America/New_York', holidayDates: ['2026-09-29'] });
const timeScale = new ChartTimeScale({ mode: 'session-compressed', timezone: 'America/New_York', timeframe: '5m', calendar, sessionGapBars: 1 });
timeScale.bindTimeline(times);
if (parseTimeframeSeconds('5m') !== 300 || parseTimeframeSeconds('1h') !== 3600) throw new Error('timeframe parser contract failed');
if (!(timeScale.displayCoordinateForBar(2) - timeScale.displayCoordinateForBar(1) > 1)) throw new Error('session gap coordinate contract failed');
const timeViewport = new ChartViewportController();
timeViewport.set(times.length, { from: 0, to: times.length, pixelWidth: 1000 });
const x = timeScale.xFromTime(times[1], timeViewport);
const roundTripTime = timeScale.timeFromX(x, timeViewport);
if (Math.abs(roundTripTime - times[1]) > 1e-6) throw new Error('session time transform is not reversible');

const price = new ChartPriceScaleEngine();
price.setDomain(100, 200, true);
for (const mode of ['linear', 'log', 'percent', 'indexed'] as const) {
  price.setMode(mode);
  if (mode !== 'linear') price.setBasePrice(100);
  if (mode === 'log') price.setDomain(10, 100, true);
  else price.setDomain(90, 110, true);
  const value = mode === 'log' ? 31.25 : 100;
  const y = price.yFromPrice(value, 1000);
  const recovered = price.priceFromY(y, 1000);
  if (Math.abs(recovered - value) / Math.max(1, Math.abs(value)) > 1e-9) throw new Error(`price ${mode} transform is not reversible`);
}
price.setManualDomain(100, 120); price.lock(); price.setDomain(10, 20);
if (price.domain.min !== 100 || price.domain.max !== 120) throw new Error('locked manual scale contract failed');

const scaleModel = new ChartScaleModel();
const timeline = new Float64Array([1, 301, 601]);
scaleModel.bindTimeline(timeline);
scaleModel.setPriceMode('indexed');
scaleModel.setPercentBase(100);
if (scaleModel.time.timeframeSeconds !== 60) throw new Error('scale facade timeline contract failed');

console.log('STAGE96_VIEWPORT_ENGINE_OK');
console.log('STAGE96_FAST_BAR_PIXEL_TRANSFORMS_OK');
console.log('STAGE96_SESSION_AWARE_TIME_SCALE_OK');
console.log('STAGE96_PRICE_SCALE_MODES_OK');
console.log('STAGE96_AUTOSCALE_MANUAL_LOCK_CONTRACT_OK');
