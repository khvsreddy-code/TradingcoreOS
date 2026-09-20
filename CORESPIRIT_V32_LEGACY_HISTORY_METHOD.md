# TradingCoreOS v32 — Legacy History Method Restoration

## Reference
`TradingcoreOS-4ed40e0d0486b524bd3026299d74f7aba9d78462.zip`

## Contract
Use the legacy FYERS history method as the reference: timeframe-specific broker-safe calendar windows, `cont_flag=1`, chronological normalization/merge, and first-paint-oriented history loading. v32 changes the requested candle target to 20,000 and repeats the same valid window backwards only when necessary.

### Targets
- 1m: 20,000
- 3m: 20,000
- 5m: 20,000
- 15m: 20,000
- 30m: 20,000
- 1H: 20,000
- 1D: 20,000 subject to broker availability

### Safety
- Broker date-window limits are not bypassed.
- Responses are deduplicated by candle timestamp and sorted chronologically.
- If the broker has fewer candles, return the available valid history.
- No synthetic historical candles are created.
- Newer cache/deduplication/rapid-switch protections remain active.

## Validation
The modified route, broker adapter and LiveChart files pass TypeScript transpilation. Full repository type-check requires the project's installed dependency environment, which is not present in the supplied archive. Live broker testing cannot be claimed without connected FYERS credentials.
