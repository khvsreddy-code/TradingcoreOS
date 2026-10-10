# CoreScript typed quant values and Gaussian HMM

CoreScript's quant layer keeps the distinction between a scalar, a bar-aligned series, persistent state, and shaped numeric data. These values are not interchangeable, and arithmetic never silently broadcasts a matrix/tensor over a price series.

## Core value families

```corescript
let scalarValue: float = 1.25;
let closingPrices: series<float> = close;
let longCondition: series<bool> = close > ema(close, 20);
let modelState: state<float> = 0.0; // persistent scalar cell, distinct from a series
let covariance: matrix<float> = identity(3);
let featureVector: vector<float> = vector(0.2, 0.4, 1.1);
let weights: tensor<float> = tensor(vector(2, 2), 1.0, 0.0, 0.0, 1.0);
let regimeConfidence: probability = 0.8;
let statePosterior: distribution<float> = hmmPosterior("regimeHMM");
```

Declared temporal types normalize aliases such as `bool` / `boolean`; scalar-to-series and series-to-scalar assignment is rejected. A series expression such as `close > ema(close, 20)` has type `series<bool>`. Use explicit indexing/reduction when you need a single scalar decision.

Structured numeric containers carry a runtime tag and their dimensions. The runtime checks matrix addition, matrix multiplication, transpose and vector dot-product dimensions. There is no implicit `matrix + close` or `matrix + 1`; call an explicit operation instead.

## Explicit linear algebra

Available primitives are `vector`, `matrix`, `tensor`, `zeros`, `identity`, `matrixAdd`, `matrixScale`, `matmul`, `transpose`, and `dot`. Matrices use row-major storage. Current browser-safe caps are 256 rows/columns per matrix (65,536 cells), 16,384 vector elements and 262,144 tensor elements; constructors reject non-finite elements and invalid dimensions.

User-defined `fn` declarations have typed parameters and a required return type. This initial inlining tier accepts a sequence of local `let`/`const` expression assignments followed by one `return`. The function is inlined before ordinary compilation so its linear algebra calls still pass the same type checks:

```corescript
fn forward(
    observations: matrix<float>,
    transition: matrix<float>
) -> matrix<float> {
    let transposed: matrix<float> = transpose(observations);
    return matmul(transposed, transition);
}

let alpha = forward(observations, transition);
```

This first tier deliberately does not implement general function-body control flow, loops, recursion, or mutable local frames. It is useful for composable linear-algebra expressions, but it is not yet a full procedural quant language for implementing every Kalman / particle-filter / GARCH algorithm. That needs first-class function IR and bounded-loop execution in a follow-on compiler step.

## High-level Gaussian HMM

```corescript
model regimeHMM: HMM<float> {
    states = 3
    emission = gaussian
    covariance = full
}

features = dataset {
    returns: pctchange(close)
    volatility: atr(14)
    momentum: rsi(close, 14)
}

fit regimeHMM on features
regime = regimeHMM.decode(features)
confidence = regimeHMM.probability(features)
posterior = regimeHMM.posterior(features)
plot regime
```

The source form lowers to typed `dataset`, `hmmFit`, `hmmDecode`, `hmmProbability`, and `hmmPosterior` calls, all handled by the existing CoreSpirit parser/IR/VM. The HMM fits bounded batches of observations using log-space Gaussian emissions and regularized covariance estimates. It filters the latest posterior per bar, skips feature warm-up rows with missing values, and replaces the latest observation when a live candle is revised at the same timestamp. Default limits are 2–12 hidden states, up to 16 feature dimensions and at most 1,024 retained observations; refitting happens in small batches to avoid fitting the full model on every tick.

This release supports Gaussian emissions and full or diagonal covariance. It is a research/runtime foundation—not a guarantee that the inferred regime predicts future returns. Quant validation should include walk-forward evaluation, leakage checks, calibrated regime stability and out-of-sample costs before using a model in automation. CoreSpirit model output remains a signal/prediction input; order intent still flows through TradingCoreOS risk checks rather than the model calling a broker.

## Verification contract

`src/services/coreSpirit/typedQuantAndHmm.test.ts` covers scalar/series assignment rejection, explicit matrix/vector operations, invalid shape rejection, typed inline quant functions, a synthetic regime sequence, posterior normalization, developing-candle replacement and the high-level HMM DSL through runtime execution.
