# TradingCoreOS 2 architecture

TradingCoreOS is organized around permanent production planes, not numbered development stages.

## Canonical production architecture

```text
TradingCoreOS
│
├── Market Data Plane
│   ├── canonical columnar data
│   ├── realtime tick stream
│   ├── history demand
│   └── multi-timeframe aggregation
│
├── CoreSpirit
│   ├── parser
│   ├── semantic analyzer
│   ├── optimizer
│   ├── executable IR
│   ├── runtime VM
│   ├── state kernels
│   └── capability system
│
├── Compute Plane
│   ├── CPU scalar
│   ├── CPU vectorized
│   ├── Worker/WASM
│   └── GPU/WebGPU later
│
├── Vela
│   ├── chart model
│   ├── renderer
│   ├── drawings
│   ├── panes
│   ├── native indicators
│   └── workspace
│
└── TradingCoreOS
    ├── strategy
    ├── risk
    ├── execution
    ├── portfolio
    └── AI
```

## Dependency rules

- Market Data owns canonical market state and demand.
- CoreSpirit owns language semantics, executable artifacts, runtime state and capabilities.
- Compute owns execution backends; CoreSpirit requests compute without depending on a backend implementation.
- Vela consumes canonical data and CoreSpirit output; it is not the semantic authority.
- TradingCoreOS owns strategy, risk, portfolio and execution side effects.
- Broker/vendor integrations remain adapters behind host-owned contracts.

No plane should create a new stageNN, VNN, or parallel architecture generation to ship a feature.

## Cross-boundary state contracts

The boundary contracts below are the source-of-truth rules for integration work. Existing types and adapters should implement these rules; do not add a second chart engine, candle store, compiler, or order state machine to restate them.

| Contract | Owner | Revision / mutation rule | Consumers |
| --- | --- | --- | --- |
| `MarketDataSnapshot` / `MarketDataRevision` | Canonical Market Data Plane | A key identifies one broker/instrument/timeframe timeline. Revisions are monotonic within that plane; OHLCV mutations are committed through the canonical store. | CoreSpirit, Compute, Vela, research |
| `CanonicalDirtyRange` | Canonical Market Data Plane / CoreSpirit dependency graph | Half-open bar-index range `[from, to)`; full history replacement invalidates the replaced timeline, while a forming-bar mutation invalidates only that bar and its dependent lookback/state. | Kernels and render patch builders |
| Vela `DirtyRange` | Vela `ScenePatch` contract | Market-time bounds (epoch milliseconds), not bar indices. Convert the canonical index range through the matching timeline revision before emitting a renderer patch. | Vela retained renderer |
| `VisibleRange` | Vela | Vela owns chart viewport and scale state. React may request viewport operations but must not maintain a second authoritative range. | CoreSpirit viewport-aware compute |
| `IndicatorOutputPatch` | CoreSpirit runtime | CoreSpirit owns indicator values and state; downstream rendering consumes output patches and must not recompute script semantics. | Vela adapter |
| `ChartSeriesPatch` | Vela chart model | Append or replace-last for live bars; full replacement only for bootstrap, symbol/timeframe changes or history reconciliation. | Retained Vela renderer |
| `OrderIntent` | TradingCoreOS host trading plane | A signal is a proposal, not an order. Risk and policy must approve before the execution adapter can submit. | Risk engine, policy engine, execution adapter |
| `OrderStateTransition` | Broker execution/reconciliation adapter | Normalize broker events, preserve event sequence/correlation, reconcile against REST snapshots, and deduplicate before publishing state. | Portfolio, order panels, automation |

### Mutation and freshness rules

