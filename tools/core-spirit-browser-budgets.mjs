const BUDGET_ENV = Object.freeze([
  ['firstPlotReadyMs', 'TCO_SMC_MAX_FIRST_PLOT_MS'],
  ['recompilePlotReadyP95Ms', 'TCO_SMC_MAX_RECOMPILE_P95_MS'],
  ['p95FrameGapMs', 'TCO_SMC_MAX_P95_FRAME_GAP_MS'],
  ['heapDeltaAcrossRecompileSamplesBytes', 'TCO_SMC_MAX_HEAP_GROWTH_BYTES'],
]);

/**
 * Compare real browser measurements with optional runner-calibrated limits.
 * Missing telemetry is a failure only when that metric budget is configured.
 */
export function evaluateCoreSpiritBrowserBudgets(observed, environment = {}) {
  const checks = [];
  for (const [metric, envName] of BUDGET_ENV) {
    const rawLimit = environment[envName];
    if (rawLimit === undefined || rawLimit === null || String(rawLimit).trim() === '') continue;
    const limit = Number(rawLimit);
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new Error(envName + ' must be a finite positive number.');
    }
    const rawObserved = observed?.[metric];
    const value = typeof rawObserved === 'number' && Number.isFinite(rawObserved) ? rawObserved : null;
    checks.push(Object.freeze({
      metric,
      envName,
      observed: value,
      limit,
      passed: value !== null && value <= limit,
    }));
  }
  return Object.freeze({
    configured: checks.length > 0,
    passed: checks.every(check => check.passed),
    checks: Object.freeze(checks),
  });
}
