# v121 — deeper CoreSpirit fusion, faster Fyers pages, and corrected motion

## CoreSpirit

The fused cursor remains one chronological traversal for compatible linear series chains. Realtime rollback now uses reusable bounded checkpoints: clone once, then copy state in place. This removes repeated per-tick allocation of fused state objects while preserving deterministic forming-bar rollback semantics.

The historical path still produces one public Float64Array. Realtime consumers can use the scalar incremental output seam without creating a history-sized result buffer.

## Fyers

Initial and older-history pages remain exactly 5,000 candles. The server now computes a resolution-aware calendar lookback around that page instead of downloading a much larger fixed window and trimming it. The broker remains outside the chart render loop, and in-memory request caching plus inflight dedupe remain the fast path.

## Motion and visual system

TradingCoreOS keeps the graphite-black plus indigo-violet visual language. The fast rendering mode no longer forces 90ms UI transitions; it uses slower premium motion so toolbar, panel and workspace changes feel deliberate. Three.js is not introduced for ordinary DOM motion: the existing Motion package is the correct UI animation layer, while Vela owns chart animation.
