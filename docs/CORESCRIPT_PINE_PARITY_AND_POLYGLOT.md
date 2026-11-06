# CoreSpirit Pine-Class, Polyglot and Quantitative Runtime

This milestone is delivered in small executable contracts. A feature is not complete merely because a builtin or type exists: it must parse, type-check, lower to canonical IR, execute under the VM, emit validated output/events and pass historical/realtime/replay parity tests.

## Non-negotiable ownership boundaries

These boundaries apply to every feature and every runtime adapter:

- **CoreScript owns language semantics.** Parsing, name resolution, typing, capability checks, language editions and lowering are defined by CoreScript. Foreign-language modules do not redefine CoreScript syntax or semantics.
- **Canonical CoreSpirit IR and the VM own execution.** Executable code must be a validated canonical IR artifact. The VM owns instruction order, control flow, deterministic state, series semantics and execution budgets. AST recovery, source text, foreign code or Vela callbacks are never alternate execution paths.
- **External runtimes are isolated compute hosts.** Python, Rust, C++, Julia, R, ONNX and WASM receive bounded, versioned, typed inputs and return validated values. They do not generate or mutate CoreSpirit IR, VM state, chart objects, orders or alerts. Cancellation, memory, fuel/step and time budgets are enforced at the host boundary.
- **Vela owns chart rendering.** CoreSpirit defines semantic visual intent and stable object identity. The output adapter validates and maps renderer-neutral outputs into Vela's native ABI. Vela owns chart scene lifecycle, panes, scales, coordinate transforms, hit testing, render scheduling and pixel painting.
- **No reverse ownership calls.** Vela does not compile or execute scripts; renderer code does not invoke VM services. Isolated compute hosts do not call back into the compiler, VM or renderer. The VM never paints or acquires broker authority.

The executable architecture contract and canonical compiler-pipeline contract enforce these rules, including rejecting invalid IR at both load and execution boundaries.


## Pine-class execution

### Data requests
- The runtime exposes `request.security(symbol, timeframe, field, offset?, phase?)` as a confirmed-data request surface. The accepted fields are OHLCV/time; phase is confirmed/historical by default, with developing/realtime data permitted only in realtime mode.
- A 40-context per-program request budget is enforced by symbol/timeframe/field/alignment identity. Repeated calls reuse the same context; a 41st unique context fails closed.
- `request.security_lower_tf(symbol, timeframe, field)` returns a bounded array (maximum 16,384 values) through the host-owned lower-timeframe provider.
- Snapshot validation rejects developing values and samples whose candle close is after the base bar's as-of timestamp. Host adapters remain responsible for supplying canonical exchange-calendar/session alignment.
- The lower-timeframe provider can be symbol-scoped. Async providers must prefetch before VM evaluation; the VM does not await network calls.

Remaining parity work: complete Pine `gaps` and lookahead enum semantics (lookahead-on must remain denied), request-expression evaluation, full session/timezone/calendar behavior, invalid-symbol policy, and exact `request.security_lower_tf` semantics for missing/incomplete intrabars.

### Visual outputs
- The standard library now exposes `plotshape` and `plotchar` with condition, location, offset, shape/character, color and size mapping into retained native scene objects.
- `fill` and `band` remain native band outputs; helper `coreSpiritFillSeries` converts two aligned series into stable retained bands and preserves gaps instead of bridging them.
- Existing Vela scene types and object lifecycle remain authoritative. The VM emits semantic objects, not pixels.

Remaining parity work: full Pine plot style matrix, plot references as fill inputs, pane/scale/display/force-overlay options, show-last behavior across all plot families, object setter/deletion parity, and real Vela browser acceptance for each visual kind.

