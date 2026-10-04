# Consolidated release notes — legacy

> Historical release notes preserved outside the active architecture documentation. Current implementation truth is in the four canonical docs and the build tracker.

---

# SOURCE: CORESPIRIT_V101_RELEASE_NOTES.md

# TradingCoreOS v101 — Terminal Density + First-Class Right Dock

Date: 2026-09-29

## Scope

v101 deepens the v99 terminal-shell and v100 visual-density work. It is a TradingCoreOS host/UI release. CoreSpirit remains **v98** and its language/compiler/IR/VM/model ABI/execution boundaries are unchanged.

## Deeper terminal hierarchy

`/live` now follows an explicit five-surface hierarchy:

```text
/live
  ├── terminal command chrome
  ├── chart workspace
  │     └── chart-native drawing rail / tools
  ├── right terminal dock
  │     ├── WATCHLIST
  │     ├── ORDER BOOK
  │     └── ALERTS
  └── bottom terminal dock
        ├── POSITIONS
        ├── ORDERS
        ├── TRADES
        ├── ACTIVITY
        ├── STRATEGY LOG
        └── ORDER TICKET
```

The chart area is the primary work surface. Secondary information is docked around it rather than represented as floating workspace windows.

## Deeper visual language

Terminal infrastructure uses a deliberate surface hierarchy instead of dashboard cards:

```text
chart / separators       → 0px
compact controls         → 0–2px
popovers                 → ≤4px
major dialogs            → outside the terminal density rule
shadow                   → none on terminal infrastructure
separation               → 1px rules + spacing
accent                   → blue
market semantics         → independent positive/negative colors
```

No landing-page/marketing selectors were changed by this release.

## Right dock as a first-class system

The former watchlist-oriented component is now named `RightTerminalDock` and owns three equivalent dock surfaces under one interaction contract.

### Dock state

The canonical workspace owns:

```text
rightDockOpen
rightDockTab
rightDockWidth
```

`watchlistOpen` remains only as a compatibility alias for older snapshots.

### Panel contract

```text
RIGHT_DOCK_TABS
    ├── WATCHLIST   Alt+1
    ├── ORDER BOOK  Alt+2
    └── ALERTS      Alt+3

Alt+0 → collapse / expand right dock
```

Panel state remains in the same dock shell while the active surface changes. There is no modal backdrop, popup ownership, or second workspace host.

### Width contract

The dock width is controlled by `LiveTradingWorkspace`, constrained to 260–460px on desktop, and persisted through the workspace snapshot/local/cloud workspace lifecycle. This makes sizing part of the workspace rather than transient component-local state.

### Shared context

The selected watchlist instrument is the dock's shared market context. Selecting a symbol updates the focused chart assignment using the existing workspace/chart contract. The Order Book and Alerts surfaces consume the same selected instrument rather than creating their own symbol selector state.

### Status contract

The dock exposes a compact footer containing live-state, selected-instrument context, and the collapse shortcut. This makes dock state visible without adding a decorative card.

## Non-interference

The release does not alter:

- market-data transport or quote-heartbeat behavior
- historical candle request ownership
- canonical chart data-plane ownership
- CoreSpirit compiler/semantic graph/IR/VM
- broker execution capability contracts
- renderer-neutral chart interaction semantics

## Validation

```text
TRADINGCORE_V101_RIGHT_DOCK_SYSTEM_CONTRACT_OK
TRADINGCORE_V99_TERMINAL_SHELL_CONTRACT_OK
TRADINGCORE_V100_TERMINAL_VISUAL_DENSITY_CONTRACT_OK
```

Dependency-backed `tsc`, Vite build, and connected-broker runtime verification remain environment/deployment checks rather than being claimed by the static contract run.

---

# SOURCE: CORESPIRIT_V102_RELEASE_NOTES.md

# TradingCoreOS v102 — First-Class Right Dock + Single React Root

Date: 2026-09-29

## Scope

v102 is a TradingCoreOS host/UI architecture release. CoreSpirit remains **v98**. No CoreSpirit language, compiler, semantic graph, IR, VM, model ABI, execution capability, or roadmap semantics were changed.

The release deepens v101 in two areas:

1. the right-side dock is now an explicit subsystem with independently renderable surfaces and a canonical dock interaction contract;
2. the live terminal is enforced as a single-React-root route, with legacy DOM entrypoint/mutation bridges removed.

## 1 — deeper first-class right dock

The canonical implementation is now:

```text
LiveTradingWorkspace
      │
      ▼
RightTerminalDock
      ├── WatchlistSurface
      ├── OrderBookSurface
      └── AlertsSurface
```

