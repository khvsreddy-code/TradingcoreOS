/**
 * Deterministic Gaussian hidden-Markov model kernels for CoreScript quant research.
 *
 * Inputs use row-major observations: observations[time][feature].
 * No network, random source, or broker capability is used by this module.
 */
export type NumericVector = readonly number[];
export type NumericMatrix = readonly NumericVector[];
export type HmmCovarianceMode = 'diagonal' | 'full';

export type GaussianHmmOptions = Readonly<{
  states: number;
  covariance?: HmmCovarianceMode;
  maxIterations?: number;
  tolerance?: number;
  varianceFloor?: number;
}>;

export type GaussianHmmModel = Readonly<{
  kind: 'GaussianHMM';
  states: number;
  dimensions: number;
  covarianceMode: HmmCovarianceMode;
  initial: readonly number[];
  transition: NumericMatrix;
  means: NumericMatrix;
  covariances: readonly NumericMatrix[];
  iterations: number;
  logLikelihood: number;
  converged: boolean;
}>;

const EPS = 1e-12;
const MAX_ELEMENTS = 1_000_000;

function finiteMatrix(input: NumericMatrix, label: string, minimumRows = 1): number[][] {
  if (!Array.isArray(input) || input.length < minimumRows) {
    throw new Error(label + ' must contain at least ' + minimumRows + ' observations');
  }
  const dimensions = input[0]?.length ?? 0;
  if (dimensions < 1) throw new Error(label + ' must contain at least one feature');
  if (input.length * dimensions > MAX_ELEMENTS) throw new Error(label + ' exceeds the numeric element limit');
  return input.map((row, i) => {
    if (!Array.isArray(row) || row.length !== dimensions) {
      throw new Error(label + ' must be a rectangular matrix; row ' + i + ' has the wrong width');
    }
    return row.map((value, j) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(label + '[' + i + '][' + j + '] must be finite');
      }
      return value;
    });
  });
}

function probabilities(input: NumericVector, length: number, label: string): number[] {
  if (!Array.isArray(input) || input.length !== length) {
    throw new Error(label + ' must have length ' + length);
  }
  const values = input.map((value, i) => {
    if (!Number.isFinite(value) || value < 0) throw new Error(label + '[' + i + '] must be finite and non-negative');
    return value;
  });
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!(total > EPS)) throw new Error(label + ' must have positive mass');
  return values.map(value => value / total);
}

function validateSquareMatrix(input: NumericMatrix, size: number, label: string): number[][] {
  const value = finiteMatrix(input, label, size);
  if (value.length !== size || value.some(row => row.length !== size)) {
    throw new Error(label + ' must be a ' + size + 'x' + size + ' square matrix');
  }
  return value;
}

function normalizeRow(row: number[], fallback: number[]): number[] {
  const total = row.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!(total > EPS)) return fallback.slice();
  return row.map(value => Math.max(0, value) / total);
}

function logSumExp(values: readonly number[]): number {
  const maximum = Math.max(...values);
  if (!Number.isFinite(maximum)) return maximum;
  let sum = 0;
  for (const value of values) sum += Math.exp(value - maximum);
  return maximum + Math.log(Math.max(sum, Number.MIN_VALUE));
}

function cholesky(matrix: NumericMatrix, floor: number): number[][] {
  const n = matrix.length;
  const lower = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let value = Number(matrix[i]?.[j] ?? 0);
      if (i === j) value += floor;
      for (let k = 0; k < j; k += 1) value -= lower[i]![k]! * lower[j]![k]!;
      if (i === j) lower[i]![j] = Math.sqrt(Math.max(floor, value));
      else lower[i]![j] = value / Math.max(Math.sqrt(floor), lower[j]![j]!);
    }
  }
  return lower;
}

function gaussianLogPdf(x: NumericVector, mean: NumericVector, covariance: NumericMatrix, floor: number): number {
  const d = x.length;
  const lower = cholesky(covariance, floor);
  const solved = Array<number>(d).fill(0);
  let logDet = 0;
  for (let i = 0; i < d; i += 1) {
    let residual = x[i]! - mean[i]!;
    for (let j = 0; j < i; j += 1) residual -= lower[i]![j]! * solved[j]!;
    const diagonal = Math.max(Math.sqrt(floor), lower[i]![i]!);
    solved[i] = residual / diagonal;
    logDet += Math.log(diagonal);
  }
  let quadratic = 0;
  for (const value of solved) quadratic += value * value;
  return -0.5 * (d * Math.log(2 * Math.PI) + 2 * logDet + quadratic);
}

