import assert from 'node:assert/strict';
import { CORESPIRIT_LUXALGO_SMC_SOURCE } from './luxAlgoSmcCoreSource.ts';
import { compileCoreSpirit, executeCoreSpirit } from './coreSpiritPipeline.ts';
import { CoreSpiritRuntime } from './runtime.ts';
import { requireCoreSpiritOutputs } from './boundaryValidation.ts';
import { adaptCoreSpiritOutputsForVela, normalizeVelaBarsToCoreSpirit } from './velaOutputAdapter.ts';
import { projectCoreSpiritObjectsToVela } from '../core/chart/coreSpiritVisualAbi.ts';

const SOURCE_ID = 'corespirit-smc-acceptance';
const source = CORESPIRIT_LUXALGO_SMC_SOURCE;
const compiled = compileCoreSpirit(source, SOURCE_ID, { layer: 'script' });
const errors = compiled.diagnostics.filter(item => item.severity === 'error');
assert.deepEqual(errors, [], 'SMC acceptance source must compile without errors');
assert.ok(compiled.ir, 'compile must produce executable IR');
assert.ok(compiled.artifact, 'compile must produce a validated executable artifact');

const BASE_SECONDS = 1_782_000_000;
function candle(index, open, high, low, close) {
  const sessionOffset = Math.floor(index / 75) * 57_600;
  return {
    timestamp: new Date((BASE_SECONDS + index * 300 + sessionOffset) * 1000).toISOString(),
    open, high, low, close, volume: 1_000 + (index % 80) * 17,
  };
}

function fixedDataset() {
  const bars = [];
  for (let index = 0; index < 260; index += 1) {
    const base = 100 + Math.sin(index * 0.19) * 1.8 + Math.sin(index * 0.047) * 2.0;
    const open = base - 0.12;
    const close = base + 0.10;
    bars.push(candle(index, open, Math.max(open, close) + 0.55, Math.min(open, close) - 0.55, close));
  }

  // Confirmed equal swing highs and lows (swing length 50, right-side delay 50).
  bars[55] = candle(55, 111.5, 115, 111.0, 112.0);
  bars[110] = candle(110, 111.4, 115, 111.1, 112.2);
  bars[70] = candle(70, 92.0, 93.0, 90.0, 91.5);
  bars[125] = candle(125, 92.2, 93.2, 90.0, 91.6);

  // A confirmed bullish break with a real three-candle gap.
  bars[168] = candle(168, 106.0, 110.0, 105.4, 107.0);
  bars[169] = candle(169, 107.1, 111.2, 106.8, 108.2);
  bars[170] = candle(170, 116.4, 117.5, 116.2, 116.9);

  // A confirmed bearish break and bearish gap after the swing low is confirmed.
  bars[183] = candle(183, 99.0, 101.0, 97.0, 99.5);
  bars[184] = candle(184, 99.6, 100.8, 96.5, 99.0);
  bars[185] = candle(185, 88.2, 88.8, 87.2, 87.8);
  return bars;
}

function semanticFingerprint(outputs) {
  return JSON.stringify(outputs, (_key, value) => {
    if (typeof value === 'number' && Number.isNaN(value)) return '__NaN__';
    if (value === Number.POSITIVE_INFINITY) return '__Infinity__';
    if (value === Number.NEGATIVE_INFINITY) return '__-Infinity__';
    return value;
  });
}

const bars = fixedDataset();
const first = executeCoreSpirit(source, bars, SOURCE_ID);
const replay = executeCoreSpirit(source, bars, SOURCE_ID);
const referenceRuntime = new CoreSpiritRuntime({ sourceId: SOURCE_ID, executionTier: 'reference' });
const referenceReplay = referenceRuntime.executeIr(compiled.ir, bars);
assert.deepEqual(first.diagnostics, [], 'fixed SMC history must execute without runtime diagnostics');
assert.deepEqual(referenceReplay.diagnostics, [], 'reference SMC history must execute without runtime diagnostics');
assert.equal(semanticFingerprint(replay.outputs), semanticFingerprint(first.outputs),
  'full-history replay must reproduce byte-stable confirmed outputs');
