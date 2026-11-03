import assert from 'node:assert/strict';
import { CORESPIRIT_LUXALGO_SMC_SOURCE } from './luxAlgoSmcCoreSource.ts';
import { compileCoreSpirit, executeCoreSpirit as executeCoreSpiritWithPolicy } from './coreSpiritPipeline.ts';
import { CoreSpiritRuntime } from './runtime.ts';
import { requireCoreSpiritOutputs } from './boundaryValidation.ts';
import { adaptCoreSpiritOutputsForVela, normalizeVelaBarsToCoreSpirit } from './velaOutputAdapter.ts';
import { CoreSpiritVisualAbiStore, createCoreSpiritVisualSnapshot, projectCoreSpiritObjectsToVela } from '../core/chart/coreSpiritVisualAbi.ts';

const SOURCE_ID = 'corespirit-smc-acceptance';
// This suite proves deterministic semantics and rendering contracts, not wall-clock performance.
// Production runtime limits remain at 150 ms/bar and are tested independently with deterministic clocks.
const ACCEPTANCE_RESOURCE_BUDGET = Object.freeze({ maxExecutionTimeMs: 1_000, maxExecutionTimeMsPerRun: 120_000 });
function executeAcceptance(source, bars, sourceId) {
  return executeCoreSpiritWithPolicy(source, bars, sourceId, { resourceBudget: ACCEPTANCE_RESOURCE_BUDGET });
}
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

  // An opposite-color candle gives the bullish break a real order-block origin.
  // The default fixture bars are bullish, so without this bearish candle there
  // is no qualifying source candle for the model's bounded bullish OB zone.
  bars[167] = candle(167, 107.2, 107.6, 106.4, 106.6);

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
  return JSON.stringify(outputs, (key, value) => {
    // Runtime provenance is intentionally compared by its own assertions below.
    // A corrected replay and a clean historical run must share numerical/drawing
    // semantics even though their host execution phases are necessarily distinct.
    if (key === 'coreSpiritExecution') return undefined;
    if (typeof value === 'number' && Number.isNaN(value)) return '__NaN__';
    if (value === Number.POSITIVE_INFINITY) return '__Infinity__';
    if (value === Number.NEGATIVE_INFINITY) return '__-Infinity__';
    return value;
  });
}

const bars = fixedDataset();
const first = executeAcceptance(source, bars, SOURCE_ID);
const replay = executeAcceptance(source, bars, SOURCE_ID);
const referenceRuntime = new CoreSpiritRuntime({ resourceBudget: ACCEPTANCE_RESOURCE_BUDGET, sourceId: SOURCE_ID, executionTier: 'reference' });
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
const bullishOrderBlock = outputs.find(item => item.kind === 'zone' && item.style?.fillColor === '#1848CC');
const hasBullishOrderBlock = Boolean(bullishOrderBlock);
const bullishOrderBlockDebug = hasBullishOrderBlock ? [] : executeAcceptance(source + `
if bar_index == 167 {
    if close < open { label("DBG_BAR167_BEARISH_TRUE", "below", "#00FF00", "#000000", 8, "pill") }
    if close >= open { label("DBG_BAR167_BEARISH_FALSE", "below", "#FF0000", "#FFFFFF", 8, "pill") }
    if time[0] > 0 { label("DBG_TIME0_POSITIVE_AT_167", "below", "#00FF00", "#000000", 8, "pill") }
}
if bar_index == 170 {
    if swingBullBreak == true { label("DBG_SWING_BULL_BREAK_TRUE", "below", "#00FF00", "#000000", 8, "pill") }
    if swingBullBreak == false { label("DBG_SWING_BULL_BREAK_FALSE", "below", "#FF0000", "#FFFFFF", 8, "pill") }
    if lastBearishTime > 0 { label("DBG_LAST_BEARISH_TIME_POSITIVE", "below", "#00FF00", "#000000", 8, "pill") }
    if lastBearishTime <= 0 { label("DBG_LAST_BEARISH_TIME_ZERO", "below", "#FF0000", "#FFFFFF", 8, "pill") }
    if lastBearishTime != lastBearishTime { label("DBG_LAST_BEARISH_TIME_NAN", "below", "#FF0000", "#FFFFFF", 8, "pill") }
    if showOrderBlockZones == true { label("DBG_OB_INPUT_TRUE", "below", "#00FF00", "#000000", 8, "pill") }
    if showOrderBlockZones == false { label("DBG_OB_INPUT_FALSE", "below", "#FF0000", "#FFFFFF", 8, "pill") }
    if showOrderBlockZones == true and swingBullBreak == true and lastBearishTime > 0 { label("DBG_OB_GATE_TRUE", "below", "#00FF00", "#000000", 8, "pill") }
    if showOrderBlockZones == false or swingBullBreak == false or lastBearishTime <= 0 { label("DBG_OB_GATE_FALSE", "below", "#FF0000", "#FFFFFF", 8, "pill") }
    if swingPivotHigh > 0 { labelAt(time[0], swingPivotHigh, "DBG_SWING_PIVOT_HIGH", "above", "#00FF00", "#000000", 8, "pill", "600") }
    if close > swingPivotHigh and close[1] <= swingPivotHigh { label("DBG_SWING_CROSSING_TRUE", "above", "#00FF00", "#000000", 8, "pill") }
    if bullObExists == true { label("DBG_BULL_OB_EXISTS_TRUE", "below", "#00FF00", "#000000", 8, "pill") }
    if bullObExists == false { label("DBG_BULL_OB_EXISTS_FALSE", "below", "#FF0000", "#FFFFFF", 8, "pill") }
}
`, bars, SOURCE_ID + '-ob-debug').outputs
  .filter(item => item.kind === 'label' && item.text.startsWith('DBG_'))
  .map(item => ({text:item.text, price:item.price, time:item.time}));
