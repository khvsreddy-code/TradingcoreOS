# Live price / forming-candle hard fix

- Removed client-side dropping of FYERS ticks based on broker last-trade timestamp ordering.
- A fresh live packet is now considered fresh by arrival order; stale exchange timestamps no longer freeze the UI.
- Realtime candle reconciliation pins an older broker timestamp to the current forming candle instead of rejecting the price.
- Added a hard LTP update path in `LiveChart`: every valid incoming LTP immediately updates the current candle's high/low/close even when timestamp reconciliation cannot advance the candle.
- REST quote fallback now wakes at 650ms staleness and retries every 350ms while the WebSocket feed is stale.
- Analytics publish on a live tick is immediate instead of waiting for the 200ms debounce.
