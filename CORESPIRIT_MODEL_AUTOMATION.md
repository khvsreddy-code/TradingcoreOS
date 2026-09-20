# CoreSpirit model + automation contract — v24

CoreSpirit v24 treats prediction and automation as one deterministic pipeline:

`market data -> features -> score -> probability -> decision -> execution intent -> automation layer`

## Prediction primitives

```corespirit
trend = ema(close, 50)
momentum = change(close, 5)
edge = score(-1.0, momentum, 0.30, rsi(close, 14), 0.02, close - trend, 0.003)
prob = predict(-1.0, momentum, 0.30, rsi(close, 14), 0.02, close - trend, 0.003)
```

- `score(...)` returns a raw weighted score.
- `predict(...)` applies a logistic transform and returns a probability-like value in `[0, 1]`.
- `sigmoid(x)` and `probability(x, temperature)` expose the transform directly.
- `clamp`, `exp`, `log`, and `tanh` support custom formulas.

Arguments after the bias are feature/weight pairs:

`predict(bias, feature1, weight1, feature2, weight2, ...)`

This makes a model explicit, inspectable, replayable, and deterministic.

## Entry/exit intents

```corespirit
if prob > 0.72 {
  entry(true, "long", prob, close - atr(14), close + atr(14) * 2, "trend-long")
}

if prob < 0.35 {
  exit(true, "trend-exit")
}
```

`entry()` and `exit()` do not place orders. They emit broker-neutral `orderIntent` objects and a typed `execution.intent` event. A later permissioned execution service can validate, throttle, route, reject, or paper-trade those intents.

## Why this architecture

Pine is excellent at chart-native calculations and visuals. CoreSpirit should keep that simplicity while making the runtime boundary explicit enough to support models and automations without exposing the VM directly to brokers, arbitrary network calls, or DOM APIs.

## Next model work

1. First-class feature sets.
2. Reusable `model` declarations compiled to the same IR.
3. Walk-forward training primitives with explicit anti-lookahead rules.
4. Model metrics and calibration.
5. Model versioning/persistence.
6. Remote/accelerated model adapters through capability-gated services.
7. Replay/backtest parity for model decisions.
