# v101 — Deeper Terminal Hierarchy, Flat Density, First-Class Right Dock

Date: 2026-09-29

## Why this release exists

v99 established the chart-first shell. v100 removed most of the SaaS-style card treatment. v101 completes a deeper structural pass so the terminal behaves as a workstation rather than a dashboard.

## Terminal composition

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ terminal command chrome                                                  │
├───────────────────────────────────────────────────────┬─────────────────┤
│                                                       │ WATCHLIST       │
│                                                       │ ORDER BOOK      │
│                  chart workspace                     │ ALERTS          │
│                                                       │                 │
│                                                       │                 │
├───────────────────────────────────────────────────────┴─────────────────┤
│ POSITIONS | ORDERS | TRADES | ACTIVITY | STRATEGY LOG | ORDER TICKET     │
└─────────────────────────────────────────────────────────────────────────┘
```

The chart remains the primary surface. The right and bottom docks are structural workspace regions.

## 1 — deeper terminal layout rules

- One canonical `/live` owner remains `LiveTradingTerminal → LiveTradingWorkspace`.
- The chart region has no decorative outer card, no floating watchlist, and no workspace-level shadow.
- Multi-chart layouts use 1px separator gaps rather than card borders.
- The drawing rail is integrated into chart infrastructure instead of reading as a floating glass panel.
- Secondary controls remain in terminal chrome or docks; they do not create another workspace layer.
- Responsive behavior may overlay the dock on narrow screens, but desktop composition remains dock-based.

## 2 — deeper flat-density rules

- Chart infrastructure is square/near-square.
- Controls are compact and use minimal rounding.
- Popovers are the only small rounded transient surfaces.
- Terminal infrastructure has no decorative drop shadows.
- Grouping is communicated through separators, typography, section headers and whitespace.
- The terminal uses one structural accent, blue; positive/negative market semantics remain independent.
- Premium glow/card aesthetics remain available to non-terminal marketing/landing surfaces.

## 3 — right dock system

`RightTerminalDock` is a single stateful host with three panel surfaces:

```text
RIGHT_DOCK_TABS
  WATCHLIST    Alt+1
  ORDER BOOK   Alt+2
  ALERTS       Alt+3

Alt+0 → collapse/expand
```

The workspace owns `rightDockOpen`, `rightDockTab`, and `rightDockWidth`. The dock emits width changes to the workspace rather than persisting sizing solely inside the dock component.

Every surface uses the same tab/header/status shell and the same selected-instrument context. Watchlist selection changes the focused chart through existing chart/workspace callbacks. Order Book reads existing normalized Level-2 fields. Alerts remain local-first until a backend alert capability is independently introduced.

## Performance boundary

The visual pass does not add a second market-data subscription per panel. Dense rendering consumes the existing tick map and chart/data-plane outputs. UI persistence is debounced and the existing animation-frame tick coalescing path remains unchanged.
