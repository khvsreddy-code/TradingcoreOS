# TradingCoreOS — Stage Status / Anti-Drift

**Updated:** 2026-09-19
**Current ZIP:** Stage 2–8 validated-gated tree + Stage 9 Pine compatibility + Stage 10 canonical structure engine + Stage 11 Levels/shared-structure merge.

## Merge policy

- Stage 8 is the primary/newer tree.
- Stage 7 is used only for files missing from Stage 8.
- Stage 8 wins conflicts.
- Stage 9 is implemented as a fail-closed Pine compatibility adapter.
- Stage 10 is implemented as the canonical TradingCore V quantitative structure engine; later stages remain untouched.

## Current status

| Stage | Status | Validation / scope |
|---|---|---|
| 1. Chart lifecycle hardening | **DONE** | Generation guard, cleanup, stale async result rejection and resize lifecycle are present. |
| 2. Unified CoreDrawing | **DONE** | Canonical data-coordinate contract, tool catalog, retained store, undo/redo, renderer geometry, hit testing, handle dragging and OHLC snapping are implemented. |
| 3. Data/Event Bus | **DONE** | Typed events, sequencing, listener isolation, market lifecycle, calculation, replay and drawing events are implemented. |
| 4. CoreSpirit AST/IR | **DONE** | Lexer/parser/AST/IR foundation is present and typechecked. |
| 5. CoreSpirit Compiler | **DONE** | Semantic validation, builtin signatures, arity checking, IR generation, diagnostics and deterministic executable artifacts/checksums are implemented. |
| 6. Stateful CoreSpirit Runtime | **DONE** | Stateful chronological runtime, incremental bar execution, lookback guards, step quota and worker boundary are implemented. |
| 7. Plot/Drawing/Alert API | **DONE** | Declarative output contract plus chart-independent plot/drawing/event dispatcher are implemented. |
| 8. Chart UX/Performance | **IMPLEMENTED — browser build verification pending** | Drawing rail, watchlist, lifecycle hardening, worker indicators and RAF batching are present. Browser-level FPS/memory validation still requires a dependency-complete environment. |
| 9. Pine compatibility | **IMPLEMENTED — application build gate pending** | Fail-closed Pine subset translator into native CoreSpirit AST/IR; runtime support for translated crossover/crossunder/math/nz primitives. Browser-level build remains pending. |
| 10. TradingCore V Price Action | **IMPLEMENTED — application build gate pending** | Canonical structure engine for fractal/KDE S/R, ATR impulse Supply/Demand zones, mitigation, deterministic 1D clustering and multi-timeframe confluence. Browser build remains pending. |
| 11. Levels/shared structure engine | **IMPLEMENTED — application build gate pending** | Levels now consume the canonical Stage 10 structure engine; lifecycle state, break/retest/failure events, session/opening anchors and chart analytics are routed through that shared structure boundary. |
| 12. Deterministic Replay | **DONE** | Stable sorting, invalid-data rejection, step/resume semantics, replay source tagging and event sequencing are implemented and self-tested. |
| 13. ML Feature Registry | **IMPLEMENTED / VALIDATION-GATED** | Canonical versioned feature definitions, provenance-aware extraction, availability gating, and vector validation are implemented; model training/inference is not claimed by this stage. |
| 14. Model Registry + Artifact Validation | **NOT STARTED** | Held for downstream pass. |
| 15. Regime Engine | **NOT STARTED** | Held for downstream pass. |
| 16. Cross-Asset Feature Engine | **NOT STARTED** | Held for downstream pass. |
| 17. Meta-Labeler | **NOT STARTED** | Held for downstream pass. |
| 18. Risk Engine | **NOT STARTED** | Held for downstream pass. |
| 19. Execution Policy | **NOT STARTED** | Held for downstream pass. |
| 20. Broker Execution | **PARTIAL / existing foundation** | Existing broker connectivity remains; policy-controlled production execution is downstream. |
| 21. CoreSpirit Copilot | **NOT STARTED** | AI authoring is intentionally downstream of the language/runtime boundary. |
| 22. AI Backtesting/Debugging/Optimization | **NOT STARTED** | Downstream of replay/runtime/compiler validation. |

