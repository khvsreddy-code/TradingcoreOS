# CoreSpirit V32 — Time, Series, Execution, Chart Deployment

## 1. Time is first-class
Every evaluation now has an explicit execution frame containing:

- timestamp
- barIndex
- symbol
- timeframe
- timezone
- session
- mode
- realtime/confirmed state
- new-bar flag
- revision

The VM owns the interpretation of these values. Indicators do not create their own clocks.

## 2. Series engine is the canonical history cursor
`CoreSpiritSeriesEngine` is the single boundary for OHLCV/time history.

Rules:

- `[0]` = current evaluation bar
- `[1]` = immediately previous bar
- positive offsets only
- future offsets are rejected
- missing warm-up history returns `null`
- windows are current-first (`[0]`, `[1]`, ...)

Indicators consume this cursor rather than independently interpreting bar indexes.

## 3. Deterministic historical/realtime/replay semantics
A realtime bar can be evaluated repeatedly. Each revision is isolated until confirmation.

- same timestamp bucket → update current bar revision
- new timestamp bucket → previous realtime bar can be committed
- confirmed bar → state becomes committed
- replay/historical execution uses the same series contract
- host owns ticks/network; CoreSpirit remains socket-free

This is the basis for non-repainting behavior and identical historical/replay/realtime calculations.

## 4. Chart-side CoreSpirit indicator workflow
Every chart now has a compact CoreSpirit button on the right-side chart rail.

Flow:

1. click CoreSpirit
2. edit the indicator directly beside the chart
3. compile
4. inspect diagnostics
5. deploy to the active chart

Deployment goes through `coreSpiritChartRegistry`, so the editor does not own chart rendering. The chart remains the execution/rendering host.

The same source can therefore move between the full CoreSpirit IDE and the chart-side quick editor.
