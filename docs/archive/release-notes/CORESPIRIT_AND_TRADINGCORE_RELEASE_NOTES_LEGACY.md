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