- **Canonical data is borrowed, not co-owned.** Consumers may read typed-array views but must not replace the canonical buffers or independently advance candle boundaries. Worker packets are copied and tagged with their source timeline/revision; buffer transfer changes ownership only at that worker boundary.
- **A revision describes an accepted state change, not packet arrival.** A quote can refresh UI state without changing candle data. A repeated LTP that leaves open/high/low/close unchanged must not dirty the canonical series or manufacture a new chart-data revision.
- **Older trade timestamps cannot rewrite newer bars.** A live update must be tied to a validated exchange trade timestamp. Ticks older than the chart tail or older than the latest accepted trade for that data-plane instance are rejected before they can regress chart quote/candle state. Timestamp-less quotes may update quote presentation only.
- **Dirty bounds never cross domains implicitly.** Canonical dirty ranges use bar indices; Vela scene-patch dirty bounds use epoch milliseconds. Translate via the same timeline snapshot/revision that produced the patch, and treat missing/ambiguous mappings as a full affected-span invalidation rather than comparing raw numbers.
- **The forming bar has one owner.** The canonical data plane commits the market mutation; CoreSpirit consumes the resulting data revision and dirty range; Vela receives a patch. No consumer independently infers a second append/replace-last transition from the same packet.
- **Risk and broker authority stay host-owned.** CoreSpirit and externally orchestrated AI may emit signals/order intents only. The host validates quantity, account/venue policy, risk limits and lifecycle state before execution. External automation must not receive unrestricted broker credentials.

### Required integration evidence

A source contract proves only the invariant it checks. Release evidence must keep separate results for contract tests, TypeScript/build checks, bundle budgets, and authenticated browser runs. A passing unit or static contract is not evidence of real FYERS availability, correct candles in a live session, browser frame-time under load, or end-to-end order latency. Those require runtime tests with the relevant environment configured.

## Repository policy

The production tree no longer carries the numbered CoreSpirit manifest lineage, stage-specific TypeScript configs, or stage/versioned architecture contract tests. Those artifacts remain recoverable through Git history; historical narrative documents belong under docs/archive/.

Git is the history store; the working tree is the production system.

## CoreSpirit boundary

CoreSpirit remains the only TradingCoreOS scripting language. Its implementation evolves internally through parser → semantic analysis → optimizer → executable IR → VM/state kernels without publishing a new architecture generation for each internal change.

The existing compiler/runtime modules are implementation details of one CoreSpirit plane. Public contracts should name capabilities and semantics, not development stages.

## Market data boundary

The market data plane owns typed/columnar historical data, realtime tick ingestion, bounded history demand, revision/append/replace-last semantics, and timeframe aggregation.

Charting, indicators and trading consumers should request canonical data rather than maintain independent candle stores.

## Compute boundary

Compute backends are interchangeable implementations: CPU scalar for correctness, CPU vectorized for hot paths, Worker/WASM for isolated browser workloads, and GPU/WebGPU only when profiling proves a material benefit.

The architecture does not require a new source-tree generation when a backend is added.

## Vela boundary

Vela is the production chart/workspace implementation. The TCO adapter is a compatibility boundary between canonical TradingCoreOS data/visual output and Vela renderer APIs.

Vendored Vela is an implementation dependency, not a separate architecture. Changes to it are renderer changes, not a new TradingCoreOS stage.

## Trading boundary

TradingCoreOS owns the host-side lifecycle: strategy → signal → risk → order intent → execution → portfolio.

AI belongs to this plane as a strategy/research capability; it must not become a second runtime or a second market-data authority.

## Historical artifact policy

Do not add CORESPIRIT_VNN_MANIFEST.json files at repository root, tsconfig.stage*.json files, stageNN production modules/tests, or vNNN architecture/performance/product release-history tests.

If historical material is genuinely useful to a human, put it in docs/archive/. Otherwise rely on Git history.

The architecture guard in src/architectureConsolidationGuard.test.mjs enforces this policy.
## Execution tiers and incremental rendering

CoreSpirit has two execution tiers with one semantic contract:

- **Reference VM** is the correctness/debugging implementation. It interprets IR directly and remains the semantic oracle.
- **Optimized runtime** lowers IR registers to stable numeric slots once per executable program, then runs the same host callbacks without per-instruction string-keyed `Map` access. Existing fused/stateful kernels stay behind the same host seam.

The Vela execution adapter selects the optimized tier for production chart execution. Debugging and compatibility tests can explicitly request the reference tier from `CoreSpiritRuntime`.

Realtime execution is persistent: a live `CoreSpiritRuntime` owns state across ticks and evaluates the forming bar through `executeBar()`. Historical backfill replays only a bounded causal window (`dirty range + maxLookback`) rather than rebuilding the entire chart state.

