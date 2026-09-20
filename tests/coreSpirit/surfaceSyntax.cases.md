# CoreSpirit surface syntax cases — v16

These cases are compiler-contract examples. They must normalize to the existing core AST without losing executable statements.

```corespirit
indicator("Trend") {
  overlay: true
  input length = int(20, min: 1)
}
fast = ema(close, length)
slow = ema(close, length * 2)
plot fast
if fast crossesAbove slow {
  signal "BUY"
}
```

Expected properties:
- `indicator` wrapper is metadata only.
- `overlay:` is not sent to the VM.
- `input length` becomes a deterministic declaration.
- assignment becomes `let`.
- `crossesAbove` becomes `crossover`.
- `plot fast` becomes `plot(fast)`.
- `signal "BUY"` becomes `signal("BUY")`.