function emissionLogLikelihoods(
  observations: NumericMatrix,
  means: NumericMatrix,
  covariances: readonly NumericMatrix[],
  floor: number,
): number[][] {
  return observations.map(row => means.map((mean, state) => gaussianLogPdf(row, mean, covariances[state]!, floor)));
}

function forwardBackward(logB: NumericMatrix, initial: NumericVector, transition: NumericMatrix): {
  alpha: number[][];
  beta: number[][];
  gamma: number[][];
  logLikelihood: number;
  xi: number[][][];
} {
  const timeSteps = logB.length;
  const states = initial.length;
  const logA = transition.map(row => row.map(p => Math.log(Math.max(EPS, p))));
  const logPi = initial.map(p => Math.log(Math.max(EPS, p)));
  const alpha = Array.from({ length: timeSteps }, () => Array<number>(states).fill(Number.NEGATIVE_INFINITY));
  const beta = Array.from({ length: timeSteps }, () => Array<number>(states).fill(0));
  const scale = Array<number>(timeSteps).fill(0);

  for (let s = 0; s < states; s += 1) alpha[0]![s] = logPi[s]! + logB[0]![s]!;
  scale[0] = logSumExp(alpha[0]!);
  for (let s = 0; s < states; s += 1) alpha[0]![s] -= scale[0]!;

  for (let t = 1; t < timeSteps; t += 1) {
    for (let s = 0; s < states; s += 1) {
      const incoming = Array.from({ length: states }, (_, prior) => alpha[t - 1]![prior]! + logA[prior]![s]!);
      alpha[t]![s] = logB[t]![s]! + logSumExp(incoming);
    }
    scale[t] = logSumExp(alpha[t]!);
    for (let s = 0; s < states; s += 1) alpha[t]![s] -= scale[t]!;
  }

  for (let t = timeSteps - 2; t >= 0; t -= 1) {
    for (let s = 0; s < states; s += 1) {
      beta[t]![s] = logSumExp(Array.from({ length: states }, (_, next) =>
        logA[s]![next]! + logB[t + 1]![next]! + beta[t + 1]![next]! - scale[t + 1]!));
    }
  }

  const gamma = alpha.map((row, t) => {
    const logs = row.map((value, s) => value + beta[t]![s]!);
    const normalizer = logSumExp(logs);
    return logs.map(value => Math.exp(value - normalizer));
  });
  const xi: number[][][] = [];
  for (let t = 0; t + 1 < timeSteps; t += 1) {
    const logs: number[][] = Array.from({ length: states }, (_, from) =>
      Array.from({ length: states }, (_, to) =>
        alpha[t]![from]! + logA[from]![to]! + logB[t + 1]![to]! + beta[t + 1]![to]! - scale[t + 1]!));
    const normalizer = logSumExp(logs.flat());
    xi.push(logs.map(row => row.map(value => Math.exp(value - normalizer))));
  }
  return { alpha, beta, gamma, logLikelihood: scale.reduce((sum, value) => sum + value, 0), xi };
}

function globalVariance(observations: NumericMatrix, dimension: number, floor: number): number {
  const mean = observations.reduce((sum, row) => sum + row[dimension]!, 0) / observations.length;
  return Math.max(floor, observations.reduce((sum, row) => sum + (row[dimension]! - mean) ** 2, 0) / observations.length);
}

function covarianceFor(
  observations: NumericMatrix,
  weights: NumericVector,
  mean: NumericVector,
  mode: HmmCovarianceMode,
  floor: number,
): number[][] {
  const dimensions = mean.length;
  const totalWeight = Math.max(EPS, weights.reduce((sum, value) => sum + value, 0));
  const covariance = Array.from({ length: dimensions }, () => Array<number>(dimensions).fill(0));
  for (let i = 0; i < dimensions; i += 1) {
    for (let j = 0; j < dimensions; j += 1) {
      if (mode === 'diagonal' && i !== j) continue;
      let sum = 0;
      for (let t = 0; t < observations.length; t += 1) {
        sum += weights[t]! * (observations[t]![i]! - mean[i]!) * (observations[t]![j]! - mean[j]!);
      }
      covariance[i]![j] = i === j ? Math.max(floor, sum / totalWeight) : sum / totalWeight;
    }
  }
  return covariance;
}

