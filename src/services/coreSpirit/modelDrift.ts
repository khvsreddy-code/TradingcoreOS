/**
 * Read-only, schema-pinned monitoring for model feature quality and distribution drift.
 *
 * This module never trains, promotes, predicts, or changes an artifact. It deliberately
 * requires timestamped observations and reports insufficient evidence rather than
 * treating a small or malformed sample as healthy.
 */
export type CoreSpiritFeaturePhase = 'historical' | 'confirmed' | 'developing' | 'realtime' | 'forecast';

export type CoreSpiritFeatureObservation = Readonly<{
  timestamp: number;
  availableAt: number;
  confirmed: boolean;
  phase: CoreSpiritFeaturePhase;
  values: readonly (number | null)[];
}>;

export type CoreSpiritFeatureDriftOptions = Readonly<{
  minimumBaselineRows?: number;
  minimumObservedRows?: number;
  warningPsi?: number;
  criticalPsi?: number;
  warningMissingRate?: number;
  criticalMissingRate?: number;
}>;

export type CoreSpiritFeatureDriftReport = Readonly<{
  protocol: 'corespirit-feature-drift-v1';
  status: 'healthy' | 'warning' | 'critical' | 'insufficient-evidence';
  artifactHash: string;
  featureSchemaHash: string;
  baselineRows: number;
  observedRows: number;
  eligibleObservedRows: number;
  temporalViolations: number;
  features: readonly Readonly<{
    name: string;
    baselineValidCount: number;
    observedValidCount: number;
    missingRate: number;
    invalidRate: number;
    populationStabilityIndex: number | null;
    status: 'healthy' | 'warning' | 'critical' | 'insufficient-evidence';
  }>[];
  blockers: readonly string[];
  warnings: readonly string[];
}>;

const MAX_ROWS = 100_000;
const MAX_FEATURES = 128;
const HASH = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validateSchema(featureNames: readonly string[]): void {
  if (!Array.isArray(featureNames) || featureNames.length < 1 || featureNames.length > MAX_FEATURES ||
      featureNames.some(name => typeof name !== 'string' || !name.trim() || name.length > 100) ||
      new Set(featureNames).size !== featureNames.length) {
    throw new Error('Feature drift monitoring requires 1–128 unique, non-empty feature names.');
  }
}

function validateRows(rows: readonly CoreSpiritFeatureObservation[], width: number, label: string): void {
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) {
    throw new Error(label + ' observations must be an array with at most 100,000 rows.');
  }
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isRecord(row) || !Number.isSafeInteger(row.timestamp) || !Number.isSafeInteger(row.availableAt) ||
        row.timestamp <= previousTimestamp || !Array.isArray(row.values) || row.values.length !== width ||
        typeof row.confirmed !== 'boolean' ||
        !['historical', 'confirmed', 'developing', 'realtime', 'forecast'].includes(String(row.phase))) {
      throw new Error(label + ' observation ' + index + ' has an invalid timestamp, phase, confirmation flag, or feature schema.');
    }
    if (row.availableAt > row.timestamp && row.phase !== 'forecast') {
      throw new Error(label + ' observation ' + index + ' contains a feature unavailable at its decision timestamp.');
    }
    previousTimestamp = row.timestamp;
  }
}