Vela exposes a retained `ScenePatch` ABI and its orchestrator converts tick/bar model changes into `append`, `replace-last`, and range patches. CoreSpirit therefore treats a full model as the initial mount/state boundary; the steady-state path is **state kernel → changed values → retained scene patch → Vela renderer**. Full `replace` remains the fallback for structural or history-wide changes.
## Dependency-aware dirty graph

Every CoreSpirit IR node now carries execution metadata for incremental planning: id, source inputs, output register, lookback, stateful/incremental capability, viewport dependence, and realtime safety.

On a forming-bar update, CoreSpirit compares changed market columns and propagates dirtiness through the compiled dependency graph. A close change invalidates only nodes causally downstream of close; an unrelated column does not dirty that branch.

Bounded rolling operations extend their dirty range by causal lookback. Recursive/stateful operations use a forward-to-end dependency when historical data changes. Tail ticks remain one-bar dirty.

Stateful kernels are currently treated as execution barriers during realtime rollback. The dirty graph identifies their data-dependent consumers precisely, while the runtime still replays stateful kernels each forming-bar revision so transactional rollback/commit semantics remain exact. The next optimization is per-kernel realtime state snapshots, which will allow unaffected stateful branches to be restored instead of replayed.

## Columnar-first CoreSpirit execution

CoreSpirit keeps a canonical typed-array market history alongside the compatibility HistoricalCandle[] view. Numeric series loads (open/high/low/close/volume/time) read from columnar history first.

The object view remains a compatibility boundary for language and host APIs, not the numerical source of truth. Production market transport is already columnar at the TradingCoreOS market-data plane and Vela worker boundary; CoreSpirit now follows the same rule internally.

## ID-addressed series storage

CoreSpirit local series history is now split into a numeric-ID registry rather than using `Record<string, number[]>` as the execution data structure.

The hot path is:

```
program preparation
  name -> SeriesId
        |
        v
optimized VM
  SeriesId -> ring slot
        |
        v
Float64Array buffer
```

Each numeric series is a bounded ring with `head`, `length`, `capacity`, and a `Float64Array`. Realtime transactions journal only metadata plus overwritten ring slots, so rollback does not copy a history-sized array. A mixed/non-numeric local series is migrated to a compatibility value ring only when the script actually changes its value kind.

`state.seriesState` and `state.localSeries` remain public `Record<string, ...[]>` views for compatibility. They are lazy proxies; the numerical ring is the source of truth and array materialization happens at the API/checkpoint boundary.

The optimized VM lowers `setLocal` and historical local-series `index` operations to numeric series IDs during program preparation. The reference VM keeps the string-keyed form as the correctness/debugging oracle.

## Fused-series backend dispatch

Series fusion is a two-level optimization:

1. the fusion planner proves that a compatible chronological chain can share one pass and zero full intermediate-series allocations;
2. the backend dispatcher decides where that fused group should run for the current workload.

The dispatch policy is deliberately asymmetric:

| Workload | Backend |
| --- | --- |
| forming-bar / realtime | fused CPU cursor |
| small historical pass | fused CPU |
| long historical pass | WASM/SIMD when an executable kernel is available |
| very large, stateless, highly parallel pass | GPU/WebGPU when enabled and policy allows it |
| stateful recurrence or unsupported offload | fused CPU |

GPU dispatch is not merely a “bigger threshold”: recursive operations such as EMA/RMA/change/persistence remain on chronological CPU unless a backend explicitly provides equivalent deterministic state semantics. Deterministic execution also suppresses a GPU profile marked nondeterministic.

The dispatcher is host-kernel based. If a WASM or GPU profile is selected but no registered executable kernel exists, CoreSpirit falls back to the fused CPU implementation with identical IR semantics. This prevents backend availability metadata from becoming a correctness dependency.

A production offload implementation should therefore provide three additional pieces without changing the language or semantic graph: a batch ABI over `Float64Array` inputs/outputs, a kernel capability manifest, and asynchronous completion fencing for non-realtime work. Realtime never waits on a GPU round trip.



## WASM backend milestone

