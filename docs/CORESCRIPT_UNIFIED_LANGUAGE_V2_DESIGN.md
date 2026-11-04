# CoreScript Unified Language v2 — Design and Pine Capability Adoption

Status: design RFC committed as the next language direction. This document does **not** claim that the proposed syntax or every listed capability is already implemented. Existing CoreSpirit v1 programs remain governed by the current v1 compiler/runtime contract until a feature is implemented and proven by conformance tests.

Primary reference: [TradingView Pine Script release notes](https://www.tradingview.com/pine-script-docs/release-notes/). This is a behavioral and feature reference, not a source-code template. CoreSpirit must implement its own semantics and implementation.

## 1. Product goal

CoreSpirit should be the single authoring language for TradingCoreOS indicators, strategies, scans, market analytics, quantitative research, predictive models and automation.

The language should be:

- **Very easy at the beginning:** a useful indicator can be expressed in one short line with safe defaults.
- **Composable at every scale:** a simple script and a large multi-module system share the same names, types, compiler, artifact model and runtime semantics.
- **Progressively explicit:** users can introduce types, functions, loops, state, event handlers, models and resource policies only when needed.
- **Quantitative and AI capable:** matrix/tensor operations and statistical primitives are native; Python and other specialist languages can implement isolated model modules through a typed ABI.
- **Safe and reproducible:** temporal causality, repainting, permissions, data provenance, compute limits and artifact identity are enforced by the compiler and host—not left to comments or user discipline.
- **Fast on real charts:** chart evaluation remains incremental, off-thread where appropriate, cacheable and connected to Vela through the existing typed output adapter.

There is one language with multiple authoring experiences, not one language per skill level and not a separate Pine-compatible interpreter.

## 2. One semantic pipeline

Every authoring surface must normalize into the existing canonical path:

`source → edition parser/normalizer → canonical AST → name resolution → semantic/type/effect analysis → dependency graph → typed IR → optimization → backend plan → validated artifact → execution`

Keep the existing CoreSpirit compiler, AST, semantic graph, IR, VM/optimized VM, worker runtime, columnar data, kernel backends, artifact cache, incremental calculation and Vela output lifecycle. Do not introduce PineTS, a second chart engine, or a foreign-language interpreter in the candle VM.

Concise syntax is a surface transformation, not a separate runtime. A compact declaration and its expanded equivalent must produce equivalent canonical AST/IR, diagnostics, dependencies and outputs.

## 3. Editions and compatibility

A source file may declare a language edition:

```corescript
edition@1.2
```

Edition rules:

1. The edition is pinned in the compiled artifact and cache identity.
2. The compiler must reject unknown editions with an actionable diagnostic.
3. A new edition may add syntax or clarify semantics, but must not silently change the behavior of existing source.
4. Old editions remain readable through explicit compatibility normalizers and golden fixtures.
5. Editor suggestions must be edition-aware.
6. A source edition is not permission to use an unavailable runtime feature. The compiler must still check feature maturity, execution target and host capabilities.

The v1 language remains supported. Do not relabel the current v1 compiler as v1.2 until v1.2 parsing and conformance evidence exists.

## 4. Three authoring experiences over one language

### 4.1 Simple authoring

Target: one-line to a few-line indicators and simple signals.

Illustrative compact surface:

```corescript
edition@1.2
vwap(source=ohlc4, anchor=session) color=white width=1 style=line
```

Equivalent expanded surface:

```corescript
edition@1.2
vwapLine = vwap(source=ohlc4, anchor=session)
show vwapLine, color=white, width=1, style=line
```

The compact form should infer the obvious output name, chart pane and output kind. It must still lower to the same typed declaration and visual output node as the expanded form. The compiler should offer a “show expanded code” action so the shorthand is discoverable, editable and debuggable.

Another illustrative short form:

```corescript
ema(close, 20) color=blue width=2
ema(close, 50) color=orange width=2
```

Do not make whitespace, commas, or line continuation rules ambiguous. Named arguments are preferred for readability; positional arguments may be supported when the signature is unambiguous.

### 4.2 Advanced authoring

Target: full indicators, strategies, scanners and automation.

```corescript
edition@1.2
indicator "NIFTY Structure"

swing = structure(high, low, internal=5, external=20)
gaps = fairValueGaps(high, low, minSize=0.1%)
blocks = orderBlocks(swing, mitigation=close)
trend = ema(close, 50) > ema(close, 200)

show swing, gaps, blocks
show trend, color=green
```

This is a proposed authoring experience. Each callable must be registered, typed and executable before the source can compile successfully. The example is not a promise that these exact functions currently exist.

Advanced constructs should include typed functions, local and persistent state, loops, arrays, maps, matrices, tensors, enums, user-defined types, methods, modules, imports, event handlers, multi-symbol/timeframe requests, typed outputs, and explicit resource budgets. All are lowered through the same CoreSpirit pipeline.

### 4.3 Quant and system authoring

Target: large statistical systems, model research, strategies and event-driven automation.

The language should support a complete model workflow: define features, declare the target and horizon, build datasets, train or call a model, validate chronologically, inspect metrics and drift, promote a versioned artifact, and consume its prediction. Training is not run on every candle. Realtime inference is bounded and consumes a validated immutable model artifact.

## 5. Polyglot blocks: Python and other specialist languages

### 5.1 Desired user experience

Support an explicit foreign-language block, beginning with Python:

```corescript
edition@1.2

@! use python as RegimeModel
# Python source lives in this isolated module.
# Inputs and outputs are declared by the CoreScript model contract.
@! end

features = dataset(
    returns=returns(close),
    volatility=atr(14),
    momentum=rsi(close, 14)
)
regime = RegimeModel.predict(features)
show regime
```

The exact block grammar, delimiter and editor behavior are still to be implemented. The marker `@!` is a language boundary, not an instruction to evaluate arbitrary text in the browser.

### 5.2 Language backends

Use one versioned model/module ABI for specialist implementations:

- Python: research, data science and ML ecosystem.
- Julia and R: numerical/statistical research where a supported host runtime is available.
- Rust and C/C++: compiled, latency-sensitive kernels and systems components.
- ONNX: portable trained model artifacts and inference.
- WASM: deterministic, sandboxable portable kernels.
- Remote services: controlled RPC for isolated compute where local runtime is unsuitable.

A language is available only when its execution adapter, compiler/runtime image, provenance, security policy and conformance suite are installed. Syntax highlighting or a language label is not proof of runtime support.

### 5.3 Mandatory module contract

Every foreign module must declare:

- language and language/runtime version;
- immutable source/package/artifact digest and dependency lock;
- named input/output schema, dtype, dimensions and units;
- training, validation and inference entry points, where applicable;
- deterministic seed and state/rollback policy;
- memory, instruction/step, input/output, concurrency and wall-time limits;
- data classes it may read and output channels it may write;
- expected latency and whether it is eligible for incremental or realtime inference.

The host validates the schema and artifact identity before execution and validates every returned tensor/value after execution. Results are tagged with source/model version, input fingerprint, timestamp, confirmation phase and status.

### 5.4 Hard execution boundary

Never run raw Python with `eval`, `exec`, Pyodide or arbitrary user packages inside the chart worker or per-candle VM. Do not expose broker credentials, environment secrets, filesystem, arbitrary network access or order-routing authority to foreign code.

Keep compilation/training in isolated, asynchronous research jobs. Keep live inference to a bounded host adapter with a strict ABI, cancellation, timeout, memory/step limits, stale-result handling and version/fingerprint checks. A model can produce typed predictions or advisory signals. TradingCoreOS risk and execution authorities remain the only path to order submission.

The existing Python ML service, model ABI and external model orchestration are the starting point. Extend them rather than building a second Python integration.

## 6. Pine capability adoption catalogue

The release-note history shows that Pine is not only an indicator formula language. It has developed a large family of data, language, visualization, strategy and editor features. Adopt the useful capabilities, not Pine's exact syntax or source implementation.

### A. Series, history and time semantics

Adopt:
- scalar versus series qualifiers and explicit history references;
- rolling windows, persistent state and per-bar execution;
- confirmed, developing, realtime, historical, replay and forecast phases;
- session/timezone/calendar/time-bar utilities and non-standard chart context;
- explicit gaps, lookahead, lower-timeframe and higher-timeframe behavior;
- deterministic replay, correction handling and repaint/lookahead diagnostics.

CoreSpirit already has typed series and temporal values, phase-aware semantics, causal analysis and repaint-safety contracts. Improve test coverage and user ergonomics before creating parallel concepts.

### B. Market and external data

Adopt a typed request model for:
- multiple symbols and timeframes, including dynamic requests;
- lower-timeframe intrabar data with clear aggregation and confirmation semantics;
- tick/trade/quote and bid/ask data where the provider supports it;
- order book, footprint, volume rows and volume profile;
- financial/fundamental/economic series and corporate events where licensed data exists;
- dividends, splits, earnings, futures metadata and currency conversion;
- options chains with expiry, strike, CE/PE, lot size, OI, IV and Greeks when actual instrument-level provider data is connected.

Data requests must declare source, symbol, timeframe, required history, freshness, availability time, confirmation policy, gaps policy and resource cost. A namespace or function name without a real provider/data contract must be labelled unavailable—not represented as implemented.

### C. Language and reusable abstractions

Adopt:
- typed variables, declarations and reassignment;
- first-class arrays, maps, matrices, vectors and tensors;
- general user-defined functions with return types, local scope and bounded recursion/loop policies;
- user-defined data types, enums and methods;
- safe function overloading and optional/default named parameters;
- loops, iteration, switch/match and conditional expressions;
- source modules with import/export and semantic versioning;
- multiline strings, formatting, parsing, regex and robust string utilities;
- reusable libraries with dependency lock, publisher identity and version pinning.

These are among the largest gaps in the current matrix. Prioritize them as a coherent language foundation rather than implementing isolated syntax tokens.

### D. Technical analysis, statistics and quant

Adopt a broad, tested standard library:
- moving averages, RSI, MACD, ATR, volatility/band/channel and trend measures;
- rolling statistics, percentiles/quantiles, correlations, covariance, beta, regression and distributions;
- vector/matrix/tensor operations and numerical decompositions;
- order-flow, liquidity, market structure and profile analytics;
- probability, regime detection, filtering, HMM, Kalman and other state-space methods;
- feature pipelines, dataset construction and experiment tracking;
- model fit/predict/evaluate, walk-forward validation, out-of-sample metrics, calibration and drift.

Every primitive requires documented units, missing-value behavior, warm-up rules, causality, numerical stability, complexity and batch/incremental/replay equivalence.

### E. Visual and chart outputs

Adopt typed visual outputs for:
- plots, histograms, custom candles/bars and chart coloring;
- markers, shapes, characters, arrows and icons;
- horizontal/diagonal lines, line fills, boxes, zones and polylines;
- labels, text, formatting, tooltips and tables including merged cells;
- gradients, fills and layered drawing order;
- overlay/pane/scale placement, price/time anchoring, offsets and visibility per chart/status/data-window surface;
- retained object identity, updates, deletion and object limits.

All outputs must use CoreSpirit's scene/output ABI and Vela's retained scene lifecycle. Never fake native objects with screenshot-like images or add a competing chart renderer.

### F. Alerts, strategies and execution simulation

Adopt:
- alert conditions, dynamic messages and alert events;
- strategy entry/exit/reversal, pyramiding, brackets, stop/limit/trailing and OCO-like semantics;
- position, trade, equity, drawdown and performance metrics;
- commission, slippage, spread, margin, leverage, lot/tick sizing and capital assumptions;
- order-fill events, intrabar/historical-tick simulation and configurable bar-close behavior;
- realistic latency, partial fills and broker/provider constraints where the simulation model supports them.

Historical backtesting and live execution are separate targets. A strategy emits broker-neutral order intent; host policy, risk checks, user authorization and execution authority decide whether anything reaches a broker. Forming bars, lookahead results and forecasts cannot silently authorize live orders.

### G. Debugging, profiling and authoring workflow

Adopt:
- source-mapped compiler/type/effect errors and warnings;
- autocomplete, signature help, hover, go-to-definition, rename, references and formatting;
- breakpoints, step/debug traces, per-bar inspection and execution graph visualization;
- runtime logs, resource/latency diagnostics and profiling;
- indicator inputs with validation, grouping, inline layout, options and tooltips;
- source version history, publish/import/library workflows and reproducible examples;
- explicit status for compile, validation, run, first output, stopped, failed and stale.

Editor affordances should not be confused with runtime features. A visible button or autocomplete entry is not implementation evidence.

## 7. Current source-of-truth gap baseline

The source file `src/services/coreSpirit/languageParity.ts` currently tracks 60 capabilities:

| Source status | Count |
|---|---:|
| Implemented | 33 |
| Partial | 17 |
| Surface only | 3 |
| Planned | 7 |
| Total | 60 |

This count is taken from the current source matrix. Older narrative documents contain a different count and should be reconciled against this source when their trackers are next updated.

Highest priority missing/incomplete language capabilities:
1. typed arrays and maps with safe mutation/iteration and memory budgets;
2. general typed functions, local frames, loops and methods;
3. enums, complete matrix/vector kernels and collection methods;
4. import/export modules and versioned library dependencies;
5. end-to-end strategy simulation, realistic fill model and full performance metrics;
6. fully specified multi-timeframe confirmed/gaps/lookahead/session semantics;
7. provider-backed option chain/Greeks/IV and canonical tick semantics;
8. real data contracts for fundamental, economic and corporate-action series.

Do not change a matrix entry to `implemented` until conformance evidence exists.

## 8. Implementation order and acceptance gates

### Phase 0 — Freeze the language contract

- Treat v1 as the compatibility baseline.
- Specify the v1.2 edition header, concise grammar, operator precedence, names, comments, source spans and error recovery.
- Specify compact-to-canonical-AST lowering.
- Add golden AST/IR fixtures and source maps for compact and expanded forms.

Gate: compact and expanded sources produce equivalent canonical artifacts and outputs.

### Phase 1 — Finish the general language core

- Arrays, maps, matrix/vector operations and checked shape semantics.
- First-class functions, local frames, loops, iteration and methods.
- Enums, pattern matching and user-defined data types.
- Module import/export and immutable dependency resolution.
- Explicit allocation, iteration, recursion and execution budgets.

Gate: parser/type/IR/runtime fixtures, fuzz and malformed-input tests, batch/worker parity, deterministic replay and cancellation/resource tests.

### Phase 2 — Complete Pine-class trading features

- Input/settings schema as true typed inputs, not editor-only lets.
- Multi-timeframe confirmation, gaps, lookahead, exchange calendar and lower-TF tests.
- Strategy/backtest engine and realistic cost/fill assumptions.
- Complete visual-output contract and Vela parity.
- Alerts and event semantics tested in historical, replay and realtime modes.

Gate: documented feature-by-feature parity fixtures and clear unsupported-data/provider behavior.

### Phase 3 — Polyglot model modules

- Formalize the existing external-model ABI for source modules and compiled artifacts.
- Implement the `@! use <language>` parser/source-map node and editor block experience.
- Build Python first using an isolated runtime image and locked dependencies.
- Add versioned module build, model registry, signatures, input/output validation and immutable artifacts.
- Add Rust/C++/WASM/ONNX and then Julia/R adapters only where operationally supported.
- Separate async training/research from bounded streaming inference.

Gate: hostile-input isolation tests, resource exhaustion tests, artifact tamper rejection, deterministic/replay tests, timeout/cancellation, version mismatch and output-schema failure tests.

### Phase 4 — Advanced data and quantitative workflows

- Provider-backed options chain, Greeks and IV with contract/expiry/lot-size identity.
- Canonical tick/trade/quote objects and event-time ordering.
- Market profile, corporate actions and fundamental/economic feeds.
- Walk-forward optimizer and experiment promotion with strict out-of-sample economics and drift controls.

Gate: provider provenance, timestamp/freshness, licensing and coverage tests; no synthetic data presented as live.

### Phase 5 — Production performance and UX

- Editor, compiler, worker, artifact cache and Vela output lifecycle benchmark suite.
- Measure cold compile, cache-hit compile, first plot, tail tick, input change, timeframe change, replay and large historical load.
- Profile low-memory devices and concurrent scripts; make scheduling adaptive and observable.
- Keep the UI's Beginner / Trader / Quant / System profiles as teaching lenses, not semantic restrictions.

Gate: no regression in chart startup/update latency, memory, bundle budgets, output determinism or visual identity; verified in browser under realistic data volume.

## 9. Non-negotiable invariants

1. One language, one AST, one semantic model, one artifact ABI.
2. Syntax sugar must not create another runtime path.
3. No arbitrary foreign-language code in the per-candle chart VM.
4. No implicit lookahead, repainting, future leakage or confirmed/developing data mixing.
5. No model promotion from training accuracy alone; chronological holdout, costs, stability and provenance remain mandatory.
6. No broker side effects from the compiler, Python block or chart renderer.
7. Vela remains the terminal/chart owner.
8. No feature is called production-ready without parser, semantics, runtime, resource, output and conformance evidence.
9. Do not copy Pine source code or vendor a runtime whose license obligations have not been explicitly accepted. Implement independently from documented behavior.

## 10. Repository implementation map

Extend the existing foundations rather than creating competing systems:

- Language/edition/surface: `languageSpec.ts`, `languageConcepts.ts`, `surfaceForms.ts`, `syntax.ts`.
- Grammar and canonical representation: `lexer.ts`, `parser.ts`, `ast.ts`, incremental compiler and source-map contracts.
- Types/effects/capabilities: semantic type system, semantic analyzer, `coreScriptLanguagePolicy.ts`, capability sandbox and execution target.
- Library APIs: `standardLibrary.ts`, `standardLibraryNamespaces.ts`, component contracts and numerical kernels.
- Planning/runtime: semantic dependency graph, IR, optimizer, execution planner, VM, stateful kernels and worker pool.
- External code/models: `modelAbi.ts`, `modelOrchestration.ts`, `pythonMlModelAdapter.ts`, `ml/` and model artifact lifecycle.
- Research: research validation, dataset/artifact provenance, batch training, out-of-sample economics and model promotion.
- Visuals: CoreSpirit output/scene ABI and Vela output adapter.
- Proof: `languageParity.ts` plus contract tests; update source status only with evidence.

The first delivery should establish this design and compatibility contract. Subsequent commits should land one independently testable capability slice at a time. Do not attempt to mark all Pine features complete in one large change.
