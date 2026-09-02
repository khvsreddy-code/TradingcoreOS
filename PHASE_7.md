# Phase 7 — Risk Engine

TradingCore V26 adds a broker-neutral, deterministic pre-trade risk gate. It is intentionally separate from the broker adapters so the same limits apply to Upstox, FYERS and future brokers.

## Controls
- Maximum live lots per order
- Maximum live notional
- Maximum daily loss gate
- Maximum open lots / exposure
- Live order rate limit
- Emergency kill switch
- LIVE preflight before the browser submits an order
- Server-side enforcement immediately before broker submission

## Environment variables
- `TRADINGCORE_RISK_MAX_LOTS` (default 5)
- `TRADINGCORE_RISK_MAX_NOTIONAL` (default 250000)
- `TRADINGCORE_RISK_MAX_DAILY_LOSS` (default 10000)
- `TRADINGCORE_RISK_MAX_OPEN_LOTS` (default 10)
- `TRADINGCORE_RISK_MAX_ORDERS_MIN` (default 20)

The kill switch is process-wide in this phase. For production it should be persisted per user/account in the authenticated database and require privileged confirmation to disarm.
