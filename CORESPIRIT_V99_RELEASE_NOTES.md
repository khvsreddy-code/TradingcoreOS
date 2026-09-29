# TradingCoreOS v99 — Terminal Shell Consolidation

Date: 2026-09-28

## Scope

v99 is a TradingCoreOS host/workspace UI release. It does **not** advance CoreSpirit beyond v98 and does not change the CoreSpirit language, compiler, stable IR, VM, 130-stage roadmap, or v98 user-indicator authoring/publication execution boundary.

## Live terminal

- `/live` now has one canonical terminal owner: `LiveTradingTerminal` → `LiveTradingWorkspace`.
- The center is chart-first; the chart work area is the primary product surface.
- The right dock consolidates Watchlist, Order Book, and Alerts, and supports resize/collapse.
- The bottom dock consolidates Positions, Orders, Trades, Activity, Strategy Log, and the inline Order Ticket.
- Compare, Replay, Settings, Indicators, Draw, Alerts, and chart controls remain available through the terminal command surface.
- Older workspace snapshots continue to restore through backward-compatible mapping of the former `panel` state.
- The unused duplicate `TradingCoreProWorkspace` file was removed.

## Non-interference

No market-data subscription architecture, history pagination, quote fallback, chart data plane, or CoreSpirit execution path was changed as part of v99.

## Verification

- `TRADINGCORE_V99_TERMINAL_SHELL_CONTRACT_OK`
- Existing architecture/route/hardening/CoreSpirit/indicator community contracts: PASS
- TSX parser validation: PASS for modified source files
- Full dependency-backed typecheck/build: pending in the supplied archive because npm dependencies were not available and registry installation timed out


## v100 terminal visual-density pass — 2026-09-29

The `/live` shell now uses a flatter terminal visual language. This is a presentation-only refinement layered on top of the v99 composition boundary. The landing page and premium marketing surfaces retain their existing visual treatment.

- Chart infrastructure uses squared or nearly squared geometry (0–2px radius).
- Terminal controls use 0–4px radius; popovers use up to 6px.
- Decorative shadows are removed from chart, dock, toolbar and bottom-terminal infrastructure.
- Separators are thin and information density is increased through spacing and typography rather than cards.
- The terminal uses blue as the structural accent; market semantics such as positive/negative values remain distinguishable.
- Existing chart/feed/CoreSpirit/runtime contracts are unchanged.
