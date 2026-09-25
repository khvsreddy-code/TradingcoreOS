# CoreSpirit v36 — Stable IR + Replay Contract

## IR

The CoreSpirit VM executes stable IR, never AST nodes. IR v1 is a compatibility contract.

Canonical opcodes:

- const
- loadSeries
- move
- unary
- binary
- call
- index
- setLocal
- jumpIfFalse
- jump
- emit

The IR is serializable and validated before it is accepted by the runtime or persisted as an executable artifact.

## Artifact identity

An executable artifact is identified by a deterministic checksum of its canonical IR serialization. This checksum is suitable for cache keys, worker messages, persistence, and replay provenance.

## Replay

Replay consumes only:

1. a validated IR artifact
2. a deterministic OHLCV dataset
3. execution metadata (symbol/timeframe)

Replay does not open sockets, mutate chart state, or depend on UI state.

Running the same artifact against the same dataset twice must produce identical output, state, and per-bar trace checksums.
