import assert from 'node:assert/strict';
import { evaluateCoreSpiritBrowserBudgets } from '../../../tools/core-spirit-browser-budgets.mjs';

const unconfigured = evaluateCoreSpiritBrowserBudgets({
  firstPlotReadyMs: 120,
  recompilePlotReadyP95Ms: 45,
}, {});
assert.deepEqual(unconfigured, { configured: false, passed: true, checks: [] },
  'developer runs without explicit budgets must remain diagnostic-only');

const passing = evaluateCoreSpiritBrowserBudgets({
  firstPlotReadyMs: 120,
  recompilePlotReadyP95Ms: 45,
  p95FrameGapMs: 18,
  heapDeltaAcrossRecompileSamplesBytes: 1_024,
}, {
  TCO_SMC_MAX_FIRST_PLOT_MS: '150',
  TCO_SMC_MAX_RECOMPILE_P95_MS: '60',
  TCO_SMC_MAX_P95_FRAME_GAP_MS: '20',
  TCO_SMC_MAX_HEAP_GROWTH_BYTES: '2048',
});
assert.equal(passing.configured, true);
assert.equal(passing.passed, true);
assert.equal(passing.checks.length, 4);
assert.ok(passing.checks.every(check => check.passed));

const failing = evaluateCoreSpiritBrowserBudgets({
  firstPlotReadyMs: 151,
  recompilePlotReadyP95Ms: 45,
  p95FrameGapMs: null,
  heapDeltaAcrossRecompileSamplesBytes: 1_024,
}, {
  TCO_SMC_MAX_FIRST_PLOT_MS: '150',
  TCO_SMC_MAX_P95_FRAME_GAP_MS: '20',
});
assert.equal(failing.passed, false);
assert.deepEqual(failing.checks.map(check => check.passed), [false, false],
  'a configured limit must fail on a regression or unavailable measurement');

assert.throws(() => evaluateCoreSpiritBrowserBudgets({}, {
  TCO_SMC_MAX_FIRST_PLOT_MS: 'NaN',
}), /must be a finite positive number/);
assert.throws(() => evaluateCoreSpiritBrowserBudgets({}, {
  TCO_SMC_MAX_HEAP_GROWTH_BYTES: '0',
}), /must be a finite positive number/);

console.log('CORESPIRIT_BROWSER_PERFORMANCE_BUDGET_CONTRACT_OK');
