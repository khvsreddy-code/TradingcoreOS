# V17 Performance + UI Fixes

## UI reliability
- Fixed composite-indicator removal (Bollinger, VWAP deviation, Donchian, Keltner, High/Low) so toggle-off does not pass boolean marker values to Lightweight Charts.
- Fixed derived price-action level toggles to use stable level IDs.
- Added active-state feedback to level-group buttons.
- Explicitly exposed embedded chart UI actions on `window` for reliable iframe button handling.
- Persisted drawing undo/clear changes correctly.

## Latency/performance
- Removed private Upstox access token from the browser iframe.
- Removed per-tick browser Upstox REST polling; recovery uses Supabase Realtime and only checks the latest row when the stream is stale.
- Replaced one-thread-per-tick Supabase writes with a single bounded background queue/worker.
- Switched the server Upstox V3 live feed from `full` to `ltpc` for the underlying chart path, reducing unnecessary payloads.
- Reduced historical chart payload cap from 50,000 to 20,000 rows.
- Cached session-market metrics and eliminated a duplicate 1-minute candle API request.
- Isolated heavy analytics in a 5-second Streamlit fragment so chart interactions do not rebuild the whole page.
- Reduced high-frequency UI timers to 1 second.
- Cached derived price-action calculations inside the browser session to avoid recomputation when rendering level button state.

## Architecture
- Broker WebSocket remains authoritative for server-side live price ingestion.
- Browser chart remains independent of Streamlit reruns.
- Supabase is a transport/bridge only; it is never allowed to block the broker callback.
- The browser no longer receives the private broker access token.
