# CoreSpirit v35 — Deep Steps 5–8

## Step 5 — Historical vs realtime semantics

The runtime now treats the active realtime bar as a transaction:

1. Capture the last committed state before the first revision.
2. Evaluate the current tick/bar revision.
3. Before the next revision, restore the pre-bar snapshot.
4. Re-run the program against the new current-bar values.
5. Commit once when the bar is confirmed.

Invariant: a developing bar can change outputs, but it cannot permanently mutate confirmed indicator state until commit.

### Conformance

For the same OHLCV sequence, historical and replay executions must match committed realtime values. Rollback must restore indicator/cross/local series state to the last committed boundary.

## Step 6 — Runtime-native indicators

`indicatorEngine.ts` is the single mathematical implementation. `nativeIndicatorRegistry.ts` is the contract describing which primitives are stateful and rollback-safe.

The runtime owns lifecycle/state; the indicator engine owns math. Chart, backtest, replay, and CoreSpirit must not calculate their own EMA/SMA/RSI variants.

## Step 7 — Small standard library

CoreSpirit v1 remains exactly 30 primitives. Extensions live outside the language core. Every core primitive must have a deterministic runtime path or be a documented output primitive.

## Step 8 — Compiler pipeline

The independent boundaries remain:

Source → Lexer → Parser/AST → Name Resolution → Type Checking/Semantic Validation → IR Lowering → Optimization → Executable Artifact.

Golden tests protect AST and IR shape. Cross-mode execution conformance protects IR/runtime semantics.
