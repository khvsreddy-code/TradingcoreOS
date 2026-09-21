# TradingCoreOS v32 — Legacy History Method Restoration

## Reference
`TradingcoreOS-4ed40e0d0486b524bd3026299d74f7aba9d78462.zip`

## Contract
The initial FYERS chart load must use the proven legacy method: **one History API request per chart load**, with the timeframe-specific broker-safe calendar window and `cont_flag=1`.

- 1m / 3m / 5m / 15m: 30 calendar days
- 30m / 1H: 90 calendar days
- 1D: 3650 calendar days
- Chronological normalization and timestamp deduplication remain enabled.
- Older candles are loaded only on demand through the existing `before=` left-edge pagination.
- No synthetic historical candles are created.

## Why this was changed
The first v32 implementation converted a 20,000-candle target into repeated broker History API calls. A single cold chart could require dozens of FYERS History requests, and watchlist prefetch multiplied that across several symbols. That is the direct architectural difference from the known-good legacy build and is consistent with the FYERS request-limit error seen in the chart.

The hotfix therefore restores the legacy **single-request first page** instead of trying to manufacture a 20,000-candle first page from many requests.

## Watchlist behavior
Historical data is now loaded on demand by `LiveChart`. The v32 watchlist-wide historical prefetch has been removed because it was not present in the working legacy build and was unnecessary for painting the selected chart.

## Safety
- Broker date-window limits are respected.
- Responses are deduplicated by candle timestamp and sorted chronologically.
- Empty/invalid broker responses are not replaced with fabricated historical candles.
- Existing cache, request deduplication, rapid-switch abort protection, and left-edge pagination remain active.

## Validation
The supplied archive does not contain its installed dependency environment, so a full repository `npm run lint` could not be executed in the extracted archive. The modified files were inspected after patching. Live broker validation still requires a connected FYERS account.
