# CoreSpirit — language, compiler and execution

CoreSpirit is TradingCoreOS's only user-facing scripting language for indicators, models, visuals and automation.

## Compiler model

```
source
 → CST/tokens
 → normalized AST
 → semantic model
 → IR
 → one reactive VM/runtime
```

Users write CoreSpirit declarations; they do not need to understand IR, renderer internals or broker authority.

## Language foundations

CoreSpirit's small semantic surface is built around:

`DATA / LET / WHEN / SHOW / MODEL / AUTOMATE`

Typed series, dependency graphs, deterministic replay, source maps, capability sandboxing and renderer-neutral visual intent are compiler/runtime concerns.

## Stateful mathematics

The canonical bounded-state layer is:

```
RollingSum
RollingMean
RollingVariance
RollingMin / RollingMax
RollingMedian
RollingPercentile
RollingAbsoluteDeviation
EMA
Wilder
ATR
WMA
VWAP
```

The execution rule is:

> A fixed-period historical calculation must not recreate and rescan the same period-sized window for every bar when an equivalent bounded state machine exists.

Implementation strategy:

| Operation | State | Typical hot-path cost |
|---|---|---:|
| Sum / mean | ring buffer + running sum | O(1) |
| Variance / stdev | running moments | O(1) |
| Min / max | bounded extrema tree for append + forming-bar replacement | O(log P) |
| Median / percentile | ordered statistics | O(log P) expected |
| WMA | running weighted state | O(1) |
| EMA / Wilder | recursive state | O(1) |
| ATR | true-range + Wilder state | O(1) |
| VWAP | session accumulator | O(1) |

A monotonic deque remains the preferred structure for scans that have monotone append semantics, including centered extrema. Forming-bar replacement is different: arbitrary point replacement can invalidate a dominated deque entry, so `RollingMinMax` uses a bounded segment tree.

## Fused execution

Compatible deterministic series chains are executed through one chronological traversal with bounded state and one final output buffer. The semantic dependency graph decides fusion eligibility; regex/source-text discovery is not an execution mechanism.

```
source series
  → stateful stage
  → scalar handoff
  → stateful stage
  → final output
```

`seriesVector.ts` now delegates fused stages to the canonical stateful kernel classes. It remains a fusion/execution planner, not a second mathematical kernel library.

## Indicator authoring

Authors should normally express the mathematical calculation directly:

```corespirit
let basis = ema(close, 20)
let upper = basis + atr(14) * 2
show line(basis)
show line(upper)
```

The compiler/runtime absorbs rolling buffers, incremental state and execution planning.

Manual `slice()`, `reduce()`, repeated `Math.max/min` window scans and `sort()` inside a historical loop are prohibited when a canonical kernel can express the same operation.

## Revisions and forming bars

A forming candle is a replacement, not a new historical bar. Stateful kernels therefore support `append` and semantically valid `replace` operations.

A replacement must update the current state slot without advancing the cursor, then repair any dependent state that observes the changed value.

## Dirty spans

CoreSpirit has a causal lookback model and the chart engine can evaluate a bounded affected range plus warmup. This is implemented on the primary backfill path, but it is **not yet universal across every renderer/model collection and overlay type**.

The target is:

```
history mutation
 → dirty [from,to]
 → causal warmup
 → CoreSpirit range execution
 → renderer-neutral range delta
 → Vela replace-range patch
```

The fallback full recomputation path remains legal when a dependency cannot prove a smaller safe range.

## Performance boundary

The runtime should optimize the user's source without expanding CoreSpirit into a large collection of manual optimization keywords. Stateful kernels, semantic scheduling, dirty ranges and fused execution are compiler/runtime machinery.

## v131 deep kernel pass

