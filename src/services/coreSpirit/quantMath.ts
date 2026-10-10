/**
 * Bounded, deterministic quant primitives for CoreScript.
 *
 * Structured values carry their shape at runtime. The compiler rejects implicit
 * scalar/series broadcasting; users must call an explicit linear-algebra op.
 * The Gaussian HMM is intentionally bounded for interactive browser workloads.
 */
export type CoreSpiritVector = Readonly<{ kind: 'vector'; length: number; data: Float64Array }>;
export type CoreSpiritDenseMatrix = Readonly<{ kind: 'matrix'; rows: number; columns: number; data: Float64Array }>;
export type CoreSpiritDenseTensor = Readonly<{ kind: 'tensor'; shape: readonly number[]; data: Float64Array }>;
export type CoreSpiritDistribution = Readonly<{ kind: 'distribution'; length: number; data: Float64Array }>;
export type CoreSpiritDatasetRow = Readonly<{ kind: 'dataset'; fields: readonly string[]; values: readonly (number | null)[] }>;

const MAX_MATRIX_CELLS = 65_536;
const MAX_VECTOR_LENGTH = 16_384;
const MAX_TENSOR_CELLS = 262_144;

function checkedDimension(value: unknown, label: string, max: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new Error(`${label} must be an integer between 1 and ${max}; received ${String(value)}`);
  }
  return number;
}

function flattenNumbers(values: readonly unknown[], output: number[] = []): number[] {
  for (const value of values) {
    if (typeof value === 'number') output.push(value);
    else if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      for (const item of Array.from(value as unknown as ArrayLike<unknown>)) {
        const number = Number(item);
        if (!Number.isFinite(number)) throw new Error('quant values must be finite numbers');
        output.push(number);
      }
    } else if (Array.isArray(value)) flattenNumbers(value, output);
    else if (value && typeof value === 'object' && 'data' in value) {
      flattenNumbers([(value as { data: unknown }).data], output);
    } else {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error('quant values must be finite numbers');
      output.push(number);
    }
    if (output.length > MAX_TENSOR_CELLS) throw new Error('quant input exceeds the maximum supported element count');
  }
  if (!output.every(Number.isFinite)) throw new Error('quant values must be finite numbers');
  return output;
}

export function coreSpiritVector(...values: unknown[]): CoreSpiritVector {
  const flat = flattenNumbers(values);
  if (!flat.length || flat.length > MAX_VECTOR_LENGTH) throw new Error('vector requires 1–16384 values');
  return Object.freeze({ kind: 'vector' as const, length: flat.length, data: Float64Array.from(flat) });
}

export function coreSpiritMatrix(rowsValue: unknown, columnsValue: unknown, ...values: unknown[]): CoreSpiritDenseMatrix {
  const rows = checkedDimension(rowsValue, 'matrix rows', 256);
  const columns = checkedDimension(columnsValue, 'matrix columns', 256);
  const size = rows * columns;
  if (size > MAX_MATRIX_CELLS) throw new Error('matrix exceeds the supported element limit');
  const flat = flattenNumbers(values);
  if (!flat.length) flat.push(...new Array<number>(size).fill(0));
  if (flat.length !== size) throw new Error(`matrix(${rows}, ${columns}) requires ${size} values; received ${flat.length}`);
  return Object.freeze({ kind: 'matrix' as const, rows, columns, data: Float64Array.from(flat) });
}

export function coreSpiritZeros(rowsValue: unknown, columnsValue: unknown): CoreSpiritDenseMatrix {
  const rows = checkedDimension(rowsValue, 'matrix rows', 256);
  const columns = checkedDimension(columnsValue, 'matrix columns', 256);
  if (rows * columns > MAX_MATRIX_CELLS) throw new Error('matrix exceeds the supported element limit');
  return Object.freeze({ kind: 'matrix' as const, rows, columns, data: new Float64Array(rows * columns) });
}

export function coreSpiritIdentity(sizeValue: unknown): CoreSpiritDenseMatrix {
  const size = checkedDimension(sizeValue, 'identity size', 256);
  const data = new Float64Array(size * size);
  for (let i = 0; i < size; i += 1) data[i * size + i] = 1;
  return Object.freeze({ kind: 'matrix' as const, rows: size, columns: size, data });
}

