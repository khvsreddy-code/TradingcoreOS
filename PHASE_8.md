# Phase 8 — Portfolio & Account Intelligence

Built on TradingCoreOS V27. No Streamlit runtime is introduced.

## Implemented
- Persistent browser account WebSocket at `/ws/account/{session_id}`.
- Upstox portfolio stream integration for order/position/holding updates.
- Initial REST hydration + recovery snapshot.
- Upstox Funds & Margin V3 endpoint.
- Normalized positions and order blotter.
- Realized/unrealized/net P&L summary.
- Gross exposure and per-position weights.
- Trade history derived from completed orders.
- Broker-supplied Greeks when present; otherwise explicitly shown as unavailable.
- Margin snapshot from broker funds payload.
- Persistent Portfolio page with Positions, Order Blotter, Exposure, Greeks, Trade History and Margin.
- Stream status and last-event tracking.

## Streaming architecture

Browser -> TradingCore WebSocket -> account hub -> broker portfolio stream.

REST is only used for initial hydration and recovery. Upstox's portfolio stream supports order, position and holding updates; funds remain snapshot data and are refreshed through the current Funds V3 endpoint.

## Safety

No broker secrets are placed in browser JavaScript. Live order execution remains behind the existing risk engine and contract validation.