### Strategies and backtesting
- The existing simulator remains the execution engine. It has a simulation-only authority boundary, deterministic ledger, order types, lot/risk controls, fees/slippage and intrabar ambiguity policy.
- `backtestMetrics.ts` adds return, drawdown, Sharpe/Sortino, win rate, profit factor, trade expectancy, fee and exposure summaries, plus exact-timestamp benchmark comparison and a direct adapter for the canonical strategy simulator result.
- `quantResearch.ts` adds chronological walk-forward planning with purge/embargo, deterministic bounded ridge regression, validation/test metrics, lineage validation and gated artifact promotion. Research-approved artifacts remain production-ineligible until separate risk approval.\n- `quantResearchServiceHost.ts` adds an asynchronous job control plane for large columnar datasets referenced by opaque storage keys, with checksum/schema validation, progress lookup and cancellation.

Remaining parity work: complete Pine strategy configuration and command semantics (pyramiding, OCA, partial fills, currency/margin, bar magnifier and order sequencing), full trade list/equity reconciliation and independent fill-model differential tests. Research eligibility is not broker or production risk approval.

### Alerts
- `alertcondition` now emits a confirmed-bar alert event; `alert` events preserve message/frequency metadata.
- `alertDelivery.ts` converts VM alert events into idempotent outbox envelopes, suppresses historical/replay delivery, and defines atomic lease claims, retry/backoff and terminal failure behavior.

The outbox store is an explicit host persistence contract. A production deployment still needs a durable implementation (for example, a database-backed store with atomic `claimPending`/lease recovery) and a host delivery worker. The VM never performs webhooks or notification delivery.

## Polyglot execution

### Python first
- `polyglotModules.ts` defines a versioned ABI, exact artifact identity, declared exports, typed tensor contracts, quotas, confirmed-bar input policy and cancellation.
- `pythonModuleServiceHost.ts` is server-only. It supports content-addressed package registration, SHA-256 verification, exact pinned dependency versions/hashes, HTTPS transport, timeout/cancellation and bounded response validation.
- The existing `pythonMlModelAdapter.ts` remains the specialized inference path; the module service is the general callable module path.

The Python service endpoint must be provisioned as an isolated host service. The repository adapter does not claim that a Python interpreter or package sandbox has been deployed by a Vercel browser bundle.

### Rust, C++, Julia, R, ONNX and WASM
`polyglotServiceHost.ts` provides content-addressed remote host adapters for Rust, C++, Julia, R, ONNX Runtime and WASM, with explicit transport identity, HTTPS, cancellation, artifact hashing and bounded responses. These are executable client adapters, not bundled language engines: each corresponding service/worker still needs to be deployed with its own sandbox, runtime image, fuel/memory enforcement and differential ABI tests before it is marked production-ready.

## Quantitative research and performance

- Research datasets are columnar and bounded; timestamps must be strictly increasing. Walk-forward folds are chronological and keep training strictly before validation/test windows.
- Synchronous ridge training is capped at 100,000 rows and 32 features and accepts a budget/cancellation callback. Larger jobs must run in the research worker/service, not on the chart thread.
- The repository already has a dirty dependency graph, optimized VM/cache, hot/warm/cold lane scheduler, profiler, resource governor, scene quotas and real-browser benchmark scripts. These are the performance foundations; do not introduce a second graph/scheduler/profiler.
- Resource governance already tracks instructions, data/model calls, retained output estimates and allocation budgets. Browser verification uses `tools/verify-chart-performance.mjs`; pipeline/VM workloads are covered by benchmark scripts.

Remaining performance proof: connect the latest CoreSpirit hot-path measurements to the real browser harness, run 2k/5k/20k/50k-bar cases and multi-chart workloads on target browsers, measure heap growth/GC and worker transfer cost, and publish before/after p50/p95/p99 results. A Node benchmark alone is not real-browser proof.

## Release gates

- Contract suite and `npm run typecheck`.
- Production build and bundle-budget checks.
- Confirmed/developing request tests and no-lookahead differential tests.
- VM visual output tests plus Vela retained-scene browser tests.
- Deterministic strategy ledger and fees/slippage/intrabar tests.
- Durable alert-store atomic-claim, retry, crash-recovery and replay-suppression tests.
- Python module registration, dependency-lock, cancellation, isolation and output-envelope tests.
- Per-runtime ABI conformance tests for Rust/C++/Julia/R/ONNX/WASM.
- Real-browser performance matrix with current telemetry, heap and long-task evidence.
