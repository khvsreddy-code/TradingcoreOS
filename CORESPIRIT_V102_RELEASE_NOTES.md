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

