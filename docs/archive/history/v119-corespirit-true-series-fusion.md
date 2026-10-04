# v119 — CoreSpirit true series-kernel fusion

## Problem

The earlier seriesVector implementation had a fusion plan but executed each operation independently: source -> full array -> full array -> full array. That made the planner's single-pass-streaming label misleading.

## New execution model

A CoreSpiritFusedSeriesCursor now owns one bounded state object per fused operation and processes the entire chain in one chronological traversal: bar i -> stage state update -> scalar output -> next stage -> final output[i].

The only history-sized output allocation is the final Float64Array. If the caller already owns a Float64Array input, the input is borrowed.

## Bounded state

Rolling mean/sum/variance/WMA use fixed-period ring state. Highest/lowest/normalize use monotonic deques. Median uses a bounded ordered window. Persistence uses bounded sign/comparison state. EMA/RMA use scalar recursive state with a deterministic seed.

These workspaces scale with the largest lookback, not the number of historical bars.

## Stateful fusion

EMA and RMA are now explicitly marked fusible even though they are stateful. The planner permits them because their state is local, deterministic and side-effect free. Stateful does not automatically mean effectful.

Effectful, nondeterministic, external/market I/O, visual emission, order authority and multi-consumer branches remain outside fusion.

## VM integration

Historical/replay execution installs the semantic fusion plan. At a group's first instruction, the runtime advances its reusable fusion cursor and writes all stage registers for the current bar. Subsequent fused call instructions become register no-ops because their values have already been computed by the same cursor.

Realtime execution intentionally remains on the established rollback-safe state path until fused cursor checkpoint/rollback is formalized.

## Verification

The v119 test suite includes independent numerical comparison against sequential reference evaluation and a static architecture contract that rejects the previous full-series executeOne loop.

## Next

The next performance boundary is direct canonical typed-series ingress into the CoreSpirit runtime, followed by dirty-span propagation into renderer-neutral RenderPacket output and realtime fusion cursor checkpointing.