CoreSpirit now has a concrete batch WASM ABI seam. The engine does not cross the JS/WASM boundary once per bar. A backend kernel receives contiguous buffers through a single batch entry point:

```text
inputPtrsPtr
inputCount
outputPtrsPtr
outputCount
barCount
paramsPtr
paramsCount
```

The module exports `memory`, `alloc`, and `runKernel`; `free` is optional. Numeric columns and series outputs remain `Float64Array` values, and pointer tables are stored as little-endian `i32` entries inside WASM linear memory.

The manifest declares each kernel's arity, output count, deterministic property, statefulness, and `scalar|simd` variant. That lets the CoreSpirit dispatcher distinguish:

- a portable scalar WASM kernel;
- a SIMD kernel operating on the same batch ABI;
- a stateful chronological kernel such as EMA/RSI/ATR/VWAP;
- a stateless wide kernel suitable for eventual GPU dispatch.

SIMD is therefore a backend capability, not a new language semantic. The WebAssembly SIMD extension uses the `v128` type and SIMD instruction space; feature support should be established by validating/instantiating the actual kernel artifact rather than assuming the host CPU exposes a particular ISA. citeturn638160search0turn646416search0

The first production kernel pack should target the same ABI for SMA, EMA, WMA, rolling variance/stdev, rolling extrema, RSI, ATR, VWAP, normalization, and z-score. Median/percentile should use their ordered-window kernels rather than pretending to be simple SIMD reductions.

The repository includes a benchmark harness at `tools/benchmark-core-spirit-wasm.mjs`. It compares:

```text
current JS VM
current JS fused cursor
WASM scalar kernel
WASM SIMD kernel
```

at exactly:

```text
5,000
50,000
500,000
5,000,000 bars
```

The WASM lanes are intentionally reported as `not-configured` until a compatible module is supplied through environment variables. This keeps performance claims empirical rather than speculative.

## Compile-to-specialized-plan

After semantic optimization, CoreSpirit now emits a second compiled representation rather than forcing every backend to rediscover structure from generic IR.

A specialized plan contains:

```text
stable numeric register slots
      +
lowered instruction kinds
      +
shared-input series fanouts
      +
fused kernel regions
      +
WASM-eligible operations
```

For:

```text
ema = ta.ema(close, 20)
rsi = ta.rsi(close, 14)
signal = ema > close and rsi < 30
```

the specialized representation identifies the conceptual region:

```text
FUSED_KERNEL_0
    input: close
    series: EMA(20), RSI(14)
    scalar: ema > close
            rsi < 30
            AND
```

This does not yet claim that EMA+RSI is executed by one native WASM kernel. Instead, it gives the backend a stable region contract from which such a kernel can be generated. The optimized JS VM consumes the same specialized numeric-slot instruction representation, preserving one semantic source.

The important performance boundary is now explicit:

```text
source -> semantic graph -> optimized IR
      -> specialized plan
      -> backend lowering
          CPU / fused JS / WASM scalar / WASM SIMD
```

A future native kernel compiler can therefore consume the specialized region directly instead of reparsing the AST or generic VM instructions.



## Trading-native language direction

CoreSpirit is not positioned as a second spelling of Pine Script. Pine already has a mature compiled sequential execution model, historical time-series buffers, realtime recalculation, strategies and libraries; its cloud runtime also deliberately enforces execution, memory, data-request and compiled-size limits. CoreSpirit's differentiator should therefore be architectural: make trading data domains and execution contexts explicit inputs to the compiler, not compatibility functions layered over a generic scalar language.

The five language-level pillars are:

**Data-native.** Bars remain the base columnar plane, but `trade`, `orderbook`, `footprint`, `volume-profile`, `matrix<T>`, and `tensor<T>` are explicit data domains. Host adapters normalize these structures; the VM does not own sockets or broker connections.

**Multi-timeframe-native.** A market reference carries both symbol and timeframe. Chained handles such as `market("NSE:NIFTY50").timeframe("15m").close` are lowered to one typed data reference rather than a sequence of generic requests. The compiled trading-native plan groups these requests for batch resolution.

**Multi-symbol-native.** A script can keep the chart's current symbol and additional concrete symbols in the same dependency plan. The scheduler sees the actual symbol/timeframe set and can issue one batch data boundary for compatible requests rather than repeatedly entering the host resolver.