## What was finished in the partial-stage pass

### Stage 2 — CoreDrawing
- Canonical retained `CoreDrawingStore` is now used by the chart drawing workflow.
- Undo/redo no longer relies on destructive array popping.
- Pure geometry module supports hit testing, selection handles and data-coordinate handle movement.
- OHLC snapping is applied when creating drawings.
- Tool definitions remain separate from renderer implementation.

### Stage 5 — CoreSpirit compiler
- Standard-library signature registry is authoritative for builtin validation.
- Compiler produces deterministic IR and an executable artifact with checksum/instruction metadata.
- Compile failures are returned as diagnostics rather than silently producing an executable plan.

### Stage 6 — CoreSpirit runtime
- Compile-once `loadProgram()` boundary.
- Incremental `executeBar()` stateful execution.
- Public compiled-IR access for worker execution.
- Dedicated `coreSpirit.worker.ts` boundary.
- Runtime remains independent of chart rendering and browser DOM APIs.

### Stage 7 — Plot/Drawing/Alert boundary
- `CoreSpiritOutputDispatcher` owns the main-thread handoff.
- Plot series are retained as time/value data.
- Spatial outputs are converted through `CoreDrawingDispatcher`.
- Signals remain event/data outputs; alerts/webhooks remain event-bus capabilities.

### Chart history target / workspace chrome correction
- Historical chart capacity is **30,000 valid candles**, loaded progressively: 10,000 initially plus 5,000-candle backward pages.
- Fyers and Upstox history routes use broker-safe windows plus a `before` cursor for lazy backward loading.
- The browser/runtime retains up to 30,000 normalized candles for chart rendering.
- No synthetic candles are created to pad the target; broker availability remains the hard ceiling.
- Removed the duplicate `/live` header navigation strip (`CHARTS / MODELS / AUTOMATIONS / PORTFOLIO / INDICATORS / PROFILE`).
- Removed the standalone Crosshair item from the embedded drawing rail.

### Stage 8 — Chart UX/performance
- RAF-batched worker indicator rendering via `ChartUpdateScheduler`.
- Lifecycle cancellation also cancels pending chart work.
- Existing worker generation checks remain in place.
- CoreDrawing selection and drag interaction use data-coordinate geometry rather than pixel-persistent drawings.

### Stage 9 — Pine compatibility
- Pine source is translated into native CoreSpirit rather than executed through a Pine runtime.
- Unsupported strategy/request/function/loop/array/table/ternary constructs fail closed.
- Translated `crossover`/`crossunder` primitives retain state per compiled call site.
- Pine math/input/plot/alert subset is normalized through the CoreSpirit compiler boundary.

### Stage 11 — Levels / shared structure engine

- `src/services/marketData/levelEngine.ts` is now a compatibility facade over the canonical `structureEngine.ts`; it no longer contains an independent pivot/S&R detector.
- Canonical structure levels now carry their best source candle index so downstream lifecycle analysis can remain chronological.
- Added `buildCanonicalLevelAnalytics(...)` to the structure engine for Levels-specific lifecycle semantics.
- Levels consume the same fractal/KDE/ATR-scaled clustered structure outputs as TradingCore V.
- Preserved session and opening-range anchors as contextual levels without creating a second structural detector.
- Breakout, retest, flip and failure events are evaluated chronologically from the shared levels.
- ATR values used during lifecycle scanning are precomputed once per candle rather than recalculated from the full prefix for every level.
- `indicatorEngine.dynamicSupportResistance()` now consumes canonical structure output instead of maintaining another pivot implementation.
- `ChartAnalytics` now exposes the canonical `structure` object so chart/UI/ML consumers can inspect the same underlying levels/zones.
- Added `src/services/marketData/levelEngine.test.ts` covering shared-structure provenance, side partitioning and lifecycle event bounds.

### Stage 10 — TradingCore V Price Action
- Added `src/services/marketData/structureEngine.ts` as the canonical quantitative structure implementation.
- Fractal swing candidates and volume-weighted KDE density peaks are merged through deterministic 1D ATR-scaled clustering.
- ATR-scaled impulse detection creates Demand/Supply zones from the base candle preceding the impulse.
- Zone mitigation is tracked forward and mitigated zones are excluded from active output.
- Multi-timeframe confluence uses deterministic resampling and boosts matching level/zone confidence.
- The existing `LiveChart` TradingCore V path now consumes the shared structure engine through the existing `tradingCoreVPriceAction` export.
- `structureEngine.test.ts` validates deterministic output, MTF confluence, score bounds and malformed-candle filtering.