export function coreSpiritMatrixAdd(left: unknown, right: unknown): CoreSpiritDenseMatrix {
  const a = requireMatrix(left, 'matrixAdd left operand');
  const b = requireMatrix(right, 'matrixAdd right operand');
  if (a.rows !== b.rows || a.columns !== b.columns) throw new Error('matrixAdd requires identical matrix shapes');
  const data = new Float64Array(a.data.length);
  for (let i = 0; i < data.length; i += 1) data[i] = a.data[i]! + b.data[i]!;
  return Object.freeze({ kind: 'matrix' as const, rows: a.rows, columns: a.columns, data });
}

export function coreSpiritMatrixScale(value: unknown, factorValue: unknown): CoreSpiritDenseMatrix {
  const matrix = requireMatrix(value, 'matrixScale first operand');
  const factor = Number(factorValue);
  if (!Number.isFinite(factor)) throw new Error('matrixScale factor must be a finite scalar');
  const data = new Float64Array(matrix.data.length);
  for (let i = 0; i < data.length; i += 1) data[i] = matrix.data[i]! * factor;
  return Object.freeze({ kind: 'matrix' as const, rows: matrix.rows, columns: matrix.columns, data });
}

export function coreSpiritMatrixMultiply(left: unknown, right: unknown): CoreSpiritDenseMatrix {
  const a = requireMatrix(left, 'matmul left operand');
  const b = requireMatrix(right, 'matmul right operand');
  if (a.columns !== b.rows) throw new Error(`matmul shape mismatch: ${a.rows}x${a.columns} cannot multiply ${b.rows}x${b.columns}`);
  const data = new Float64Array(a.rows * b.columns);
  for (let row = 0; row < a.rows; row += 1) {
    for (let inner = 0; inner < a.columns; inner += 1) {
      const av = a.data[row * a.columns + inner]!;
      for (let column = 0; column < b.columns; column += 1) {
        data[row * b.columns + column] += av * b.data[inner * b.columns + column]!;
      }
    }
  }
  return Object.freeze({ kind: 'matrix' as const, rows: a.rows, columns: b.columns, data });
}

export function coreSpiritMatrixTranspose(value: unknown): CoreSpiritDenseMatrix {
  const matrix = requireMatrix(value, 'transpose operand');
  const data = new Float64Array(matrix.data.length);
  for (let row = 0; row < matrix.rows; row += 1) {
    for (let column = 0; column < matrix.columns; column += 1) {
      data[column * matrix.rows + row] = matrix.data[row * matrix.columns + column]!;
    }
  }
  return Object.freeze({ kind: 'matrix' as const, rows: matrix.columns, columns: matrix.rows, data });
}

export function coreSpiritVectorDot(left: unknown, right: unknown): number {
  const a = requireVector(left, 'dot left operand');
  const b = requireVector(right, 'dot right operand');
  if (a.length !== b.length) throw new Error('dot requires vectors of identical length');
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a.data[i]! * b.data[i]!;
  return sum;
}

export function coreSpiritTensor(shapeValue: unknown, ...values: unknown[]): CoreSpiritDenseTensor {
  const shapeSource = requireVector(shapeValue, 'tensor shape');
  const shape = Array.from(shapeSource.data, (dimension) => checkedDimension(dimension, 'tensor dimension', 512));
  const size = shape.reduce((product, dimension) => product * dimension, 1);
  if (size > MAX_TENSOR_CELLS) throw new Error('tensor exceeds the supported element limit');
  const flat = flattenNumbers(values);
  if (flat.length !== size) throw new Error(`tensor shape [${shape.join(', ')}] requires ${size} values; received ${flat.length}`);
  return Object.freeze({ kind: 'tensor' as const, shape: Object.freeze(shape), data: Float64Array.from(flat) });
}