assert.equal(semanticFingerprint(referenceReplay.outputs), semanticFingerprint(first.outputs),
  'reference and optimized backends must produce identical confirmed SMC output objects');
const outputs = first.outputs;
assert.equal(requireCoreSpiritOutputs(outputs).length, outputs.length, 'SMC output must pass the same worker payload validator as production');
assert.ok(outputs.some(item => item.kind === 'line'), 'SMC must produce native structure/EQH/EQL line objects');
assert.ok(outputs.some(item => item.kind === 'label' && /BOS/.test(item.text)), 'SMC must produce BOS transitions');
assert.ok(outputs.some(item => item.kind === 'label' && /CHoCH/.test(item.text)), 'SMC must distinguish CHoCH from BOS transitions');
assert.ok(outputs.some(item => item.kind === 'label' && /^(HH|LH|HL|LL|SH|SL)$/.test(item.text)),
  'confirmed swing points must be labelled at the pivot, not at the later confirmation bar');
assert.ok(outputs.some(item => item.kind === 'label' && item.text === 'EQH'),
  'equal highs must use the configured price-relative tolerance after pivot confirmation');
assert.ok(outputs.some(item => item.kind === 'label' && item.text === 'EQL'),
  'equal lows must use the configured price-relative tolerance after pivot confirmation');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#00FF68'),
  'bullish FVGs must preserve their original bounds');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#FF0008'),
  'bearish FVGs must preserve their original bounds');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#1848CC'),
  'bullish order blocks must be represented as bounded zones');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#B22833'),
  'bearish order blocks must be represented as bounded zones');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#F23645'),
  'premium range should be painted above equilibrium');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#089981'),
  'discount range should be painted below equilibrium');
assert.ok(outputs.some(item => item.kind === 'hline'),
  'gap-inferred previous-session high/low levels must be present when session transitions occur');

const visualIds = outputs.map(item => item.id).filter(id => typeof id === 'string' && id.length > 0);
assert.equal(new Set(visualIds).size, visualIds.length,
  'same-callsite zone extension must upsert the retained drawing instead of duplicating it');
const fvgZones = outputs.filter(item => item.kind === 'zone' && ['#00FF68', '#FF0008'].includes(item.style?.fillColor));
assert.ok(fvgZones.length > 0 && fvgZones.every(item => Number.isFinite(item.left) && Number.isFinite(item.right) && item.right > item.left),
  'FVG objects must retain explicit ordered bar-time boundaries');
const pivotLabels = outputs.filter(item => item.kind === 'label' && /^(HH|LH|HL|LL|SH|SL)$/.test(item.text));
assert.ok(pivotLabels.every(item => item.time <= Date.parse(bars.at(-1).timestamp) / 1000),
  'pivot labels must be anchored to historical bar times, not generated with future coordinates');

// Exercise the production timestamp adapter and the native Vela drawing projection,
// not just the compiler's internal output objects.
const velaBars = normalizeVelaBarsToCoreSpirit(bars.map(bar => ({
  timestamp: bar.timestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume,
})));
const adapted = adaptCoreSpiritOutputsForVela(outputs, velaBars);
const scene = projectCoreSpiritObjectsToVela(adapted.outputs);
assert.ok(scene.lines.length > 0, 'confirmed structure and equal-level lines must reach Vela native drawings');
assert.ok(scene.boxes.length > 0, 'order blocks, FVGs and premium/discount must reach Vela native boxes');
assert.ok(scene.labels.some(label => /BOS|CHoCH|EQH|EQL/.test(label.text)),
  'structure labels must survive time normalization and native Vela projection');
assert.ok(scene.priceLines.length > 0, 'previous-session levels must reach Vela price lines');
assert.ok(scene.boxes.every(box => box.xloc === 'bar_time' && box.left < box.right),
  'projected Vela rectangles must use bar-time coordinates with ordered boundaries');

