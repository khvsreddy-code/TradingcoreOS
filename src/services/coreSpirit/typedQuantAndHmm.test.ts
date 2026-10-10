import { compileCoreSpirit, makeCoreSpiritProgram } from './coreSpiritPipeline.ts';
import { CoreSpiritRuntime } from './runtime.ts';
import { extractCoreSpiritSurfaceMetadata } from './languageConcepts.ts';
import {
  CoreSpiritGaussianHMM,
  coreSpiritIdentity,
  coreSpiritMatrix,
  coreSpiritMatrixMultiply,
  coreSpiritMatrixTranspose,
  coreSpiritVector,
  coreSpiritVectorDot,
} from './quantMath.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const valid = compileCoreSpirit([
  'let fast: series<float> = ema(close, 3);',
  'let blended = close + ema(close, 20);',
  'let isReady: bool = true;',
  'let trendUp: series<bool> = close > ema(close, 3);',
  'model testHMM: HMM<float> {',
  '  states = 3',
  '}',
  'let features = dataset("returns", 1.0, "volatility", 0.5);',
  'hmmFit("testHMM", features);',
  'let stateEstimate: prediction<float> = hmmDecode("testHMM", features);',
  'let stateProbabilities: distribution<float> = hmmPosterior("testHMM", features);',
].join('\n'), 'typed-quant-values-valid', { layer: 'model' });
assert(Boolean(valid.ir), 'scalar, series, model-output and probability declarations should compile: ' + valid.diagnostics.map(item => item.message).join('; '));

const explicitAlgebra = compileCoreSpirit([
  'let a: matrix<float> = matrix(2, 2, 1, 0, 0, 1);',
  'let b: matrix<float> = identity(2);',
  'fn multiply(',
  '  left: matrix<float>,',
  '  right: matrix<float>',
  ') -> matrix<float> {',
  '  return matmul(left, right);',
  '}',
  'let product: matrix<float> = multiply(a, b);',
  'let vectorA: vector<float> = vector(1, 2, 3);',
  'let normSquared: float = dot(vectorA, vectorA);',
].join('\n'), 'typed-quant-algebra-valid', { layer: 'model' });
assert(Boolean(explicitAlgebra.ir), 'explicit shaped constructors and linear algebra should compile: ' + explicitAlgebra.diagnostics.map(item => item.message).join('; '));

const invalidSeriesAssignment = compileCoreSpirit([
  'let notASeries: series<float> = 2;',
].join('\n'), 'typed-quant-no-scalar-to-series', { layer: 'model' });
assert(!invalidSeriesAssignment.ir, 'a scalar must not be assigned to series<float>');
assert(invalidSeriesAssignment.diagnostics.some(item => item.code === 'TYPE_DECLARATION' || item.code === 'TYPE_ASSIGNMENT' || /series/.test(item.message)),
  'scalar-to-series mismatch should produce a declaration diagnostic');

const invalidBroadcast = compileCoreSpirit([
  'let a: matrix<float> = identity(2);',
  'let invalid = a + close;',
].join('\n'), 'typed-quant-no-implicit-broadcast', { layer: 'model' });
assert(!invalidBroadcast.ir, 'matrix + series must not compile');

const invalidSeriesToScalar = compileCoreSpirit([
  'let scalarFlag: bool = close > ema(close, 3);',
].join('\n'), 'typed-quant-no-series-to-scalar', { layer: 'model' });
assert(!invalidSeriesToScalar.ir, 'series<bool> must not be assigned to bool without explicit reduction/indexing');

assert(invalidBroadcast.diagnostics.some(item => item.code === 'TYPE_SEMANTIC_ARITHMETIC' || item.code === 'TYPE_ARITHMETIC'),
  'matrix + series should produce an actionable arithmetic diagnostic');

const matrix = coreSpiritMatrix(2, 2, 1, 0, 0, 1);
const identity = coreSpiritIdentity(2);
const product = coreSpiritMatrixMultiply(matrix, identity);
assert(product.rows === 2 && product.columns === 2 && product.data[0] === 1 && product.data[3] === 1, 'matrix multiplication must preserve shape and identity');
const transposed = coreSpiritMatrixTranspose(coreSpiritMatrix(2, 2, 1, 2, 3, 4));
assert(transposed.data[1] === 3 && transposed.data[2] === 2, 'transpose must reorder values by matrix shape');
assert(coreSpiritVectorDot(coreSpiritVector(1, 2, 3), coreSpiritVector(1, 2, 3)) === 14, 'dot product must compute exact vector product');
let shapeMismatchRejected = false;
try {
  coreSpiritMatrixMultiply(coreSpiritMatrix(2, 3, 1, 2, 3, 4, 5, 6), coreSpiritMatrix(2, 2, 1, 0, 0, 1));
} catch {
  shapeMismatchRejected = true;
}
assert(shapeMismatchRejected, 'matrix runtime must reject incompatible multiplication shapes');

