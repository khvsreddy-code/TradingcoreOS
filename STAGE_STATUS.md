# TradingCoreOS — Stage Status / Anti-Drift

**Updated:** 2026-09-19
**Current ZIP:** Stage 2–8 validated-gated tree + Stage 9 Pine compatibility merge + Stage 10 TradingCore V Price Action structure-engine merge.

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
| 11. Levels/shared structure engine | **NOT STARTED** | Held for downstream pass. |
| 12. Deterministic Replay | **DONE** | Stable sorting, invalid-data rejection, step/resume semantics, replay source tagging and event sequencing are implemented and self-tested. |
| 13. ML Feature Registry | **NOT STARTED** | Held for downstream pass. |
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
- Historical chart loading now targets **50,000 valid candles** instead of 10,000/25,000/one-window subsets.
- Fyers and Upstox history routes accept a 50,000 target and walk backwards through broker-safe date windows.
- The browser/runtime retains up to 50,000 normalized candles for chart rendering.
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

### Stage 10 — TradingCore V Price Action
- Added `src/services/marketData/structureEngine.ts` as the canonical quantitative structure implementation.
- Fractal swing candidates and volume-weighted KDE density peaks are merged through deterministic 1D ATR-scaled clustering.
- ATR-scaled impulse detection creates Demand/Supply zones from the base candle preceding the impulse.
- Zone mitigation is tracked forward and mitigated zones are excluded from active output.
- Multi-timeframe confluence uses deterministic resampling and boosts matching level/zone confidence.
- The existing `LiveChart` TradingCore V path now consumes the shared structure engine through the existing `tradingCoreVPriceAction` export.
- `structureEngine.test.ts` validates deterministic output, MTF confluence, score bounds and malformed-candle filtering.

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

**Consequently Stages 8, 9 and 10 remain implementation-complete but environment-gated.** A clean dependency install plus full `npm run lint` / `npm run build` and browser smoke/FPS/memory validation remain required before Stage 11.

### Stage 10 validation

- Structure engine strict TypeScript compilation: **PASS**.
- TradingCore V deterministic structure test: **PASS** (`TRADINGCORE_V_STRUCTURE_TEST=PASS`).
- Test coverage: fractal/KDE level generation, ATR-scaled clustering, Supply/Demand impulse zones, mitigation filtering, MTF confluence, score bounds and malformed candle filtering.
- Full application build: **BLOCKED** by the same dependency-install/environment limitation.
- Browser smoke/FPS/memory validation: **NOT RUN**.

## Next gate

```text
Stages 2,3,4,5,6,7,9,10,12 → source/runtime validated
Stages 8,9,10             → full app/browser gate pending
                              ↓
                   FULL APP BUILD + BROWSER SMOKE TEST
                              ↓
                       START STAGE 11
```