/** Fits a Gaussian HMM with deterministic initialization and bounded Baum-Welch iterations. */
export function fitGaussianHmm(input: NumericMatrix, options: GaussianHmmOptions): GaussianHmmModel {
  const observations = finiteMatrix(input, 'observations', 3);
  const dimensions = observations[0]!.length;
  const states = Math.floor(options.states);
  if (!Number.isInteger(options.states) || states < 2 || states > 12) {
    throw new Error('HMM states must be an integer between 2 and 12');
  }
  if (observations.length < Math.max(3, states * 2)) {
    throw new Error('HMM needs at least twice as many observations as hidden states');
  }
  const covarianceMode = options.covariance ?? 'diagonal';
  if (covarianceMode !== 'diagonal' && covarianceMode !== 'full') {
    throw new Error('HMM covariance must be diagonal or full');
  }
  const maxIterations = Math.max(1, Math.min(200, Math.floor(options.maxIterations ?? 30)));
  const tolerance = Math.max(1e-9, Number(options.tolerance ?? 1e-4));
  const floor = Math.max(1e-9, Number(options.varianceFloor ?? 1e-6));
  if (!Number.isFinite(tolerance) || !Number.isFinite(floor)) throw new Error('HMM tolerance and variance floor must be finite');

  const sorted = observations.map((row, index) => ({ row, index })).sort((a, b) => {
    const primary = a.row[0]! - b.row[0]!;
    return primary === 0 ? a.index - b.index : primary;
  });
  const clusters: number[][][] = Array.from({ length: states }, () => []);
  sorted.forEach((entry, rank) => {
    const state = Math.min(states - 1, Math.floor(rank * states / sorted.length));
    clusters[state]!.push(entry.row);
  });
  const means = clusters.map((cluster, state) =>
    Array.from({ length: dimensions }, (_, d) => {
      if (!cluster.length) return observations[Math.min(observations.length - 1, Math.floor((state + 0.5) * observations.length / states))]![d]!;
      return cluster.reduce((sum, row) => sum + row[d]!, 0) / cluster.length;
    }));
  const globalVars = Array.from({ length: dimensions }, (_, d) => globalVariance(observations, d, floor));
  let covariances = clusters.map(cluster => {
    const clusterMean = means[clusters.indexOf(cluster)]!;
    const fallback = Array.from({ length: dimensions }, (_, i) =>
      Array.from({ length: dimensions }, (_, j) => i === j ? globalVars[i]! : 0));
    if (cluster.length < 2) return fallback;
    const weights = cluster.map(() => 1);
    return covarianceFor(cluster, weights, clusterMean, covarianceMode, floor);
  });
  let initial = Array<number>(states).fill(1 / states);
  let transition = Array.from({ length: states }, (_, from) =>
    Array.from({ length: states }, (_, to) => from === to ? 0.85 : 0.15 / (states - 1)));
  let previousLogLikelihood = Number.NEGATIVE_INFINITY;
  let logLikelihood = Number.NEGATIVE_INFINITY;
  let completedIterations = 0;
  let converged = false;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const logB = emissionLogLikelihoods(observations, means, covariances, floor);
    const posterior = forwardBackward(logB, initial, transition);
    logLikelihood = posterior.logLikelihood;
    completedIterations = iteration + 1;
    const gamma = posterior.gamma;
    initial = normalizeRow(gamma[0]!.slice(), Array<number>(states).fill(1 / states));

    const transitions = Array.from({ length: states }, (_, from) => {
      const row = Array<number>(states).fill(0);
      for (let t = 0; t < posterior.xi.length; t += 1) {
        for (let to = 0; to < states; to += 1) row[to] += posterior.xi[t]![from]![to]!;
      }
      const denom = row.reduce((sum, value) => sum + value, 0);
      return normalizeRow(row.map(value => value / Math.max(EPS, denom)), transition[from]!);
    });
    transition = transitions;

    for (let state = 0; state < states; state += 1) {
      const weights = gamma.map(row => row[state]!);
      const mass = weights.reduce((sum, value) => sum + value, 0);
      if (!(mass > EPS)) continue;
      for (let d = 0; d < dimensions; d += 1) {
        means[state]![d] = observations.reduce((sum, row, t) => sum + weights[t]! * row[d]!, 0) / mass;
      }
      covariances[state] = covarianceFor(observations, weights, means[state]!, covarianceMode, floor);
    }

    if (Number.isFinite(previousLogLikelihood) && Math.abs(logLikelihood - previousLogLikelihood) <= tolerance * (1 + Math.abs(previousLogLikelihood))) {
      converged = true;
      break;
    }
    previousLogLikelihood = logLikelihood;
  }

  // Resolve state labels deterministically: state zero is the lowest mean on feature zero.
  const ordering = means.map((mean, state) => ({ state, value: mean[0]! })).sort((a, b) => a.value - b.value || a.state - b.state);
  const remap = new Map(ordering.map((entry, index) => [entry.state, index]));
  const sortedMeans = ordering.map(entry => means[entry.state]!);
  const sortedCovariances = ordering.map(entry => covariances[entry.state]!);
  const sortedInitial = ordering.map(entry => initial[entry.state]!);
  const sortedTransition = ordering.map(from => ordering.map(to => transition[from.state]![to.state]!));
  return Object.freeze({
    kind: 'GaussianHMM' as const,
    states,
    dimensions,
    covarianceMode,
    initial: Object.freeze(normalizeRow(sortedInitial, Array<number>(states).fill(1 / states))),
    transition: Object.freeze(sortedTransition.map(row => Object.freeze(normalizeRow(row, Array<number>(states).fill(1 / states))))),
    means: Object.freeze(sortedMeans.map(row => Object.freeze(row.slice()))),
    covariances: Object.freeze(sortedCovariances.map(matrix => Object.freeze(matrix.map(row => Object.freeze(row.slice()))))),
    iterations: completedIterations,
    logLikelihood,
    converged,
  });
}