`WatchlistDock.tsx` remains only as a compatibility re-export. New workspace code imports `RightTerminalDock` directly.

### Dock state contract

Workspace state remains the authoritative location for:

```text
rightDockOpen
rightDockTab
rightDockWidth
```

The dock does not create a second persistence authority. Width is clamped to 260–460px and returned to the workspace through the existing controlled callback.

### Surface isolation

Each panel is an independently renderable React surface. Only the active surface is mounted, so inactive work does not continue rendering or fetching. The existing selected-instrument tick map remains the shared market context. No panel creates its own chart/data subscription.

```text
selected instrument
       │
       ├── WatchlistSurface  → existing tick map + instrument search
       ├── OrderBookSurface  → selected tick bid/ask depth
       └── AlertsSurface     → selected-symbol local alert state
```

News fetching is scoped to the watchlist surface and is cancelled when that surface or symbol changes. Alert persistence is scoped to the selected symbol.

### Interaction contract

```text
Alt+1 → Watchlist
Alt+2 → Order Book
Alt+3 → Alerts
Alt+0 → Collapse / Expand
Tab / Arrow keys / Home / End → navigate dock tabs
Pointer drag → resize dock
```

Tabs now use roving `tabIndex` plus explicit `aria-controls` / `aria-labelledby` relationships.

## 2 — single React root / route ownership

The production browser entrypoint is now explicitly:

```text
index.html
   │
   ▼
src/main.tsx
   │
   ▼
<App />
   │
   ▼
workspace route
   │
   ▼
<LiveTradingTerminal />
   │
   ▼
<LiveTradingWorkspace />
```

`index.html` loads only `src/main.tsx` as a module entrypoint. A repository contract now asserts that exactly one `createRoot(...)` exists and that it is owned by `src/main.tsx`.

The live route renders `LiveTradingTerminal` directly inside the existing React tree. The separate `LiveModuleBoundary` wrapper was removed because the existing `RouteErrorBoundary` already owns workspace-route failure isolation.

### Legacy DOM bridge retirement

The following browser-level injection files were removed because their behavior had no remaining canonical owner in the v99–v101 terminal:

```text
src/workspaceRuntimeBridge.ts
src/workspaceChromeStyle.ts
src/workspaceOrderBridge.ts
src/workspaceHotfix.ts
src/workspaceChromeHotfix.ts
src/quickOrderHotfix.ts
```

This removes:

- global `window.fetch` replacement from terminal bootstrap;
- document-level click listeners that re-click toolbar controls;
- MutationObserver-driven order-ticket DOM rewriting;
- injected terminal-only style elements;
- dead repair/hotfix entrypoints.

Instrument-search and option-chain caching remain owned by the canonical market-data/runtime services rather than an HTML bootstrap script.

### Resulting lifecycle

```text
old
HTML scripts → global DOM listeners → React root → terminal

new
HTML → single React root → route → terminal workspace → dock/chart surfaces
```

## Non-interference

No market-data transport, historical candle ownership, canonical chart data plane, CoreSpirit execution path, broker adapter, or broker authorization contract was intentionally changed by v102.

## Validation

```text
TRADINGCORE_V101_RIGHT_DOCK_SYSTEM_CONTRACT_OK
TRADINGCORE_V102_RIGHT_DOCK_ARCHITECTURE_CONTRACT_OK
TRADINGCORE_V102_SINGLE_REACT_ROOT_CONTRACT_OK
TRADINGCORE_V99_TERMINAL_SHELL_CONTRACT_OK
TRADINGCORE_V100_TERMINAL_VISUAL_DENSITY_CONTRACT_OK
```

All modified TS/TSX sources were syntax-transpiled with the installed TypeScript compiler. A dependency-backed `tsc`/Vite build remains a deployment/environment verification step because the archive does not contain installed npm dependencies.

## v102 dock input/performance hardening

- Pointer resizing is requestAnimationFrame-coalesced so the workspace width state does not update more than once per rendered frame during a drag.
- Alt dock shortcuts ignore focused form controls and contenteditable regions, preventing terminal navigation keys from stealing text-entry focus.
- These changes are interaction-layer optimizations; they do not change the market-data cadence or broker transport.

---

# SOURCE: CORESPIRIT_V103_RELEASE_NOTES.md

# CoreSpirit v103 Release Notes — Host/Data-Plane Integration

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM version remains **v98**. v103 is a TradingCoreOS host performance release and does not introduce language syntax or runtime authority changes.

## Chart host integration

The live chart host now consumes a shared chart data plane keyed by:

```text
broker:symbol:timeframe
```

CoreSpirit chart registry entries remain per visible chart so that scripts can address chart-local lifecycle identity, but market history and compute results are not copied per chart.

