# TradingCoreOS — FYERS API v3 Architecture Audit

Date: 2026-09-21
Base: TradingCoreOS v31 uploaded by the user

## Immediate candle regression fixed

The FYERS history route contained a runtime bug:

```ts
data = await fetchFyersHistoryTarget(...)
```

inside a module without a declared `data` variable. That can throw a `ReferenceError` before the route returns the fetched candles. It is now:

```ts
const data = await fetchFyersHistoryTarget(...)
```

The route also listened to `req.close` and could abort a valid history request while the response was still being produced. It now uses the request `aborted` event and response `close` event.

## FYERS history rules enforced

- Minute resolutions: maximum 100 calendar days per request.
- Day/week/month: maximum 366 calendar days per request.
- Seconds: only the recent 30 trading days and are not exposed by the current chart UI.
- `cont_flag=1` is not sent for normal equities, indexes, or ordinary option/futures contracts. It is reserved for a future explicit continuous-futures path.
- History requests use one canonical `date_format=1` path instead of retrying the same page with a second date format.
- Older chart data is fetched progressively through the existing `before` route.
- Candle boundaries are deduplicated by timestamp.

## Rate-limit architecture

TradingCore keeps a per-authenticated-token broker gate. FYERS is documented at 10 requests/second and 200 requests/minute for the applicable API tier. TradingCore deliberately runs below the hard ceiling at approximately 190 requests/minute with a 300 ms spacing floor. A 429 response extends the token queue backoff.

The next architectural step should be a distributed scheduler if production deployment uses multiple server instances. An in-memory limiter is only authoritative inside one process.

## FYERS data architecture

Use REST for:

- historical candles
- initial/snapshot quotes
- market depth snapshots
- option-chain snapshots
- futures-chain snapshots
- market-status snapshots
- expired F&O discovery/history
- portfolio/account reconciliation

Use WebSocket for:

- live SymbolUpdate
- live 5-level DepthUpdate
- live order/trade/position events

Use TBT only when TradingCore explicitly needs 50-level NSE/NFO order-book data. It has separate connection/symbol limits and a different binary protocol.

## Current FYERS API surface to integrate safely

### Market data

- `/data/history`
- `/data/quotes` (maximum 50 symbols/request)
- `/data/depth`
- `/data/options-chain-v3`
- `/data/marketStatus`
- `/data/futures-chain`
- expired F&O: expiry dates, underlying contracts, historical data

### Trading/account

- profile, funds, holdings
- orders, trades, positions
- sync/multi-order/multileg order operations
- GTT
- smart orders
- margin checks
- reports: order history, trade history, charges, realised P&L, tax P&L, ledger
- price alerts

### Realtime

- market-data WebSocket: SymbolUpdate / DepthUpdate
- order WebSocket: orders / trades / positions
- TBT 50-level depth when specifically required

## Important implementation rules

1. Never use `/quotes` as the normal live-feed loop when a WebSocket is available.
2. Chunk quote requests to <=50 symbols.
3. Never retry invalid-symbol or invalid-parameter errors. Resolve symbols through the daily FYERS symbol masters.
4. Treat HTTP 401 and FYERS auth errors as re-authentication events, not retryable errors.
5. On HTTP 429, honor `Retry-After` / `X-Retry-After-Ms` and back off the whole token queue.
6. Keep order traffic on a higher-priority queue than chart backfill.
7. Keep broker tokens server-side and encrypted.
8. Do not add a generic arbitrary FYERS proxy route; endpoint allowlists and typed adapters prevent accidental exposure of trading operations.
9. Use order WebSocket events for live order state and REST only for reconciliation.
10. Keep the chart history engine independent of the live-feed transport so a WebSocket problem cannot erase historical candles.

## Validation status for this archive

- Changed FYERS history route: TypeScript syntax/transpile validation passed.
- Changed FYERS adapter: TypeScript syntax/transpile validation passed.
- Changed broker request gate: TypeScript syntax/transpile validation passed.
- Full `tsc --noEmit`: not executed successfully because the uploaded archive has no installed dependencies (`vite/client` types are absent). An attempted dependency install timed out in the execution environment.
- No authenticated FYERS account was available for a live API call, so broker response validation is limited to current FYERS documentation and source-level validation.

## Persistent engineering context files

The following files are now part of the project and must be maintained with future FYERS work:

- `docs/fyers/FYERS_API_COVERAGE.md` — capability matrix and FYERS rules.
- `docs/fyers/TRADINGCOREOS_FYERS_STATE.md` — current implemented/pending state and phase plan.
- `docs/fyers/FYERS_IMPLEMENTATION_LOG.md` — cumulative implementation history.
- `docs/fyers/FYERS_UI_FREEZE.md` — explicit UI preservation contract.

These files are engineering context, not claims that every listed capability is already implemented.
