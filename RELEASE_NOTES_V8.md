# TradingCoreOS v8 — Live Workspace / Market Data Fix

## Fixed
- Upstox historical candles now use the current V3 endpoint and V3 interval model (`minutes/5`, `hours/1`, `days/1`) instead of the deprecated V2-style `5minute` path.
- 1H chart bucketing no longer produces `NaN` timestamps.
- VWAP is now a real cumulative session VWAP line derived from broker OHLCV candles, not a static demo line.
- VWAP recalculates when live ticks update the active candle.
- Support/resistance, ATR, previous high/low and bias recalculate as live candles change.
- Levels/VWAP/Volume buttons now immediately apply their visibility changes.
- Chart now has a more TradingView-like crosshair, watermark, spacing and volume pane behavior.
- Watchlist and chart feed badges no longer claim LIVE when the stream is not actually connected.

## API note
Upstox's current documentation exposes Historical Candle V3 at `/v3/historical-candle/:instrument_key/:unit/:interval/:to_date/:from_date`, with minute/hour/day units. Market Feed V3 uses a WebSocket feed and protobuf payloads.
