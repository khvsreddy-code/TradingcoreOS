# CoreSpirit v27 — Coder + Data Planner Contract

## Coder
The language service is separated from the UI. `CoreSpiritEditorModel` owns source/version state and exposes diagnostics, completions, semantic tokens, symbols, formatting and cached compilation. UI adapters must not duplicate compiler semantics.

## Data planner
`planCoreSpiritDataRequests()` deduplicates requests by symbol/timeframe/field/offset. `resolveCoreSpiritDataPlan()` prefers host batching and falls back to individual requests. The VM remains network-free.

## Non-repainting direction
Every future timeframe resolver must carry data status (`confirmed`, `developing`, `historical`, `realtime`) and an explicit alignment policy. The planner must never silently mix developing HTF values with confirmed historical values.

## Footprint direction
Footprint remains a provider-neutral contract. Authoritative exchange/feed data should be marked as such; tick-inferred buy/sell classification must be marked inferred. Future scene rendering should virtualize rows and only paint visible price levels.
