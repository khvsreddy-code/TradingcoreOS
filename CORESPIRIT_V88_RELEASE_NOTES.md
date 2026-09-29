# TradingCoreOS CoreSpirit v88

## Purpose

v88 turns the existing CoreSpirit foundation into a small authoring surface with a substantially more composable and performance-aware execution system.

The source language remains six concepts:

`DATA` · `LET` · `WHEN` · `SHOW` · `MODEL` · `AUTOMATE`

Complexity is absorbed below that surface by semantic graphs, reusable components, execution planning, incremental compilation, bounded caches, workers, lineage and host execution contexts.

## Implemented

- Simple / Advanced / Professional authoring profiles without a language fork.
- Live / paper / backtest / replay / scan / research / optimization execution contexts.
- Universal CoreSpirit value kinds and pure/stateful/io/event/visual/authority execution classes.
- Reusable typed semantic components and pipeline contracts.
- Incremental AST reuse, changed semantic-node detection and bounded compiler caching.
- Canonical object serialization and SHA-256 artifact caching.
- Source-input reverse indexes for targeted reactive invalidation.
- Bounded pure-node runtime cache and queue traversal without `shift()` in the reactive hot path.
- Hot / warm / cold execution-lane planning and explicit effect barriers.
- Runtime performance budgets and public performance statistics.
- Reusable CoreSpirit worker pool instead of one worker per run.
- Chart realtime frame coalescing and persisted chart-state memoization.
- Workspace market-tick backpressure with one React state write per animation frame.
- Incremental EMA / RSI / ATR / SMA / VWAP developing-bar previews.
- Canonical timestamp normalization for realtime candle identity.
- Rare committed-candle correction rebuild for historical corrections.
- Bounded history request cache with in-flight request deduplication and stale-while-revalidate behavior retained.
- Generic semantic value lineage tracing.
- Version-aware CoreSpirit package registry.
- Existing capability sandbox / execution authority preserved.
- Existing numerical CPU/WASM/GPU planner preserved and extended with lanes/cache metadata.

## Verification

The repository contract suite passes:

```text
STAGE88_TERMINAL_ARCHITECTURE_GUARD_OK
STAGE89_SPA_ROUTE_CONTRACT_OK
STAGE_V85_HARDENING_CONTRACT_OK
V85_LEGACY_BRIDGE_CLEANUP_OK
CORESPIRIT_V88_COMPLEXITY_ABSORPTION_PERFORMANCE_CONTRACT_OK
```

Changed TypeScript/TSX source was syntax-parsed successfully with the available TypeScript compiler API.

A direct runtime behavioral check also passed for same-candle realtime updates, reversible developing-bar previews, stable bar-close commits, and committed-candle correction rebuilds.

## Environment limitation

The archive does not contain a complete installed dependency environment. In this execution environment the local `vite` binary and `vite/client` type declarations were unavailable, and dependency installation timed out. Therefore a production Vite build was not claimed as verified.

The repository remains intended to be installed normally with its declared package dependencies before `npm run build` / `npm run typecheck` are executed.