const bullishOrderBlockReference = referenceReplay.outputs
  .filter(item => item.kind === 'zone' && item.style?.fillColor === '#1848CC')
  .map(item => ({left:item.left,right:item.right,top:item.top,bottom:item.bottom,style:item.style}));
const bullishOrderBlockStateInstructions = compiled.ir.entry.instructions
  .filter(instruction => instruction.op === 'setState' &&
    ['lastBearishTime','lastBearishHigh','lastBearishLow','bullObExists','bullObLeft','bullObRight','bullObTop','bullObBottom'].includes(instruction.name))
  .map(instruction => ({op:instruction.op,name:instruction.name,initialize:instruction.initialize}));
assert.ok(hasBullishOrderBlock,
  'bullish order blocks must be represented as bounded zones; diagnostics=' +
  JSON.stringify({optimizedDebug:bullishOrderBlockDebug,referenceZones:bullishOrderBlockReference,stateInstructions:bullishOrderBlockStateInstructions}));
assert.equal(bullishOrderBlock.left, Date.parse(bars[167].timestamp) / 1000,
  'the bullish order block must start at the last bearish candle time in epoch seconds');
assert.equal(bullishOrderBlock.top, bars[167].high,
  'the bullish order block top must come from the selected bearish origin candle');
assert.equal(bullishOrderBlock.bottom, bars[167].low,
  'the bullish order block bottom must come from the selected bearish origin candle');

// The active → mitigated transition is part of the observable SMC contract.
// Keep one runtime/instance so the test proves retained identity, state rollback,
// and in-place geometry updates rather than comparing unrelated snapshots.
const orderBlockLifecycleRuntime = new CoreSpiritRuntime({ resourceBudget: ACCEPTANCE_RESOURCE_BUDGET, sourceId: SOURCE_ID + '-ob-lifecycle' });
const orderBlockSeed = orderBlockLifecycleRuntime.executeIr(compiled.ir, bars.slice(0, 171));
assert.deepEqual(orderBlockSeed.diagnostics, [], 'the unmitigated order-block prefix must execute cleanly');
const activeBullishOrderBlock = orderBlockSeed.outputs.find(item =>
  item.kind === 'zone' && item.style?.fillColor === '#1848CC');
assert.ok(activeBullishOrderBlock, 'the confirmed bullish break must create a retained bullish order block');
assert.equal(activeBullishOrderBlock.left, Date.parse(bars[167].timestamp) / 1000,
  'the active order block must retain its bearish-origin anchor');
assert.equal(activeBullishOrderBlock.right, Date.parse(bars[170].timestamp) / 1000,
  'the active order block must end at the latest visible bar before mitigation');
assert.equal(activeBullishOrderBlock.style?.fillOpacity, 0.16,
  'an unmitigated order block must retain its active fill opacity');

