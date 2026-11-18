import assert from 'node:assert/strict';
import { ChartPriceScaleEngine } from './services/core/chart/chartPriceScale.ts';
import { averageSpecs } from '../vendor/vela/src/core/native-indicators/classics/averages.ts';
import { lazyNativeIndicatorCatalog } from '../vendor/vela/src/core/native-indicators/lazyCatalog.ts';
import { registerBuiltinChartTypes } from '../vendor/vela/src/chart-types/builtins.ts';
import { chartTypes } from '../vendor/vela/src/chart-types/registry.ts';
import { BUILTIN_PRICE_STYLES } from '../vendor/vela/src/renderers/native/core/chartConfig.ts';
import { loadNativeIndicatorType } from '../vendor/vela/src/core/native-indicators/lazyCatalog.ts';
import { volumeDescriptor } from '../vendor/vela/src/core/native-indicators/volume/VolumeIndicator.ts';
import { vpvrDescriptor } from '../vendor/vela/src/core/native-indicators/vpvr/VpvrIndicator.ts';
import { ChartScaleModel } from './services/core/chart/chartScales.ts';

const near = (a,b,label) => assert.ok(Number.isFinite(a) && Math.abs(a-b)<1e-8, label + ': ' + a + ' vs ' + b);
for (const mode of ['linear','log','percent','indexed']) {
  const scale = new ChartPriceScaleEngine();
  scale.setMode(mode);
  if (mode === 'percent' || mode === 'indexed') scale.setBasePrice(100);
  scale.setDomain(mode === 'log' ? 10 : 50, mode === 'log' ? 500 : 200, true);
  const sample = 123.45;
  near(scale.unitToPrice(scale.priceToUnit(sample)),sample,mode+' scale round-trip');
}
const logDomain = new ChartPriceScaleEngine();
logDomain.setDomain(-10,100,true);
logDomain.setMode('log');
assert.ok(logDomain.domain.min > 0 && logDomain.domain.max > logDomain.domain.min,'switching an existing scale to logarithmic mode must clamp its domain to positive prices');
near(logDomain.unitToPrice(logDomain.priceToUnit(25)),25,'linear-to-log domain transition');
const inverted = new ChartPriceScaleEngine();
inverted.setPaddingRatio(0);
inverted.setDomain(10,20,true);
inverted.setInverted(true);
near(inverted.yFromPrice(10,100),0,'inverted scale puts its minimum at the top');
near(inverted.yFromPrice(20,100),100,'inverted scale puts its maximum at the bottom');
near(inverted.priceFromY(35,100),13.5,'inverted scale inverse pixel mapping');
assert.equal(inverted.snapshot().inverted,true,'scale inversion is persisted in the scale snapshot');

const manual = new ChartPriceScaleEngine();
manual.setManualDomain(90,110);
manual.setPolicy('locked');
manual.setDomain(1,1000);
assert.deepEqual(manual.domain,{min:90,max:110},'locked price range is not silently rescaled');
const auto = new ChartPriceScaleEngine();
auto.setPaddingRatio(0.1);
auto.setDomain(100,200,true);
near(auto.domain.min,90,'auto-scale lower margin');
near(auto.domain.max,210,'auto-scale upper margin');
const scaleFacade = new ChartScaleModel();
scaleFacade.setPricePaddingRatio(0);
scaleFacade.setPriceDomain(10,20);
scaleFacade.setPriceInverted(true);
near(scaleFacade.price.yFromPrice(10,100),0,'scale facade inversion at minimum');
near(scaleFacade.price.yFromPrice(20,100),100,'scale facade inversion at maximum');

const paneA = new ChartPriceScaleEngine(), paneB = new ChartPriceScaleEngine();
paneA.setBasePrice(100); paneB.setBasePrice(200);
paneA.setMode('indexed'); paneB.setMode('indexed');
near(paneA.displayValue(110),110,'pane A indexed baseline');
near(paneB.displayValue(110),55,'pane B indexed baseline');

