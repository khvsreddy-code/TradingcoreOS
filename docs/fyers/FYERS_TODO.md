# TradingCoreOS — FYERS TODO / Execution Queue

Last updated: 2026-09-21

## Current stage — v32.3 realtime + derivatives backend

### P0 — protect the chart
1. Keep historical route precedence unchanged.
2. Keep chart data contract unchanged.
3. Do not introduce UI changes.
4. Verify market-stream behavior with a real FYERS session before touching chart consumers.

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
5. Add typed normalization only after observing live payloads; preserve raw payload first.

### P3 — analytics
1. Build expiry resolver from FYERS expiryData.
2. Build PCR/OI/ΔOI calculations from preserved option-chain data.
3. Build IV/Greeks aggregation.
4. Build futures basis analytics.

### P4 — account/trading
1. Extract FYERS funds/holdings/positions/orders into shared client services.
2. Add margin preflight.
3. Add multi-order / multi-leg.
4. Add GTT/OCO.
5. Add Smart Orders / Smart Exit / TP-SL.
6. Add reports.
7. Add EDIS only where required and supported.

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
