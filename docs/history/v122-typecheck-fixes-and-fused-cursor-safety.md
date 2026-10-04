# v122 — typecheck repair, fused cursor safety, and chart hot-path polish

## CoreSpirit

The existing true-fusion design is preserved: a compatible chain such as close → EMA → change → normalize is evaluated in one chronological traversal. EMA/RMA and rolling kernels retain bounded state; no full intermediate history arrays are allocated between stages.

The realtime rollback path now copies each fused stage's bounded state through FusedSeriesStage.copyFrom. This makes a forming-bar revision deterministic without replaying 20k bars or materializing intermediate arrays.

## Vela incremental rendering

The retained patch architecture remains the live rule: history replacement is exceptional; append/replace-last tail changes stay scalar/tiny; style state changes do not rebuild data; heterogeneous overlay collections cross the patch boundary as renderer-neutral values.

The Vela engine's older-history trigger is explicit: initial hot history 5,000 bars, left-edge lead 200 bars, hard retained cap 50,000 bars, older page size 5,000.

## Fyers

The existing Fyers route already caps history requests at 5,000, caches identical requests briefly, deduplicates in-flight requests, and uses the shared chart history coordinator/store. Older pages are requested by exact before boundary rather than repeatedly requesting the latest page.

## Supabase

Supabase remains the persistence plane for workspace layouts, user preferences, Journal and CoreSpirit artifacts. It is deliberately not placed between Fyers and the chart's hot candle path because database round trips would make first paint slower than the broker/cache path.

## UI

The application uses near-black graphite surfaces and indigo-violet branding. The remaining drawing-toolbar blue token was removed in this pass so the workspace does not regress to mixed blue/purple accents.