- Scalar indicator compatibility helpers now route period work through the canonical stateful kernels rather than reconstructing windows with `slice/reduce/spread`.
- The forming-bar replacement path for `RollingMinMax` is corrected so replacement does not advance the rolling cursor.
- Recursive EMA/Wilder/ATR state keeps an explicit stable prior value; ATR replacements use the prior bar's close rather than the forming bar's own revised close.
- The existing numerical kernel tests continue to serve as parity guards.
- Fused kernel deduplication is complete; the remaining deep phases are Vela's final columnar ABI, universal dirty-span propagation and authenticated browser/GPU verification.


## Unified language architecture

CoreSpirit is one language with progressive authoring depth, not separate beginner/trader/quant/system languages.

```text
Beginner → Trader → Quant → System
     \         |         |        /
      \        |         |       /
       └──── shared lexer/parser ─────┘
                    ↓
              semantic graph
                    ↓
             shared executable IR
                    ↓
             shared runtime / VM
                    ↓
        backtest · replay · live
```

### Authoring levels

- **Beginner:** `DATA`, `LET`, `WHEN`, and `SHOW` for single-symbol indicator work.
- **Trader:** multi-symbol/timeframe market handles, explicit dependency graphs, strategy signals, and broker-neutral order intents.
- **Quant:** statistical factors, first-class `feature<T>`, `featureSet<T>`, `model<T>`, `prediction<T>`, `probability`, `distribution<T>`, research plans, and backtest evaluation metadata.
- **System:** reactive `on` blocks plus host-routed automation and risk queries. System scripts can request intents/events but cannot acquire broker credentials or call broker APIs.

### One semantic graph

Models are graph participants rather than a separate Python island. Declared model inputs become `model-input` nodes, model inference becomes `model-output` nodes, and the same market/feature dependencies feed indicators, predictions, signals, visualization, and automation. The runtime may use host adapters for Python/ONNX/WASM/native inference, but the semantic contract remains CoreSpirit.

Namespace-qualified APIs such as `ta.ema`, `stats.beta`, `math.log`, `orderflow.depthImbalance`, `strategy.signal`, `model.predict`, `automation.notify`, and `events.signal` resolve through the same callable registry as unqualified builtins. Catalog-only domains are explicit and cannot be executed until their deterministic runtime contract is registered.

### Temporal/model type discipline

```text
series<T>        observed historical/vector data
confirmed<T>     finalized value
developing<T>    forming/realtime value
prediction<T>    model-produced estimate
forecast<T>      explicitly future-oriented value
probability      bounded confidence/probability semantic
feature<T>       model input value
featureSet<T>    grouped model inputs
distribution<T>  statistical distribution
```

These are not aliases for `series<float>`. The semantic analyzer preserves their value kind so model outputs cannot silently become observed market history.

### Automation authority

```text
CoreSpirit
   ↓
signal / automation event / order intent
   ↓
TradingCoreOS execution authority
   ↓
risk → policy → execution
   ↓
broker adapter
```

CoreSpirit can ask the host to notify, route, query risk, or construct an order intent. It does not submit, modify, cancel, or square off broker orders.

## Authority boundary

Indicator and model computation cannot directly authorize broker execution. Risk and execution authority remain outside the numeric VM.

## Runtime architecture — hot VM extraction (v132)

The CoreSpirit runtime is an orchestration facade, not the hot execution loop. The hot loop now lives in CoreSpiritExecutionVM.

```text
CoreSpiritRuntime
  ├─ CoreSpiritExecutionVM       ← tiny instruction dispatch loop
  ├─ CoreSpiritStateStore        ← transactional runtime state
  │    └─ CoreSpiritSeriesStore  ← bounded series + mutation journal
  ├─ CoreSpiritOutputCollector   ← bounded output sink
  ├─ CoreSpiritEventRouter       ← event emission boundary
  ├─ CoreSpiritCapabilityHost    ← data/model/capability boundary
  └─ CoreSpiritDebugHost         ← bounded diagnostics/trace host
```

The VM is deliberately dependency-light. It does not know about the DOM, broker, network, Vela renderer, Supabase or workspace behavior. Runtime-specific operations are supplied through a narrow host interface.

This preserves the single CoreSpirit IR / single VM model while removing orchestration responsibilities from the instruction-dispatch hot path.