export function coreSpiritDataset(...values: unknown[]): CoreSpiritDatasetRow {
  if (!values.length || values.length % 2 !== 0) throw new Error('dataset expects alternating field-name and numeric-value arguments');
  const fields: string[] = [];
  const row: (number | null)[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < values.length; i += 2) {
    const field = String(values[i] ?? '').trim();
    const rawValue = values[i + 1];
    const value = rawValue == null ? null : Number(rawValue);
    if (!field) throw new Error('dataset field names cannot be empty');
    if (seen.has(field)) throw new Error("dataset contains duplicate field '" + field + "'");
    if (value !== null && !Number.isFinite(value)) throw new Error("dataset field '" + field + "' must be numeric or missing during warm-up");
    seen.add(field);
    fields.push(field);
    row.push(value);
  }
  return Object.freeze({ kind: 'dataset' as const, fields: Object.freeze(fields), values: Object.freeze(row) });
}

function requireMatrix(value: unknown, label: string): CoreSpiritDenseMatrix {
  if (!value || typeof value !== 'object' || (value as CoreSpiritDenseMatrix).kind !== 'matrix') {
    throw new Error(`${label} requires matrix<float>; received ${describeQuantValue(value)}`);
  }
  const matrix = value as CoreSpiritDenseMatrix;
  if (!Number.isInteger(matrix.rows) || !Number.isInteger(matrix.columns) || matrix.rows < 1 || matrix.columns < 1 ||
      matrix.rows * matrix.columns !== matrix.data.length || matrix.data.length > MAX_MATRIX_CELLS) {
    throw new Error(`${label} received an invalid matrix shape`);
  }
  return matrix;
}

function requireVector(value: unknown, label: string): CoreSpiritVector {
  if (Array.isArray(value) && value.every(item => Number.isFinite(Number(item)))) return coreSpiritVector(value);
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return coreSpiritVector(value);
  if (!value || typeof value !== 'object' || (value as CoreSpiritVector).kind !== 'vector') {
    throw new Error(`${label} requires vector<float>; received ${describeQuantValue(value)}`);
  }
  const vector = value as CoreSpiritVector;
  if (vector.length !== vector.data.length || vector.length < 1 || vector.length > MAX_VECTOR_LENGTH) throw new Error(`${label} received an invalid vector length`);
  return vector;
}

function describeQuantValue(value: unknown): string {
  if (value && typeof value === 'object' && 'kind' in value) return String((value as {kind:unknown}).kind);
  if (value === null) return 'null';
  return typeof value;
}

export type CoreSpiritGaussianHMMOptions = Readonly<{
  states: number;
  emission?: 'gaussian';
  covariance?: 'full' | 'diagonal';
  maxObservations?: number;
  fitEvery?: number;
  fitIterations?: number;
}>;

type GaussianParameters = { mean: number[]; covariance: number[][]; lower: number[][]; logDeterminant: number };

export type CoreSpiritGaussianHMMState = Readonly<{
  schemaVersion: 1;
  states: number;
  covarianceMode: 'full' | 'diagonal';
  maxObservations: number;
  fields: readonly string[];
  transition: readonly (readonly number[])[];
  startProbability: readonly number[];
  emissions: readonly Readonly<{ mean: readonly number[]; covariance: readonly (readonly number[])[] }>[];
  latestPosterior: readonly number[];
}>;

export type CoreSpiritHMMArtifactBinding = Readonly<{
  artifactHash: string;
  artifactName?: string;
  modelAlias: string;
  stateLabels?: readonly string[];
  trainingEndTimestampMs: number;
  state: CoreSpiritGaussianHMMState;
}>;

const EPSILON = 1e-8;

function logSumExp(values: readonly number[]): number {
  const maximum = Math.max(...values);
  if (!Number.isFinite(maximum)) return Number.NEGATIVE_INFINITY;
  let total = 0;
  for (const value of values) total += Math.exp(value - maximum);
  return maximum + Math.log(Math.max(total, Number.MIN_VALUE));
}

function normalizeProbabilities(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (!Number.isFinite(total) || total <= 0) return values.map(() => 1 / values.length);
  return values.map(value => Math.max(0, value) / total);
}

