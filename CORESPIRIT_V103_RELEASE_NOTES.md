# CoreSpirit v103 Release Notes — Host/Data-Plane Integration

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM version remains **v98**. v103 is a TradingCoreOS host performance release and does not introduce language syntax or runtime authority changes.

## Chart host integration

The live chart host now consumes a shared chart data plane keyed by:

```text
broker:symbol:timeframe
```

CoreSpirit chart registry entries remain per visible chart so that scripts can address chart-local lifecycle identity, but market history and compute results are not copied per chart.

## Performance boundary

The host runtime now provides:

- one shared symbol-level realtime feed per broker/symbol,
- one shared history lifecycle per dataset,
- bounded analytics/indicator worker pools,
- dataset/revision result caching,
- dataset-scoped prediction deduplication,
- canonical typed-array storage shared by chart consumers.

CoreSpirit output execution remains downstream of the existing canonical data/runtime contracts.

## Preserved CoreSpirit invariants

```text
CoreSpirit source
      ↓
compiler / normalization / IR
      ↓
VM / approved runtime capability boundary
      ↓
chart output projection
```

The chart data plane does not grant CoreSpirit broker authority and does not move execution into chart UI code.
