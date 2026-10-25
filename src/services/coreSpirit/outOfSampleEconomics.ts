export type CoreSpiritOutOfSampleObservation = Readonly<{
  /** Timestamp of the decision made without access to the outcome. */
  timestamp: number;
  /** First timestamp when the complete realized outcome is available. */
  outcomeAvailableAt: number;
  confirmed: boolean;
  phase: 'historical' | 'confirmed' | 'developing' | 'realtime' | 'forecast';
  /** Target portfolio position at decision time, normalized to [-1, 1]. */
  position: number;
  /** Simple realized return over the non-overlapping outcome interval. */
  realizedReturn: number;
}>;

export type CoreSpiritOutOfSampleSplit = Readonly<{
  trainingEnd: number;
  validationStart: number;
  validationEnd: number;
  datasetHash: string;
  modelArtifactHash: string;
}>;

export type CoreSpiritOutOfSampleEconomicsOptions = Readonly<{
  transactionCostBps: number;
  slippageBps: number;
  /** Required for annualization; omitted means no assumed bar frequency. */
  periodsPerYear?: number;
  /** Stability is measured over complete, non-overlapping validation windows. */
  stabilityWindowSize?: number;
}>;

export type CoreSpiritOutOfSampleEconomicsReport = Readonly<{
  protocol: 'out-of-sample-economic-v1';
  status: 'computed';
  sampleCount: number;
  validationRange: Readonly<{ start: string; end: string }>;
  provenance: Readonly<{
    datasetHash: string;
    modelArtifactHash: string;
    trainingEnd: string;
    validationStart: string;
    validationEnd: string;
    allLabelsAvailableWithinValidationWindow: true;
    nonOverlappingOutcomes: true;
  }>;
  assumptions: Readonly<{
    transactionCostBps: number;
    slippageBps: number;
    periodsPerYear: number | null;
    stabilityWindowSize: number;
    positionBounds: readonly [-1, 1];
    returnType: 'simple-return';
  }>;
  metrics: Readonly<{
    grossTotalReturn: number;
    returnAfterTransactionCosts: number;
    netTotalReturn: number;
    transactionCostDrag: number;
    slippageDrag: number;
    totalTurnover: number;
    averageTurnoverPerObservation: number;
    maxDrawdown: number;
    annualizedReturn: number | null;
  }>;
  stability: Readonly<{
    status: 'measured' | 'insufficient-windows';
    windowSize: number;
    windowReturns: readonly number[];
    positiveWindowFraction: number | null;
    returnDispersion: number | null;
  }>;
}>;

const MAX_ECONOMIC_EVALUATION_ROWS = 1_000_000;
const BASIS_POINT_DIVISOR = 10_000;

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function compound(returns: readonly number[]): number {
  let equity = 1;
  for (const value of returns) equity *= 1 + value;
  return equity - 1;
}

