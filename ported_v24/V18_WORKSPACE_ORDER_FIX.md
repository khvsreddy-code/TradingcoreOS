# TradingCoreOS V18 — Clean Workspace + Index Options Ticket

## What changed
- Preserves V17 low-latency live-feed architecture (Upstox V3 WebSocket `ltpc` -> server bridge -> browser chart).
- Adds a working vertical workspace navigation: Info, Option Chain, Positions, Orders, Levels, Signals.
- Keeps the chart clean and user-controlled.
- Adds an index-aware Quick Trade panel beside the chart.
- For index watching, the ticket defaults to **+1 ITM CE** and **+1 ITM PE** and lets the user change both strikes independently.
- Adds BUY CE, BUY PE, SELL CE and SELL PE actions.
- Quantity is lot-based and derived from the broker's option contract metadata.
- Adds MARKET/LIMIT, product, expiry and LIVE/PAPER controls.
- LIVE execution requires an explicit confirmation checkbox and is server-side only.
- Uses Upstox **Place Order V3** (`/v3/order/place`) for live orders; the access token is never sent to browser JavaScript.
- Adds compact Positions and Orders panels and V3 Funds/Margin on Info.
- Avoids duplicate chart bootstrap requests by passing the preloaded spot/level state into the live chart.

## Important
Upstox's API versioning is endpoint-specific. This build uses the current V3 order and funds endpoints while retaining the currently documented portfolio/order-history endpoints where applicable.

## Safety
The ticket defaults to PAPER mode. Switching to LIVE and checking the confirmation box is required before a real broker order can be submitted.
