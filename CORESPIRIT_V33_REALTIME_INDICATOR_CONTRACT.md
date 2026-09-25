# CoreSpirit v33 — Realtime Transactions + Native Indicator Engine

## 1. Execution lifecycle

A developing realtime bar is a transaction:

`begin -> evaluate tick/revision -> rollback previous revision -> evaluate -> commit once`

A revision never becomes historical state until `commitRealtimeBar()`.

Public runtime lifecycle:
- `beginRealtimeEvaluation()`
- `executeBar()` / `executeTick()`
- `commitRealtimeBar()`
- `rollbackRealtimeBar()`
- `confirmRealtimeBar()` (compatibility alias)

The execution frame exposes `isRealtime`, `isConfirmed`, `revision`, `isNewBar`, and `mode`.

## 2. Stateful rollback

Before the first evaluation of a developing bar the runtime snapshots:
- indicator state
- local series state
- cross detection state
- history length

Every subsequent revision of the same bar restores that snapshot before execution. This prevents EMA/RSI/ATR/crossover state from accumulating multiple times during one candle.

## 3. Commit boundary

Commit copies the developing state into the confirmed baseline and marks the frame confirmed. The current bar is then the historical starting point for the next bar.

## 4. Native indicator engine

`src/services/coreSpirit/indicatorEngine.ts` is the canonical runtime dispatch for SMA, EMA, RSI, highest, lowest, change, and ATR. The runtime owns state and execution timing; the indicator engine owns deterministic mathematical definitions.

The chart/market-data kernel now delegates SMA/EMA/RMA math to the CoreSpirit deterministic kernel instead of maintaining a separate EMA/SMA formula.

No indicator implementation may read chart state, broker state, sockets, or UI state.