const mitigationBar = candle(171, 106.2, 106.6, 106.1, 106.2);
const firstMitigatedRun = orderBlockLifecycleRuntime.executeBar(mitigationBar, 'realtime');
assert.deepEqual(firstMitigatedRun.diagnostics, [], 'order-block mitigation must not produce runtime diagnostics');
const firstMitigatedBullishOrderBlock = firstMitigatedRun.outputs.find(item =>
  item.kind === 'zone' && item.style?.fillColor === '#1848CC');
assert.ok(firstMitigatedBullishOrderBlock, 'a mitigated order block remains as a faded historical drawing');
assert.equal(firstMitigatedBullishOrderBlock.id, activeBullishOrderBlock.id,
  'mitigation must update the existing retained drawing identity rather than create a duplicate');
assert.equal(firstMitigatedBullishOrderBlock.style?.fillOpacity, 0.04,
  'a developing bar that trades through the order block must provisionally fade it');

// Replace that same forming candle with a version that no longer reaches the
// mitigation boundary. The runtime must roll back the prior provisional state.
const nonMitigatingReplacement = candle(171, 106.2, 106.6, 106.5, 106.55);
const restoredRun = orderBlockLifecycleRuntime.executeBar(nonMitigatingReplacement, 'realtime');
const restoredBullishOrderBlock = restoredRun.outputs.find(item =>
  item.kind === 'zone' && item.style?.fillColor === '#1848CC');
assert.ok(restoredBullishOrderBlock, 'same-bar correction must preserve the existing bullish order block');
assert.equal(restoredBullishOrderBlock.id, activeBullishOrderBlock.id,
  'same-bar replacement must preserve the bullish order-block identity');
assert.equal(restoredBullishOrderBlock.left, activeBullishOrderBlock.left);
assert.equal(restoredBullishOrderBlock.right, Date.parse(nonMitigatingReplacement.timestamp) / 1000,
  'restored active order block must extend to the current forming bar');
assert.equal(restoredBullishOrderBlock.top, activeBullishOrderBlock.top);
assert.equal(restoredBullishOrderBlock.bottom, activeBullishOrderBlock.bottom);
assert.equal(restoredBullishOrderBlock.style?.fillOpacity, 0.16,
  'replacing a provisional mitigation candle must restore the active order-block styling');

const mitigatedRun = orderBlockLifecycleRuntime.executeBar(mitigationBar, 'realtime');
assert.deepEqual(mitigatedRun.diagnostics, [], 'replayed order-block mitigation must remain diagnostic-free');
const mitigatedBullishOrderBlock = mitigatedRun.outputs.find(item =>
  item.kind === 'zone' && item.style?.fillColor === '#1848CC');
assert.ok(mitigatedBullishOrderBlock, 'the final mitigated order block remains visible');
assert.equal(mitigatedBullishOrderBlock.id, activeBullishOrderBlock.id,
  'repeated same-bar mitigation must not mint another drawing identity');
assert.equal(mitigatedBullishOrderBlock.left, activeBullishOrderBlock.left,
  'mitigation must preserve the original order-block left anchor');
assert.equal(mitigatedBullishOrderBlock.right, Date.parse(mitigationBar.timestamp) / 1000,
  'mitigation must stop the order-block right edge on the first candle that trades through its invalidation boundary');
assert.equal(mitigatedBullishOrderBlock.top, activeBullishOrderBlock.top);
assert.equal(mitigatedBullishOrderBlock.bottom, activeBullishOrderBlock.bottom);
assert.equal(mitigatedBullishOrderBlock.style?.fillOpacity, 0.04,
  'a mitigated order block must become visually faded without losing its original price bounds');
assert.equal(
  mitigatedRun.outputs.filter(item => item.kind === 'zone' && item.style?.fillColor === '#1848CC').length,
  1,
  'the active-to-mitigated transition must retain exactly one bullish order-block object',
);

// Mirror the lifecycle for bearish blocks. Bar 185 creates the bearish break
// from the most recent bullish origin at bar 183; bar 186 trades above its top.
const bearOrderBlockRuntime = new CoreSpiritRuntime({ resourceBudget: ACCEPTANCE_RESOURCE_BUDGET, sourceId: SOURCE_ID + '-bear-ob-lifecycle' });
const bearOrderBlockSeed = bearOrderBlockRuntime.executeIr(compiled.ir, bars.slice(0, 186));
const activeBearishOrderBlock = bearOrderBlockSeed.outputs.find(item =>
  item.kind === 'zone' && item.style?.fillColor === '#B22833');