function quantile(sorted: readonly number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function makeBins(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  // Quantile edges are learned from baseline only, never from the monitored window.
  const edges = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    .map(fraction => quantile(sorted, fraction));
  return [...new Set(edges)].sort((a, b) => a - b);
}

function histogram(values: readonly number[], edges: readonly number[]): number[] {
  const counts = Array.from({ length: edges.length + 1 }, () => 0);
  for (const value of values) {
    let bin = 0;
    while (bin < edges.length && value > edges[bin]!) bin += 1;
    counts[bin] += 1;
  }
  return counts;
}

function psi(expected: readonly number[], actual: readonly number[]): number {
  const expectedTotal = expected.reduce((sum, value) => sum + value, 0);
  const actualTotal = actual.reduce((sum, value) => sum + value, 0);
  if (!expectedTotal || !actualTotal) return Number.POSITIVE_INFINITY;
  let result = 0;
  for (let index = 0; index < expected.length; index += 1) {
    // Smoothing avoids log(0) while remaining explicit and deterministic.
    const expectedRate = Math.max(expected[index]! / expectedTotal, 1e-6);
    const actualRate = Math.max(actual[index]! / actualTotal, 1e-6);
    result += (actualRate - expectedRate) * Math.log(actualRate / expectedRate);
  }
  return result;
}

function featureStatus(
  score: number | null,
  missingRate: number,
  invalidRate: number,
  options: Required<CoreSpiritFeatureDriftOptions>,
): 'healthy' | 'warning' | 'critical' | 'insufficient-evidence' {
  if (score === null) return 'insufficient-evidence';
  if (score >= options.criticalPsi || missingRate >= options.criticalMissingRate || invalidRate >= options.criticalMissingRate) return 'critical';
  if (score >= options.warningPsi || missingRate >= options.warningMissingRate || invalidRate >= options.warningMissingRate) return 'warning';
  return 'healthy';
}

/**
 * Compare confirmed historical baseline feature distributions with a later observation
 * window. This is a monitoring report only; callers must not auto-promote or trade from it.
 */
export function monitorCoreSpiritFeatureDrift(input: {
  artifactHash: string;
  featureSchemaHash: string;
  featureNames: readonly string[];
  baseline: readonly CoreSpiritFeatureObservation[];
  observed: readonly CoreSpiritFeatureObservation[];
  options?: CoreSpiritFeatureDriftOptions;
}): CoreSpiritFeatureDriftReport {
  validateSchema(input.featureNames);
  if (!HASH.test(input.artifactHash) || !HASH.test(input.featureSchemaHash)) {
    throw new Error('Feature drift monitoring requires artifact and feature-schema SHA-256 hashes.');
  }
  const options: Required<CoreSpiritFeatureDriftOptions> = {
    minimumBaselineRows: input.options?.minimumBaselineRows ?? 100,
    minimumObservedRows: input.options?.minimumObservedRows ?? 30,
    warningPsi: input.options?.warningPsi ?? 0.1,
    criticalPsi: input.options?.criticalPsi ?? 0.25,
    warningMissingRate: input.options?.warningMissingRate ?? 0.05,
    criticalMissingRate: input.options?.criticalMissingRate ?? 0.2,
  };
  if (!Number.isSafeInteger(options.minimumBaselineRows) || options.minimumBaselineRows < 20 ||
      !Number.isSafeInteger(options.minimumObservedRows) || options.minimumObservedRows < 10 ||
      !Number.isFinite(options.warningPsi) || options.warningPsi < 0 ||
      !Number.isFinite(options.criticalPsi) || options.criticalPsi <= options.warningPsi ||
      !Number.isFinite(options.warningMissingRate) || options.warningMissingRate < 0 || options.warningMissingRate > 1 ||
      !Number.isFinite(options.criticalMissingRate) || options.criticalMissingRate <= options.warningMissingRate || options.criticalMissingRate > 1) {
    throw new Error('Feature drift thresholds or minimum sample sizes are invalid.');
  }
  validateRows(input.baseline, input.featureNames.length, 'Baseline');
  validateRows(input.observed, input.featureNames.length, 'Observed');

  const blockers: string[] = [];
  const warnings: string[] = [];
  const baselineEligible = input.baseline.filter(row => row.confirmed && (row.phase === 'historical' || row.phase === 'confirmed'));
  const observedEligible = input.observed.filter(row => row.phase !== 'forecast' && row.phase !== 'developing' && row.confirmed);
  const temporalViolations = input.observed.filter(row => row.availableAt > row.timestamp || row.phase === 'forecast' || row.phase === 'developing' || !row.confirmed).length;

  if (baselineEligible.length < options.minimumBaselineRows) blockers.push('Baseline has too few confirmed historical observations.');
  if (observedEligible.length < options.minimumObservedRows) blockers.push('Observed window has too few confirmed, causally available observations.');
  if (temporalViolations > 0) warnings.push(temporalViolations + ' observed rows were excluded because they were developing, forecast, unconfirmed, or temporally unavailable.');

  const features = input.featureNames.map((name, featureIndex) => {
    const baselineRaw = baselineEligible.map(row => row.values[featureIndex]);
    const observedRaw = observedEligible.map(row => row.values[featureIndex]);
    const baselineValid = baselineRaw.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const observedValid = observedRaw.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const missingRate = observedEligible.length ? observedRaw.filter(value => value === null || value === undefined).length / observedEligible.length : 1;
    const invalidRate = observedEligible.length ? observedRaw.filter(value => typeof value !== 'number' || !Number.isFinite(value)).length / observedEligible.length : 1;
    const enoughData = baselineEligible.length >= options.minimumBaselineRows &&
      observedEligible.length >= options.minimumObservedRows &&
      baselineValid.length >= options.minimumBaselineRows * 0.8 &&
      observedValid.length >= options.minimumObservedRows * 0.8;
    const edges = baselineValid.length ? makeBins(baselineValid) : [];
    const score = enoughData && edges.length > 0
      ? psi(histogram(baselineValid, edges), histogram(observedValid, edges))
      : null;
    const status = featureStatus(score, missingRate, invalidRate, options);
    if (status === 'critical') blockers.push('Feature "' + name + '" crossed a critical drift or data-quality threshold.');
    else if (status === 'warning') warnings.push('Feature "' + name + '" crossed a warning drift or data-quality threshold.');
    else if (status === 'insufficient-evidence') warnings.push('Feature "' + name + '" has insufficient valid samples to assess drift.');
    return Object.freeze({
      name,
      baselineValidCount: baselineValid.length,
      observedValidCount: observedValid.length,
      missingRate,
      invalidRate,
      populationStabilityIndex: score !== null && Number.isFinite(score) ? score : null,
      status,
    });
  });

  const insufficient = blockers.some(message => message.includes('too few')) ||
    features.some(feature => feature.status === 'insufficient-evidence');
  const status = insufficient ? 'insufficient-evidence' : blockers.length ? 'critical' : warnings.length ? 'warning' : 'healthy';
  return Object.freeze({
    protocol: 'corespirit-feature-drift-v1' as const,
    status,
    artifactHash: input.artifactHash,
    featureSchemaHash: input.featureSchemaHash,
    baselineRows: baselineEligible.length,
    observedRows: input.observed.length,
    eligibleObservedRows: observedEligible.length,
    temporalViolations,
    features: Object.freeze(features),
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
  });
}
