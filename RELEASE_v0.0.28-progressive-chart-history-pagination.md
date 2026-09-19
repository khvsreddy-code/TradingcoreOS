# Release v0.0.28 — Progressive Chart History Pagination

## Goal
Make the chart behave more like TradingView by loading a modest recent history page first and fetching older candles only as the user pans toward the left edge.

## Changes
- Initial broker history request reduced from 10,000 to 1,200 candles.
- Older-history page reduced from 5,000 to 1,500 candles.
- Older history is already merged into the existing chart without resetting the visible range.
- Prefetch threshold increased from 300 to 500 logical bars so pagination begins before the user reaches the edge.
- Application maximum remains 30,000 candles in memory.
- Existing FYERS history resolution/symbol handling is preserved.
- No synthetic historical candles are introduced by pagination.

## Expected behavior
1. Chart opens quickly with recent candles.
2. Pan/scroll left toward the older edge.
3. TradingCore requests the next older page automatically.
4. New candles are prepended while the current viewport is preserved.
5. Repeat until the 30,000-candle application cap or broker history boundary is reached.
