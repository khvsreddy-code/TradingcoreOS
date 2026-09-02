# TradingCoreOS V21 — Phase 2: Broker + Market Data Architecture

## What changed

TradingCore now has a broker-neutral layer:

- `broker_core.py` — normalized Tick/ConnectionHealth primitives and MarketDataHub.
- `upstox_adapter.py` — Upstox V3 WebSocket adapter.
- `fyers_adapter.py` — FYERS API V3 data WebSocket adapter.
- `broker_registry.py` — process-local connection reuse keyed by broker/account/token digest.

The existing live Upstox chart path remains intact; this layer is the migration path
for replacing broker-specific UI calls with one normalized market-data pipeline.

## Design

```text
Upstox V3 WebSocket ─┐
                     ├─ Broker Adapter ──> normalized Tick ──> MarketDataHub
FYERS V3 WebSocket ──┘                                      ├─ chart
                                                            ├─ OI engine
                                                            ├─ indicators
                                                            ├─ alerts
                                                            └─ automation
```

A slow UI consumer cannot block the broker callback. Connections are reused for the
same authenticated account, reducing duplicate WebSocket sessions and API traffic.

## Current broker facts

Upstox V3 Market Data Feed supports LTPC/full modes and WebSocket subscriptions.
FYERS API V3 supports `SymbolUpdate` and `DepthUpdate` data sockets. The FYERS adapter
uses the official `fyers-apiv3` package when installed.

## Important production note

This phase does **not** claim sub-broker latency. It removes avoidable TradingCore
work and duplicate connections. Exchange → broker network latency remains outside
our control.

For FYERS live order placement after April 1, 2026, production deployment must also
comply with FYERS/SEBI requirements such as the registered static IP and daily 2FA.
