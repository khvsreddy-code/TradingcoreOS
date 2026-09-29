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
