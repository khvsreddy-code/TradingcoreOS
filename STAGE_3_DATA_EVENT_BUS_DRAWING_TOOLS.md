# TradingCoreOS — Stage 3: Data/Event Bus + Individual CoreDrawing Tools

## Scope
Stage 3 integrates the existing event bus into the live market runtime and establishes an explicit catalog of individual CoreDrawing tools. Core Chart and CoreSpirit remain separate entities; neither owns the other.

## Event architecture
Live broker runtime now publishes normalized market lifecycle events to `coreEventBus`: `market.tick`, `market.status`, `market.error`, and `market.history.loaded`. The realtime calculation engine publishes `market.calculation` and emits completed `market.bar` events when a new bar begins or a bar closes.

Event listener failures are isolated so one consumer cannot stop unrelated consumers.

## Individual drawing tools
`src/services/core/drawing/drawingTools.ts` is the canonical semantic catalog for individual tools. It defines interaction cardinality and semantics for trendline, ray, extended line, horizontal/horizontal ray, vertical, rectangle, ellipse, parallel channel, Fibonacci retracement/extension, pitchfork, arrow, price/date range, brush, highlighter, text, long/short position, and measure.

The registry does not render charts. Core Chart remains responsible for pointer interaction and rendering, while CoreDrawing remains the shared data-coordinate contract.

## TradingCoreOS improvement direction
The tool architecture is designed to support later selection, snapping, drag/edit, hit-testing, z-order, lock/hide, templates, multi-select, precise measurements, magnet modes, and richer geometry without changing the CoreDrawing contract.

## Separation rule
No Stage 3 code imports CoreSpirit runtime internals into Core Chart. Future script/AI drawing producers will emit CoreDrawing-compatible intents through the shared event/data contract.