// Input changes are a different semantic artifact. They must produce a fresh,
// internally consistent result rather than leaving stale drawings from the old input.
const shortSwingRuntime = new CoreSpiritRuntime({
  sourceId: SOURCE_ID,
  inputValues: { swingLength: 20 },
});
const changedSettings = shortSwingRuntime.executeIr(compiled.ir, bars);
assert.deepEqual(changedSettings.diagnostics, [], 'changed SMC inputs must re-execute cleanly');
assert.notEqual(semanticFingerprint(changedSettings.outputs), semanticFingerprint(outputs),
  'changing swingLength must invalidate/recompute the results, not reuse the previous settings output');

// A forming-bar revision must roll back the previous unconfirmed state. Its output
// must equal a fresh run of that exact revised candle after the same confirmed prefix.
const prefix = bars.slice(0, -1);
const liveBar = bars.at(-1);
const revisedBar = {
  ...liveBar,
  close: liveBar.close + 0.12,
  high: Math.max(liveBar.high, liveBar.close + 0.18),
  low: Math.min(liveBar.low, liveBar.close - 0.06),
};
const liveRuntime = new CoreSpiritRuntime({ sourceId: 'smc-forming-bar' });
liveRuntime.executeIr(compiled.ir, prefix);
liveRuntime.executeBar(liveBar, 'realtime');
const revisedLive = liveRuntime.executeBar(revisedBar, 'realtime');
const referenceLiveRuntime = new CoreSpiritRuntime({ sourceId: 'smc-forming-bar' });
referenceLiveRuntime.executeIr(compiled.ir, prefix);
const referenceLive = referenceLiveRuntime.executeBar(revisedBar, 'realtime');
assert.equal(semanticFingerprint(revisedLive.outputs), semanticFingerprint(referenceLive.outputs),
  'forming-bar replacement must be equivalent to executing only the final version of that bar');
assert.equal(revisedLive.state.barIndex, referenceLive.state.barIndex);

// Historical corrections force a chronological replay and must converge to the
// same outputs as a clean run of the corrected immutable dataset.
const correctedBars = bars.map(bar => ({ ...bar }));
correctedBars[42] = { ...correctedBars[42], close: correctedBars[42].close + 0.08 };
const correctionRuntime = new CoreSpiritRuntime({ sourceId: 'smc-correction' });
correctionRuntime.executeIr(compiled.ir, bars);
const corrected = correctionRuntime.executeIr(compiled.ir, correctedBars);
const cleanCorrected = executeCoreSpirit(source, correctedBars, 'smc-correction');
assert.deepEqual(corrected.diagnostics, [], 'historical correction replay must remain runtime-valid');
assert.equal(semanticFingerprint(corrected.outputs), semanticFingerprint(cleanCorrected.outputs),
  'corrected history must equal a clean full replay; no stale drawing objects may survive correction');


function epochSeconds(bar) {
  return Date.parse(bar.timestamp) / 1000;
}

// Confirm that swing pivots are not back-filled before the right-hand
// confirmation window closes. The label is anchored to the candidate candle,
// but must only become observable after the full 50-bar confirmation delay.
const pivotCandidateTime = epochSeconds(bars[55]);
const beforePivotConfirmation = executeCoreSpirit(source, bars.slice(0, 105), SOURCE_ID + '-pivot-before-confirmation');
assert.ok(!beforePivotConfirmation.outputs.some(item =>
  item.kind === 'label' && ['SH', 'HH', 'LH'].includes(item.text) && item.time === pivotCandidateTime
), 'a swing-high label must not appear before its right-side confirmation bars exist');
const atPivotConfirmation = executeCoreSpirit(source, bars.slice(0, 106), SOURCE_ID + '-pivot-at-confirmation');
assert.ok(atPivotConfirmation.outputs.some(item =>
  item.kind === 'label' && item.text === 'SH' && item.time === pivotCandidateTime
), 'the first swing high must appear on the original pivot candle exactly when confirmation becomes available');

// Equal-level fixtures are deliberately exact matches: validate the anchor and
// price rather than only checking that some EQH/EQL label was emitted.
assert.ok(outputs.some(item => item.kind === 'label' && item.text === 'EQH' &&
  item.time === epochSeconds(bars[110]) && item.price === bars[110].high),
  'EQH must attach to the second confirmed high candle and its actual price');
