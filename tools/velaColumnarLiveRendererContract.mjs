import assert from 'node:assert/strict';
import fs from 'node:fs';

import { columnarTimeToMillis } from '../vendor/vela/src/core/model/columnar-bars.ts';
import { canonicalIndexRangeToVelaMillis } from '../src/services/marketData/chartCandleEvents.ts';

const seconds2026 = 1791360000;
const milliseconds2026 = 1791360000000;

assert.equal(columnarTimeToMillis(seconds2026, 'seconds'), milliseconds2026);
assert.equal(columnarTimeToMillis(milliseconds2026, 'milliseconds'), milliseconds2026);

const canonicalTimes = Float64Array.from([seconds2026, seconds2026 + 60, seconds2026 + 120, seconds2026 + 180]);
assert.deepEqual(
  canonicalIndexRangeToVelaMillis({ from: 1, to: 3 }, canonicalTimes, 'seconds'),
  { from: (seconds2026 + 60) * 1000, to: (seconds2026 + 120) * 1000 },
  'canonical [from,to) indices must become inclusive Vela epoch-millisecond bounds',
);
assert.equal(canonicalIndexRangeToVelaMillis({ from: 2, to: 2 }, canonicalTimes, 'seconds'), undefined,
  'empty canonical dirty spans must not become Vela time ranges');

const source = fs.readFileSync(
  new URL('../vendor/vela/src/renderers/native/NativeRenderer.ts', import.meta.url),
  'utf8',
);
const engineSource = fs.readFileSync(
  new URL('../vendor/vela/src/core/engine/EngineOrchestrator.ts', import.meta.url),
  'utf8',
);
const providerSource = fs.readFileSync(
  new URL('../src/TcoVelaDataProvider.ts', import.meta.url),
  'utf8',
);

assert.ok(
  source.includes('if (!this.columnarBars)') &&
  source.includes('this.updateBar({') &&
  source.includes('columnarTimeToMillis(update.time, unit)'),
  'columnar live updates must have an explicit scalar fallback path when no mutable columnar store exists',
);
assert.match(
  source,
  /this\.scheduler\.invalidate\(InvalidateLevel\.Full\);/,
  'in-place columnar mutations must invalidate the native renderer',
);
assert.match(
  source,
  /const nextTimeMs = columnarTimeToMillis\(next\.time, columns\.timeUnit \?\? 'milliseconds'\);/,
  'columnar seconds must be normalized before appending to the renderer time axis',
);

const columnarSetStart = source.indexOf('    setBarsColumns(columns: ColumnarBars');
const columnarUpdateStart = source.indexOf('    updateBarColumns(update: ColumnarBarUpdate)', columnarSetStart);
assert.ok(columnarSetStart >= 0 && columnarUpdateStart > columnarSetStart, 'native columnar full-load method must remain present');
const columnarSetBody = source.slice(columnarSetStart, columnarUpdateStart);
assert.ok(columnarSetBody.includes('this.coords.setBarsColumns('), 'columnar coordinate time axis must be installed directly');
assert.ok(!columnarSetBody.includes('this.coords.setBars(this.bars.map((b) => b.time))'),
  'columnar full-load must not rebuild the same coordinate time array through OHLCV objects');
assert.match(engineSource, /if \(update\.operation === 'replace-history' && update\.columns\)/,
  'EngineOrchestrator must recognize full historical column updates before scalar tick handling');
assert.match(engineSource, /this\.rawTape\.replaceColumns\(update\.columns\)/,
  'historical replacements must update the canonical retained engine tape');
assert.match(engineSource, /notifySessionsBars\('backfill', update\.dirtyRange\)/,
  'historical replacement must notify indicator sessions with the explicit Vela dirty range');
assert.match(providerSource, /canonicalIndexRangeToVelaMillis\([\s\S]{0,160}view\.time[\s\S]{0,60}'seconds'/,
  'the TCO provider must translate canonical dirty indices through the same epoch-second timeline');
assert.match(providerSource, /\.\.\.\(dirtyRange \? \{ dirtyRange \} : \{\}\)/,
  'an empty canonical dirty span must not be emitted as a misleading renderer range');

assert.match(engineSource, /private get bars\(\): OHLCV\[\]/,
  'OHLCV compatibility rows must be materialized lazily rather than on every columnar render');
const retainedRenderStart = engineSource.indexOf('private renderRetainedRawSeries');
const retainedRenderEnd = engineSource.indexOf('private setBarSeriesColumns', retainedRenderStart);
const retainedRenderBody = engineSource.slice(retainedRenderStart, retainedRenderEnd);
assert.ok(retainedRenderStart >= 0 && retainedRenderEnd > retainedRenderStart);
assert.ok(!retainedRenderBody.includes('const raw = this.rawBars') || retainedRenderBody.indexOf('const raw = this.rawBars') < retainedRenderBody.indexOf('} else {'),
  'identity rendering must not read the OHLCV compatibility projection');
const correctionStart = engineSource.indexOf("if (update.operation === 'replace-history' && update.columns)");
const correctionEnd = engineSource.indexOf('const unit = update.timeUnit', correctionStart);
const correctionBody = engineSource.slice(correctionStart, correctionEnd);
assert.ok(!correctionBody.includes('this.rawTape.toOHLCV()'),
  'identity history corrections must not eagerly rebuild the full OHLCV object mirror');
const liveColumnarStart = engineSource.indexOf('private applyColumnarBar(update');
const liveColumnarEnd = engineSource.indexOf('private columnarUpdateToBar', liveColumnarStart);
const liveColumnarBody = engineSource.slice(liveColumnarStart, liveColumnarEnd);
assert.ok(!liveColumnarBody.includes('this.bars.push(bar)') && !liveColumnarBody.includes('this.bars[this.bars.length - 1] = bar'),
  'identity scalar updates must not force the lazy OHLCV mirror into existence');

console.log('VELA_COLUMNAR_LIVE_RENDERER_CONTRACT_OK');
