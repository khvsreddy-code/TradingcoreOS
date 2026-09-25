# CoreSpirit Stages 9–12 — Deep Contract

## 9 Stable IR
The VM consumes a validated executable artifact, not AST nodes. The artifact carries IR version, program checksum, instruction stream, source map, required lookback, and runtime ABI version. IR is validated before and after optimization.

## 10 Deterministic Replay
Replay consumes an immutable dataset and executable artifact. Results include dataset identity, artifact checksum, output/state/trace checksums, and per-bar checksums. Two identical runs must match structurally at every bar.

## 11 Debugger
The debugger is an observation layer over one execution engine. A selected candle exposes Source → AST reference → IR instruction → runtime state → output, plus revision/confirmation metadata. It must never create a second interpreter.

## 12 Signal Boundary
CoreSpirit emits signals only. The platform converts signals to order proposals, applies risk and user/automation policy, then creates execution requests. CoreSpirit has no broker/venue/order API and cannot mutate account state.