assert.ok(activeBearishOrderBlock, 'the confirmed bearish break must create a retained bearish order block');
assert.equal(activeBearishOrderBlock.left, Date.parse(bars[183].timestamp) / 1000,
  'the bearish order block must retain its bullish-origin anchor');
assert.equal(activeBearishOrderBlock.right, Date.parse(bars[185].timestamp) / 1000);
assert.equal(activeBearishOrderBlock.style?.fillOpacity, 0.16);

const bearishMitigationBar = candle(186, 100.9, 102.4, 100.4, 101.9);
const bearishMitigatedRun = bearOrderBlockRuntime.executeBar(bearishMitigationBar, 'realtime');
const mitigatedBearishOrderBlock = bearishMitigatedRun.outputs.find(item =>
  item.kind === 'zone' && item.style?.fillColor === '#B22833');
assert.ok(mitigatedBearishOrderBlock, 'a bearish order block must remain visible after mitigation');
assert.equal(mitigatedBearishOrderBlock.id, activeBearishOrderBlock.id);
assert.equal(mitigatedBearishOrderBlock.left, activeBearishOrderBlock.left);
assert.equal(mitigatedBearishOrderBlock.right, Date.parse(bearishMitigationBar.timestamp) / 1000);
assert.equal(mitigatedBearishOrderBlock.top, activeBearishOrderBlock.top);
assert.equal(mitigatedBearishOrderBlock.bottom, activeBearishOrderBlock.bottom);
assert.equal(mitigatedBearishOrderBlock.style?.fillOpacity, 0.04,
  'a bearish wick through the order-block top must fade the retained zone');

const bearishNonMitigatingReplacement = candle(186, 100.9, 100.95, 100.5, 100.8);
const bearishRestoredRun = bearOrderBlockRuntime.executeBar(bearishNonMitigatingReplacement, 'realtime');
const restoredBearishOrderBlock = bearishRestoredRun.outputs.find(item =>
  item.kind === 'zone' && item.style?.fillColor === '#B22833');
assert.ok(restoredBearishOrderBlock, 'bearish same-bar replacement must keep the order block');
assert.equal(restoredBearishOrderBlock.id, activeBearishOrderBlock.id);
assert.equal(restoredBearishOrderBlock.right, Date.parse(bearishNonMitigatingReplacement.timestamp) / 1000);
assert.equal(restoredBearishOrderBlock.style?.fillOpacity, 0.16,
  'a bearish order block must restore active styling when its forming-bar wick is corrected away');

const finalBearishMitigationRun = bearOrderBlockRuntime.executeBar(bearishMitigationBar, 'realtime');
const finalBearishOrderBlock = finalBearishMitigationRun.outputs.find(item =>
  item.kind === 'zone' && item.style?.fillColor === '#B22833');
assert.ok(finalBearishOrderBlock);
assert.equal(finalBearishOrderBlock.id, activeBearishOrderBlock.id);
assert.equal(finalBearishOrderBlock.style?.fillOpacity, 0.04);
assert.equal(finalBearishMitigationRun.outputs.filter(item =>
  item.kind === 'zone' && item.style?.fillColor === '#B22833').length, 1,
  'bearish mitigation replay must preserve a single retained order-block drawing');

assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#B22833'),
  'bearish order blocks must be represented as bounded zones');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#F23645'),
  'premium range should be painted above equilibrium');
assert.ok(outputs.some(item => item.kind === 'zone' && item.style?.fillColor === '#089981'),
  'discount range should be painted below equilibrium');
assert.ok(outputs.some(item => item.kind === 'hline'),
  'gap-inferred previous-session high/low levels must be present when session transitions occur');
const priorSessionBars = bars.slice(150, 225);
const previousSessionHigh = outputs.find(item => item.kind === 'hline' && item.style?.color === '#F5A623');
const previousSessionLow = outputs.find(item => item.kind === 'hline' && item.style?.color === '#3B82F6');
assert.equal(previousSessionHigh?.price, Math.max(...priorSessionBars.map(bar => bar.high)),
  'previous-session high must use the actual high from the completed prior session');