assert.ok(outputs.some(item => item.kind === 'label' && item.text === 'EQL' &&
  item.time === epochSeconds(bars[125]) && item.price === bars[125].low),
  'EQL must attach to the second confirmed low candle and its actual price');

// The fixed three-candle bullish imbalance at bar 170 must not exist before
// that candle closes. At creation, its coordinates are exactly the prior
// candle's high at the left and the current candle's low at the right bound.
const bullishGapLeft = epochSeconds(bars[168]);
const bullishGapRight = epochSeconds(bars[170]);
const beforeBullishGap = executeCoreSpirit(source, bars.slice(0, 170), SOURCE_ID + '-before-bull-fvg');
assert.ok(!beforeBullishGap.outputs.some(item => item.kind === 'zone' &&
  item.style?.fillColor === '#00FF68' && item.left === bullishGapLeft),
  'a bullish FVG must not be emitted before the third candle establishes the imbalance');
const atBullishGap = executeCoreSpirit(source, bars.slice(0, 171), SOURCE_ID + '-at-bull-fvg');
const bullishGap = atBullishGap.outputs.find(item => item.kind === 'zone' &&
  item.style?.fillColor === '#00FF68' && item.left === bullishGapLeft);
assert.ok(bullishGap, 'the fixture bullish FVG should be emitted on its third candle');
assert.equal(bullishGap.right, bullishGapRight, 'new FVG starts at the third candle, not at a future viewport edge');
assert.equal(bullishGap.top, bars[170].low, 'bullish FVG top must equal the third candle low');
assert.equal(bullishGap.bottom, bars[168].high, 'bullish FVG bottom must equal the first candle high');

// Mirror the exact-boundary check for a bearish three-candle gap.
const bearishGapLeft = epochSeconds(bars[183]);
const bearishGapRight = epochSeconds(bars[185]);
const atBearishGap = executeCoreSpirit(source, bars.slice(0, 186), SOURCE_ID + '-at-bear-fvg');
const bearishGap = atBearishGap.outputs.find(item => item.kind === 'zone' &&
  item.style?.fillColor === '#FF0008' && item.left === bearishGapLeft);
assert.ok(bearishGap, 'the fixture bearish FVG should be emitted on its third candle');
assert.equal(bearishGap.right, bearishGapRight, 'bearish FVG must preserve the actual third-candle boundary');
assert.equal(bearishGap.top, bars[183].low, 'bearish FVG top must equal the first candle low');
assert.equal(bearishGap.bottom, bars[185].high, 'bearish FVG bottom must equal the third candle high');

// Input switches are part of the indicator's public surface. A setting change
// must remove disabled visual families rather than leaving stale historical
// drawings behind in a newly evaluated output snapshot.
const hiddenFvgRuntime = new CoreSpiritRuntime({
  sourceId: SOURCE_ID + '-hide-fvg',
  inputValues: { showFairValueGaps: false },
});
const hiddenFvgRun = hiddenFvgRuntime.executeIr(compiled.ir, bars);
assert.deepEqual(hiddenFvgRun.diagnostics, [], 'disabling FVG visuals must remain runtime-valid');
assert.ok(!hiddenFvgRun.outputs.some(item => item.kind === 'zone' &&
  ['#00FF68', '#FF0008'].includes(item.style?.fillColor)),
  'disabled FVG input must remove both bullish and bearish FVG zones from the replacement output');

// A forming-bar revision must not create duplicate event objects while state is
// restored. Stable identities should let Vela update the same objects in-place.
const formingVisualIds = revisedLive.outputs
  .map(item => item.id)
  .filter(id => typeof id === 'string' && id.length > 0);
assert.equal(new Set(formingVisualIds).size, formingVisualIds.length,
  'forming-bar replacement must not duplicate retained CoreSpirit drawing IDs');

console.log('CORESPIRIT_SMC_DETERMINISTIC_ACCEPTANCE_OK');
