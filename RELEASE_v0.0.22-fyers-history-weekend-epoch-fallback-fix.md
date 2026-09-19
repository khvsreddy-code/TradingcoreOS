# TradingCoreOS v0.0.22 — FYERS chart candle recovery hardening

## Pinpointed failure

The deployed Stage 13 screen was receiving the live FYERS quote, but the initial History request was not producing a real candle series. The chart's emergency fallback therefore reduced the series to one flat quote candle (`open=high=low=close`), which is effectively invisible at normal zoom. That explains the empty canvas while the NIFTY price continued updating.

## Root cause hardening

The Stage 13 history route relied on a single date-string (`date_format=1`) request ending at the current calendar date. That is fragile around non-trading days and broker-side request handling. The older working adapter path already used epoch ranges (`date_format=0`).

## Fix

- Initial FYERS history now tries the epoch (`date_format=0`) form first.
- Falls back to the documented `yyyy-mm-dd` form when necessary.
- When the market is closed, probes recent prior calendar days so a Saturday/Sunday/holiday end date cannot turn valid Friday/previous-session history into an empty response.
- Keeps the 30-day intraday first-page limit and lazy `before` pagination.
- 429 responses still stop immediately so the request gate is not hammered.
- The live quote remains only a last-resort seed; real historical candles are preferred and returned whenever FYERS provides them.

## Validation

- Node TypeScript syntax check: PASS (`node --experimental-strip-types --check`)
- No changes to the Stage 13 chart rendering API or candle normalization contract.
