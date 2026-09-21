# TradingCoreOS v23 — CoreSpirit visual scene-graph deep pass
**Date:** 2026-09-20
**Base:** v22

### Implemented
- Studied the current TradingView Pine release notes and visual documentation as a capability checklist rather than copying Pine syntax.
- Added first-class `polyline`, `hline`, `bg`, `barcolor`, and `table` CoreSpirit primitives.
- Added renderer-independent output objects for polylines, horizontal levels, background/bar tint and screen-space tables.
- Added persistent visual reconciliation/upsert behavior in the output dispatcher so source-stable boxes, zones, lines, polylines, levels and table cells can update in place instead of accumulating duplicates.
- Kept per-bar visuals such as bands, shapes and tint effects append-oriented for historical visualization.
- Extended labels with font weight/style metadata and renderer support.
- Added canvas rendering for polylines, horizontal levels and per-bar tint effects.
- Added a screen-space table layer with anchored 3x3 positions and row/column cells.
- Added `stage23VisualContract.test.ts` covering compilation and output contracts for the new primitives.
- Bumped CoreSpirit version marker to v23.

### Verification
- CoreSpirit source files type-check successfully under an isolated TypeScript check; the full repository check could not be run because the archive does not contain installed npm dependencies (`vite/client` was unavailable).
- `npm ci --ignore-scripts` was attempted but timed out in the execution environment, so no full Vite/browser build is claimed.

### Why this matters
Pine's recent evolution shows that serious chart scripting is not only about indicator math. Its visual model includes lines, boxes, polylines, fills, labels and tables, while recent language/runtime changes add richer text formatting, data structures and more granular execution. CoreSpirit now has a broader scene-graph foundation while preserving the simpler surface syntax and keeping rendering outside the VM.

### Not claimed complete
- Multi-pane scale routing.
- Interactive drag/edit handles for script-owned drawings.
- Footprint/volume-row native data objects.
- Realtime incremental output frames and true hot reload.
- Full indicator reference-value conformance corpus.

# TradingCoreOS v22 — CoreSpirit expressive visual system
**Date:** 2026-09-20
**Base:** v21

### Implemented
- Added first-class CoreSpirit visual objects for boxes, per-bar bands, arrows and symbols.
- Added `box`, `band`, `fill`, `gradient`, `arrow`, `shape` and `heatmap` language primitives with semantic argument checks.
- Extended `zone` with fill opacity and simple pattern support.
- Added a dedicated canvas overlay renderer so rich visuals do not require one Lightweight Charts series per object.
- Added gradient fills, hatch/dot/stripe patterns, vector arrowheads and multiple symbols.
- Added text-capable symbols for compact annotations.
- Added high-cardinality band sampling before canvas rendering to protect UI responsiveness with large histories.
- Passed the chart host into the CoreSpirit renderer so rich visuals share the exact chart DOM coordinate space.
- Updated CoreSpirit version marker to v22 and expanded task/history tracking.

### Why this matters
The screenshots motivating this pass demonstrate that useful trading visuals are not limited to line plots: filled regimes, volatility envelopes, signal symbols, boxes, directional vectors, gradients and parameter surfaces all communicate structure. v22 therefore makes visual composition a first-class CoreSpirit capability while keeping the language small. The same declarative visual objects can later be produced by indicators, models, replay engines or AI services.

### Deliberately not claimed complete
- Full TradingView-style object editor/drag handles for script-owned rich visuals.
- Multi-pane routing and shared scale contracts.
- Arbitrary path/array literals and high-dimensional heatmap/table primitives.
- Realtime incremental/hot-reload output frames.
- Exact reference-value parity for the full indicator catalog.

# TradingCoreOS v21 — Stage 1–3 visual/runtime deep pass
**Date:** 2026-09-20
**Base:** v20

