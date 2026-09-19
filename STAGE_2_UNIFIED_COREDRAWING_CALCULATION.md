# Stage 2 — Unified CoreDrawing + Realtime Calculation Clock

## Scope

Stage 2 extends the Stage 1 chart-lifecycle-hardened build without merging Core Chart and CoreSpirit.

## Implemented

### 1. Unified CoreDrawing contract

Added:

`src/services/core/drawing/coreDrawing.ts`

CoreDrawing is a shared data contract for user, AI, script and system chart objects.

It contains:

- semantic drawing kind
- data-coordinate geometry
- owner/source identity
- pane/series references
- style/label/metadata
- lifecycle state
- timestamps

Existing persisted drawings are normalized into this contract.

### 2. Tick and bar calculation clock

Added:

`src/services/core/calculation/realtimeCalculationEngine.ts`

The engine supports:

- tick/developing-bar calculations
- completed-bar calculations
- chronological state
- SMA20
- EMA20
- RSI14
- ATR14
- VWAP
- change/change%
- high/low
- calculation timestamps and bar indexes

Every live tick can generate a `market.calculation` event. A tick updating the current candle does not advance the completed-bar state as though it were a new bar.

### 3. Event bus

Added:

`market.calculation`

This allows independent Chart, CoreSpirit, replay, ML, validation and alert consumers to subscribe without direct internal coupling.

### 4. Stage 1 preserved

The Stage 1 chart lifecycle guard remains intact.

CoreSpirit remains a separate entity. This stage does not import CoreSpirit internals into the chart lifecycle or rendering path.

## Next engineering work

- full incremental indicator graph
- session-aware state/reset rules
- confirmed/developing MTF semantics
- calculation cache/invalidation
- replay/live conformance tests
- full CoreDrawing renderer/hit-testing/editing
- CoreSpirit producers for CoreDrawing

## Completion pass — 2026-09-18

The retained drawing store is now connected to the chart drawing workflow. Geometry support includes hit testing, handles, data-coordinate movement and OHLC snapping. This keeps drawing state semantic and independent of chart pixels.
