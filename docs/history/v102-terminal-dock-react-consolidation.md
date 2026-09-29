# v102 — First-Class Dock Subsystem + Single React Root

Date: 2026-09-29

## 1. Right dock becomes a subsystem

v101 made the right dock structural. v102 gives it a stronger internal boundary:

```text
RightTerminalDock
 ├─ WatchlistSurface
 ├─ OrderBookSurface
 └─ AlertsSurface
```

The shell owns dock chrome, resize, tab navigation and shared selected-symbol context. Each surface owns only the state and side effects needed for that surface.

Only the active surface is mounted. This keeps inactive dock panels out of the render/fetch path and avoids turning the right dock into a second market-data engine.

`WatchlistDock` is now only a compatibility adapter. The canonical workspace import is `RightTerminalDock`.

## 2. Dock interaction model

- `Alt+1`, `Alt+2`, `Alt+3` select a dock panel.
- `Alt+0` collapses/expands the dock.
- Arrow/Home/End keys navigate the tablist.
- Pointer drag changes the workspace-owned dock width.
- The active tab owns a single tabpanel relationship with explicit ARIA linkage.

## 3. Single React root

The browser entrypoint is now strictly:

```text
index.html → main.tsx → App → route → LiveTradingTerminal → LiveTradingWorkspace
```

No second root, body-mounted terminal host, DOM hiding class, MutationObserver order-ticket injector, or HTML-loaded terminal hotfix remains.

The only `createRoot(...)` in application source is the root in `src/main.tsx`.

## 4. Retired bootstrap bridges

Terminal behavior that had been implemented through global scripts is retired. Existing native services remain the owners of instrument search and option-chain caching, while the terminal's React components own terminal presentation and interaction.

## Non-interference

The release does not alter the market-data transport, historical candle pipeline, chart data-plane contract, CoreSpirit compiler/runtime, or broker execution semantics.

## 5. Input and resize discipline

The dock resize path is coalesced with `requestAnimationFrame` so pointer movement cannot force an unbounded sequence of React state updates. Terminal Alt-key shortcuts yield to focused input/select/textarea/contenteditable elements. This keeps the dock's global command surface from interfering with text-entry controls.

