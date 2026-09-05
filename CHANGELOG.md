# Changelog

## v1.4.0 — Global Instrument Workspace

- Added searchable instrument suggestions for indices, stocks, commodities, futures, options and currency products.
- Added exchange + instrument type context beside the chart and search results.
- Expanded the workspace universe beyond NIFTY and BANK NIFTY while preserving the existing UI layout.
- Hardened broker-session restoration so a transient empty session lookup does not falsely clear a connected FYERS or Upstox account.
- Preserved the existing 25,000-candle history request target and live-chart flow.

TradingCoreOS Changelog

## v1.3.0 — Account Selection & Persistence

### Broker routing
- Keeps the existing Broker Runtime Settings UI and its `PRIMARY` / `Set Primary` workflow.
- Switching the active broker now triggers a reactive workspace rebind without requiring a page refresh.
- The live market-data subscription is recreated when the active broker changes.
- The workspace header, portfolio synchronization path and active-route state refresh against the selected broker.

### Persistence
- Preserves the existing local broker-session cache and preferred primary broker across browser refreshes while server-side session restoration runs.
- Retains the selected primary broker when multiple verified broker sessions are restored.

### Previous fixes retained from the base build
- FYERS OAuth/session persistence improvements.
- Broker-aware live market-data routing.
- Historical-data requests targeting up to 25,000 candles where the broker/API permits it.
- Instrument search/suggestions and commodity watchlist entries.
- Option-chain workspace section with a return-to-chart action.
- Workspace-module preloading to reduce navigation delays.

### Notes
Broker APIs remain the source of truth for authentication and historical-data availability. A local browser cache can preserve UI state during restoration, but it cannot extend an expired broker session or bypass broker/API candle limits.