function cholesky(matrix: number[][]): { lower: number[][]; logDeterminant: number } {
  const dimension = matrix.length;
  const lower = Array.from({ length: dimension }, () => new Array<number>(dimension).fill(0));
  let logDeterminant = 0;
  for (let row = 0; row < dimension; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let sum = matrix[row]![column]!;
      for (let k = 0; k < column; k += 1) sum -= lower[row]![k]! * lower[column]![k]!;
      if (row === column) {
        const diagonal = Math.max(sum, EPSILON);
        lower[row]![column] = Math.sqrt(diagonal);
        logDeterminant += Math.log(diagonal);
      } else {
        lower[row]![column] = sum / Math.max(lower[column]![column]!, Math.sqrt(EPSILON));
      }
    }
  }
  return { lower, logDeterminant };
}

function gaussianParameters(mean: number[], covariance: number[][], covarianceMode: 'full' | 'diagonal'): GaussianParameters {
  const dimension = mean.length;
  const safe = covariance.map((row, i) => row.map((value, j) => {
    if (i === j) return Math.max(Number.isFinite(value) ? value : 1, EPSILON);
    return covarianceMode === 'diagonal' ? 0 : (Number.isFinite(value) ? value : 0);
  }));
  const factor = cholesky(safe);
  return { mean, covariance: safe, lower: factor.lower, logDeterminant: factor.logDeterminant };
}

function gaussianLogDensity(observation: readonly number[], parameters: GaussianParameters): number {
  const dimension = observation.length;
  const whitened = new Array<number>(dimension).fill(0);
  for (let row = 0; row < dimension; row += 1) {
    let value = observation[row]! - parameters.mean[row]!;
    for (let column = 0; column < row; column += 1) value -= parameters.lower[row]![column]! * whitened[column]!;
    whitened[row] = value / Math.max(parameters.lower[row]![row]!, Math.sqrt(EPSILON));
  }
  const mahalanobis = whitened.reduce((sum, value) => sum + value * value, 0);
  return -0.5 * (dimension * Math.log(2 * Math.PI) + parameters.logDeterminant + mahalanobis);
}

/**
 * Online Gaussian HMM. It fits in bounded batches and replaces, rather than
 * double-counts, a developing candle when its timestamp is revised.
 */
export class CoreSpiritGaussianHMM {
  readonly states: number;
  readonly covarianceMode: 'full' | 'diagonal';
  readonly maxObservations: number;
  private readonly fitEvery: number;
  private readonly fitIterations: number;
  private observations: number[][] = [];
  private timestamps: number[] = [];
  private fields?: string[];
  private transition: number[][] = [];
  private startProbability: number[] = [];
  private emissions: GaussianParameters[] = [];
  private fitted = false;
  private updatesSinceFit = 0;
  private latestPosterior: number[] = [];
  private lastInferenceTimestamp?: number;
  private posteriorBeforeLastInference?: number[];
  private minimumInferenceTimestampExclusive?: number;
  private stateLabels: string[] = [];

  constructor(options: CoreSpiritGaussianHMMOptions) {
    if (options.emission && options.emission !== 'gaussian') throw new Error('Only Gaussian HMM emissions are supported by the built-in HMM runtime');
    if (!Number.isInteger(options.states) || options.states < 2 || options.states > 12) {
      throw new Error('HMM states must be an integer between 2 and 12');
    }
    this.states = options.states;
    this.covarianceMode = options.covariance ?? 'full';
    this.maxObservations = Math.max(this.states * 4, Math.min(1024, Math.floor(options.maxObservations ?? 512)));
    this.fitEvery = Math.max(1, Math.min(64, Math.floor(options.fitEvery ?? 8)));
    this.fitIterations = Math.max(1, Math.min(6, Math.floor(options.fitIterations ?? 3)));
  }

