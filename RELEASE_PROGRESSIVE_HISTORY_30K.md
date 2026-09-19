# TradingCoreOS — Progressive 30k Historical Chart Loading

## Problem

A 50,000-candle first request could trigger broker/API request-limit errors and leave the chart blank.

## New behavior

- Load 10,000 candles initially.
- Load 5,000 older candles per backward page.
- Continue on user backward pan until 30,000 candles are held, or the broker has no more valid history.
- Do not request all 30,000 candles at once.
- Do not synthesize missing candles.
- Preserve the viewport after prepending history.
- Show `Loading more history…` while a page is in flight.
- Continue live candle updates from the broker websocket/developing-bar path.

## Broker API routing

FYERS and Upstox history routes now accept a `before` timestamp cursor. Initial and lazy requests are broker-window aware.

## Rendering compatibility

The chart retains the established TradingCoreOS rendering approach: normalized historical OHLCV is passed to the candlestick series with `setData`, and realtime updates use the existing `update` path.

## Validation

Changed TypeScript/TSX files passed TypeScript transpile/syntax diagnostics. Full dependency-complete `npm run lint`/`npm run build` remains environment-gated because `npm ci` timed out before dependencies were installed.