### Hot-loop invariant

The hot VM should remain close to:

```text
fetch instruction
→ execute primitive
→ advance program counter
```

Abort checks are amortized every 1024 instructions. Fused series dispatch remains an indexed lookup and the VM emits into a bounded collector rather than constructing another output pipeline.

## Realtime state architecture — checkpoint + copy-on-write journal (v132)

Forming-bar evaluation no longer clones the complete CoreSpirit series/local/cross state on every tick.

The realtime lifecycle is:

```text
committed bar N
   ↓
begin mutation journal
   ↓
mutate working state
   ↓
evaluate + publish
   ↓
tick replacement
   ↓
rollback journal
   ↓
begin new journal
   ↓
evaluate again
```

The journal records only state keys touched by the forming-bar evaluation. Existing bounded arrays retain their identity where possible; replacements retain the previous array reference. Cross-state entries are journaled per key.

This makes rollback proportional to **mutated state**, not the entire runtime state graph.

Cold-path checkpoint export/import is still allowed to clone state because persistence and recovery are not realtime hot paths.

### State-safety rules

- A forming candle is never committed twice.
- Replacing a forming candle never advances a historical cursor.
- A realtime rollback restores the pre-forming-bar state without rebuilding the complete state graph.
- getState({ clone: false }) is used by the realtime execution result path; callers requiring an isolated snapshot continue to use the default cloned form.
- Broker execution authority remains outside the CoreSpirit VM.

## Runtime boundaries

The following responsibilities are explicitly outside CoreSpiritExecutionVM:

| Concern | Owner |
|---|---|
| instruction dispatch | CoreSpiritExecutionVM |
| series/local/cross transactional state | CoreSpiritStateStore / CoreSpiritSeriesStore |
| emitted script objects | CoreSpiritOutputCollector |
| event delivery | CoreSpiritEventRouter |
| data/model/capability resolution | CoreSpiritCapabilityHost |
| debug trace | CoreSpiritDebugHost |
| workspace/UI orchestration | CoreSpiritRuntime + host application |
| broker order authorization | TCO risk/execution layer |

The architecture deliberately does not introduce new CoreSpirit language keywords for these mechanisms.


## v130 hot-path architecture
CoreSpirit's execution VM is the smallest instruction-dispatch layer. Runtime remains lifecycle/orchestration; state, series mutation, events, outputs, capabilities and debugging are host services. Forming-bar rollback uses a checkpoint plus mutation journal instead of cloning retained-bar state. Runtime RSI, ATR and session VWAP use canonical incremental kernels with append/replace semantics.

### Canonical v92 architecture record
- Complexity absorber: complexity is absorbed by semantic/compiler/runtime layers rather than language forks.
- Standard-library namespaces: library discovery is namespaced and deterministic.
- Progressive authoring: deeper capabilities stay behind DATA / LET / WHEN / SHOW / MODEL / AUTOMATE.


## v136 — CoreSpirit as an actual compiler

CoreSpirit now treats compilation as an explicit, serializable pipeline rather than “parse and lower”:

```text
source
  ↓
CST / protected surface normalization
  ↓
AST
  ↓
semantic analysis + name resolution
  ↓
semantic dependency graph
  ↓
typed, contract-validated IR
  ↓
instruction dependency graph
  ↓
time-series optimizer
  ↓
execution plan
  ↓
CoreSpiritExecutionVM / specialized host
```

The compiler records this order in `compilerPipeline` metadata on the executable artifact. The VM contract stays at IR v1, so the architecture gains explicit compiler stages without introducing a second execution language or a second VM.

### Semantic graph before execution

`semanticDependencyGraph` captures source intent at the AST layer: data sources, symbols, components, models and model outputs, conditions, events, visuals and order intents. The instruction-level `graphs` bundle then maps the optimized IR into execution, visual and reactive dependency structures.

This distinction matters: source semantics explain *what* the program means; the instruction graph explains *how* the host can execute that meaning.