  observe(row: readonly number[], timestamp: number, fields?: readonly string[]): number | null {
    if (!row.length || row.length > 16 || !row.every(Number.isFinite)) return null;
    if (!Number.isFinite(timestamp)) return null;
    if (this.fields && fields && (this.fields.length !== fields.length || this.fields.some((name, i) => name !== fields[i]))) {
      throw new Error('HMM feature schema changed while the model was active; reset or use a new model name');
    }
    if (!this.fields && fields) this.fields = [...fields];
    const previousTimestamp = this.timestamps[this.timestamps.length - 1];
    if (this.observations.length && row.length !== this.observations[0]!.length) {
      throw new Error('HMM feature dimension changed while the model was active');
    }
    if (this.observations.length && timestamp < previousTimestamp!) throw new Error('HMM observations must be chronological');
    if (this.observations.length && timestamp === previousTimestamp) {
      this.observations[this.observations.length - 1] = [...row];
    } else {
      this.observations.push([...row]);
      this.timestamps.push(timestamp);
      if (this.observations.length > this.maxObservations) {
        this.observations.shift();
        this.timestamps.shift();
      }
      this.updatesSinceFit += 1;
    }
    if (this.observations.length >= Math.max(12, this.states * 4) &&
        (!this.fitted || this.updatesSinceFit >= this.fitEvery)) {
      this.fitBounded();
      this.updatesSinceFit = 0;
    } else if (this.fitted) {
      this.latestPosterior = this.filterLatest(this.observations);
    }
    return this.decodeLatest();
  }

  decodeLatest(): number | null {
    if (!this.fitted || !this.latestPosterior.length) return null;
    let best = 0;
    for (let i = 1; i < this.latestPosterior.length; i += 1) {
      if (this.latestPosterior[i]! > this.latestPosterior[best]!) best = i;
    }
    return best;
  }

  probabilityLatest(): number | null {
    if (!this.fitted || !this.latestPosterior.length) return null;
    return Math.max(...this.latestPosterior);
  }

  posterior(): CoreSpiritDistribution | null {
    return this.fitted && this.latestPosterior.length
      ? Object.freeze({ kind: 'distribution' as const, length: this.latestPosterior.length, data: Float64Array.from(this.latestPosterior) })
      : null;
  }

  /** Snapshot only the fitted numerical parameters; no training history is persisted. */
  exportTrainedState(): CoreSpiritGaussianHMMState {
    if (!this.fitted || !this.emissions.length || !this.transition.length) {
      throw new Error('Cannot export an HMM before it has been fitted on historical observations');
    }
    return Object.freeze({
      schemaVersion: 1 as const,
      states: this.states,
      covarianceMode: this.covarianceMode,
      maxObservations: this.maxObservations,
      fields: Object.freeze([...(this.fields ?? [])]),
      transition: Object.freeze(this.transition.map(row => Object.freeze([...row]))),
      startProbability: Object.freeze([...this.startProbability]),
      emissions: Object.freeze(this.emissions.map(item => Object.freeze({
        mean: Object.freeze([...item.mean]),
        covariance: Object.freeze(item.covariance.map(row => Object.freeze([...row]))),
      }))),
      latestPosterior: Object.freeze([...this.latestPosterior]),
    });
  }