const hmm = new CoreSpiritGaussianHMM({ states: 3, emission: 'gaussian', covariance: 'full', fitEvery: 4, fitIterations: 2 });
let state: number | null = null;
for (let i = 0; i < 72; i += 1) {
  const regimeShift = i < 24 ? -1.8 : i < 48 ? 0.2 : 2.4;
  const row = [regimeShift + Math.sin(i * 0.43) * 0.12, Math.cos(i * 0.17) * 0.08 + regimeShift * 0.3];
  state = hmm.observe(row, 1_700_000_000 + i * 60, ['return', 'volatility']);
}
assert(Number.isInteger(state) && state !== null && state >= 0 && state < 3, 'HMM should fit synthetic features and decode a valid regime');
const posterior = hmm.posterior();
assert(posterior !== null && posterior.length === 3, 'HMM posterior should return one probability per state');
const probabilitySum = Array.from(posterior!.data).reduce((sum, value) => sum + value, 0);
assert(Math.abs(probabilitySum - 1) < 1e-6, 'HMM filtered posterior probabilities should sum to one');
assert((hmm.probabilityLatest() ?? 0) > 0 && (hmm.probabilityLatest() ?? 1) <= 1, 'HMM confidence must be a valid probability');
const revised = hmm.observe([0.23, 0.01], 1_700_000_000 + 71 * 60, ['return', 'volatility']);
assert(revised !== null, 'HMM should accept a corrected developing-bar observation without double-appending it');

const hmmSource = [
  'model regimeHMM: HMM<float> {',
  '  states = 3',
  '  emission = gaussian',
  '  covariance = full',
  '}',
  'features = dataset {',
  '  returns: pctchange(close)',
  '  volatility: atr(14)',
  '  momentum: rsi(close, 14)',
  '}',
  'fit regimeHMM on features',
  'regime = regimeHMM.decode(features)',
  'plot regime',
].join('\n');
const metadata = extractCoreSpiritSurfaceMetadata(hmmSource);
const declaration = metadata.declarations.find(item => item.kind === 'model' && item.name === 'regimeHMM');
assert(declaration?.kind === 'model' && declaration.modelType === 'HMM<float>' && declaration.states === 3 &&
  declaration.emission === 'gaussian' && declaration.covariance === 'full',
  'typed HMM declaration metadata should retain model family and hyperparameters');

const compiledHmm = compileCoreSpirit(hmmSource, 'typed-hmm-surface', { layer: 'model' });
assert(Boolean(compiledHmm.ir), 'high-level HMM/data-set syntax should lower into executable CoreScript IR: ' + compiledHmm.diagnostics.map(item => item.message).join('; '));
const program = makeCoreSpiritProgram(hmmSource, 'typed-hmm-runtime-contract');
const runtime = new CoreSpiritRuntime({ layer: 'model', symbol: 'NIFTY', timeframe: '1m' });
const ir = runtime.loadProgram(program);
const bars = Array.from({ length: 84 }, (_, index) => {
  const drift = index < 28 ? -0.08 : index < 56 ? 0.015 : 0.11;
  const close = 20000 + index * drift + Math.sin(index * 0.45) * 1.8;
  return {
    timestamp: new Date(1_700_000_000_000 + index * 60_000).toISOString(),
    open: close - 0.4,
    high: close + 1.2,
    low: close - 1.1,
    close,
    volume: 1_000 + (index % 17) * 25,
  };
});
const execution = runtime.executeIr(ir, bars);
assert(execution.outputs.some(output => output.kind === 'series'), 'HMM decode result should flow into existing chart series output');
assert(!execution.diagnostics.some(message => /Unknown typed HMM|hmmFit expects|matrix/i.test(message)),
  'HMM runtime should not produce model/configuration diagnostics: ' + execution.diagnostics.join('; '));

console.log('CORESCRIPT_TYPED_QUANT_VALUES_AND_HMM_OK');
