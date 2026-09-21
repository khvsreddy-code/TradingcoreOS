# TradingCoreOS — FYERS Implementation Checklist

Last updated: 2026-09-21

Legend: `[x]` implemented in source, `[~]` implemented but runtime verification pending, `[ ]` not implemented.

## Chart-safe market foundation
- [x] Shared authenticated FYERS REST client
- [x] Per-user REST request gate
- [x] 429 / Retry-After handling
- [x] 5xx retry/backoff
- [x] History chunking / normalization / deduplication
- [x] Daily symbol-master cache/search
- [x] Quotes REST endpoint
- [x] 5-level Depth REST endpoint
- [x] Option Chain v3 raw-preserving endpoint
- [x] Market Status endpoint
- [~] Data WebSocket SymbolUpdate
- [~] Data WebSocket DepthUpdate
- [x] Data WebSocket no longer falls back to quote polling
- [x] Data WebSocket heartbeat + reconnect handling

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
- [ ] Funds service extraction
- [ ] Holdings service extraction
- [ ] Positions service extraction
- [ ] Orders service extraction
- [ ] Margin preflight service
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