### Stage 13 — ML Feature Registry

- Added `src/services/ml/featureRegistry.ts` as the canonical versioned feature contract.
- Feature definitions carry domain, data requirement, intended horizon, description and version.
- OHLCV-derived features include returns, EMA distances, RSI, ATR%, range%, volume ratio and breakout distance.
- Options, order-book, macro and sentiment features are availability-gated; absent external data is represented as unavailable rather than fabricated.
- Every feature value carries timestamp, timeframe, source and definition version provenance.
- Added vector validation and `src/services/ml/featureRegistry.test.ts` self-test.
- This stage does **not** claim that the registered prediction models are genuinely trained; it establishes the shared feature schema needed by future training/inference pipelines.

### Stage 12 — Deterministic Replay
- Replay input is validated before entering the bus.
- Invalid timestamps/OHLC/volume and duplicate timestamps are rejected.
- Replay uses sorted immutable copies of the supplied bars.
- Step mode emits exactly one replay market bar per step.
- Resume does not emit duplicate `replay.started` events.

## Validation performed

### Passed
- Core TypeScript strict compilation using a dependency-independent test configuration: **PASS**.
- Core runtime/drawing/replay self-test: **PASS**.
- `LiveChart.tsx` and `CoreDrawingToolbar.tsx` TypeScript/TSX parser diagnostics: **SYNTAX_OK**.

### Environment limitation

A complete application build could not be run in this extracted environment because the project dependencies are not installed. `npm ci` timed out before producing `node_modules`, and the repository's configured `tsconfig.json` therefore reports the missing `vite/client` type package.

**Consequently Stages 8, 9 and 10 remain implementation-complete but environment-gated.** A clean dependency install plus full `npm run lint` / `npm run build` and browser smoke/FPS/memory validation remain required before marking Stage 11 fully validated.

### Stage 10 validation

- Structure engine strict TypeScript compilation: **PASS**.
- TradingCore V deterministic structure test: **PASS** (`TRADINGCORE_V_STRUCTURE_TEST=PASS`).
- Test coverage: fractal/KDE level generation, ATR-scaled clustering, Supply/Demand impulse zones, mitigation filtering, MTF confluence, score bounds and malformed candle filtering.
- Full application build: **BLOCKED** by the same dependency-install/environment limitation.
- Browser smoke/FPS/memory validation: **NOT RUN**.

## Next gate

```text
Stages 2,3,4,5,6,7,9,10,12 → source/runtime validated
Stage 13                  → feature-registry implementation complete; validation gate pending
Stages 8,9,10             → full app/browser gate pending
                              ↓
                   FULL APP BUILD + BROWSER SMOKE TEST
                              ↓
                 CONTINUE STAGE 13 → MODEL PIPELINES
```


### Progressive historical chart loading — reliability correction
- Initial history is bounded at 10,000 candles to avoid broker/API request-limit bursts.
- Backward pages contain up to 5,000 candles and are loaded only after the user pans toward the left edge.
- Chart history is capped at 30,000 valid candles per symbol/timeframe.
- FYERS and Upstox support a timestamp cursor (`before`) for backward history pages.
- The chart preserves the user's visible time range after older candles are prepended and displays a non-blocking `Loading more history…` status.
- Existing live-tick/developing-bar updates remain active after lazy history loads.


### Historical chart reliability correction — 2026-09-19
- Progressive 30k history now uses one broker-safe history window per request.
- FYERS uses one 100-day intraday page, 90-day 30m/60m page, or 366-day daily page; older data loads one page at a time from the left edge.
- Upstox uses one documented month/quarter page per request; older data loads only when the user pans backward.
- The browser history guard no longer retries broker rate-limit responses. HTTP status is preserved across the broker adapter boundary.
- The chart still retains up to 30,000 valid candles and continues live/developing-bar updates after lazy loads.
