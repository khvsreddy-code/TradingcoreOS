# TradingCoreOS — FYERS TODO / Execution Queue

Last updated: 2026-09-21

## Current stage — v32.5 multi-user chart recovery

### P0 — restore and verify candles
1. **DONE:** Confirm actual production source from the deployed GitHub commit, not only local/archive context.
2. **DONE:** Confirm Supabase-backed broker session lookup is keyed by authenticated TradingCore user.
3. **DONE:** Confirm history cache/in-flight keys include the authenticated user ID.
4. **DONE:** Remove the outer `withBrokerRequestGate` from the FYERS history route.
5. **DONE:** Keep `FyersApiClient` as the single owner of the FYERS REST gate.
6. **NEXT:** Deploy the fix and verify NIFTY 50 candles.
7. **NEXT:** Verify BANK NIFTY candles.
8. **NEXT:** Verify 1m/3m/5m/15m/30m/1H/1D switching.
9. **NEXT:** Verify live candle updates continue after historical candles render.
10. **NEXT:** Verify left-scroll older-history pagination.
11. Do not add new FYERS feature work until the candle regression is cleared.

### Multi-user safety
1. Broker sessions must always resolve from `broker_sessions.user_id = req.tradingCoreUserId`.
2. Never use a global FYERS access token for chart/history/account requests.
3. History cache and in-flight request keys must include user ID.
4. Broker request scheduling must not allow one user's token/session state to be reused by another user.
5. Keep Supabase as the production broker-session source of truth.
6. Runtime tests must cover two authenticated users using different FYERS sessions.

### P1 — realtime
1. Runtime-smoke-test SymbolUpdate.
2. Runtime-smoke-test DepthUpdate.
3. Runtime-smoke-test Order WebSocket.
4. Reconcile order/trade/position events against REST snapshots.
5. Do not treat a socket event as the permanent source of truth without reconciliation.

### P2 — derivatives
1. Verify Futures Chain against a live index/underlying.
2. Verify expired-F&O expiry dates.
3. Verify expired-F&O contract lookup.
4. Verify expired-F&O historical candles with OI/Greeks.
5. Preserve raw payload first; add typed normalization after observing live payloads.

### P3 — analytics
1. Build expiry resolver from FYERS expiryData.
2. Build PCR/OI/ΔOI calculations.
3. Build IV/Greeks aggregation.
4. Build futures basis analytics.

### P4 — account/trading
1. Runtime-smoke-test profile/funds/holdings/positions/orders/trades.
2. Runtime-smoke-test margin preflight.
3. Add strict symbol/lot/tick preflight before any future live order path.
4. Add multi-order / multi-leg.
5. Add GTT/OCO.
6. Add Smart Orders / Smart Exit / TP-SL.
7. Add reports.
8. Add EDIS only where required and supported.

### P5 — advanced
1. Isolate TBT behind a separate service.
2. Implement protobuf snapshot + diff state correctly.
3. Respect TBT limits: 3 connections/user, 5 symbols/connection.
4. Build unified market-data bus only after chart regression passes.

## Stop conditions
- If candles disappear, stop feature work and restore chart path first.
- If FYERS returns 401/invalid token, do not retry indefinitely; require broker re-authentication.
- If 429 occurs, honor broker retry headers and reduce background work.
- If a new feature requires a UI change, stop and ask the user before changing UI.
- Never mark runtime functionality as verified from source inspection alone.