  /** Rehydrates a sealed HMM for inference without running fitBounded(). */
  static fromTrainedState(snapshot: CoreSpiritGaussianHMMState): CoreSpiritGaussianHMM {
    if (!snapshot || snapshot.schemaVersion !== 1) throw new Error('Unsupported HMM state snapshot version');
    if (!Number.isInteger(snapshot.states) || snapshot.states < 2 || snapshot.states > 12) {
      throw new Error('HMM snapshot has an invalid state count');
    }
    const states = snapshot.states;
    if (snapshot.covarianceMode !== 'full' && snapshot.covarianceMode !== 'diagonal') throw new Error('HMM snapshot covariance mode is invalid');
    if (!Number.isInteger(snapshot.maxObservations) || snapshot.maxObservations < states * 4 || snapshot.maxObservations > 1024) {
      throw new Error('HMM snapshot observation limit is invalid');
    }
    const finite = (values: readonly number[]) => Array.isArray(values) && values.every(Number.isFinite);
    if (!Array.isArray(snapshot.fields) || !Array.isArray(snapshot.transition) ||
        !Array.isArray(snapshot.startProbability) || !Array.isArray(snapshot.emissions) ||
        !Array.isArray(snapshot.latestPosterior) ||
        snapshot.transition.length !== states || snapshot.startProbability.length !== states ||
        snapshot.emissions.length !== states || snapshot.latestPosterior.length !== states ||
        !finite(snapshot.startProbability) || !finite(snapshot.latestPosterior) ||
        snapshot.startProbability.some(value => value < 0) || snapshot.latestPosterior.some(value => value < 0)) {
      throw new Error('HMM snapshot dimensions or probabilities are invalid');
    }
    for (const row of snapshot.transition) {
      if (!Array.isArray(row) || row.length !== states || !finite(row) || row.some(value => value < 0) ||
          Math.abs(row.reduce((sum, value) => sum + value, 0) - 1) > 1e-5) {
        throw new Error('HMM snapshot transition matrix is invalid');
      }
    }
    if (Math.abs(snapshot.startProbability.reduce((sum, value) => sum + value, 0) - 1) > 1e-5 ||
        Math.abs(snapshot.latestPosterior.reduce((sum, value) => sum + value, 0) - 1) > 1e-5) {
      throw new Error('HMM snapshot probabilities must sum to one');
    }
    const dimensions = snapshot.emissions[0]?.mean.length ?? 0;
    if (dimensions < 1 || dimensions > 16 || snapshot.fields.length && snapshot.fields.length !== dimensions ||
        snapshot.fields.some(name => typeof name !== 'string' || !name.trim()) || new Set(snapshot.fields).size !== snapshot.fields.length) {
      throw new Error('HMM snapshot feature dimensions are invalid');
    }
    for (const emission of snapshot.emissions) {
      if (!emission || !Array.isArray(emission.mean) || !Array.isArray(emission.covariance) ||
          emission.mean.length !== dimensions || !finite(emission.mean) ||
          emission.covariance.length !== dimensions ||
          emission.covariance.some(row => !Array.isArray(row) || row.length !== dimensions || !finite(row))) {
        throw new Error('HMM snapshot emission dimensions are invalid');
      }
    }
    const model = new CoreSpiritGaussianHMM({
      states,
      covariance: snapshot.covarianceMode,
      maxObservations: snapshot.maxObservations,
    });
    model.fields = [...snapshot.fields];
    model.transition = snapshot.transition.map(row => [...row]);
    model.startProbability = [...snapshot.startProbability];
    model.emissions = snapshot.emissions.map(item => gaussianParameters(
      [...item.mean],
      item.covariance.map(row => [...row]),
      snapshot.covarianceMode,
    ));
    model.latestPosterior = normalizeProbabilities([...snapshot.latestPosterior]);
    model.fitted = true;
    model.updatesSinceFit = 0;
    return model;
  }

