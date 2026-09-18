# Stage 1 — Chart Lifecycle Hardening

## Scope

This stage hardens the **Core Chart Engine only**. CoreSpirit remains a separate entity and is not imported, coupled, or embedded into the chart lifecycle layer.

## Changes

- Added `src/services/core/chart/chartLifecycle.ts`.
- Added generation-based invalidation for asynchronous chart work.
- Added idempotent chart cleanup handling.
- Added safe chart-operation helper for teardown-sensitive calls.
- Hardened the LiveChart lifecycle around historical loading, worker callbacks, prediction callbacks, and chart teardown.
- Added resize handling so chart instances remain synchronized with their host element.
- Ensured stale work cannot mutate a newly created chart instance after symbol/timeframe changes or unmount.
- Preserved chart failure isolation: optional indicator/analytics/prediction failures do not replace the candle chart with an error state.

## Explicit boundary

```text
Core Chart Engine                 CoreSpirit Engine
       │                                  │
       │                                  │
       └────── shared data/event contracts┘

Stage 1 changes only the left side.
```

## Validation

The new lifecycle utility is TypeScript-checkable in isolation. Full application type-checking still depends on the project's installed frontend dependencies/types.
