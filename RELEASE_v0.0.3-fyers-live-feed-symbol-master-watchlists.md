# TradingCoreOS v0.0.3 — FYERS Live Feed + Full Instrument Search + Multi-Watchlists

## Fixed
- Prevented the workspace from emitting the false `Connect a broker before starting live market data.` message during the asynchronous broker-session restore race.
- FYERS market-data subscription now uses the documented `symbolUpdate` subscription payload without the obsolete channel/action fields.
- FYERS unsubscribe uses the documented `type: unsubscribe` payload.
- Live feed state clears stale connection errors once the stream reconnects or a tick arrives.

## Instrument search
- Added authenticated FYERS symbol-master search backed by the official public symbol master files.
- Searches NSE/BSE cash equities, NSE/BSE derivatives, MCX commodities, and NSE currency instruments.
- Search results include the actual FYERS symbol, description, exchange, expiry, strike, option type, and lot size where available.
- Search is no longer limited to a hard-coded list of a few stocks.

## Watchlists
- Added multiple persistent watchlists per broker.
- Create, rename, switch, delete, add, and remove symbols.
- Watchlists are persisted in browser storage and isolated by broker.
- Search results can be added directly to the active watchlist.

## UI
- Existing TradingCoreOS visual design/layout is preserved; only the existing search/watchlist controls were expanded.

## Validation
- TypeScript/TSX syntax transpilation checks passed for all changed source files.
- Full dependency build was not run because the extracted release environment has no installed `node_modules` and dependency installation is unavailable in this runtime.
