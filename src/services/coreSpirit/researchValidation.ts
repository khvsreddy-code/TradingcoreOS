/** Causal data guards shared by CoreSpirit research APIs and the isolated training worker. */
export type ResearchTemporalPhase = 'historical' | 'confirmed' | 'developing' | 'realtime' | 'forecast';
export type ResearchFeatureRow = Readonly<{
  timestamp: number;
  availableAt: number;
  confirmed: boolean;
  phase: ResearchTemporalPhase;
  values: readonly number[];
  source?: 'fyers' | 'tvdatafeed' | 'trusted_feature_pipeline' | 'user_supplied';
  revision?: number;
}>;
export type ResearchDateRange = Readonly<{ from: string; to: string }>;
export const DEFAULT_RESEARCH_VALIDATION_FRACTION = 0.2;
export const MIN_RESEARCH_VALIDATION_ROWS = 12;
export const DEFAULT_RESEARCH_MAX_ROWS = 1024;
export const CORESPIRIT_MAX_DATASET_ROWS = 1_000_000;

export type ChronologicalResearchSplit<T extends ResearchFeatureRow> = Readonly<{
  trainingRows: readonly T[];
  validationRows: readonly T[];
  trainingRange: ResearchDateRange;
  validationRange: ResearchDateRange;
  validationFraction: number;
  purgedCount: number;
  validationProtocol: 'chronological-holdout-v1' | 'purged-chronological-v1';
}>;

function isoRange(rows: readonly ResearchFeatureRow[]): ResearchDateRange {
  if (rows.length < 2) throw new Error('A research time range needs at least two observations.');
  return Object.freeze({
    from: new Date(rows[0]!.timestamp).toISOString(),
    to: new Date(rows[rows.length - 1]!.timestamp).toISOString(),
  });
}

/** A training row is a decision-time observation, not a forming candle. */
export function validateConfirmedResearchRows<T extends ResearchFeatureRow>(
  rows: readonly T[],
  featureNames: readonly string[],
  options: { maxRows?: number } = {},
): T[] {
  const maxRows = Math.max(1, Math.min(CORESPIRIT_MAX_DATASET_ROWS, Math.floor(options.maxRows ?? DEFAULT_RESEARCH_MAX_ROWS)));
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > maxRows) {
    throw new Error('Research rows must contain 1–' + maxRows + ' observations for this pipeline.');
  }
  if (!featureNames.length || featureNames.length > 16 ||
      featureNames.some(name => typeof name !== 'string' || !name.trim()) ||
      new Set(featureNames).size !== featureNames.length) {
    throw new Error('Research feature names must be 1–16 unique, non-empty names.');
  }
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  return rows.map((row, index) => {
    if (!row || typeof row !== 'object' ||
        Object.keys(row).some(key => !['timestamp','availableAt','confirmed','phase','values','source','revision'].includes(key)) ||
        typeof row.timestamp !== 'number' || !Number.isSafeInteger(row.timestamp) ||
        typeof row.availableAt !== 'number' || !Number.isSafeInteger(row.availableAt) ||
        row.availableAt > row.timestamp ||
        row.confirmed !== true ||
        (row.phase !== 'historical' && row.phase !== 'confirmed') ||
        !Array.isArray(row.values) || row.values.length !== featureNames.length ||
        row.values.some(value => typeof value !== 'number' || !Number.isFinite(value)) ||
        (row.source !== undefined && !['fyers','tvdatafeed','trusted_feature_pipeline','user_supplied'].includes(row.source)) ||
        (row.revision !== undefined && (!Number.isSafeInteger(row.revision) || row.revision < 0))) {
      throw new Error('Research row ' + index + ' must contain finite feature values from confirmed historical data, with availableAt <= decision timestamp. Developing, realtime, forecast, and unconfirmed rows are forbidden.');
    }
    if (row.timestamp <= previousTimestamp) {
      throw new Error('Research rows must be strictly chronological with unique decision timestamps.');
    }
    previousTimestamp = row.timestamp;
    return Object.freeze({ ...row, values: Object.freeze([...row.values]) }) as T;
  });
}

/** Keep labels/targets/outcomes separate from the unsupervised HMM input vector. */
export function assertNoKnownLabelLeakage(featureNames: readonly string[]): void {
  const forbidden = /(?:^|[^a-z0-9])(label|target|outcome|realized|future|forward|lookahead|next(?:[_-]?bar)?|lead(?:[_-]?\d+)?)(?:$|[^a-z0-9])/i;
  // Normalize common identifier styles before checking: camelCase and PascalCase
  // must not bypass the guard that already catches snake_case feature names.
  const normalizeFeatureName = (name: string) => name.trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_');
  const leaked = featureNames.filter(name => forbidden.test(normalizeFeatureName(name)));
  if (leaked.length) {
    throw new Error('Potential target/label leakage in model feature names: ' + leaked.join(', ') +
      '. Keep labels and future outcomes outside the input feature vector.');
  }
}

