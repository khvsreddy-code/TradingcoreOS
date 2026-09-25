# CoreSpirit Stages 13–14 — Strategy Model + Killer Example

## 13. Strategy model

A future `strategy(...)` program is still a CoreSpirit program and still compiles to the same stable IR.

The strategy layer adds declarative events:

`CoreSpirit -> Strategy Event -> Risk Engine -> Order Intent -> Execution Engine`

CoreSpirit never receives broker credentials, venue controls, account state mutation, or direct order submission APIs.

An entry/exit event identifies:
- strategy
- direction
- position identity
- bar/timestamp
- symbol/timeframe
- reason/metadata

The risk engine decides whether an order intent is permitted and at what quantity.

## 14. Killer example

The canonical proof program is `examples/coreSpirit/ema-rsi-strategy.core`.

It demonstrates:
- inputs
- native EMA
- RSI extension
- crossover/crossunder
- boolean composition
- plots
- named signals
- strategy metadata

The acceptance matrix is:

| Surface | Required |
|---|---|
| Historical | same outputs |
| Replay | deterministic |
| Realtime | provisional revisions |
| Rollback | no state contamination |
| Commit | final state |
| Chart | plots + signals |
| Debugger | source -> AST -> IR -> state -> output |
| Execution | signal only; risk engine owns orders |

The example is intentionally one program, not a gallery of scripts. It becomes the end-to-end CoreSpirit conformance fixture.