**Event-native.** `on bar`, `on tick`, `session.open`, `session.close`, `breakout`, `signal`, `order`, and `fill` are modeled as event kinds with concrete TradingCore event channels. Event routing remains transactional, so speculative realtime executions cannot leak order or notification side effects before confirmation.

**Compute-aware.** The language does not expose backend selection as source syntax. The compiler emits a specialized plan; the execution planner and backend dispatcher choose scalar, fused, worker, WASM/SIMD, or GPU execution according to workload and semantic constraints.

This is the intended strategic boundary:

```text
Pine-like surface compatibility  -> optional compatibility layer
CoreSpirit semantic core         -> trading-native systems language
                                   |
                                   +-- typed market contexts
                                   +-- multi-symbol scheduling
                                   +-- multi-timeframe scheduling
                                   +-- event graph
                                   +-- data-domain kernels
                                   +-- backend-aware execution
```

The implementation intentionally keeps the market host/network boundary outside the VM. A `market()` handle is data identity plus execution context; resolution, caching, freshness and provider access belong to the host.



### Trading-native scheduling contract

The compiled trading-native plan is the bridge between language semantics and host scheduling. It records the concrete symbol/timeframe contexts, the fields or market structures each context needs, and whether each dependency can cross the batched OHLCV resolver boundary.

For example:

```text
close                         -> current/chart
market("NIFTY50").close      -> NIFTY50/chart
market("NIFTY50").timeframe("15m").close
                              -> NIFTY50/15m
```

becomes one dependency set with one batchable host request boundary for compatible OHLCV fields. The chart-native `current/chart` columns are intentionally excluded from that host batch because they already live in CoreSpirit's local columnar tape.

Structured domains remain separate:

```text
NIFTY50/chart/orderbook
NIFTY50/chart/footprint
NIFTY50/chart/volume-profile
```

They are not coerced into OHLCV requests and are resolved through symbol/timeframe-scoped host hooks.

The runtime deduplicates identical `symbol + timeframe + field` requests before calling `requestBatch`. This turns multi-symbol/multi-timeframe data access into a scheduler problem instead of repeated per-expression calls.

### Event-native scheduling contract

Surface automation triggers and normalized `event(...)` expressions become typed event triggers with concrete TradingCore bus names:

```text
bar           -> market.bar
tick          -> market.tick
session.open  -> market.session.open
session.close -> market.session.close
breakout      -> market.breakout
signal        -> script.signal
order         -> execution.order
fill          -> execution.fill
```

Event routing remains transactional. An automation can therefore subscribe to an event class without being allowed to commit an order/notification side effect before the current realtime evaluation is confirmed.

This makes `when` a scheduler concept rather than another indicator function. The semantic graph can reason about an event-triggered region independently from the numerical data graph.



## Branch 12 — explicit temporal type system

CoreSpirit does not collapse every time-aware value into one implicit series model.

The canonical temporal type algebra is:

```
scalar<T>
series<T>
window<T>
state<T>
event<T>
snapshot<T>
stream<T>

confirmed<T>
developing<T>
forecast<T>
```

The semantics are intentionally different:

- **`series<T>`** is historical/vector market data. It is indexable, typed, columnar-first, and remains subject to causal lookback rules.
- **`window<T>`** is a bounded computational view over a series. It does not own persistent program history and should be disposable/reusable by kernels.
- **`state<T>`** is explicit persistent program memory. It survives across bars but is transactionally rolled back during an unconfirmed realtime revision.
- **`event<T>`** and **`stream<T>`** represent event-fed domains rather than bar-aligned historical arrays.
- **`snapshot<T>`** is an immutable point-in-time capture.
- **`confirmed<T>`**, **`developing<T>`**, and **`forecast<T>`** explicitly encode temporal certainty.

This makes a strategy's memory model visible in the program instead of inferring it from whether a value happened to be historical.

### State is not a disguised series

For example:

```corespirit
let trailingStop: state<float> = na

on bar {
  trailingStop := max(trailingStop, close - atr(14) * 2)
}
```

