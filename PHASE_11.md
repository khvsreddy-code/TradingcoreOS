# Phase 11 — Market Data Infrastructure (V30)

Implemented as a persistent backend layer; no Streamlit dependency and no frontend rewrite.

## Included
- Broker-neutral normalized tick envelope
- Persistent WebSocket market fan-out (`/ws/market/{client_id}`)
- Dynamic subscribe/unsubscribe protocol
- Reference-counted unique instrument subscriptions
- Latest tick registry and stale-feed detection
- Central candle aggregation (1s, 5s, 15s, 1m, 3m, 5m, 15m, 30m, 1h, daily)
- Latency timestamps and ingest/tick-age metrics
- Health/observability endpoint (`/api/market/health`)
- Subscription inspection endpoint
- Adapter ingress endpoint for normalized broker workers
- Dead WebSocket cleanup and subscription cleanup

## Production integration boundary
The hub is ready for Upstox/FYERS websocket workers to call `market_hub.publish()` directly. Each broker session/user must remain isolated unless the broker's API and market-data redistribution terms explicitly permit a shared upstream feed. The hub therefore centralizes processing without assuming redistribution rights.

## Protocol
Client sends `{ "op":"subscribe", "instruments":["KEY"] }` or unsubscribe/ping. Tick messages contain normalized price, timestamps, broker and sequence fields.
