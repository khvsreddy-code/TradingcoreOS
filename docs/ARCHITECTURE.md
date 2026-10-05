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
