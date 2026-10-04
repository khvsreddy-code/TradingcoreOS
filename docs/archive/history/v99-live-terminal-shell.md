# v99 — Live Terminal Shell Consolidation

Date: 2026-09-28

## Goal

Move `/live` toward a chart-first terminal layout inspired by professional trading terminals without changing market-data or CoreSpirit architecture.

## Architecture changes

The canonical live host now mounts `LiveTradingWorkspace` directly. The workspace owns the terminal command bar, chart work area, right information dock, and bottom operational dock. The separate `TradingCoreProWorkspace` source was removed because it had no live-route ownership.

## UI model

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ TCO | Instrument | Route | Chart | Indicators | Draw | Compare | Alerts │
│     Timeframes | Replay | Settings                                      │
├───────────────────────────────────────────────────────┬──────────────────┤
│                                                       │ WATCHLIST        │
│                                                       │ ORDER BOOK       │
│                         CHART                         │ ALERTS           │
│                                                       │                  │
├───────────────────────────────────────────────────────┴──────────────────┤
│ Positions | Orders | Trades | Activity | Strategy Log | Order Ticket    │
└──────────────────────────────────────────────────────────────────────────┘
```

## Preserved contracts

- Live chart data remains in the existing market-data/runtime path.
- Chart interaction remains chart-scoped through existing window/controller events.
- CoreSpirit remains a separate language/runtime surface.
- Existing workspace layout persistence remains compatible with older snapshots.

## Validation

`TRADINGCORE_V99_TERMINAL_SHELL_CONTRACT_OK` plus the existing architecture, route, hardening, CoreSpirit, and indicator community contract tests.
