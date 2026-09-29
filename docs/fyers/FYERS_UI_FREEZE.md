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

## Explicit terminal UI exceptions — v99–v101

The freeze remains the default rule for unrequested UI changes. The terminal changes recorded in v99, v100 and v101 are explicit user-requested exceptions and therefore do not authorize unrelated FYERS UI redesign outside the requested terminal scope.

## v102 UI ownership boundary — 2026-09-29

v102 changes only terminal presentation/lifecycle ownership. FYERS transport, authorization, quote heartbeat, historical data, option-chain and execution contracts remain behind the existing service/runtime boundaries.

The right dock is a UI consumer of normalized runtime state; it is not a FYERS API client. The terminal is mounted through the existing React application root rather than a separate DOM/bootstrap host.

## v104 demand-driven history + multi-chart budget — 2026-09-29

The v103 shared chart data plane is now refined so history initialization, older-page acquisition and compute inputs scale by actual user demand. Initial chart paint is bounded to 300–1,500 candles by timeframe; visible-range movement requests one bounded older page; only the active chart is eligible for a single low-priority warm page. A global `ChartHistoryCoordinator` limits browser history requests to two concurrent operations.

The `HistoryStore` remains reusable retention up to 50,000 candles, but `ChartDataPlane` materializes only its active demanded window. Cached older data is reused through binary-search `getBefore()` before issuing a broker request.

The client/runtime/server history contract now forwards and validates an explicit `limit`, removing the old fixed-size initial request path. The chart compute coordinator also protects pathological deep-history states with a 10,000-candle worker input ceiling while preserving the v103 bounded worker pools and dataset/revision cache identity.

For older-history prepends, logical viewport state is restored with the logical-range API so user navigation does not jump.

**Non-interference:** CoreSpirit language/compiler/IR/VM, execution/risk authority, terminal dock ownership, drawing semantics, and shared realtime symbol-feed ownership remain unchanged.
