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