### Typed IR boundary

Type validation remains a semantic compiler responsibility. The emitted IR is only accepted by the stable `irContract`; source provenance, surface metadata and semantic graph identity travel with the artifact so replay, caching, debugging and future backends do not need to reinterpret source syntax.

### One artifact, one runtime

The compiler produces one `CoreSpiritExecutableArtifact` containing the IR plus its semantic/optimization/execution metadata. Historical, replay and realtime hosts continue to execute the same artifact through the existing execution VM and host contracts.

## Unified language architecture — four authoring depths

CoreSpirit is now treated as one trading-native language with four progressive authoring depths. The surface remains intentionally small; deeper semantics are compiler capabilities, not separate languages.

```text
Beginner
  DATA / LET / WHEN / SHOW
      ↓
Trader
  multi-symbol + strategy signals
      ↓
Quant
  features + statistics + models + predictions + research
      ↓
System Builder
  events + automation + host-owned risk/execution requests
```

All four levels compile into the same executable artifact and the same runtime family. The artifact records `authoringLevel` and `languageCapabilities` so the IDE can progressively expose detail without forking the language.

### First-class semantic values

CoreSpirit no longer treats every computed number as an interchangeable `series<float>`. The type system recognizes model and research semantics such as:

`model<T>` · `prediction<T>` · `probability` · `forecast<T>` · `distribution<T>` · `feature<T>` · `featureSet<T>` · `dataset<T>` · `trainingData<T>` · `experiment<T>` · `modelArtifact<T>`

A prediction remains semantically distinct from an observed market series. A forecast is explicitly future-oriented, while a probability carries its own semantic unit. This distinction is preserved through semantic analysis and IR generation.

### Quant and model graph

```text
market data
   ↓
features / indicators / statistics
   ↓
model declaration
   ↓
prediction / probability
   ├── visualization
   ├── signal
   ├── research evaluation
   └── automation event
```

Model declarations are declarative metadata. The compiler lowers model references and prediction calls to host-provided model resolvers; CoreSpirit does not create a second Python execution environment.

### Shared data dependency graph

Multi-symbol and multi-timeframe access is represented as an explicit dependency graph in the executable plan. The same graph drives batching, chronological execution, fusion eligibility and incremental invalidation.

```text
NIFTY 5m ─┐
          ├─ dependency DAG ─→ feature graph ─→ model graph
BANKNIFTY ┘
```

### Automation is a host request, never broker authority

`risk.allowed()`, `automation.notify(...)`, and `automation.route(...)` are host capabilities. They produce decisions/events or order-intent requests; they do not expose broker credentials or broker APIs to the CoreSpirit VM.

```text
CoreSpirit
   ↓
signal / event / order intent
   ↓
TradingCoreOS execution authority
   ↓
risk → policy → execution adapter
   ↓
broker
```

Vela remains a visualization consumer. It can project CoreSpirit signals and order intents into its scene graph, but it cannot authorize or submit broker execution.

## Canonical incremental invalidation and correction replay

CoreSpirit uses the existing `CoreSpiritDirtyGraph` as the shared dirty-range planner. Do not introduce a second invalidation graph in the renderer, individual indicators, or runtime adapters.

- Dirty ranges are absolute-history, half-open intervals: `[from, to)`.
- A forming candle update is a replacement of the current bar, not an append.
- Bounded-window nodes expand the affected range by their proven forward horizon.
- Recursive/stateful nodes invalidate through the execution tail.
- Historical correction planning must restore state from a checkpoint strictly before the changed interval.
- When no safe checkpoint exists, the plan explicitly becomes a full graph replay from bar zero. A partial dirty-range plan must never be returned while the stateful runtime still requires full replay.
- With a safe checkpoint, only the causally affected subgraph is replayed, starting at the checkpoint and continuing to the execution end. Unrelated indicator branches remain reusable.
- The execution plan's ranges, replay origin, and instruction set must agree; adapters must not infer a narrower range than the planner emits.

