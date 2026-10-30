# CoreSpirit: PineTS-informed editor and runtime parity

## Intent

Use the public PineTS project as a **design and behavioral reference** for a serious chart-scripting environment, not as CoreSpirit's compiler/runtime. CoreSpirit remains its own progressively typed language, execution model, artifact format and worker runtime.

PineTS is distributed under AGPL-3.0 with a separate commercial-license option. Do not add `pinets` or `@luxalgo/vela-pinets` to the TradingCoreOS application dependency graph unless the project explicitly decides to accept the license obligations. The current live editor therefore uses CoreSpirit's own compiler and Vela engine.

Reference: https://github.com/LuxAlgo/PineTS

## What is already present in TradingCoreOS

- CoreSpirit compiler worker and typed executable artifacts.
- Artifact identity/cache and worker VM execution.
- Series/columnar market data and dependency/dirty-graph infrastructure.
- Vela scripting engine adapter with streaming, visible-range, inputs and props capabilities.
- Scene-model and incremental scene-patch output into Vela.
- Monaco language adapter with CoreSpirit syntax tokens, completions, hover, definition and compiler markers.
- The live Code panel compiles off-thread, submits the source through the workspace's indicator path, watches Vela's ready/error events and removes a failed script instead of leaving a dead legend row.
- The full CoreSpirit Coder page mounts the Monaco adapter with compiler diagnostics, symbol intelligence, completions, hover and definition navigation. The smaller embedded live-chart dock currently uses a plain textarea; keep its compile/run path shared with the same off-thread compiler, but migrate its editor surface to the shared Monaco adapter.
- The embedded dock now exposes the same Beginner / Trader / Quant / System guidance profiles as the full Coder. The selected profile is an authoring lens only; the compiler-inferred required level and sandbox capabilities remain authoritative.
- The explicit CoreSpirit feature-parity matrix currently distinguishes implemented, partial, surface-only and planned capabilities. A visible namespace or syntax entry is not proof that its provider data, runtime semantics and visual output are complete.
- The current chart history policy requests up to 5,000 initial bars per timeframe, keeps a 500-bar warm target, and loads older history in bounded viewport-demand pages. This is the current implementation, not a claim that 5,000 bars is the best cold-start default for every chart or device.

## Runtime principles to borrow

### 1. Make time-series semantics explicit

Every expression that can vary by candle should have a clear series type and history contract. Keep scalar values distinct from `series<T>`, stateful `state<T>`, and model/prediction values. Resolve history offsets and lookback requirements during compilation instead of guessing at runtime.

### 2. Separate compile from execution

The editor's Run action should compile to an immutable artifact, validate the artifact and capability set, then execute it in the worker runtime. Diagnostics must be returned against the exact source version; stale worker responses must never overwrite diagnostics or outputs for newer edits.

### 3. Keep historical, developing and realtime states distinct

Historical bars, confirmed bars, the developing bar, and forecasts need distinct semantic markers. Multi-timeframe requests must define their confirmation/lookahead behavior, and compiler analysis must flag repaint/lookahead hazards before execution or automation.

### 4. Recompute only what is dirty

Track dependencies, lookback, statefulness, incremental support and viewport sensitivity. Recompute only affected spans where safe; retain deterministic snapshots for stateful kernels and replay. A new live tick should update the active tail rather than re-run the entire dataset unless a dependency truly requires it.

### 5. Treat outputs as structured data

Plots, markers, fills, drawings, alerts, strategy intents and model outputs should be typed output channels. The Vela adapter maps those channels into Vela's neutral model; it must not create a second chart engine or bypass Vela's lifecycle.

### 6. Make Run observable

The editor must distinguish:
- syntax/type/semantic validation failure;
- artifact validation failure;
- execution started;
- first successful output / ready;
- runtime error with source location;
- stopped/removed script.

Never report "running" merely because a button click or indicator handle was created. On failure, surface diagnostics and clean up the failed instance.

## Conformance work to prioritize

1. Per-bar fixtures for scalar vs series behavior, lookbacks, state persistence and confirmed/developing bars.
2. Golden tests for common TA kernels (SMA/EMA/RSI/ATR/MACD/Bollinger) across batch, incremental and replay execution.
3. MTF tests covering gaps, session boundaries, stale data, lookahead and confirmed-only requests.
4. Differential test harnesses using public PineTS behavior as an *external oracle* for overlapping standard TA semantics, with the input data and expected differences documented. Do not vendor or execute PineTS in production as part of this harness.
5. Benchmark compiler cold start, artifact-cache hit, first plot, tail update, input change and timeframe change separately.

## Parity gaps that must remain explicit

The language feature matrix should drive implementation and release claims. The current matrix records 34 implemented, 16 partial, 3 surface-only and 7 planned entries out of 60 tracked features. Highest-impact gaps are typed mutable arrays/maps, user-defined functions and enums, import/export library syntax, full strategy/backtest execution and metrics, research optimization, concrete options-chain/Greeks/IV pricing data, corporate actions, market profile, and canonical tick-stream semantics.

Do not close a gap by adding only autocomplete, a namespace stub, or a renderer primitive. Each feature needs:
1. a language/AST/type-system contract;
2. compile-time diagnostics and capability requirements;
3. deterministic historical and developing-bar semantics;
4. an execution implementation with bounded state and cancellation;
5. typed output/data contracts into Vela or the host;
6. batch/incremental/replay parity tests;
7. user-facing examples and an observable ready/error lifecycle.

## Product rule

Pine-style editor ergonomics are welcome—syntax highlighting, completions, diagnostics, templates, Run/Stop, logs, input controls, versioned scripts and chart-linked plots. The language, runtime semantics, artifacts, optimization passes and advanced quant/model types remain CoreSpirit-native.
