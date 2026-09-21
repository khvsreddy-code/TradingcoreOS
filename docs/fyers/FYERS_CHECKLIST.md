# TradingCoreOS — FYERS Implementation Checklist

Last updated: 2026-09-21

Current implementation stage: **v32.7 — FYERS intraday epoch-range candle recovery**

Legend: `[x]` implemented in source, `[~]` implemented but runtime verification pending, `[ ]` not implemented.

## Chart-safe market foundation
- [x] Shared authenticated FYERS REST client
- [x] Per-user REST request gate
- [x] Supabase-backed per-user broker sessions
- [x] User-scoped history cache/in-flight keys
- [x] 429 / Retry-After handling
- [x] 5xx retry/backoff
- [x] History chunking / normalization / deduplication
- [x] Dedicated authoritative FYERS symbol-master service (all 7 documented masters)
- [x] Backend symbol-master search route
- [x] Quotes REST endpoint
- [x] 5-level Depth REST endpoint
- [x] Option Chain v3 raw-preserving endpoint
- [x] Market Status endpoint
- [~] Data WebSocket SymbolUpdate
- [~] Data WebSocket DepthUpdate
- [x] Data WebSocket no longer falls back to quote polling
- [x] Data WebSocket heartbeat + reconnect handling
- [x] **History route does not acquire the FYERS gate before FyersApiClient**
- [x] **Nested FYERS history gate deadlock removed from production main**
- [ ] Production candle regression verified after deployment

## Derivatives data
- [x] Futures Chain REST service/route
- [x] Expired F&O expiry-date service/route
- [x] Expired F&O underlying-contract service/route
- [x] Expired F&O historical-data service/route
- [ ] Expired-F&O chart integration
- [ ] Futures analytics

## Realtime account/trading
- [~] FYERS Order WebSocket transport
- [ ] Order-stream runtime smoke test with connected FYERS account
- [x] Funds service extraction
- [x] Profile service extraction
- [x] Holdings service extraction
- [x] Orders read service extraction
- [x] Trades read service extraction
- [x] Positions read service extraction
- [x] Margin preflight endpoint
- [ ] Live order placement
- [ ] Multi-order service
- [ ] Multi-leg order service
- [ ] GTT/OCO service
- [ ] Smart Order service
- [ ] Smart Exit / TP-SL service
- [ ] Reports service
- [ ] EDIS service

## Analytics / intelligence
- [ ] Option expiry resolver
- [ ] PCR analytics
- [ ] OI / ΔOI analytics
- [ ] IV analytics
- [ ] Greeks analytics
- [ ] India VIX analytics
- [ ] Futures basis analytics
- [ ] Screeners service
- [ ] Price alerts service

## Advanced realtime
- [ ] TBT 50-level isolated service
- [ ] TBT protobuf snapshot/diff state engine
- [ ] Unified market-data event bus
- [ ] Chart/live-candle verification after bus integration

## Release verification
- [ ] Complete dependency install
- [ ] `tsc --noEmit` passes
- [ ] Production build passes
- [ ] FYERS authenticated market-stream smoke test
- [ ] FYERS authenticated order-stream smoke test
- [ ] Candle regression test: selected symbol displays candles
- [ ] Candle regression test: watchlist symbols do not blank
- [ ] Option-chain regression test
- [ ] No UI diff / UI freeze maintained

## v32.5 incident record
- Production deployment commit `529d21be295061f093409dac6a40c4d716e393b8` still wrapped the history route in `withBrokerRequestGate`.
- `FyersApiClient.dataGet()` also acquires that same FYERS gate.
- This creates a self-deadlock for the history request.
- Fix committed to `main` as `111085cb6d399c0242c8a96797f0c95b9dbcc561`.
- Runtime verification is intentionally still pending until the new deployment serves candles.

- [x] Initial history target bounded to one FYERS minute-history window per timeframe
- [~] Structured history failure logging added; runtime cause verification pending


## v32.7 evidence
- [x] Production runtime log captured: history request reaches FYERS and returns 0 candles rather than deadlocking.
- [x] Intraday FYERS history switched to epoch-second range parameters.
- [x] Intraday history window reduced to 99 calendar days to stay below the broker cap.
- [~] Production candle regression verified after v32.7 deployment


## v32.8 — history response/range correction
- [x] Deep code audit traced blank candles to FYERS History returning zero rows before chart paint.
- [x] Removed intraday epoch-range dependency for backfill; use completed trading-day yyyy-mm-dd ranges.
- [x] Added broker response telemetry: status/code/message/candleCount/nextTime (no token data).
- [~] Production verification pending.

## v32.9 — successful partial-history termination
- [x] Production evidence confirms FYERS is returning thousands of valid 5m candles (candleCount 4,800–5,250+ per window).
- [x] Identified the actual 502 trigger: the backfill continued until FYERS reached pre-availability ranges and returned s=no_data; the route then treated the overall history load as failure instead of returning already accumulated candles.
- [x] Changed no_data handling to stop backfill and preserve accumulated candles.
- [~] Production verification after v32.9 deployment pending.
