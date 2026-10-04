# v117 — Vela incremental retained scene + columnar render

## 1. Canonical data path

TCO history and realtime data remain in canonical typed columns until an explicit compatibility boundary. The native Vela renderer owns its mutable columnar candle capacity store; the worker transport is not HistoricalCandle[] based.

## 2. Vela native ownership

Vela now consumes setBarsColumns/updateBarColumns for native candle data, and its coordinate-system time index is a typed Float64Array with append growth. The compatibility OHLCV mirror remains only for older scripting/data-window/drawing surfaces.

## 3. True incremental retained-scene updates

Series patches have explicit append, replace-last, prepend, replace-range and replace operations. Tick/bar engine runs compare against the previous mounted model and emit only tail deltas when the series identity and timestamps prove the update is incremental. Full replacement remains reserved for history, structural, market/timeframe and unproven recompute paths.

Style/display state uses a separate patch channel. Markers diff by changed range. Fill anchors use the same tail operations; explicit fill-option changes can replace only the fill value state without rebuilding the associated indicator point series.

This prevents the old tick -> rebuild 20k points -> setData path.

## Supabase/Fyers boundary

Supabase remains persistence/session infrastructure and must not sit inside the per-tick render loop. Broker connections/sessions and workspace persistence are database concerns; live market ticks stay in the browser/runtime. Realtime Broadcast is the appropriate future primitive for low-latency collaborative workspace events, rather than Presence as a per-tick transport.

## Next

Remove the remaining worker-side HistoricalCandle[] materialization from CoreSpirit/native indicator computation, then benchmark simultaneous 1/4/8-chart, multi-pane, multi-indicator, fill, marker and drawing workloads.

### v117 deep patch ABI + verification

The retained-scene contract is now explicit: `append`, `replace-last`, `prepend`, and `replace-range` mutate only affected data; `seriesStyles` handles appearance without touching values; marker updates diff their changed interval; fill updates use a separate value/style channel. The engine only selects a tail delta when the previous/current series identity and timestamp continuity prove the live operation; otherwise it falls back to a full replacement.

The full Vela source audit also confirmed that candle rendering is the correct place to keep the columnar representation: the renderer may keep an internal `OHLCV[]` compatibility mirror for legacy scripting/data-window paths, but that mirror is not the render transport. Supabase broker/session/workspace persistence remains outside this hot path; the database advisor currently reports RLS-policy evaluation and duplicate-policy/index cleanup opportunities, which are separate persistence optimizations.