The canonical compiler contract remains the existing source → parser/name resolution/semantic analysis → semantic graph → Core IR → optimizer/dependency graph → backend and execution plans → `CoreSpiritExecutionVM` boundary. The semantic graph describes meaning; the instruction dependency graph describes scheduling. They are related views of one executable artifact, not separate compilers or runtimes.

Contract coverage: `canonicalCompilerPipelineContract.test.mjs` and `dirtyGraphContract.test.mjs`.


## Stateful kernel parity, backend cost, and editor revision contract

### Stateful smoothing kernels

`CoreSpiritIncrementalSmoother` is the explicit incremental path for EMA and Wilder RMA. It tracks absolute bar identity and the state immediately before a forming bar, so repeated updates to that bar restore the prior state and replace the observation rather than advancing the recurrence multiple times. It also supports deterministic replay, reset, and versioned checkpoint snapshots.

- Batch kernels remain the numerical reference implementation.
- Non-finite inputs follow the existing batch contract: EMA resets to the next finite seed; RMA resets and requires a full finite seed period.
- A historical correction should replay the corrected history or restore a compatible pre-correction checkpoint before replaying forward; never patch a recursive output alone.
- Checkpoints are versioned and validate operation, period, state shape, and bar position before restore.
- The incremental stateful contract compares EMA/RMA against batch output across deterministic randomized histories, invalid gaps, repeated forming-bar replacements, reset, and checkpoint restore. Broader numerical-kernel parity remains covered by `numericalKernelsContract.test.mjs`.

### Backend planner is cost-aware, not backend-first

The execution planner first requires a registered, exact kernel adapter and respects deterministic/stateful constraints. It then compares estimated CPU work with end-to-end accelerated cost, including transfer volume, backend startup/warmup, and immediate-result handoff. Optional throughput/latency inputs let browser telemetry replace conservative defaults.

- Small or latency-sensitive work stays on CPU when offload overhead dominates.
- Large historical pure workloads can use a compatible registered WASM kernel when measured/estimated savings exceed transfer and startup costs.
- GPU remains unavailable unless an actual registered adapter supports the exact operation; stateful recurrences and effects are not sent to GPU by this planner.
- These values are estimates, not benchmark claims. Tune them using real workload telemetry and numerical parity tests, not marketing throughput.

### Editor-to-output revision identity

Run is bound to the exact current editor source and compiled artifact. A prepared artifact whose source hash differs from the current draft is rejected. If the source changes while an asynchronous chart run is in flight, that run's result is discarded rather than being shown beside newer code. Successful run metadata carries source version, source hash, and artifact hash so the UI can expose which revision produced the visible output.

Contract coverage: `incrementalStatefulKernelContract.test.mjs`, `numericalKernelsContract.test.mjs`, `backendPlannerIntegrationContract.test.mjs`, and `coreSpiritEditorCompilerContract.test.mjs`.

## CoreSpirit ↔ Vela ownership and time contract

### One execution owner, one chart renderer

CoreSpirit owns CoreScript compilation, artifact identity, runtime state, chronological evaluation, signal creation, and numerical truth. Vela owns chart series, panes, time/price scales, drawing models, scene retention, and pixels. The TCO adapter is a translation boundary, not a second evaluator:

```text
Canonical chart history / Vela DataProvider
                 |
                 v
        CoreSpirit data snapshot
                 |
                 v
     CoreScript → validated artifact
                 |
                 v
      CoreSpirit worker execution
                 |
                 v
      normalized output revision
                 |
                 v
        Vela native scene patches
                 |
                 v
          Vela render frame
```

A render/frame notification must not compile or evaluate a script. A viewport notification may request a separately declared viewport-dependent calculation from CoreSpirit, but repainting, resizing, crosshair movement, and patch application do not implicitly request a full calculation. No CoreSpirit VM code draws directly to a canvas.

### Canonical data ownership

