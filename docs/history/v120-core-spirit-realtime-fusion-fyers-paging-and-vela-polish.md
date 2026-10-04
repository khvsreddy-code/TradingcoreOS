# v120 — CoreSpirit realtime fusion, Fyers 5k demand paging, and Vela visual polish

## CoreSpirit

The semantic graph now distinguishes purity from deterministic stateful execution. EMA/RMA are stateful but deterministic local kernels, so explicit kernel contracts can fuse them. Fused cursors retain bounded state and can be snapshotted/restored around forming-bar revisions.

A chain such as close -> EMA -> change -> normalize executes as one chronological traversal. The only history-sized allocation is the final public output when one is required; stage state is bounded by lookback.

## Fyers history

The first Vela history window is 5,000 candles. When the viewport approaches the left boundary, Vela increases depth by another 5,000 through its existing backfill engine. TCO's shared chart plane caches and deduplicates older-page requests and checks its local history store before calling the broker.

## Vela

Native rendering continues to use typed columns for the base market plane. The workspace theme is custom graphite-black with indigo-violet brand accents, while semantic green/red colors remain reserved for market state. Chart animations are deliberately slower and use Vela's native easing; DOM surfaces continue to use Motion.

## Persistence

The TCO adapter keeps Vela's persistence contract vendor-neutral and maps it to Supabase workspace_layouts, user_preferences, and user_settings with local fallback.
