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