The active chart/data provider and TradingCoreOS canonical data plane own the source timeline. CoreSpirit receives an immutable run snapshot and owns only its artifact, execution state/checkpoints, and derived outputs. The Vela engine's normalized-bar cache is a derived adapter cache, not an authoritative market-data store; its rows and returned snapshot are immutable to asynchronous run consumers. A runtime snapshot is not an independently mutable second history store; refresh it only when the host's dataset revision changes. The adapter normalizes the forming bar and newly appended rows incrementally, then returns a frozen snapshot so an in-flight worker cannot observe later cache edits.

For high-frequency updates, read the host's current bar accessor once to form a stable worker request. Do not repeatedly clone the complete candle array just to paint a frame. Historical completion/backfill may fingerprint or normalize full history; a normal forming-bar tick should use bounded tail/revision checks.

### Timestamp and index boundary

- CoreSpirit normalized OHLCV bars use ISO timestamps; numerical market-frame columns use epoch seconds.
- Vela native chart time is epoch milliseconds.
- `velaOutputAdapter.ts` owns time conversion and canonical-bar alignment before the output enters a retained Vela scene.
- Series points are required to resolve to a bar in the current input timeline. A point with an unknown timestamp or a claimed `metadata.barIndex` inconsistent with that timestamp is rejected rather than rendered one candle off.
- Drawing geometry that uses bar-time coordinates is normalized at the same boundary. Viewport coordinates remain viewport coordinates and must not be interpreted as epoch time.
- Dirty spans passed to Vela's retained scene are expressed in Vela's time unit. Never compare CoreSpirit epoch seconds directly with Vela millisecond dirty bounds.
- A bar prepend/backfill starts a new dataset revision. A forming-candle update retains that candle's canonical opening timestamp and replaces its prior value.

### Compute and render have separate schedules

Worker execution produces a fully validated output snapshot. Vela-facing adapters compare its `streamId`, `datasetRevision`, and `outputRevision` before committing it. Delayed or duplicate responses cannot overwrite a newer scene. The chart-output controller atomically publishes the newest accepted snapshot into Vela's native model; Vela's own renderer scheduler coalesces repaint work into its next frame. The TCO adapter does not add a second `requestAnimationFrame` loop, create an overlay canvas, or evaluate scripts from a render callback. If a model update fails, the adapter attempts to restore the previous committed snapshot.

The CoreSpirit output dispatcher upserts series values by timestamp rather than treating every update to the forming candle as an append. Stable signal and visual identities similarly replace their developing-bar value rather than accumulating duplicate chart objects.

Regression coverage: `velaOutputAdapterContract.test.mjs`, `velaRevisionedScenePatchContract.test.mjs`, `velaIncrementalPatchContract.test.mjs`, `revisionedRangePatchContract.test.mjs`, and `coreSpiritVelaCapabilityContract.test.mjs`.

## CoreSpirit ↔ Vela ownership and scheduling contract

- CoreSpirit is the sole owner of CoreScript compilation, semantic analysis, execution state, and indicator values. Vela is the sole owner of chart series, coordinate transforms, scene storage, and rendering. The output controller accepts completed output objects; it must not compile or execute scripts.
- The canonical market-data source remains host/Vela-owned. CoreSpirit's adapter normalizes timestamps and creates isolated worker snapshots where asynchronous execution requires them; these snapshots are execution inputs, not a second mutable source of truth.
- CoreSpirit uses epoch seconds internally and Vela uses epoch milliseconds at the rendering boundary. Bar-opening timestamps, not array length or an assumed fixed session duration, establish output alignment. A series point that cannot be mapped to the input timeline is rejected rather than drawn one bar late.
- Incremental history reuse requires stable opening-time anchors. A prepend or index-shifting timeline change forces full normalization and downstream replay; duplicate or non-chronological opening timestamps are rejected. An explicit backfill event always takes the full-refresh path.
- Compute and render scheduling remain separate. Worker results are revision-gated before they mutate retained scene state. The output controller commits immutable output data into Vela's renderer-owned model; Vela decides when the next frame paints. A render frame never initiates CoreSpirit evaluation.
- Live forming-bar replacements, historical corrections, symbol/timeframe switches, and stale worker replies must be tested against timestamp-to-bar-index alignment as well as output values.