/** A strict chronological holdout; never random-shuffle time-series observations. */
export function splitChronologicalResearchRows<T extends ResearchFeatureRow>(
  rows: readonly T[],
  validationFraction = DEFAULT_RESEARCH_VALIDATION_FRACTION,
  minimumTrainingRows = 12,
  minimumValidationRows = MIN_RESEARCH_VALIDATION_ROWS,
  options: { maxRows?: number; purgeBars?: number } = {},
): ChronologicalResearchSplit<T> {
  if (!Number.isFinite(validationFraction) || validationFraction < 0.1 || validationFraction > 0.4) {
    throw new Error('validationFraction must be between 0.10 and 0.40 for chronological holdout validation.');
  }
  if (!Number.isInteger(minimumTrainingRows) || minimumTrainingRows < 12 ||
      !Number.isInteger(minimumValidationRows) || minimumValidationRows < 12) {
    throw new Error('Chronological validation requires at least 12 training and 12 validation rows.');
  }
  const maxRows = Math.max(1, Math.min(CORESPIRIT_MAX_DATASET_ROWS, Math.floor(options.maxRows ?? DEFAULT_RESEARCH_MAX_ROWS)));
  const purgeBars = Math.max(0, Math.floor(options.purgeBars ?? 0));
  if (!Array.isArray(rows) || rows.length > maxRows) {
    throw new Error('Research datasets are limited to ' + maxRows + ' rows for this training backend.');
  }
  if (purgeBars > 500 || purgeBars >= rows.length) {
    throw new Error('Validation purge gap must be between 0 and 500 bars and smaller than the dataset.');
  }
  const evaluableRows = rows.length - purgeBars;
  const validationCount = Math.floor(evaluableRows * validationFraction);
  const trainingCount = evaluableRows - validationCount;
  if (trainingCount < minimumTrainingRows || validationCount < minimumValidationRows) {
    throw new Error('Not enough rows for a chronological holdout with ' + purgeBars + ' purged boundary bars: require at least ' +
      (minimumTrainingRows + minimumValidationRows + purgeBars) +
      ' total rows at the selected validationFraction.');
  }
  const trainingRows = rows.slice(0, trainingCount);
  const validationStart = trainingCount + purgeBars;
  const validationRows = rows.slice(validationStart);
  const trainingRange = isoRange(trainingRows);
  const validationRange = isoRange(validationRows);
  if (trainingRows[trainingRows.length - 1]!.timestamp >= validationRows[0]!.timestamp ||
      Date.parse(trainingRange.to) >= Date.parse(validationRange.from)) {
    throw new Error('Training and validation ranges overlap; temporal contamination is not permitted.');
  }
  return Object.freeze({
    trainingRows: Object.freeze([...trainingRows]),
    validationRows: Object.freeze([...validationRows]),
    trainingRange,
    validationRange,
    validationFraction: validationCount / evaluableRows,
    purgedCount: purgeBars,
    validationProtocol: purgeBars > 0 ? 'purged-chronological-v1' : 'chronological-holdout-v1',
  });
}
export type ResearchSafetySummary = Readonly<{
  version: 1;
  causality: string;
  lookahead: string;
  realtimeSafe: boolean | 'unknown';
  backtestLiveEquivalent: boolean | 'unknown';
  approvalEligible: boolean;
  blockers: readonly string[];
  warnings: readonly string[];
}>;

const BLOCKING_CAUSALITY_CODES = new Set([
  'CAUSALITY_FUTURE_INDEX', 'CAUSALITY_FUTURE_CALL', 'CAUSALITY_DEVELOPING_HTF',
  'CAUSALITY_UNQUALIFIED_MTF', 'CAUSALITY_UNQUALIFIED_REQUEST',
  'CAUSALITY_DYNAMIC_REQUEST_ALIGNMENT', 'CAUSALITY_DEVELOPING_REQUEST',
  'CAUSALITY_INVALID_REQUEST_ALIGNMENT',
]);

export function summarizeResearchSafety(
  causality: { diagnostics: readonly Readonly<{ severity: string; code: string; message: string }>[] },
  repaint: {
    causality: string; lookahead: string; realtimeSafe: boolean | 'unknown';
    backtestLiveEquivalent: boolean | 'unknown'; warnings: readonly string[]; errors: readonly string[];
  },
): ResearchSafetySummary {
  const blockers = [
    ...causality.diagnostics
      .filter(item => item.severity === 'error' || BLOCKING_CAUSALITY_CODES.has(item.code))
      .map(item => item.code + ': ' + item.message),
    ...repaint.errors.map(message => 'REPAINT_SAFETY: ' + message),
  ];
  if (['future-dependent', 'noncausal', 'repainting'].includes(repaint.causality)) blockers.push('REPAINT_SAFETY: inferred causality is ' + repaint.causality);
  if (repaint.lookahead === 'true') blockers.push('REPAINT_SAFETY: source has inferred lookahead=true');
  if (repaint.realtimeSafe === false) blockers.push('REPAINT_SAFETY: source is not realtime-safe');
  const warnings = [
    ...causality.diagnostics.filter(item => item.severity === 'warning' && !BLOCKING_CAUSALITY_CODES.has(item.code))
      .map(item => item.code + ': ' + item.message),
    ...repaint.warnings,
  ];
  const approvalEligible = blockers.length === 0 && repaint.causality === 'causal' &&
    repaint.lookahead === 'false' && repaint.realtimeSafe === true && repaint.backtestLiveEquivalent === true;
  if (!approvalEligible && blockers.length === 0) {
    warnings.push('Static analysis could not prove causal, lookahead-free historical/realtime equivalence; keep this artifact research-only.');
  }
  return Object.freeze({
    version: 1 as const, causality: repaint.causality, lookahead: repaint.lookahead,
    realtimeSafe: repaint.realtimeSafe, backtestLiveEquivalent: repaint.backtestLiveEquivalent,
    approvalEligible, blockers: Object.freeze([...new Set(blockers)]), warnings: Object.freeze([...new Set(warnings)]),
  });
}
