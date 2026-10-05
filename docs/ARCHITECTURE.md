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