## Live computation coalescing and Indian market clock

- Raw trade events are still processed by the market-data plane in sequence. Coalescing is applied downstream to the expensive chart-script snapshot evaluation: one worker job may run at a time and pending updates collapse to the newest canonical tail revision.
- A queued work item stores revision metadata and a compact tail signature, not a full copy of the candle history. The full isolated bar snapshot is created only when the scheduled job starts. Backfills, runtime-affecting input changes and stopped sessions clear or dispose pending jobs; revision checks prevent stale worker results from being committed.
- The chart's normal renderer scheduler remains independent. Do not add a second animation-frame scheduler to the CoreSpirit renderer adapter; use the existing Vela frame path and performance telemetry for frame-time, long-frame, backend, stage and update-latency measurements.
- The canonical hot path normalizes OHLCV into the retained cache with one-bar replacement/append behavior, and only snapshots a bar array across an async execution boundary. Compatibility object views must not become an independently mutable full-history store.
- TCO's candle countdown is session-aware and uses Asia/Kolkata: it is hidden before 09:15 IST, after 15:30 IST, on weekends, for stale prior-day bars, and for daily/weekly/monthly bars. The last intraday bar is capped at the regular-session close. This is a regular-session policy, not a guarantee of exchange holiday or special-session availability.
- CoreScript source selectors may use a recognized bare OHLCV default such as `input source = close`; other string defaults remain quoted and numeric/boolean defaults remain typed literals.


## Canonical CoreScript language contract (P0)

This section is normative for new compiler and host work. It formalizes the existing canonical pipeline; it does not define a second parser, interpreter, model language, or automation language.

### Compilation and artifact identity

Every executable CoreScript source must pass through the existing canonical pipeline:

```text
source + language/compiler target
  → canonical parser / normalized AST
  → name resolution + semantic analysis
  → semantic dependency graph
  → typed IR contract validation
  → optimizer + execution plan
  → CoreSpiritExecutionVM or a validated specialized host
```

The editor, research worker, backtest runner, and live chart runner must consume the same compiler-produced artifact for the same source and target configuration. A host may provide a specialized execution backend, but it must not reinterpret source syntax or silently substitute different language semantics.

Artifact compatibility is explicit. An artifact is executable only when its declared language/compiler compatibility range and IR contract version are supported by the receiving runtime. Unknown future versions, malformed metadata, and incompatible IR versions fail closed with a structured compatibility diagnostic; they must not be guessed or silently downgraded.

### Normative semantic rules

- **Scope and assignment:** declarations are scoped to their containing program/function according to the canonical AST and semantic analyzer. Reassignment is legal only for a mutable binding; immutable bindings and unresolved names produce compile-time diagnostics.
- **Scalar and series values:** scalar values represent one value for the current evaluation. `series<T>` represents values aligned to the canonical input timeline. A scalar must not be implicitly treated as a historical series, and prediction/forecast/feature/model values retain their semantic kind through analysis and IR.
- **Historical indexing:** history offsets are non-negative integers. Offset zero means the current evaluation bar; positive offsets address earlier bars. Negative, non-integral, out-of-range, or unavailable offsets produce the language's explicit missing/error result according to the operation contract; they never read future data.
- **Forming and confirmed bars:** a forming-bar update replaces the current bar's value and state contribution; it is not an append. Confirmed-bar values are finalized inputs. Scripts must explicitly request developing/realtime values when they intend to observe an unconfirmed bar. Backtests and live execution must agree on this distinction.
- **Alignment:** multi-symbol and multi-timeframe inputs align by canonical timestamps and declared merge/session policy, not by array position alone. Missing aligned observations remain missing; hosts must not silently forward-fill unless the operation's documented policy requests it.
- **Purity and state:** pure functions depend only on their arguments and declared deterministic environment. Stateful functions declare their state/revision behavior and must support deterministic replay. Side effects are host capabilities represented as validated requests/events, never hidden effects during ordinary numeric evaluation.
- **Numeric behavior:** division by zero, non-finite values, missing values, overflow, and invalid domain inputs follow each builtin's declared contract. The compiler and backends must not rely on accidental JavaScript coercion. Backend implementations must pass numerical parity tests within the operation's documented tolerance.
- **Capability checks:** data access, model training/inference, notifications, automation routing, and order-intent construction require explicit registered capabilities. An unavailable capability is a compile-time error when statically knowable, otherwise a structured runtime denial. CoreScript cannot access broker credentials or submit/cancel/modify orders directly; the TCO risk and execution authority remains the sole order-authorization boundary.
- **Determinism:** given the same artifact, ordered input snapshot, declared configuration, and initial state/checkpoint, deterministic operations produce equivalent results across editor preview, backtest, replay, worker, and live hosts. Nondeterministic host services must be explicit inputs with provenance.
- **Diagnostics:** compile-time errors include a stable code, source span when available, and actionable message. Runtime failures are structured and bounded; a host must not silently turn a failed operation into a plausible trading signal.