The compiler lowers this to explicit `loadState` / `setState` operations. The state lives in the CoreSpirit transactional state store, not in the local historical-series registry.

During a forming-bar revision:

```
confirmed state
     │
     ├── begin realtime transaction
     │
     ├── execute developing bar
     │
     ├── rollback on revision
     │       ↓
     │   restore prior state
     │
     └── execute latest revision
             ↓
          commit once
```

This makes state mutation deterministic under realtime rollback.

### Series has explicit temporal context

A `series<T>` access is still associated with a data identity:

```
series<T>
  ├── element type
  ├── symbol
  ├── timeframe
  ├── temporal phase
  └── causal lookback
```

The current chart `close` is therefore not merely a JavaScript number. Its semantic identity includes the market context and the temporal domain in which it was produced.

Inside an event scope, CoreSpirit may **sample the current value of a series into scalar state**. That conversion is explicit in the type checker rather than being a hidden historical-series coercion.

### Temporal certainty is executable

The language surface exposes:

```corespirit
if bar.confirmed {
  signal("confirmed")
}

if bar.realtime {
  signal("developing")
}

if bar.historical {
  // historical-only work
}
```

These lower to runtime temporal-phase checks. The runtime distinguishes:

```
historical
confirmed
developing / realtime
forecast
```

and the semantic graph can use those phases when determining whether a computation is realtime-safe.

### Explicit event regions

```corespirit
on bar {
  ...
}

on tick {
  ...
}

on session.open {
  ...
}
```

becomes an `eventGate` region in executable IR.

The event gate is a scheduler boundary, not another indicator function. This allows future scheduling to keep numerical work, event-triggered work, and side effects separate.

### Why this is strategically different from Pine's model

Pine's series model is tightly coupled to its sequential execution semantics. CoreSpirit keeps historical data, bounded windows, mutable strategy state, events, immutable snapshots, streams, and temporal certainty as distinct language concepts.

That lets optimization reason about them separately:

```
series<T>   -> columnar / dirty-range / SIMD
window<T>   -> fused rolling kernel
state<T>    -> transactional persistent state
event<T>    -> event scheduler
snapshot<T> -> immutable replay boundary
stream<T>   -> asynchronous host stream
confirmed<T>/developing<T>
            -> temporal safety analysis
```

This is a core language property, not a compatibility layer.

## Branch 14 — repaint safety as a language contract

CoreSpirit treats temporal safety as compiler-visible semantics.

Every compiled program receives a `repaintSafety` proof containing:

~~~
causal
lookahead
realtimeSafe
backtestLiveEquivalent
~~~

and a per-node evidence chain.

The language supports:

~~~corespirit
@causal
@realtimeSafe
@lookahead(false)
let signal: series<float> = ema(close, 20)
~~~

Assertions are not warning suppressors. They are claims that the compiler checks.

For example:

~~~corespirit
@causal
let signal = future_lookup(close)
~~~

must fail the causal assertion if the provenance analysis classifies the dependency as future-dependent.

Safety categories are distinct:

- `causal`: only information available at or before the evaluated point is used.
- `noncausal`: output depends on information outside the causal execution frontier.
- `future-dependent`: the compiler can identify a forward/future dependency.
- `repainting`: a declared or proven historical value can change because future information changes the past result.
- `unknown`: provenance is not strong enough to prove safety.

Unknown is deliberately not silently promoted to safe.

The resulting editor diagnostics can say:

~~~
⚠ Future-dependent data detected.
⚠ Strategy result is not causal.
⚠ Backtest/live equivalence is not guaranteed.
~~~

### Safety proof architecture

~~~
source
  ↓
typed AST + safety annotations
  ↓
causality analysis
  ├── data provenance
  ├── lookahead policy
  ├── realtime safety
  └── annotation assertions
  ↓
repaintSafety report
  ↓
executable IR
~~~

The safety report is serialized into the executable artifact. A downstream runtime therefore receives the safety contract instead of having to rediscover repaint semantics.

The key distinction from a normal warning system is that `@causal` and `@realtimeSafe` are type-like assertions. A strategy author can intentionally declare noncausal research code, but a production strategy can require the compiler to prove causal behavior.