## Performance boundary

The host runtime now provides:

- one shared symbol-level realtime feed per broker/symbol,
- one shared history lifecycle per dataset,
- bounded analytics/indicator worker pools,
- dataset/revision result caching,
- dataset-scoped prediction deduplication,
- canonical typed-array storage shared by chart consumers.

CoreSpirit output execution remains downstream of the existing canonical data/runtime contracts.

## Preserved CoreSpirit invariants

```text
CoreSpirit source
      ↓
compiler / normalization / IR
      ↓
VM / approved runtime capability boundary
      ↓
chart output projection
```

The chart data plane does not grant CoreSpirit broker authority and does not move execution into chart UI code.

---

# SOURCE: CORESPIRIT_V104_RELEASE_NOTES.md

# CoreSpirit v104 Release Notes — Demand-Driven Chart History

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM version remains **v98**. v104 is a TradingCoreOS chart host/data-plane performance release.

## Multi-chart / history changes

- initial history is bounded to 300–1,500 candles by timeframe;
- older history is requested from the visible logical range;
- global history concurrency is limited to two active requests;
- cached older pages are served from `HistoryStore` before network access;
- one low-priority warm page is allowed for the active chart;
- initial history limits propagate through client runtime, HTTP route and server broker adapters;
- older-history viewport restoration uses logical-range APIs;
- full-dataset compute semantics are preserved while demand-driven history limits initial processing.

## Preserved architecture

```text
broker:symbol realtime feed
        ↓
chartMarketStore
        ↓
broker:symbol:timeframe ChartDataPlane
        ↓
active demanded window
        ↓
chart renderer / bounded shared compute
```

No CoreSpirit language or execution authority changes are part of v104.

---

# SOURCE: CORESPIRIT_V105_RELEASE_NOTES.md

# TradingCoreOS v105 Release Notes — Deeper History Demand + Indicator Dependency Graph

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM version remains **v98**. v105 is a chart/data-plane performance and indicator presentation release.

## History / multi-chart

- viewport-sized older-history pages are now derived from visible bar demand;
- duplicate left-edge requests get a short anchor/page cooldown in addition to per-dataset single-flight;
- older-history prepend events expose `olderAdded` so the chart restores the logical range without jumping;
- retained history and worker compute residency are now explicitly separated;
- indicator worker input is centered on the visible logical range with bounded warmup and a hard 10,000-candle ceiling;
- worker cache identity now includes the compute-window identity.

## Indicator dependency graph

- explicit dependency planning added for EMA, SMA, HMA, VWAP, Bollinger Bands, Keltner Channels, RSI, MACD, ATR, Supertrend and Donchian Channels;
- true range and ATR are reusable graph nodes;
- HMA reuses WMA primitives;
- composite studies reuse upstream EMA/SMA/ATR nodes;
- worker graph caches are dataset/revision/window scoped;
- appearance changes do not participate in mathematical cache signatures.

## Indicator presentation

- primary, signal, upper and lower colors;
- line width 1–6;
- solid/dotted/dashed line styles;
- opacity;
- settings are persisted through the existing indicator settings store and exposed directly from the chart indicator menu.

## Preserved boundaries

No broker execution authority, CoreSpirit language semantics, IR/VM, realtime symbol-feed ownership, terminal dock ownership or chart renderer ownership was changed by this release.

---

# SOURCE: CORESPIRIT_V106_RELEASE_NOTES.md

# TradingCoreOS v106 Release Notes — Deeper Demand History + Indicator Graph Execution

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM version remains **v98**. v106 continues the chart host/data-plane performance track.

## History

- `HistoryStore` is now an LRU-bounded shared retention cache with a maximum of 32 dataset buckets.
- Active-chart warm history can use the current visible bar count rather than blindly requesting a full page.
- Failed warm requests release the warm latch for later retry.
- Older-history events report actual net prepend growth after normalization and retention limits.
- Deep-history loading remains demand-driven; no mounted chart performs an unbounded background crawl.

## Indicator dependency graph

- Composite graph plans now contain explicit transitive source/base dependencies.
- Graph plans return deterministic topological order and reject cycles.
- WMA, Bollinger and Donchian shared kernels avoid repeated full-window rescans.
- Shared TR/ATR/EMA/SMA/WMA dependencies remain cached by dataset/revision/compute window.

## Indicator presentation

- Primary, signal, upper and lower plot colors remain configurable.
- Line width remains configurable from 1–6.
- Line style supports solid, dotted and dashed.
- Opacity is configurable and persisted.
- Presentation changes remain outside mathematical cache identity.

## Preserved boundaries