### Implemented
- Added a richer CoreSpirit output contract for styled plots and chart labels.
- Added `label(...)` for candle-relative labels and `labelAt(...)` for arbitrary data-price labels.
- Added label styling: background, text color, size and shape, with above/below/in-bar/price placement.
- Added a dedicated chart overlay layer so labels can be positioned at any time/price coordinate rather than being limited to Lightweight Charts candle-marker positions.
- Added stable label IDs and label reconciliation.
- Added plot styling arguments for color, width, line style and title.
- Reworked line/zone rendering to retain stable owned series and update them instead of destroying all script drawings on every frame.
- Added pure indicator-kernel functions for standard deviation, WMA, stochastic and Bollinger calculations.
- Extended the standard library/compiler output list for label and labelAt primitives.
- Updated the task tracker with remaining Stage 1–3 gaps.

### Why this matters
CoreSpirit now has a visual language beyond simple line plots: scripts can annotate candles, place labels at exact prices, style those labels, and draw persistent visual structures without owning or corrupting native chart state. The renderer remains outside the VM, preserving the architecture needed for replay, backtesting and realtime execution.

### Not claimed complete
- Full pane routing.
- Native high-performance boxes/polylines/filled regions.
- Realtime incremental output frames/hot reload.
- Full indicator reference-value conformance corpus and exchange session engine.

# TradingCoreOS — CoreSpirit Development History

This file is the chronological implementation log for CoreSpirit. The master plan remains in `CORESPIRIT_PROJECT_TASKS.md`; this file records what was actually changed per version and what was intentionally left unfinished.

## v20 — Deep Stage 1 / 1.5 / 2 / 3 audit and hardening
**Date:** 2026-09-20
**Base:** v19

### Implemented
- Added statement-level parser recovery so malformed scripts can return multiple syntax diagnostics with source ranges instead of failing on the first parser error.
- Added a formal CoreSpirit type lattice for scalar/series number, boolean, string and null values.
- Added semantic builtin signature and argument-count validation plus type checks for operators, conditions, indexing, indicators and outputs.
- Added a shared execution-context contract containing execution mode, symbol, timeframe, timezone and run id.
- Added explicit runtime output/history quotas and chronological/finite OHLCV validation.
- Added a pure `indicatorKernel.ts` for deterministic SMA/highest/lowest/EMA seed/true-range/RSI math.
- Added per-bar memoization for stateful/pure builtin calls to prevent duplicate indicator calls from advancing EMA/RSI/ATR/VWAP/crossover state twice on the same bar.
- Added stable compiled call identities so crossover/crossunder state persists correctly across bars.
- Made state-history retention expand to satisfy compiled lookback requirements.
- Made compiled output IDs stable from source locations rather than changing on each run.
- Fixed null plot rendering so missing/warm-up values become chart whitespace rather than invalid numeric points.
- Added a Stage 1–3 deep contract test covering typed diagnostics, duplicate indicator calls, stable output identities, warm-up behavior and execution context.
- Updated the master task file with explicit remaining gaps for each of Stages 1–3.

### Important fixes discovered by the audit
- **Crossover bug:** the runtime previously used the temporary IR destination as its state key. Because temporary names are regenerated per bar, crossovers could lose their previous-bar identity. v20 gives calls stable IDs.
- **Duplicate state advancement:** repeated calls to the same stateful indicator in one bar could update internal state twice. v20 memoizes per-bar results.
- **Memory/retention mismatch:** a script could request more historical indexing than the configured state retention. v20 expands retention to compiled lookback + safety margin.
- **Chart null handling:** line-series output containing `value: null` was passed as a numeric point. v20 converts nulls into whitespace points.

### Not claimed complete
- Full exact-reference indicator conformance suite.
- Exchange/session calendar engine.
- True higher-order series-expression arguments for every indicator.
- Transactional rich chart primitives/panes.
- Realtime incremental/hot-reload execution.

## v19 — Stage 1 deep audit and runtime foundation hardening
**Date:** 2026-09-20
**Base:** v18