/** Forward probabilities for a sequence of per-time/per-state emission likelihoods. */
export function hmmForward(
  observations: NumericMatrix,
  transitionInput: NumericMatrix,
  emissionInput: NumericMatrix,
  initialInput: NumericVector,
): number[][] {
  const transition = finiteMatrix(transitionInput, 'transition');
  const states = transition.length;
  if (transition.some(row => row.length !== states)) throw new Error('transition must be square');
  transition.forEach((row, i) => {
    if (row.some(value => value < 0)) throw new Error('transition probabilities must be non-negative');
    if (Math.abs(row.reduce((sum, value) => sum + value, 0) - 1) > 1e-6) throw new Error('each transition row must sum to 1');
    if (!row.length || !row[i] && row[i] !== 0) throw new Error('invalid transition matrix');
  });
  const emissions = finiteMatrix(emissionInput, 'emission', 1);
  if (emissions.some(row => row.length !== states || row.some(value => value < 0))) {
    throw new Error('emission must be a non-negative time-by-state matrix');
  }
  const obs = finiteMatrix(observations, 'observations', 1);
  if (obs.length !== emissions.length) throw new Error('observations and emission must have the same number of rows');
  let alpha = probabilities(initialInput, states, 'initial');
  const output: number[][] = [];
  for (let t = 0; t < emissions.length; t += 1) {
    const row = Array<number>(states).fill(0);
    for (let to = 0; to < states; to += 1) {
      let incoming = 0;
      for (let from = 0; from < states; from += 1) incoming += alpha[from]! * transition[from]![to]!;
      row[to] = incoming * emissions[t]![to]!;
    }
    alpha = normalizeRow(row, Array<number>(states).fill(1 / states));
    output.push(alpha.slice());
  }
  return output;
}

/** Most-likely hidden-state path using the Viterbi dynamic program. */
export function hmmViterbi(model: GaussianHmmModel, input: NumericMatrix, varianceFloor = 1e-6): number[] {
  const observations = finiteMatrix(input, 'observations', 1);
  if (observations.some(row => row.length !== model.dimensions)) {
    throw new Error('observation feature width does not match the fitted HMM');
  }
  const logB = emissionLogLikelihoods(observations, model.means, model.covariances, Math.max(1e-9, varianceFloor));
  const states = model.states;
  let previous = model.initial.map((p, s) => Math.log(Math.max(EPS, p)) + logB[0]![s]!);
  const back = Array.from({ length: observations.length }, () => Array<number>(states).fill(0));
  for (let t = 1; t < observations.length; t += 1) {
    const current = Array<number>(states).fill(0);
    for (let to = 0; to < states; to += 1) {
      let bestFrom = 0;
      let best = Number.NEGATIVE_INFINITY;
      for (let from = 0; from < states; from += 1) {
        const score = previous[from]! + Math.log(Math.max(EPS, model.transition[from]![to]!));
        if (score > best) { best = score; bestFrom = from; }
      }
      current[to] = best + logB[t]![to]!;
      back[t]![to] = bestFrom;
    }
    previous = current;
  }
  let last = 0;
  for (let s = 1; s < states; s += 1) if (previous[s]! > previous[last]!) last = s;
  const path = Array<number>(observations.length).fill(0);
  path[path.length - 1] = last;
  for (let t = path.length - 1; t > 0; t -= 1) path[t - 1] = back[t]![path[t]!]!;
  return path;
}

export function isGaussianHmmModel(value: unknown): value is GaussianHmmModel {
  return Boolean(value && typeof value === 'object' && (value as { kind?: unknown }).kind === 'GaussianHMM');
}