## Branch 15 — first-class profiler

CoreSpirit now exposes a profiler API designed for the editor rather than a logfile.

The profiler records:

~~~
compile time
historical execution
realtime/tick execution
instruction count
time per instruction/node
phase breakdown
tracked allocations
tracked allocation bytes
flame graph samples
~~~

The runtime exposes:

~~~ts
runtime.getProfilerSnapshot()
runtime.resetProfiler()
~~~

and the editor model can consume the same immutable snapshot.

The editor-facing summary is intentionally structured so a UI can render:

~~~
Execution time
──────────────────────────
EMA                 8.2%
RSI                 5.1%
Market structure   31.8%
HTF request        17.3%
Rendering           4.7%
~~~

alongside:

~~~
5,000 bars
12,430 instructions
3.2 ms compile
7.8 ms historical
0.031 ms/tick
~~~

The profiler also exposes a flame-oriented stream:

~~~
CoreSpirit
 ├── data
 │    ├── request
 │    └── market
 ├── execution
 │    ├── EMA
 │    ├── RSI
 │    ├── structure
 │    └── signal
 └── rendering
      └── plot
~~~

Profiling is opt-in. The normal optimized VM does not install profiling callbacks unless profiling is enabled.

### Allocation accounting

CoreSpirit reports **tracked runtime allocations**, not an invented exact JavaScript heap-allocation number.

This distinction matters because JavaScript engines and browser GC do not expose a universal exact “allocations per tick” primitive. The profiler therefore reports:

~~~
trackedAllocations
trackedAllocationBytes
trackedAllocationsPerTick
~~~

with an explicit note in the snapshot.

That gives the editor a stable optimization metric while avoiding fake precision.

### Profiler architecture

~~~
CoreSpiritRuntime
      │
      ├── compile timing
      ├── bar/tick timing
      │
      ▼
Reference VM / Optimized VM
      │
      └── optional instruction hooks
             │
             ├── node timing
             ├── phase timing
             └── flame samples
                    │
                    ▼
          CoreSpiritProfilerSnapshot
                    │
                    ├── editor tables
                    ├── flame graph
                    └── optimization feedback
~~~

The profiler is therefore a language/runtime capability, not a Vela-specific diagnostic layer.

## Branch 16 — execution-plan visualization

CoreSpirit now treats the execution plan as an inspectable artifact, not an opaque compiler detail.

The existing semantic graph, dependency graph, series-fusion plan, specialized plan, backend assignments, and IR are projected into one immutable editor-facing visualization:

~~~text
close
 │
 ├── EMA(20)   [fused]
 │
 └── RSI(14)   [fused]
       │
       └── signal [barrier]
~~~

The visualization is derived from the same compiled program that the VM executes. It does not reparse source or invent a parallel dependency model.

Each visual node carries:

~~~
node id
IR instruction
operation label
dependencies
source inputs
estimated cost
execution lane
backend
fusion kernel
source-map location
~~~

Each fused kernel carries:

~~~
CPU / WASM / GPU backend
operation count
instruction indices
single traversal count
intermediate-series allocation count
eligible backends
fusion strategy
~~~

That lets the editor explain an execution decision in concrete terms:

~~~text
Execution:
CPU fused kernel #1
3 operations
1 traversal
0 intermediate arrays
~~~

The execution-plan visualizer also emits an ASCII representation for CLI and headless tooling. The browser editor consumes the structured graph instead of scraping text.

### Why this is better than a profiler alone

A profiler answers **what was slow**.

The execution plan answers **what the runtime intends to do**.

Together they form a closed optimization loop:

~~~text
source
  ↓
semantic/dependency graph
  ↓
execution plan visualization
  ↓
fused kernels / barriers / backend choice
  ↓
runtime execution
  ↓
profiler snapshot
  ↓
optimize the source or compiler
~~~

This is especially important for professional users because “fast” is no longer a single benchmark number. The user can inspect whether work was fused, how many chronological traversals occurred, where state/effect barriers remain, and whether intermediate arrays were avoided.

## Branch 17 — Vela is the rendering/runtime substrate, not a second chart platform

The architectural rule for Vela integration is now explicit:

> TradingCoreOS owns trading semantics; Vela owns charting/rendering/runtime primitives.

The large `velaChartFacade.ts` is therefore a **compatibility boundary**, not the canonical chart API.

New TCO integrations should prefer native Vela ports and models:

~~~text
CoreSpirit
   │
   ├── Vela ScriptingEngine port
   ├── Vela DataProvider / MarketDataFeed ports
   ├── Vela columnar data model
   ├── Vela IndicatorModel / SeriesSpec
   └── Vela NativeRenderer
~~~

The compatibility facade remains only where an existing TradingCore surface still expects the older chart-api shape.

The first architectural tightening removes facade coupling from two important seams:

- `CoreSpiritVelaEngine` consumes Vela's native `ScriptingEngine` and model types directly.
- `TcoVelaDataProvider` consumes Vela's native data, market-feed, OHLCV, and columnar model types directly.

This matters because a second chart abstraction tends to become a second source of truth for:

~~~
series
viewport/range
data updates
drawing state
chart lifecycle
renderer capabilities
~~~

That is precisely the duplication Vela is designed to eliminate.

### Long-term adapter boundary

The desired layering is:

~~~text
TradingCore semantic adapter
        │
        ├── trading concepts
        │     symbol / timeframe / series / signal / order intent
        │
        └── Vela native primitives
              renderer / workspace / data feed / columnar tape /
              indicator models / drawing system / persistence
~~~

not:

~~~text
TradingCore
   ↓
TCO chart facade
   ↓
Vela chart facade
   ↓
Vela renderer
~~~

The compatibility layer can remain large while legacy callers are migrated, but new functionality should not expand it.

### Practical migration rule

When a new feature needs a chart capability, choose the boundary in this order:

~~~text
1. native Vela port/model
2. TCO semantic adapter if the feature has trading-specific meaning
3. compatibility facade only when legacy API compatibility requires it
~~~

That keeps TradingCore's differentiating logic above Vela while avoiding a second implementation of Vela's renderer/workspace/data architecture.

## CoreSpirit unified language and execution authority

CoreSpirit is the single TradingCoreOS computational language across indicators, strategies, quantitative research, models, predictions, visualization and automation. Progressive authoring is an IDE concern, not a language fork.

```text
                     CoreSpirit
                         │
      ┌────────────┬─────┼─────┬────────────┐
      │            │     │     │            │
  Indicators   Strategies Models Research Automation
      │            │     │     │            │
      └────────────┴─────┼─────┴────────────┘
                         │
                  shared compiler
                         │
                   shared data graph
                         │
                 shared executable IR
                         │
                 shared runtime hosts
                         │
             ┌───────────┼───────────┐
             │           │           │
          Backtest     Replay       Live
```

Four authoring depths are explicit in the artifact: `beginner`, `trader`, `quant`, and `system`. The same compiler/runtime contracts serve all four.

### Model and prediction semantics

Model values are distinct semantic objects rather than aliases for price series:

- `model<T>` identifies a model contract.
- `feature<T>` and `featureSet<T>` identify model inputs.
- `prediction<T>` identifies model-produced estimates.
- `probability` carries probability semantics.
- `forecast<T>` identifies future-oriented values.
- `dataset<T>`, `trainingData<T>`, `experiment<T>`, and `modelArtifact<T>` identify research lifecycle objects.

These identities travel through semantic analysis, the dependency graph and executable IR. Model execution is host-resolved; the CoreSpirit VM remains broker-free and network-free.

### Automation and execution authority

Automation can emit notifications, route requests and query host risk policy. It cannot call a broker adapter directly.

```text
CoreSpirit
   │
   ├── signal
   ├── automation event
   └── order intent
          │
          ▼
TradingCoreOS Execution Authority
          │
       risk gate
          │
      policy gate
          │
      execution adapter
          │
          ▼
        broker
```

The repository enforces this boundary with a source-level broker scanner and a contract test. CoreSpirit source may not import broker adapters, trading routes, trading HTTP clients, or call broker-side order methods.

### Vela boundary

Vela consumes CoreSpirit visual intent and chart data. It is not an execution authority and never receives direct broker execution responsibility from CoreSpirit.