### Implemented
- Re-audited Stage 1 source files: lexer, parser, semantic analyzer, compiler, IR, artifact validation, runtime, pipeline and worker.
- Added `/* ... */` block comments to the lexer.
- Added explicit unterminated block-comment diagnostics.
- Added cooperative `AbortSignal` cancellation to runtime execution.
- Added periodic cancellation checks inside long instruction loops, so cancellation is not delayed until a whole large execution finishes.
- Made runtime session-day calculation use configurable `timezone` instead of a hard-coded Asia/Kolkata timezone.
- Added configurable local/indicator state-history retention with a 2048 default floor instead of an undocumented fixed 512-entry cap.
- Added a dependency-free Stage 1 foundation regression module covering tokenization, compile/artifact creation, chronological execution, realtime rollback/commit and cancellation.
- Bumped persisted CoreSpirit compiler version marker to `corespirit-v19`.
- Updated `CORESPIRIT_PROJECT_TASKS.md` with an explicit Stage 1 verification checklist and remaining hardening items.

### Why these changes matter
Stage 1 is the foundation for every later feature. A language/runtime that can calculate indicators but cannot be cancelled, control state retention, handle comments correctly, or keep timezone behavior explicit will become fragile once Stage 4–9 add hot reload, events, models, replay and backtesting. v19 therefore strengthens the contracts before adding more surface features.

### Not claimed as complete
- Full parser error recovery with multiple diagnostics.
- Formal scalar/series type lattice.
- Unified execution-context object across live/replay/backtest.
- Formal per-script memory quotas.
- VM compatibility/version contract.

## v18 — Stage 3 chart/output lifecycle
**Base:** v17

- Added CoreSpirit chart/output lifecycle controller.
- Added worker-backed chart execution path.
- Added stable plot series ownership and cleanup.
- Added script-owned signals, lines and zones without taking ownership of native chart series.
- Connected CoreSpirit execution records to the Supabase persistence foundation.
- Consolidated project tracking into the master task file.

## v17 — Supabase/CoreSpirit persistence foundation
**Base:** v16

- Added CoreSpirit script persistence.
- Added versioned source/compiled-IR persistence.
- Added deployment records.
- Added execution-run records.
- Added RLS/indexes and hardened backend function execution.
- Kept high-frequency market data outside Supabase.


## v25 — Richer data access + granular execution + footprint + coder ergonomics
**Base:** v24

### Implemented
- Re-read current Pine documentation with emphasis on `request.*`, realtime/historical execution controls, alerts, collections, object IDs, and the new 2026 footprint API.
- Added a provider-neutral CoreSpirit data capability layer. The VM can consume pre-resolved cross-symbol/timeframe values, lower-timeframe values, depth imbalance and footprint snapshots without owning sockets, HTTP clients or broker credentials.
- Added `request()` and `lowerTf()` language primitives.
- Added footprint primitives for delta, buy/sell volume, POC, VAH, VAL and row count.
- Added normalized footprint row/bar contracts to support future broker-specific adapters.
- Added `executeTick()` so the same runtime can evaluate an open bar at tick granularity without creating a second scripting engine.
- Added execution policy metadata to distinguish bar-close, realtime-tick and historical-tick execution modes.
- Added CoreSpirit editor services for completions, function signatures, formatting and structured diagnostics.
- Added a v25 contract test covering data requests, footprint access, tick execution and editor services.

### Important boundary
Pine's `request.*()` model shows that rich data access is a core language capability, while its strategy execution controls show that tick-level execution changes reproducibility/repainting behavior. CoreSpirit therefore keeps network/data acquisition in a host adapter and makes execution mode explicit in the runtime context rather than silently performing network I/O inside scripts.

### Not claimed complete
- Real broker footprint history is not yet wired into the CoreSpirit VM.
- `request()` is synchronous from the VM's point of view; asynchronous providers must prefetch/cache data into the host resolver.
- Historical tick backtesting and fill-level simulation remain future work.
- Editor service is currently dependency-free and lightweight; full incremental parsing/AST reuse is still planned.

## v24 — CoreSpirit-native prediction + execution-intent layer
**Base:** v23