const specs = new Map(averageSpecs.map(spec => [spec.type,spec]));
for (const type of ['sma','ema','wma','vwma','hma','rma']) assert.ok(specs.has(type),'standalone moving average missing: '+type);
const bars = Array.from({length:40},(_,i)=>({
  time:1_700_200_000_000+i*60_000,
  open:100+i*0.4,high:102+i*0.4,low:99+i*0.4,close:101+i*0.4,volume:100+i*7,
}));
const compute = type => specs.get(type).compute(bars,{source:'Close',length:9}).plots[0].values;
const wmaValues=compute('wma'),vwmaValues=compute('vwma'),hmaValues=compute('hma'),last=bars.length-1;
const expectedWma=(bars[last-8].close*1+bars[last-7].close*2+bars[last-6].close*3+bars[last-5].close*4+bars[last-4].close*5+bars[last-3].close*6+bars[last-2].close*7+bars[last-1].close*8+bars[last].close*9)/45;
near(wmaValues[last],expectedWma,'WMA linear weighting');
let pv=0,volume=0;
for(let i=last-8;i<=last;i++){pv+=bars[i].close*bars[i].volume;volume+=bars[i].volume;}
near(vwmaValues[last],pv/volume,'VWMA price-volume weighting');
assert.ok(Number.isFinite(hmaValues[last]),'HMA must emit a finite value when the composite windows are warm');

const lazy = new Set(lazyNativeIndicatorCatalog().map(item=>item.type));
for (const type of ["sma","ema","wma","vwma","hma","rma","supertrend","average-directional-index","aroon","parabolic-sar","ichimoku-cloud","williams-alligator","rsi","macd","stochastic","stochastic-rsi","commodity-channel-index","williams-percent-r","rate-of-change","true-strength-index","fisher-transform","awesome-oscillator","average-true-range","bollinger-bands","keltner-channels","donchian-channels","historical-volatility","standard-deviation","choppiness-index","ttm-squeeze","on-balance-volume","vwap","anchored-vwap","accumulation-distribution","money-flow-index","chaikin-money-flow","klinger-oscillator","volume-oscillator"]) assert.ok(lazy.has(type),'lazy indicator picker metadata missing: '+type);
registerBuiltinChartTypes();
const registeredTypes = new Set(chartTypes().map(type=>type.id));
for (const type of ['heikinashi','renko','kagi','linebreak','pointfigure']) assert.ok(registeredTypes.has(type),'native chart type not registered: '+type);
for (const style of ['candles','hollowcandles','bars','line','area','baseline','heikinashi','volumecandles']) assert.ok(BUILTIN_PRICE_STYLES.includes(style),'native price style missing: '+style);
for (const type of ["sma","ema","wma","vwma","hma","rma","supertrend","average-directional-index","aroon","parabolic-sar","ichimoku-cloud","williams-alligator","rsi","macd","stochastic","stochastic-rsi","commodity-channel-index","williams-percent-r","rate-of-change","true-strength-index","fisher-transform","awesome-oscillator","average-true-range","bollinger-bands","keltner-channels","donchian-channels","historical-volatility","standard-deviation","choppiness-index","ttm-squeeze","on-balance-volume","vwap","anchored-vwap","accumulation-distribution","money-flow-index","chaikin-money-flow","klinger-oscillator","volume-oscillator"]) {
 const descriptor = await loadNativeIndicatorType(type);
 assert.ok(descriptor && descriptor.type === type,'native indicator implementation missing: '+type);
 assert.equal(typeof descriptor.create,'function','native indicator factory missing: '+type);
}
assert.equal(volumeDescriptor.type,'volume','native volume columns descriptor missing');
assert.equal(vpvrDescriptor.type,'vpvr','native visible-range volume profile descriptor missing');
assert.ok(vpvrDescriptor.title,'visible-range volume profile must have a named native implementation');
console.log('VELA_P1_CHART_TERMINAL_CONTRACT_OK');