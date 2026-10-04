# v118 — Fyers 5k history, terminal motion and cloud persistence

## History

The live Vela workspace requests 5,000 candles initially. The older-history page is also 5,000 candles, and the left-edge ranged request hydrates older data before Vela slices the requested range. This prevents repeated reloading of the newest window when users scroll backward.

The Fyers history route caps chart requests at 5,000, adds the 10-minute resolution, and uses timeframe-aware calendar lookback windows. Vela's ranged cache and deep-history chunk sizes are aligned to the 5k page contract.

## Runtime

The previous four typecheck blockers are addressed on the current Vela head: workspace listener cleanup is lexically owned, the TCO Vela adapter uses an inferred Vela legacy-bar type, and the mutable columnar store typing is already present in the retained-scene commit.

## Visual system

TradingCoreOS now uses a near-black graphite visual base with an indigo-violet accent. Vela zoom/pan/scroll/autoscale/live-bar/intro easing is deliberately slower than the former ultra-snappy defaults. Motion remains a DOM/UI concern; Vela chart rendering keeps its native frame scheduler.

## Persistence

Vela's existing VelaStorage abstraction is now backed by the connected Supabase workspace. workspace_layouts stores the Vela workspace document; user_preferences remains the home for defaults; user_settings stores Journal state. Local storage is the offline/auth fallback.

## Next

CoreSpirit series fusion is the next performance boundary: compatible pure nodes will share one chronological traversal and one output path rather than allocating one full Float64Array per operation.