- Re-read the current TradingView Pine release notes and visual docs as a capability reference, especially v6 dynamic requests, richer drawings, text formatting, and footprint data.
- Extended the CoreSpirit math/runtime kernel with `exp`, `log`, `tanh`, `clamp`, `sigmoid`, and `probability`.
- Added transparent `score()` and logistic `predict()` primitives so custom prediction formulas can be authored entirely in CoreSpirit.
- Added broker-neutral `entry()` and `exit()` intents. The VM never receives direct broker/network execution authority.
- Routed intents through the existing typed `execution.intent` event boundary.
- Added intent visualization through the existing chart marker path.
- Added a v24 model/automation contract test.
- Updated the master task tracker and version contract to v24.

### Important boundary
This version does **not** claim that CoreSpirit can train arbitrary ML models yet. It can now express transparent deterministic prediction models and entry/exit logic in-language. Walk-forward training, feature sets, model persistence, metrics, and remote/accelerated model adapters remain planned Stage 8 work.

## v16 — Market-data reliability + CoreSpirit surface syntax
**Base:** v15

- Added persistent market subscription architecture.
- Added cache-first/atomic symbol switching foundation.
- Added switch-to-paint telemetry.
- Added rapid-switch stress harness.
- Expanded CoreSpirit surface syntax: concise assignments, friendly `if`, crossover syntax, concise plot/signal syntax and indicator wrapper handling.

## v15 — Chart/data engine foundation
**Base:** v14

- Added persistent chart/data lifecycle foundation.
- Added `HistoryStore`.
- Added REST/WebSocket reconciliation foundation.
- Added watchlist prefetch.
- Preserved 25k target / 50k maximum history strategy.

## v14 — Market history expansion
**Base:** v13

- Expanded history target/ceiling.
- Added larger broker lookback behavior and background history warming.
- Improved first-paint behavior and history caching.

## v13 — History lifecycle hardening
**Base:** earlier TradingCoreOS market-data version

- Added abort-aware chart history lifecycle.
- Prevented stale/aborted chart history responses from painting the wrong symbol.
- Improved shared-request cancellation semantics.

## Earlier foundation
The pre-v13 project established the initial CoreSpirit lexer/parser/AST/semantic/IR/compiler/runtime architecture, indicator kernel foundations, chart integration and Pine compatibility boundary.


## TradingCoreOS v26 — rich data / granular execution deep pass

**Date:** 2026-09-20

### Why v26 exists
The v25 foundation exposed the right capability boundaries, but several of them were still shallow: `lowerTf()` reduced a dataset to one latest value, footprint access stopped at bar-level summary fields, quote data was limited to depth imbalance, and the editor service only returned basic completions/signatures/formatting. TradingView's current documentation makes clear that dynamic requests, full lower-timeframe arrays and footprint rows are important parts of advanced scripting. citeturn0search3turn0search5turn0search0

### Implemented
- Added `CoreSpiritIntrabar` and `CoreSpiritMarketSnapshot` provider-neutral contracts.
- Added host-side `requestBatch()` capability for request coalescing.
- Added per-bar market-data memoization in the VM so repeated calls can reuse the same host snapshot.
- Added `bid()`, `ask()`, `spread()` and `mid()` language primitives.
- Added intrabar aggregate primitives for count/sum/high/low/delta.
- Added footprint row access for price/buy/sell/delta/imbalance.
- Added `executeHistoricalTicks()` so replay/backtest hosts can feed historical tick sequences through the same VM.
- Added explicit historical-tick bar-state handling.
- Added editor hover metadata, semantic tokens and cached editor snapshots.
- Added v26 contract tests for rich data, footprint rows, historical ticks and editor ergonomics.

### Important architectural choice
The VM still never opens a WebSocket, calls HTTP, or talks directly to a broker. The host adapter owns transport, caching, freshness and provider-specific normalization. This keeps the language deterministic and makes the same CoreSpirit program reusable for charting, replay, models and automation.

### Remaining deep gaps
1. Real feed-backed footprint adapter with exchange/provider-specific aggressor-side semantics.
2. True lower-TF alignment across historical/realtime gaps, sessions and partial bars.
3. Viewport-aware footprint/heatmap scene graph and row virtualization.
4. Incremental parser/AST reuse and true hot reload.
5. Persistent VM artifact migration/version compatibility.
6. Full multi-symbol request planner that batches and caches datasets across scripts.