  /** Prevents accidental in-sample predictions when a model is loaded for a backtest or chart. */
  setStateLabels(labels: readonly string[]): void {
    if (labels.length !== this.states || labels.some(label => typeof label !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]{0,31}$/.test(label)) ||
        new Set(labels).size !== labels.length) {
      throw new Error('HMM state labels must be unique identifiers matching the trained state count');
    }
    this.stateLabels = [...labels];
  }

  getStateLabels(): readonly string[] {
    return this.stateLabels.length === this.states
      ? [...this.stateLabels]
      : Array.from({ length: this.states }, (_value, index) => 'state_' + index);
  }

  setInferenceBoundaryExclusive(timestamp: number): void {
    if (!Number.isFinite(timestamp)) throw new Error('HMM inference boundary must be finite');
    this.minimumInferenceTimestampExclusive = timestamp;
  }

  canPredictAt(timestamp: number): boolean {
    return Number.isFinite(timestamp) &&
      (this.minimumInferenceTimestampExclusive === undefined || timestamp > this.minimumInferenceTimestampExclusive);
  }

  /**
   * One-step posterior update using frozen fitted parameters. This path never
   * calls fitBounded() and is safe for a loaded model in a live chart loop.
   */
  predict(row: readonly number[], fields?: readonly string[], timestamp?: number): Readonly<{ state: number; probabilities: readonly number[]; confidence: number }> {
    if (!this.fitted || !this.latestPosterior.length) {
      throw new Error('HMM inference requires a previously trained model artifact');
    }
    if (row.length !== this.emissions[0]!.mean.length || !row.every(Number.isFinite)) {
      throw new Error('HMM inference features must be finite and match the trained feature schema');
    }
    if (this.fields?.length && fields &&
        (this.fields.length !== fields.length || this.fields.some((name, index) => name !== fields[index]))) {
      throw new Error('HMM inference feature names do not match the trained feature schema');
    }
    if (this.minimumInferenceTimestampExclusive !== undefined && timestamp === undefined) {
      throw new Error('Timestamped inference is required to enforce the model training boundary');
    }
    if (timestamp !== undefined) {
      if (!Number.isFinite(timestamp)) throw new Error('HMM inference timestamp must be finite');
      if (!this.canPredictAt(timestamp)) throw new Error('HMM inference timestamp is inside the model training range');
      if (this.lastInferenceTimestamp !== undefined && timestamp < this.lastInferenceTimestamp) {
        throw new Error('HMM inference observations must be chronological');
      }
      if (this.lastInferenceTimestamp === timestamp) {
        if (!this.posteriorBeforeLastInference) throw new Error('HMM developing-bar rollback state is unavailable');
        this.latestPosterior = [...this.posteriorBeforeLastInference];
      } else {
        this.posteriorBeforeLastInference = [...this.latestPosterior];
      }
    }
    const logScores = this.emissions.map((emission, to) => {
      const prior = this.latestPosterior.reduce((sum, probability, from) =>
        sum + probability * this.transition[from]![to]!, 0);
      return Math.log(Math.max(prior, EPSILON)) + gaussianLogDensity(row, emission);
    });
    const normalizer = logSumExp(logScores);
    const probabilities = normalizeProbabilities(logScores.map(value => Math.exp(value - normalizer)));
    this.latestPosterior = probabilities;
    if (timestamp !== undefined) this.lastInferenceTimestamp = timestamp;
    let state = 0;
    for (let index = 1; index < probabilities.length; index += 1) {
      if (probabilities[index]! > probabilities[state]!) state = index;
    }
    return Object.freeze({
      state,
      probabilities: Object.freeze([...probabilities]),
      confidence: probabilities[state]!,
    });
  }

  private fitBounded(): void {
    const rows = this.observations;
    const count = rows.length;
    const dimensions = rows[0]!.length;
    const ordered = [...rows].sort((a, b) => a[0]! - b[0]!);
    const globalMean = Array.from({ length: dimensions }, (_, d) => rows.reduce((sum, row) => sum + row[d]!, 0) / count);
    const globalCovariance = Array.from({ length: dimensions }, (_, i) =>
      Array.from({ length: dimensions }, (_, j) => rows.reduce((sum, row) => sum + (row[i]! - globalMean[i]!) * (row[j]! - globalMean[j]!), 0) / Math.max(1, count - 1)));
    this.transition = Array.from({ length: this.states }, (_, i) =>
      normalizeProbabilities(Array.from({ length: this.states }, (_, j) => i === j ? 8 : 1)));
    this.startProbability = new Array<number>(this.states).fill(1 / this.states);
    let means = Array.from({ length: this.states }, (_, state) => {
      const quantile = Math.min(count - 1, Math.max(0, Math.floor(((state + 0.5) / this.states) * count)));
      const anchor = ordered[quantile]!;
      return Array.from({ length: dimensions }, (_, d) => d === 0 ? anchor[d]! : globalMean[d]!);
    });
    let covariances = Array.from({ length: this.states }, () => globalCovariance.map(row => [...row]));
    this.emissions = means.map((mean, state) => gaussianParameters(mean, covariances[state]!, this.covarianceMode));

    for (let iteration = 0; iteration < this.fitIterations; iteration += 1) {
      const logEmission = rows.map(row => this.emissions.map(parameters => gaussianLogDensity(row, parameters)));
      const alpha = Array.from({ length: count }, () => new Array<number>(this.states).fill(Number.NEGATIVE_INFINITY));
      const beta = Array.from({ length: count }, () => new Array<number>(this.states).fill(0));
      for (let state = 0; state < this.states; state += 1) alpha[0]![state] = Math.log(Math.max(this.startProbability[state]!, EPSILON)) + logEmission[0]![state]!;
      for (let time = 1; time < count; time += 1) {
        for (let state = 0; state < this.states; state += 1) {
          alpha[time]![state] = logEmission[time]![state]! + logSumExp(Array.from({ length: this.states }, (_, previous) =>
            alpha[time - 1]![previous]! + Math.log(Math.max(this.transition[previous]![state]!, EPSILON))));
        }
      }
      for (let time = count - 2; time >= 0; time -= 1) {
        for (let state = 0; state < this.states; state += 1) {
          beta[time]![state] = logSumExp(Array.from({ length: this.states }, (_, next) =>
            Math.log(Math.max(this.transition[state]![next]!, EPSILON)) + logEmission[time + 1]![next]! + beta[time + 1]![next]!));
        }
      }
      const posterior = alpha.map((row, time) => {
        const logWeights = row.map((value, state) => value + beta[time]![state]!);
        const normalizer = logSumExp(logWeights);
        return normalizeProbabilities(logWeights.map(value => Math.exp(value - normalizer)));
      });
      const transitionCounts = Array.from({ length: this.states }, () => new Array<number>(this.states).fill(1e-3));
      for (let time = 0; time < count - 1; time += 1) {
        const logXiValues: number[] = [];
        for (let from = 0; from < this.states; from += 1) {
          for (let to = 0; to < this.states; to += 1) {
            logXiValues.push(alpha[time]![from]! + Math.log(Math.max(this.transition[from]![to]!, EPSILON)) +
              logEmission[time + 1]![to]! + beta[time + 1]![to]!);
          }
        }
        const logDenominator = logSumExp(logXiValues);
        if (!Number.isFinite(logDenominator)) continue;
        let cursor = 0;
        for (let from = 0; from < this.states; from += 1) {
          for (let to = 0; to < this.states; to += 1) {
            const logXi = logXiValues[cursor++]! - logDenominator;
            transitionCounts[from]![to] += Math.exp(Math.max(-700, Math.min(0, logXi)));
          }
        }
      }
      this.transition = transitionCounts.map(row => normalizeProbabilities(row));
      this.startProbability = normalizeProbabilities(posterior[0]!);

      means = Array.from({ length: this.states }, (_, state) => {
        const total = posterior.reduce((sum, gamma) => sum + gamma[state]!, 0);
        return Array.from({ length: dimensions }, (_, dimension) => {
          let weighted = 0;
          for (let time = 0; time < count; time += 1) weighted += posterior[time]![state]! * rows[time]![dimension]!;
          return total > EPSILON ? weighted / total : globalMean[dimension]!;
        });
      });
      covariances = Array.from({ length: this.states }, (_, state) => {
        const total = posterior.reduce((sum, gamma) => sum + gamma[state]!, 0);
        return Array.from({ length: dimensions }, (_, row) =>
          Array.from({ length: dimensions }, (_, column) => {
            if (this.covarianceMode === 'diagonal' && row !== column) return 0;
            let weighted = 0;
            for (let time = 0; time < count; time += 1) {
              weighted += posterior[time]![state]! *
                (rows[time]![row]! - means[state]![row]!) *
                (rows[time]![column]! - means[state]![column]!);
            }
            return row === column ? Math.max(EPSILON, total > EPSILON ? weighted / total : globalCovariance[row]![column]!) :
              (total > EPSILON ? weighted / total : globalCovariance[row]![column]!);
          }));
      });
      this.emissions = means.map((mean, state) => gaussianParameters(mean, covariances[state]!, this.covarianceMode));
    }
    this.latestPosterior = this.filterLatest(rows);
    this.fitted = true;
  }

  private filterLatest(rows: readonly number[][]): number[] {
    if (!rows.length || !this.emissions.length) return [];
    let previous = this.startProbability.map((probability, state) =>
      Math.log(Math.max(probability, EPSILON)) + gaussianLogDensity(rows[0]!, this.emissions[state]!));
    let normalizer = logSumExp(previous);
    previous = previous.map(value => value - normalizer);
    for (let time = 1; time < rows.length; time += 1) {
      const next = new Array<number>(this.states).fill(0);
      for (let state = 0; state < this.states; state += 1) {
        next[state] = gaussianLogDensity(rows[time]!, this.emissions[state]!) + logSumExp(
          previous.map((value, from) => value + Math.log(Math.max(this.transition[from]![state]!, EPSILON))));
      }
      normalizer = logSumExp(next);
      previous = next.map(value => value - normalizer);
    }
    return normalizeProbabilities(previous.map(value => Math.exp(value)));
  }
}
