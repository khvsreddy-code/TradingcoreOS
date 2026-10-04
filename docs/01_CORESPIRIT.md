# CoreSpirit — language and scripting

CoreSpirit is TradingCoreOS's native language for indicators, models, visuals and automation.

## Compiler model

```
source → CST/tokens → normalized AST → semantic model → IR → one VM/reactive runtime
```

Users write CoreSpirit; they do not need to write IR or renderer code.

## Foundations

### DATA
```corespirit
data market = market("NSE:NIFTY50-INDEX", "5m")
```

### LET
```corespirit
let fast = ema(close, 20)
let slow = ema(close, 50)
let spread = fast - slow
```

### WHEN / IF
```corespirit
when close > fast
  show marker(high, "above", "breakout")

if close > slow
  show line(fast)
```

### SHOW
SHOW publishes renderer-neutral visual intent: series, line, marker, label, box, zone, fill, level, background and related visual primitives.

### MODEL / AUTOMATE
MODEL consumes a model artifact. AUTOMATE declares automation intent. Broker authority remains outside the numeric VM.

## Common built-ins

```
ema(source, length)
sma(source, length)
rsi(source, length)
atr(length)
highest(source, length)
lowest(source, length)
change(source)
pctchange(source)
zscore(source, length)
normalize(source, length)
median(source, length)
```

Context helpers include `market()` and `timeframe()`.

## Indicator example

```corespirit
data market = market("NSE:NIFTY50-INDEX", "5m")

let basis = ema(close, 20)
let deviation = atr(14)
let upper = basis + deviation * 2
let lower = basis - deviation * 2

when close > upper
  show marker(high, "above", "breakout")

show line(basis, "Basis", "#7c5cff", 2)
show line(upper, "Upper", "#94a3b8", 1)
show line(lower, "Lower", "#94a3b8", 1)
```

## Settings

Indicator parameters can be number, integer, decimal, boolean, enum, color, source, timeframe, symbol, session, price, duration or string.

Parameters can publish default, min/max/step, group, tooltip, dependency, visibility and validation.

Appearance-only changes must not trigger mathematical recomputation.

## Authoring rules

1. Name calculations with LET.
2. Prefer built-ins over manual rolling loops.
3. Keep visual declarations separate from numeric calculations.
4. Keep scripts deterministic for replay.
5. Declare multi-symbol/timeframe dependencies explicitly.
6. Do not make indicators or models broker authorities.

## Performance

A compatible chain such as:

```
close → EMA → difference → normalization → signal
```

is executed as one chronological traversal with bounded state. Eligibility comes from the semantic dependency graph, not regex/source-text discovery.