function populationStdDev(values: readonly number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

/**
 * Compute cost-aware strategy metrics only from a separately supplied chronological
 * holdout. This function does not train models, fetch prices, create orders, or infer
 * positions. The caller must provide predictions/positions recorded at decision time.
 */
export function evaluateCoreSpiritOutOfSampleEconomics(
  observations: readonly CoreSpiritOutOfSampleObservation[],
  split: CoreSpiritOutOfSampleSplit,
  options: CoreSpiritOutOfSampleEconomicsOptions,
): CoreSpiritOutOfSampleEconomicsReport {
  if (!Array.isArray(observations) || observations.length < 2 || observations.length > MAX_ECONOMIC_EVALUATION_ROWS) {
    throw new Error('Out-of-sample economics requires 2–1,000,000 observations.');
  }
  if (!split || !Number.isSafeInteger(split.trainingEnd) ||
      !Number.isSafeInteger(split.validationStart) || !Number.isSafeInteger(split.validationEnd) ||
      split.trainingEnd >= split.validationStart || split.validationStart >= split.validationEnd) {
    throw new Error('The training period must end strictly before a non-empty validation window.');
  }
  if (!isHash(split.datasetHash) || !isHash(split.modelArtifactHash)) {
    throw new Error('Out-of-sample economics requires dataset and model artifact SHA-256 hashes.');
  }
  if (!Number.isFinite(options.transactionCostBps) || options.transactionCostBps < 0 || options.transactionCostBps > 1_000 ||
      !Number.isFinite(options.slippageBps) || options.slippageBps < 0 || options.slippageBps > 1_000) {
    throw new Error('Transaction-cost and slippage assumptions must each be between 0 and 1,000 basis points.');
  }
  const periodsPerYear = options.periodsPerYear;
  if (periodsPerYear !== undefined && (!Number.isSafeInteger(periodsPerYear) || periodsPerYear < 1 || periodsPerYear > 1_000_000)) {
    throw new Error('periodsPerYear must be an explicit positive integer when annualization is requested.');
  }
  const windowSize = options.stabilityWindowSize ?? 20;
  if (!Number.isSafeInteger(windowSize) || windowSize < 2 || windowSize > 250) {
    throw new Error('stabilityWindowSize must be an integer from 2 to 250.');
  }

  const rows = observations;
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  let previousOutcomeAvailability = Number.NEGATIVE_INFINITY;
  let previousPosition = 0;
  let totalTurnover = 0;
  let grossEquity = 1;
  let costOnlyEquity = 1;
  let netEquity = 1;
  let peakEquity = 1;
  let maxDrawdown = 0;
  const netReturns: number[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    if (!row || typeof row !== 'object' ||
        !Number.isSafeInteger(row.timestamp) || !Number.isSafeInteger(row.outcomeAvailableAt) ||
        row.timestamp < split.validationStart || row.timestamp > split.validationEnd ||
        row.outcomeAvailableAt <= row.timestamp || row.outcomeAvailableAt > split.validationEnd ||
        row.timestamp <= previousTimestamp ||
        (index > 0 && previousOutcomeAvailability > row.timestamp) ||
        row.confirmed !== true || (row.phase !== 'historical' && row.phase !== 'confirmed') ||
        !Number.isFinite(row.position) || row.position < -1 || row.position > 1 ||
        !Number.isFinite(row.realizedReturn) || row.realizedReturn <= -1) {
      throw new Error('Observation ' + index + ' is invalid, non-causal, unconfirmed, overlapping, outside the holdout, or contains an unsupported position/return.');
    }

    const turnover = Math.abs(row.position - previousPosition);
    const transactionCost = turnover * options.transactionCostBps / BASIS_POINT_DIVISOR;
    const slippageCost = turnover * options.slippageBps / BASIS_POINT_DIVISOR;
    const grossReturn = row.position * row.realizedReturn;
    const afterTransactionReturn = grossReturn - transactionCost;
    const netReturn = afterTransactionReturn - slippageCost;
    if (grossReturn <= -1 || afterTransactionReturn <= -1 || netReturn <= -1) {
      throw new Error('Observation ' + index + ' implies equity depletion; evaluate it with an explicit margin/liquidation model instead.');
    }

    grossEquity *= 1 + grossReturn;
    costOnlyEquity *= 1 + afterTransactionReturn;
    netEquity *= 1 + netReturn;
    peakEquity = Math.max(peakEquity, netEquity);
    if (peakEquity > 0) maxDrawdown = Math.max(maxDrawdown, (peakEquity - netEquity) / peakEquity);

    netReturns.push(netReturn);
    totalTurnover += turnover;
    previousTimestamp = row.timestamp;
    previousOutcomeAvailability = row.outcomeAvailableAt;
    previousPosition = row.position;
  }

  const grossTotalReturn = grossEquity - 1;
  const returnAfterTransactionCosts = costOnlyEquity - 1;
  const netTotalReturn = netEquity - 1;
  const windowReturns: number[] = [];
  for (let start = 0; start + windowSize <= netReturns.length; start += windowSize) {
    windowReturns.push(compound(netReturns.slice(start, start + windowSize)));
  }
  const stabilityMeasured = windowReturns.length >= 2;
  const annualizedReturn = periodsPerYear === undefined
    ? null
    : netEquity ** (periodsPerYear / rows.length) - 1;

  return Object.freeze({
    protocol: 'out-of-sample-economic-v1' as const,
    status: 'computed' as const,
    sampleCount: rows.length,
    validationRange: Object.freeze({
      start: new Date(split.validationStart).toISOString(),
      end: new Date(split.validationEnd).toISOString(),
    }),
    provenance: Object.freeze({
      datasetHash: split.datasetHash,
      modelArtifactHash: split.modelArtifactHash,
      trainingEnd: new Date(split.trainingEnd).toISOString(),
      validationStart: new Date(split.validationStart).toISOString(),
      validationEnd: new Date(split.validationEnd).toISOString(),
      allLabelsAvailableWithinValidationWindow: true as const,
      nonOverlappingOutcomes: true as const,
    }),
    assumptions: Object.freeze({
      transactionCostBps: options.transactionCostBps,
      slippageBps: options.slippageBps,
      periodsPerYear: periodsPerYear ?? null,
      stabilityWindowSize: windowSize,
      positionBounds: Object.freeze([-1, 1]) as readonly [-1, 1],
      returnType: 'simple-return' as const,
    }),
    metrics: Object.freeze({
      grossTotalReturn,
      returnAfterTransactionCosts,
      netTotalReturn,
      transactionCostDrag: grossTotalReturn - returnAfterTransactionCosts,
      slippageDrag: returnAfterTransactionCosts - netTotalReturn,
      totalTurnover,
      averageTurnoverPerObservation: totalTurnover / rows.length,
      maxDrawdown,
      annualizedReturn,
    }),
    stability: Object.freeze({
      status: stabilityMeasured ? 'measured' as const : 'insufficient-windows' as const,
      windowSize,
      windowReturns: Object.freeze(windowReturns),
      positiveWindowFraction: stabilityMeasured
        ? windowReturns.filter(value => value > 0).length / windowReturns.length
        : null,
      returnDispersion: stabilityMeasured ? populationStdDev(windowReturns) : null,
    }),
  });
}
