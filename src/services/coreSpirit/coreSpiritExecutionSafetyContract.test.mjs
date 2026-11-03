import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CoreSpiritResourceGovernor, CoreSpiritResourceLimitError } from './resourceGovernor.ts';
import {
  createCoreSpiritOutputSemantics,
  canCoreSpiritSubmitConfirmedLiveIntent,
  coreSpiritOutputSemanticsFromMetadata,
} from './executionSemantics.ts';
import { compareCoreSpiritConformance } from './coreSpiritConformanceLab.ts';

const safetyReport = {
  version: 1,
  causality: 'causal',
  lookahead: 'false',
  realtimeSafe: true,
  backtestLiveEquivalent: true,
  nodes: [],
  warnings: [],
  errors: [],
};
const forming = createCoreSpiritOutputSemantics({
  barPhase: 'forming', executionMode: 'realtime', isRealtime: true, isConfirmed: false,
}, safetyReport);
assert.equal(forming.isConfirmed, false);
assert.equal(canCoreSpiritSubmitConfirmedLiveIntent(forming), false,
  'a forming candle is always provisional, even if the indicator is causal');

const confirmed = createCoreSpiritOutputSemantics({
  barPhase: 'confirmed', executionMode: 'realtime', isRealtime: true, isConfirmed: true,
}, safetyReport);
assert.equal(confirmed.isConfirmed, true);
assert.equal(canCoreSpiritSubmitConfirmedLiveIntent(confirmed), true,
  'only a confirmed realtime bar with proven causal/no-lookahead/realtime-safe metadata can authorize live intent dispatch');
assert.equal(canCoreSpiritSubmitConfirmedLiveIntent(createCoreSpiritOutputSemantics({
  barPhase: 'confirmed', executionMode: 'realtime', isRealtime: true, isConfirmed: true,
}, undefined)), false, 'missing repaint evidence fails closed');
assert.equal(canCoreSpiritSubmitConfirmedLiveIntent(createCoreSpiritOutputSemantics({
  barPhase: 'confirmed', executionMode: 'replay', isRealtime: false, isConfirmed: true,
}, safetyReport)), false, 'replay cannot be promoted to live execution authority');
assert.equal(canCoreSpiritSubmitConfirmedLiveIntent(createCoreSpiritOutputSemantics({
  barPhase: 'confirmed', executionMode: 'realtime', isRealtime: true, isConfirmed: true,
}, { ...safetyReport, lookahead: 'true' })), false, 'lookahead-enabled programs cannot trigger live broker execution');
assert.equal(coreSpiritOutputSemanticsFromMetadata({ coreSpiritExecution: confirmed })?.barPhase, 'confirmed');

let clock = 100;
const governor = new CoreSpiritResourceGovernor({
  maxInstructionsPerRevision: 2,
  maxLookbackBars: 10,
  maxMemoryBytesPerRevision: 1024,
  maxVisualObjectsPerRevision: 1,
  maxDependenciesPerRevision: 2,
  maxDataRequestsPerRevision: 2,
  maxModelCallsPerRevision: 1,
  maxMultiSymbolRequestsPerRevision: 1,
  maxMultiTimeframeRequestsPerRevision: 1,
  maxExecutionTimeMs: 10,
}, () => clock);
governor.beginRevision(12, 'forming');
governor.consumeInstructions();
governor.consumeInstructions();
assert.throws(() => governor.consumeInstructions(), error =>
  error instanceof CoreSpiritResourceLimitError && error.resource === 'maxInstructionsPerRevision');
assert.throws(() => governor.assertLookback(11), error =>
  error instanceof CoreSpiritResourceLimitError && error.resource === 'maxLookbackBars');
governor.assertLookback(10);
governor.assertDependencies(['close', 'ema']);
assert.throws(() => governor.assertDependencies(['close', 'ema', 'mtf']), error =>
  error instanceof CoreSpiritResourceLimitError && error.resource === 'maxDependenciesPerRevision');
governor.recordDataRequest({ symbol: 'NSE:NIFTY50-INDEX', timeframe: '5m', field: 'close' });
governor.recordDataRequest({ symbol: 'NSE:NIFTY50-INDEX', timeframe: '5m', field: 'volume' });
assert.throws(() => governor.recordDataRequest({ symbol: 'NSE:BANKNIFTY-INDEX', timeframe: '15m', field: 'close' }), error =>
  error instanceof CoreSpiritResourceLimitError && (error.resource === 'maxDataRequestsPerRevision' || error.resource === 'maxMultiSymbolRequestsPerRevision'));
governor.recordModelCall();
assert.throws(() => governor.recordModelCall(), error =>
  error instanceof CoreSpiritResourceLimitError && error.resource === 'maxModelCallsPerRevision');
