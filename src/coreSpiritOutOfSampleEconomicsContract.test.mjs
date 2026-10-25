import assert from 'node:assert/strict';
import { evaluateCoreSpiritOutOfSampleEconomics } from './services/coreSpirit/outOfSampleEconomics.ts';

const start = Date.UTC(2026, 0, 1);
const returns = [0.02, 0.01, -0.04, 0.03, 0.015, -0.01, 0.025, 0.005];
const positions = [1, 1, 0, 1, 1, 0, -1, -1];
const observations = returns.map((realizedReturn, index) => ({
  timestamp: start + index * 1_000,
  outcomeAvailableAt: start + (index + 1) * 1_000,
  confirmed: true,
  phase: 'confirmed',
  position: positions[index],
  realizedReturn,
}));
const split = {
  trainingEnd: start - 1_000,
  validationStart: start,
  validationEnd: start + returns.length * 1_000,
  datasetHash: 'a'.repeat(64),
  modelArtifactHash: 'b'.repeat(64),
};

const report = evaluateCoreSpiritOutOfSampleEconomics(observations, split, {
  transactionCostBps: 5,
  slippageBps: 2,
  periodsPerYear: 252,
  stabilityWindowSize: 2,
});
assert.equal(report.protocol, 'out-of-sample-economic-v1');
assert.equal(report.status, 'computed');
assert.equal(report.sampleCount, 8);
assert.ok(report.metrics.grossTotalReturn > report.metrics.returnAfterTransactionCosts);
assert.ok(report.metrics.returnAfterTransactionCosts > report.metrics.netTotalReturn);
assert.ok(report.metrics.transactionCostDrag > 0);
assert.ok(report.metrics.slippageDrag > 0);
assert.ok(report.metrics.totalTurnover > 0);
assert.ok(report.metrics.averageTurnoverPerObservation > 0);
assert.ok(report.metrics.maxDrawdown >= 0 && report.metrics.maxDrawdown <= 1);
assert.ok(Number.isFinite(report.metrics.annualizedReturn));
assert.equal(report.stability.status, 'measured');
assert.equal(report.stability.windowReturns.length, 4);
assert.ok(report.stability.positiveWindowFraction !== null);
assert.ok(report.stability.returnDispersion !== null);
assert.equal(report.provenance.allLabelsAvailableWithinValidationWindow, true);
assert.equal(report.provenance.nonOverlappingOutcomes, true);
assert.equal(report.assumptions.transactionCostBps, 5);
assert.equal(report.assumptions.slippageBps, 2);

const short = evaluateCoreSpiritOutOfSampleEconomics(observations.slice(0, 3), {
  ...split, validationEnd: start + 3_000,
}, { transactionCostBps: 0, slippageBps: 0, stabilityWindowSize: 20 });
assert.equal(short.stability.status, 'insufficient-windows');
assert.equal(short.stability.positiveWindowFraction, null);
assert.equal(short.metrics.annualizedReturn, null, 'annualization must not guess a candle frequency');

assert.throws(() => evaluateCoreSpiritOutOfSampleEconomics(observations, {
  ...split, trainingEnd: split.validationStart,
}, { transactionCostBps: 5, slippageBps: 2 }), /strictly before/);
assert.throws(() => evaluateCoreSpiritOutOfSampleEconomics(
  observations.map((row, index) => index === 0 ? { ...row, outcomeAvailableAt: row.timestamp + 1_500 } : row),
  split, { transactionCostBps: 5, slippageBps: 2 },
), /overlapping/);
assert.throws(() => evaluateCoreSpiritOutOfSampleEconomics(
  observations.map((row, index) => index === 2 ? { ...row, phase: 'developing' } : row),
  split, { transactionCostBps: 5, slippageBps: 2 },
), /unconfirmed/);
assert.throws(() => evaluateCoreSpiritOutOfSampleEconomics(observations, split, {
  transactionCostBps: 1_001, slippageBps: 2,
}), /basis points/);
assert.throws(() => evaluateCoreSpiritOutOfSampleEconomics(observations, {
  ...split, datasetHash: 'not-a-hash',
}, { transactionCostBps: 5, slippageBps: 2 }), /SHA-256 hashes/);

console.log('CORESPIRIT_OUT_OF_SAMPLE_ECONOMICS_CONTRACT_OK');