assert.equal(previousSessionLow?.price, Math.min(...priorSessionBars.map(bar => bar.low)),
  'previous-session low must use the actual low from the completed prior session');

const visualIds = outputs.map(item => item.id).filter(id => typeof id === 'string' && id.length > 0);
assert.equal(new Set(visualIds).size, visualIds.length,
  'same-callsite zone extension must upsert the retained drawing instead of duplicating it');
const fvgZones = outputs.filter(item => item.kind === 'zone' && ['#00FF68', '#FF0008'].includes(item.style?.fillColor));
assert.ok(fvgZones.length > 0 && fvgZones.every(item => Number.isFinite(item.left) && Number.isFinite(item.right) && item.right > item.left),
  'FVG objects must retain explicit ordered bar-time boundaries');
const pivotLabels = outputs.filter(item => item.kind === 'label' && /^(HH|LH|HL|LL|SH|SL)$/.test(item.text));
assert.ok(pivotLabels.every(item => item.time <= Date.parse(bars.at(-1).timestamp) / 1000),
  'pivot labels must be anchored to historical bar times, not generated with future coordinates');

const anchoredPivotLabels = outputs.filter(item => item.kind === 'label' && item.metadata?.anchor === 'time-price');
for (const item of anchoredPivotLabels) {
  const expectedBarIndex = bars.findIndex(bar => Math.floor(Date.parse(bar.timestamp) / 1000) === Math.floor(item.time));
  assert.ok(expectedBarIndex >= 0, 'time-anchored pivot labels must match a canonical candle timestamp');
  assert.equal(item.metadata.barIndex, expectedBarIndex,
    'time-anchored pivot label metadata must reference its anchor candle, not the later confirmation candle');
}

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
const shortSwingRuntime = new CoreSpiritRuntime({ resourceBudget: ACCEPTANCE_RESOURCE_BUDGET,
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
const liveRuntime = new CoreSpiritRuntime({ resourceBudget: ACCEPTANCE_RESOURCE_BUDGET, sourceId: 'smc-forming-bar' });
liveRuntime.executeIr(compiled.ir, prefix);
liveRuntime.executeBar(liveBar, 'realtime');
const revisedLive = liveRuntime.executeBar(revisedBar, 'realtime');
const referenceLiveRuntime = new CoreSpiritRuntime({ resourceBudget: ACCEPTANCE_RESOURCE_BUDGET, sourceId: 'smc-forming-bar' });
referenceLiveRuntime.executeIr(compiled.ir, prefix);
const referenceLive = referenceLiveRuntime.executeBar(revisedBar, 'realtime');
assert.equal(semanticFingerprint(revisedLive.outputs), semanticFingerprint(referenceLive.outputs),
  'forming-bar replacement must be equivalent to executing only the final version of that bar');
assert.equal(revisedLive.state.barIndex, referenceLive.state.barIndex);

// Apply another correction to the same still-forming bar. Three successive
// versions must remain one observation, and the final state must be independent
// of how many provisional versions arrived before it.
const finalRevisionBar = {
  ...revisedBar,
  close: liveBar.close - 0.09,
  high: Math.max(liveBar.high, liveBar.open, liveBar.close - 0.09),
  low: Math.min(liveBar.low, liveBar.close - 0.21),
};
const repeatedRevision = liveRuntime.executeBar(finalRevisionBar, 'realtime');
const repeatedRevisionReferenceRuntime = new CoreSpiritRuntime({ resourceBudget: ACCEPTANCE_RESOURCE_BUDGET, sourceId: 'smc-forming-bar' });
repeatedRevisionReferenceRuntime.executeIr(compiled.ir, prefix);
const repeatedRevisionReference = repeatedRevisionReferenceRuntime.executeBar(finalRevisionBar, 'realtime');
assert.equal(semanticFingerprint(repeatedRevision.outputs), semanticFingerprint(repeatedRevisionReference.outputs),
  'repeated forming-bar replacement must restore the same pre-bar checkpoint instead of accumulating provisional state');
assert.equal(repeatedRevision.state.barIndex, repeatedRevisionReference.state.barIndex,
  'repeated forming-bar replacement must not advance the logical bar index');

// Historical corrections force a chronological replay and must converge to the
// same outputs as a clean run of the corrected immutable dataset.
const correctedBars = bars.map(bar => ({ ...bar }));
correctedBars[42] = { ...correctedBars[42], close: correctedBars[42].close + 0.08 };
const correctionRuntime = new CoreSpiritRuntime({ resourceBudget: ACCEPTANCE_RESOURCE_BUDGET, sourceId: 'smc-correction' });
correctionRuntime.executeIr(compiled.ir, bars);
const corrected = correctionRuntime.executeIr(compiled.ir, correctedBars);
const cleanCorrected = executeAcceptance(source, correctedBars, 'smc-correction');
assert.deepEqual(corrected.diagnostics, [], 'historical correction replay must remain runtime-valid');
assert.equal(semanticFingerprint(corrected.outputs), semanticFingerprint(cleanCorrected.outputs),
  'corrected history must equal a clean full replay; no stale drawing objects may survive correction');
const correctedExecutionSemantics = corrected.outputs.find(item => item.metadata?.coreSpiritExecution)?.metadata?.coreSpiritExecution;
const cleanExecutionSemantics = cleanCorrected.outputs.find(item => item.metadata?.coreSpiritExecution)?.metadata?.coreSpiritExecution;
assert.equal(correctedExecutionSemantics?.barPhase, 'correction',
  'outputs from a historical correction replay retain their explicit correction provenance');
assert.equal(cleanExecutionSemantics?.barPhase, 'historical',
  'outputs from a clean dataset replay retain their historical execution provenance');


function epochSeconds(bar) {
  return Date.parse(bar.timestamp) / 1000;
}

// Confirm that swing pivots are not back-filled before the right-hand
// confirmation window closes. The label is anchored to the candidate candle,
// but must only become observable after the full 50-bar confirmation delay.
const pivotCandidateTime = epochSeconds(bars[55]);
const beforePivotConfirmation = executeAcceptance(source, bars.slice(0, 105), SOURCE_ID + '-pivot-before-confirmation');
assert.ok(!beforePivotConfirmation.outputs.some(item =>
  item.kind === 'label' && ['SH', 'HH', 'LH'].includes(item.text) && item.time === pivotCandidateTime
), 'a swing-high label must not appear before its right-side confirmation bars exist');
const atPivotConfirmation = executeAcceptance(source, bars.slice(0, 106), SOURCE_ID + '-pivot-at-confirmation');
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
const beforeBullishGap = executeAcceptance(source, bars.slice(0, 170), SOURCE_ID + '-before-bull-fvg');
assert.ok(!beforeBullishGap.outputs.some(item => item.kind === 'zone' &&
  item.style?.fillColor === '#00FF68' && item.left === bullishGapLeft),
  'a bullish FVG must not be emitted before the third candle establishes the imbalance');
const atBullishGap = executeAcceptance(source, bars.slice(0, 171), SOURCE_ID + '-at-bull-fvg');
const bullishGap = atBullishGap.outputs.find(item => item.kind === 'zone' &&
  item.style?.fillColor === '#00FF68' && item.left === bullishGapLeft);
assert.ok(bullishGap, 'the fixture bullish FVG should be emitted on its third candle');
assert.equal(bullishGap.right, bullishGapRight, 'new FVG starts at the third candle, not at a future viewport edge');
assert.equal(bullishGap.top, bars[170].low, 'bullish FVG top must equal the third candle low');
assert.equal(bullishGap.bottom, bars[168].high, 'bullish FVG bottom must equal the first candle high');

// Mirror the exact-boundary check for a bearish three-candle gap.
const bearishGapLeft = epochSeconds(bars[183]);
const bearishGapRight = epochSeconds(bars[185]);
const atBearishGap = executeAcceptance(source, bars.slice(0, 186), SOURCE_ID + '-at-bear-fvg');
const bearishGap = atBearishGap.outputs.find(item => item.kind === 'zone' &&
  item.style?.fillColor === '#FF0008' && item.left === bearishGapLeft);
assert.ok(bearishGap, 'the fixture bearish FVG should be emitted on its third candle');
assert.equal(bearishGap.right, bearishGapRight, 'bearish FVG must preserve the actual third-candle boundary');
assert.equal(bearishGap.top, bars[183].low, 'bearish FVG top must equal the first candle low');
assert.equal(bearishGap.bottom, bars[185].high, 'bearish FVG bottom must equal the third candle high');

// Input switches are part of the indicator's public surface. A setting change
// must remove disabled visual families rather than leaving stale historical
// drawings behind in a newly evaluated output snapshot.
const hiddenFvgRuntime = new CoreSpiritRuntime({ resourceBudget: ACCEPTANCE_RESOURCE_BUDGET,
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

// Retained visual ABI acceptance: a successful replacement is idempotent, while an
// invalid/rejected replacement cannot clear or corrupt the previously committed scene.
const retainedStore = new CoreSpiritVisualAbiStore();
const retainedStreamId = 'smc-acceptance-retained-scene';
const retainedRevision1 = { streamId: retainedStreamId, datasetRevision: 1, outputRevision: 1 };
const retainedSnapshot1 = createCoreSpiritVisualSnapshot(
  adapted.outputs, retainedRevision1, retainedStreamId, 'price', true,
);
const preparedSnapshot1 = retainedStore.prepare(retainedSnapshot1);
assert.ok(preparedSnapshot1, 'the valid deterministic SMC scene must pass visual ABI preparation');
retainedStore.commit(preparedSnapshot1);

const retainedIds = () => retainedStore.objects(retainedStreamId)
  .map(item => String(item.metadata?.coreSpiritVisualAbi?.objectId ?? item.id ?? ''))
  .filter(Boolean)
  .sort();
const idsAfterFirstCommit = retainedIds();
assert.ok(idsAfterFirstCommit.length > 0, 'the retained SMC snapshot must contain native visual objects');
assert.equal(new Set(idsAfterFirstCommit).size, idsAfterFirstCommit.length,
  'the retained visual store must not contain duplicate stable object identities');

const recompilation = compileCoreSpirit(source, SOURCE_ID, { layer: 'script' });
assert.ok(recompilation.ir && recompilation.artifact &&
  !recompilation.diagnostics.some(item => item.severity === 'error'),
  'recompilation must continue to produce a validated SMC artifact');
const recompiledRun = executeAcceptance(source, bars, SOURCE_ID);
assert.deepEqual(recompiledRun.diagnostics, [], 'recompiled SMC must execute without runtime diagnostics');
assert.equal(semanticFingerprint(recompiledRun.outputs), semanticFingerprint(outputs),
  'recompile must reproduce the fixed-data SMC output before replacing chart objects');
const recompiledAdapted = adaptCoreSpiritOutputsForVela(recompiledRun.outputs, velaBars);
const retainedRevision2 = { streamId: retainedStreamId, datasetRevision: 1, outputRevision: 2 };
const preparedSnapshot2 = retainedStore.prepare(createCoreSpiritVisualSnapshot(
  recompiledAdapted.outputs, retainedRevision2, retainedStreamId, 'price', true,
));
assert.ok(preparedSnapshot2, 'a newer successful output revision must prepare as a replacement snapshot');
retainedStore.commit(preparedSnapshot2);
const idsAfterRecompile = retainedIds();
assert.deepEqual(idsAfterRecompile, idsAfterFirstCommit,
  'recompiling identical source/data must replace retained objects without growing or duplicating the scene');

const retainedBeforeRejectedCommit = JSON.stringify(retainedStore.objects(retainedStreamId));
const invalidSnapshot = {
  ...createCoreSpiritVisualSnapshot(
    [], { streamId: retainedStreamId, datasetRevision: 1, outputRevision: 3 },
    retainedStreamId, 'price', true,
  ),
  coordinateSystem: 'invalid-coordinate-space',
};
assert.equal(retainedStore.prepare(invalidSnapshot), undefined,
  'invalid visual ABI metadata must be rejected before it can replace a valid scene');
assert.equal(JSON.stringify(retainedStore.objects(retainedStreamId)), retainedBeforeRejectedCommit,
  'a rejected replacement must preserve the last valid retained SMC scene');

const staleSnapshot = createCoreSpiritVisualSnapshot(
  [], { streamId: retainedStreamId, datasetRevision: 1, outputRevision: 1 },
  retainedStreamId, 'price', true,
);
assert.equal(retainedStore.prepare(staleSnapshot), undefined,
  'stale output revisions must not resurrect old drawings after a newer scene commits');
assert.equal(JSON.stringify(retainedStore.objects(retainedStreamId)), retainedBeforeRejectedCommit,
  'stale output rejection must leave the retained scene byte-stable');

console.log('CORESPIRIT_SMC_DETERMINISTIC_ACCEPTANCE_OK');