### Validation
- Added `stage26RichDataContract.test.ts`.
- Source-level TypeScript validation should be run with repository dependencies installed; the supplied archive may not contain `node_modules`, so a full Vite/browser build is not claimed from the archive alone.

## TradingCoreOS v27 — Stage 4 coder + data-planner deep pass

Date: 2026-09-20

### What was added
- Added a provider-neutral `CoreSpiritDataPlanner` that deduplicates identical symbol/timeframe/field/offset requests before the host resolver is called.
- Added batched request resolution with graceful fallback to individual host requests.
- Added a DOM-free `CoreSpiritEditorModel` for reusable editor intelligence: incremental source edits, versioning, diagnostics, completions, semantic tokens, symbols/outline data, formatting and cached compilation.
- Added a v27 contract test for request deduplication and editor-model reuse.
- Bumped the CoreSpirit source contract to v27.

### Architectural intent
Stage 4 is now moving from a basic textarea editor toward a real language-service boundary. The same editor model can later back Monaco, CodeMirror, a native editor, or the existing lightweight UI without coupling language semantics to React.

The data planner keeps network access outside the VM while allowing the host to batch and cache cross-symbol/multi-timeframe requests. This is intentionally stronger than simply adding more `request()` built-ins.


## v28 — Data engine + visualization deep pass
**Base:** v27

- Re-checked current Pine documentation for drawing objects, fills, data contexts, lower-timeframe arrays, footprint data, and realtime execution/recalculation semantics.
- Added explicit CoreSpirit data-state metadata to make confirmed/developing/realtime values visible to the runtime contract.
- Added bounded shared data cache and cache-aware planner resolution.
- Added deterministic HTF snapshot alignment and LTF intrabar grouping contracts.
- Added footprint scene graph normalization and a native footprint visual object rendered by the existing canvas overlay.
- Added v28 contract tests covering cache reuse, alignment, LTF grouping and footprint intensity/side classification.
- Updated CoreSpirit version marker to v28.

### Design rationale
Pine's visual system separates serial plots from object drawings such as lines, boxes and polylines, while its data model distinguishes higher-timeframe requests from lower-timeframe arrays and footprint data. CoreSpirit v28 follows the useful architectural idea—typed data contexts plus object visuals—but keeps acquisition outside the VM and makes visual objects renderer-independent. This leaves room for richer heatmaps, parameter surfaces, probability clouds and model-driven scenes without forcing every cell into a chart series.

### Not claimed complete
No claim of exchange-native footprint parity, perfect session-calendar alignment, or full hot reload. Those require live feed integration and deterministic replay infrastructure.


## TradingCoreOS v29 — Stage 4 CoreSpirit Coder deep pass
**Date:** 2026-09-20

### Focus
Advanced Stage 4 instead of adding another runtime primitive. The goal was to make the coder a real language-tooling boundary while keeping CoreSpirit source simpler than Pine.

### Implemented
- Context-aware completion classification for global/call/argument/member contexts.
- Definition metadata and definition-at-cursor lookup.
- Folding-range extraction.
- Deterministic quick-fix/code-action edits.
- Bounded undo/redo in `CoreSpiritEditorModel`.
- Editor versioning and cached compilation retained from v27.
- Synchronized syntax highlighting layer over the existing lightweight textarea adapter.
- Completion popup with keyboard selection/insertion.
- Save/run/editor keyboard shortcuts.
- v29 coder contract and regression test.

### Architecture
The editor UI is now an adapter over the language service rather than the language service itself. This follows the useful separation visible in Pine's type-aware editor experience: Pine's type system and annotations feed editor suggestions and documentation, while compilation errors/warnings are surfaced separately from runtime errors. citeturn0search1turn0search3turn0search8

### Still open
- Incremental AST reuse.
- Transactional hot reload.
- Real Monaco/CodeMirror adapter.
- Type inference and member completion for UDT/collection/model objects.
- Library/package system inspired by Pine libraries, but with CoreSpirit's simpler source model and stronger runtime capabilities. Pine libraries can export functions, UDTs, methods and enums; this is now tracked as a future CoreSpirit module/package capability. citeturn0search0turn0search6


