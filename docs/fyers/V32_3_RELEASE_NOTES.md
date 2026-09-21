# TradingCoreOS v32.3 — FYERS Realtime + Derivatives Backend Stage

Date: 2026-09-21

## Added
- FYERS Futures Chain backend service and route.
- FYERS Expired F&O expiry-date route.
- FYERS Expired F&O underlying-contract route.
- FYERS Expired F&O historical-data route with optional OI and Greeks.
- Shared FYERS Order WebSocket transport for Orders, Trades and Positions.
- NDJSON order-stream route for backend consumers.

## Realtime hardening
- Removed authenticated `/quotes` polling as the live market-stream fallback.
- Added market WebSocket heartbeat and reconnect handling.
- Preserved the existing market-stream route contract.
- Added OHLC fields from FYERS SymbolUpdate payloads to normalized market ticks.

## UI
- No React/UI files intentionally changed.
- Chart layout and visual contract remain frozen.

## Source verification basis
Official FYERS references reviewed for this stage document:
- Data WebSocket: `wss://api.fyers.in/socket/v2/data/`, SymbolUpdate/DepthUpdate, dynamic subscriptions and 5000-symbol connection limit.
- Order WebSocket: `wss://socket.fyers.in/trade/v3`, Orders/Trades/Positions, 10-second ping guidance.
- Futures Chain: `/data/futures-chain`.
- Expired F&O: `/data/history/fno/expired/expiry-dates`, `/underlying-symbols`, `/historical-data`.

## Verification status
Source-level changes completed. Runtime authentication/smoke testing is still required before marking the WebSocket features fully verified.