No CoreSpirit language semantics, compiler/IR/VM authority, broker execution/risk authority, shared realtime symbol feed ownership, terminal dock ownership, or chart-local drawing ownership was changed by this release.

---

# SOURCE: CORESPIRIT_V107_RELEASE_NOTES.md

# TradingCoreOS v107 Release Notes — Incremental Indicator Execution

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM remains **v98**. v107 continues the host/data-plane/indicator performance track after v106.

## Incremental calculation

- Added reusable rolling state for mean, variance, min/max, sum, exact MAD, EMA, Wilder, ATR, WMA and session VWAP.
- Standard indicators now have a stateful forming-bar lane covering EMA, SMA, HMA, VWAP, Bollinger, Keltner, Donchian, RSI, MACD, ATR, ADX, Stochastic, CCI, OBV, MFI, Supertrend and Ichimoku.
- Six advanced indicators now have stateful tail updates: Adaptive Ehlers, Fractional EMA Kalman Filter, Trend Pressure, Trend Target Ribbon, Trinity and Neural Weight Oscillator.
- Batch fallbacks for the named rolling-window indicators no longer perform repeated full period scans.
- Advanced normalized/standard-deviation helpers now use rolling mean/variance state.

## Live correctness

- Same-bar snapshot identity includes the forming candle's OHLCV tuple.
- Incremental `replace` and `append` operations are explicit.
- Lost or incompatible worker state triggers one controlled full resync.
- Snapshot priming and incremental ticks share a stable worker affinity key.

## Rendering

- Incremental line, channel, MACD, Stochastic, Supertrend, Ichimoku and Ribbon outputs update only the affected tail points.
- Legacy studies can coexist without clearing primed worker series on every tick.

## Indicator dialogue

- Per-indicator settings gear is available from the live indicator dialogue.
- `Code` opens a read-only CoreSpirit source viewer with copy support.
- The shared settings panel exposes the same source action.
- Indicator Studio remains the editable source workflow.

## Validation

Completed: standard numerical parity and same-bar replacement checks, state-reset/WMA correctness checks, static v107 contract checks, full Markdown inventory and tracker/doc alignment.

Pending in this archive environment: dependency-backed full TypeScript check, complete Vite build, and connected FYERS/browser performance stress testing.

## Preserved boundaries

No CoreSpirit language semantics, compiler/IR/VM authority, broker execution/risk authority, shared realtime feed ownership, terminal dock ownership, or chart-local drawing ownership was changed by this release.

---

# SOURCE: CORESPIRIT_V108_RELEASE_NOTES.md

# CoreSpirit v108 Release Notes

Date: 2026-09-29

## Theme

**CoreSpirit-first platform + Vela production chart engine**

## Architecture lock

TradingCoreOS is now locked to:

```text
CoreSpirit
   ↓
TCO compiler / IR / VM / reactive runtime
   ↓
renderer-neutral chart output
   ↓
TCO chart contracts
   ↓
Vela NativeRenderer
   ├── WebGL2
   └── Canvas2D fallback
```

TCO remains the authority for canonical market data, compute, indicator/model execution, risk/policy, automation, persistence and broker authorization. Vela is a rendering backend, not a trading-system owner.

## Included

- Removed the retained external scripting compatibility translator/runtime/catalog from application source.
- Removed the external public-script catalog dependency from the community indicator surface.
- Removed `lightweight-charts` from application dependencies and the npm lockfile.
- Added vendored Vela source with upstream Apache-2.0 `LICENSE` and `NOTICE`.
- Added a TCO-owned Vela chart facade that preserves the existing workspace chart vocabulary without making React or CoreSpirit depend on vendor APIs.
- Added a Vela-backed `ChartRenderer` implementation and made `vela-native` the only production chart backend.
- Reused Vela's native WebGL2 renderer and Canvas2D fallback rather than maintaining a second production renderer selection in TradingCoreOS.
- Kept canonical columnar market data and incremental update semantics outside the renderer boundary.
- Reworked the Indicators community surface around versioned CoreSpirit Community Indicators.
- Documented the upstream Vela attribution requirement and retained visible attribution.
- Added D1–D6 deepening work for typed-array ingress, viewport LOD, stable render packets, native drawings, multi-chart sync and measurable GPU/frame budgets.

## Verification

- `TCO_V108_CORESPIRIT_VELA_BOUNDARY_OK` passes.
- Focused TypeScript validation reaches the Vela adapter cleanly; the validation harness supplied declarations for optional Vela UI packages that are absent from the uploaded archive's installed dependency environment.
- Full application build is **not claimed** because dependency installation in the isolated archive environment timed out.
- Browser/live-deployment smoke verification remains pending.

---