### Research declarations and metadata

Research/model declarations are semantic AST constructs, not text patterns. Model and backtest metadata extraction must consume the canonical normalized AST and semantic-analysis result. Source-line scanning, regex extraction, and route-local parsers must not independently determine the meaning of model declarations, feature lists, target expressions, or dataset expressions.

The research artifact must distinguish at least:

- source identity and source hash;
- compiler and IR contract versions;
- semantic feature-graph identity;
- validated model, feature, and target specifications;
- required capabilities and validation policy.

The exact schema must extend the repository's existing artifact contracts rather than introduce a parallel artifact format. Hashes must be computed from canonical, deterministic representations; object key ordering or incidental editor formatting must not create inconsistent artifact identities.

A **feature** is an input available to inference. A **target** is a label/objective used for training or evaluation. Declaring a target does not mean that labels have been materialized, that a training run succeeded, or that a compatible model artifact exists. Training eligibility, target availability, leakage checks, and model readiness are separate validated states. Training data and target ranges must be separated from inference-time feature resolution so future information cannot leak into live inference.

### Authoring depth is presentation, not semantics

Beginner, Trader, Quant, and System are IDE presentation/progressive-disclosure modes over one language. They may expose different templates and diagnostics, but they must not select different parsers, type rules, runtime meanings, or artifact formats. Any alternate surface form must normalize into the same canonical AST/IR semantics and have conformance tests before being advertised as equivalent.

### Conformance and release gates

The existing canonical compiler and unified-language contract suites should be extended rather than replaced. At minimum, the suite must verify:

1. One source revision compiles through the canonical pipeline exactly once per compile request, and downstream research metadata is derived from that compilation result.
2. Feature specs, target specs, model specs, and capability requirements are present in the validated artifact and traceable to source nodes/spans.
3. Target declarations are not accepted as evidence that training labels or a trained model artifact exist.
4. Unsupported model types and unavailable automation/data capabilities produce stable, specific diagnostics and do not emit an executable artifact.
5. Incompatible compiler/IR versions are rejected before execution.
6. Negative historical indexes and future-looking access are rejected or produce the documented missing/error behavior.
7. Forming-bar replacement, confirmed-bar finalization, multi-timeframe alignment, missing values, and deterministic replay agree across supported hosts.
8. Equivalent supported surface forms produce equivalent results from the same canonical input snapshot.
9. Editor, research worker, and chart runner report matching source and artifact checksums for the same compilation target.
10. A failed compile or stale asynchronous result cannot replace the last valid artifact/output.

Do not add another numbered architecture generation, parallel compiler, regex-based metadata interpreter, or model-only/automation-only source language to satisfy these gates. Update the existing canonical compiler, research artifact, unified-language documentation, and their current contract tests in place. These rules describe the required behavior; a passing test run and runtime/browser evidence are still required before claiming full conformance.