## TradingCoreOS v31 — Stage 4 CoreSpirit Coder completion

This pass completed the remaining Stage 4 items requested before moving to Stage 5. The editor is no longer limited to a textarea-oriented language-service boundary: a real Monaco adapter is available, while the existing lightweight editor remains a fallback. The language layer now has structural AST reuse, type inference, user-defined type declarations, member-aware completion, transactional hot reload, runtime checkpoints, and compiler source maps.

### Completed

- Monaco editor adapter with contextual completions and hover integration.
- Incremental AST structural reuse for unchanged nodes.
- Type inference for primitives, series and UDT references.
- `type Name { field: type }` declarations.
- Member completion for UDT fields.
- Compile/validate/checkpoint/atomic-swap hot reload controller.
- Runtime checkpoint export/restore.
- IR-to-source source maps.
- v31 regression contract.

### Design decisions

- Monaco is an adapter, not the language implementation.
- Failed or obsolete compilations cannot replace the active runtime.
- Source maps live in the deterministic IR so later replay/live diagnostics can share the same mapping.
- State migration is conservative; incompatible type changes remain a later explicit migration policy rather than silently corrupting runtime state.

## TradingCoreOS v31 — Chart data regression repair

The v30 chart engine had a deliberate optimization that unintentionally changed the visible history contract. FYERS history was restricted to a single ~100-day intraday window on the first request, with the rest delegated to browser-side background paging. Because candle density decreases as timeframe increases, switching from 5m to 15m/30m/1H appeared to reduce history dramatically. This was a regression relative to the older TradingCoreOS implementation.

### Repaired

- Restored target-based FYERS history accumulation using broker-safe windows.
- Kept the 25,000-candle dense target and 50,000-candle client maximum.
- Kept `cont_flag=1`.
- Kept NIFTY50 epoch/date-format fallback.
- Kept canonical NIFTY/BANKNIFTY/SENSEX/F&O symbol handling.
- Kept shared broker request gating and cache/in-flight deduplication.
- Increased background page sizes and guard capacity for higher timeframes.
- Added an 1.8-second abort grace period to the shared history request guard, allowing rapid switches to reattach to an in-flight request rather than throwing away the response.
- Preserved generation checks so stale data cannot paint the wrong symbol/timeframe.

### Resulting data contract

A cold chart load now attempts to return up to 25k valid candles for the selected symbol/timeframe rather than letting a fixed calendar window silently determine candle count. If the broker has less history, the available valid history is returned. No synthetic historical candles are fabricated.


## v32 — legacy chart history method restored
- Exact legacy FYERS timeframe window geometry restored.
- Target increased to 20,000 candles per timeframe.
- Multiple broker-valid windows are merged chronologically until target or broker history exhaustion.
- Newer cache, deduplication, abort grace, symbol normalization and switching protections retained.
- No synthetic candles when broker history is unavailable.


## TradingCoreOS v32 — exact legacy chart history method + 20k target
- [x] Restore the proven legacy FYERS timeframe-specific request-window geometry.
- [x] Repeat that same broker-valid window backwards and chronologically merge/deduplicate until 20,000 candles are available.
- [x] Keep broker request limits/date-window constraints intact.
- [x] Keep cache, deduplication, symbol normalization, rapid-switch abort grace and stale-result protections.
- [x] Use whatever valid history the broker actually provides when 20,000 is unavailable; never synthesize historical candles.
- [x] Set chart/history-store initial target to 20,000 across timeframes.
- [x] Keep the 50,000 resident-history ceiling where supported by the existing runtime.


## v32 hotfix — FYERS request-limit / blank-chart fix
- [x] Restore the legacy **single History API request** for the initial FYERS chart page.
- [x] Keep the legacy 30/90/3650-day request geometry by timeframe.
- [x] Keep `cont_flag=1` and the existing chronological normalization.
- [x] Remove v32 watchlist-wide historical prefetch; chart history is loaded on demand.
- [x] Keep `before=` pagination for deliberate left-edge history expansion.
- [x] Prevent a 20,000-candle target from turning one chart switch into dozens of FYERS History calls.
