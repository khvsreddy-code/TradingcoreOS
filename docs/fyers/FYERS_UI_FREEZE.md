# FYERS UI Freeze

The TradingCoreOS UI is frozen during FYERS backend expansion.

Backend work may add services, routes, schedulers, caches, WebSocket handling and analytics infrastructure.

Do not:
- redesign the terminal
- alter chart styling/layout
- move panels
- change watchlist layout
- change navigation
- replace existing UI components
- change visible labels solely to fit backend architecture

Only change UI when the user explicitly requests a UI change.

The chart is a protected subsystem. Optional FYERS features must fail independently and must not blank or replace an otherwise working chart.
