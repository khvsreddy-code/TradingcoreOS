# TradingCoreOS v0.0.5 — Upstox depth + instrument search + indicator parity

## Upstox market data
- Keeps Upstox Market Data Feed V3 as the live source.
- Uses the authenticated Upstox V3 market stream with `full` mode, which includes LTPC, 5-level market depth, OHLC metadata and option Greeks where available.
- Adds a transport-level `full_d30` capability for Upstox Plus accounts without changing the existing UI/default behavior. The current workspace remains on the standard 5-level feed.
- Keeps broker credentials server-side; the browser receives normalized NDJSON events only.
- Reconnects continue to re-authorize the V3 feed endpoint.

## Upstox instrument search
- Adds broker-aware instrument search for Upstox.
- Uses the authenticated Upstox Instrument Search API rather than a small hard-coded symbol list.
- Supports the existing UI filters: all, stocks, futures, options, commodities and currency.
- Returns actual Upstox `instrument_key` values plus trading symbol, exchange, expiry, strike, option type and lot size where available.
- Existing watchlist/search UI design is preserved.

## Indicator parity
- The chart indicator settings remain broker-independent, so the TradingView-style settings from v0.0.4 now apply identically when Upstox is the primary broker.
- Source selection includes Open, High, Low, Close, HL2, HLC3, OHLC4 and HLCC4 where the indicator supports a price source.
- Users can change color, line width, line style and applicable periods/multipliers/fast-slow-signal settings.
- VWAP source selection is preserved, including OHLC4/HLC3/etc., and the calculation uses the selected source.
- Indicator configuration remains persisted in workspace storage and is rendered by the same native indicator engine regardless of broker.

## Validation
- TypeScript transpilation checks passed for all modified TS/TSX files.
- A dependency-backed Vite build was not run because this working archive does not include installed `node_modules`.
