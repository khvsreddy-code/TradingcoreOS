# TradingCoreOS v0.0.20 — History Request-Limit Hardening

## Problem

The live chart could render empty with `request limit reached` when FYERS REST traffic from chart history, portfolio polling, quotes, options, or order/account activity competed for the same broker quota.

## Fix

- Route all ordinary FYERS REST adapter calls through the shared per-token `BrokerRequestGate`.
- Keep FYERS historical requests on the same broker-wide gate.
- Apply a broker-wide cooldown after a detected 429 / rate-limit response so the next queued request does not immediately repeat the failure.
- Correct FYERS history handling so a broker payload carrying code `429` is returned to the browser as HTTP `429` instead of being accidentally treated as a successful `200` status.
- Add one delayed browser-side retry for transient history rate limits; do not run an immediate retry storm.
- Preserve a recent successful history snapshot as a short stale fallback if a later history refresh is rate-limited.
- Remove `crosshairVisible` from the chart lifecycle effect dependency list so toggling crosshair no longer destroys/recreates the chart and requests historical candles again.

## Scope

No chart architecture, broker routing model, indicator architecture, or progressive 10k + 5k + 30k history policy was changed.