governor.recordOutput({ kind: 'label', id: 'one', time: 1, price: 10, text: 'x' });
assert.throws(() => governor.recordOutput({ kind: 'line', id: 'two', start: { time: 1, price: 1 }, end: { time: 2, price: 2 } }), error =>
  error instanceof CoreSpiritResourceLimitError && error.resource === 'maxVisualObjectsPerRevision');
clock += 11;
assert.throws(() => governor.assertExecutionTime(), error =>
  error instanceof CoreSpiritResourceLimitError && error.resource === 'maxExecutionTimeMs');

const reference = {
  engine: 'pine-reference',
  engineVersion: 'pinned-reference-1',
  symbol: 'NSE:NIFTY50-INDEX',
  timeframe: '5m',
  inputChecksum: 'inputs-v1',
  parametersChecksum: 'params-v1',
  bars: [
    { barIndex: 0, timestamp: 1000, phase: 'historical', series: { fast: null, close: 100 } },
    { barIndex: 1, timestamp: 1300, phase: 'confirmed', series: { fast: 100.5, close: 101 } },
  ],
  dataSamples: [{
    id: 'nifty-15m-close-900',
    symbol: 'NSE:NIFTY50-INDEX',
    timeframe: '15m',
    field: 'close',
    asOfTimestamp: 1300,
    sampleTimestamp: 600,
    closeTimestamp: 1500,
    value: 100,
    confirmation: 'confirmed',
  }],
  drawings: [
    { sequence: 1, action: 'create', objectId: 'ob:1', kind: 'box', barIndex: 1, timestamp: 1300, geometry: { left: 1000, right: 1300, top: 102, bottom: 99 } },
    { sequence: 2, action: 'extend', objectId: 'ob:1', kind: 'box', barIndex: 1, timestamp: 1600, geometry: { left: 1000, right: 1600, top: 102, bottom: 99 } },
  ],
  events: [
    { sequence: 1, eventId: 'entry:1', kind: 'strategy', name: 'LONG', barIndex: 1, timestamp: 1300, phase: 'confirmed', isConfirmed: true, side: 'long' },
    { sequence: 2, eventId: 'alert:1', kind: 'alert', name: 'cross', barIndex: 1, timestamp: 1300, phase: 'confirmed', isConfirmed: true },
  ],
};
const matching = { ...reference, engine: 'corespirit' };
const match = compareCoreSpiritConformance(reference, matching);
assert.equal(match.passed, true, 'identical reference and CoreSpirit traces must pass');
assert.equal(match.comparedSeriesValues, 4);
assert.equal(match.comparedDrawingChanges, 2);
assert.equal(match.comparedEvents, 2);

const diverged = {
  ...matching,
  bars: matching.bars.map((bar, index) => index === 1
    ? { ...bar, series: { ...bar.series, fast: 100.75 } }
    : bar),
  dataSamples: [{ ...matching.dataSamples[0], closeTimestamp: 1600, confirmation: 'developing' }],
  drawings: matching.drawings.slice(0, 1),
  events: [{ ...matching.events[0], phase: 'forming', isConfirmed: false }],
};
const mismatch = compareCoreSpiritConformance(reference, diverged, { maxMismatches: 10 });
assert.equal(mismatch.passed, false);
assert.ok(mismatch.mismatches.some(item => item.category === 'series-value' && item.key === 'fast' && item.barIndex === 1));
assert.ok(mismatch.mismatches.some(item => item.category === 'mtf-alignment' && item.reason.includes('future-looking')));
assert.ok(mismatch.mismatches.some(item => item.category === 'drawing-lifecycle'));
assert.ok(mismatch.mismatches.some(item => item.category === 'event-timing'));
assert.throws(() => compareCoreSpiritConformance(reference, matching, { maxMismatches: 0 }), /positive integer/);

const runtimeSource = fs.readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8');
const outputSource = fs.readFileSync(new URL('./outputCollector.ts', import.meta.url), 'utf8');
const automationSource = fs.readFileSync(new URL('./automationPipeline.ts', import.meta.url), 'utf8');
assert.ok(runtimeSource.includes("this.executeBar({ ...current }, 'confirmed')"),
  'a live bar is re-evaluated using final OHLC before confirmation is committed');
assert.ok(runtimeSource.includes('canDispatchConfirmedStrategyEvent()'),
  'forming or non-causal live events are prevented from reaching the event router');
assert.ok(outputSource.includes('coreSpiritExecution: this.semantics'),
  'every emitted output carries its bar phase and repaint/lookahead evidence');
assert.ok(automationSource.includes('forming-bar strategy events are provisional'),
  'the automation pipeline independently rejects forming-bar order triggers before risk evaluation');
assert.ok(automationSource.includes('event.realtimeSafe !== true'),
  'live automation requires independently proven realtime-safe causality');

console.log('CORESPIRIT_EXECUTION_SAFETY_AND_CONFORMANCE_CONTRACT_OK');
