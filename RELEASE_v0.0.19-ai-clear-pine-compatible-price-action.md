# TradingCoreOS v0.0.19 — AI clear + Pine-compatible indicator runtime foundation

## AI overlays
- Clear now removes every prediction series immediately.
- Empty selection stays empty; no five-model fallback is injected after Clear.
- Async production prediction responses are invalidated by a new prediction job, preventing stale overlays from reappearing.
- The AI badge therefore reports `AI 0` after Clear All.

## Indicators
- Added a Pine-compatible, bar-by-bar execution contract (`pineRuntime.ts`) for future CoreSpirit/Pine source execution. TradingView's proprietary Pine runtime itself is not embedded or copied.
- Pivot Points now use a session-aware classic previous-session calculation with P/R1-R3/S1-S3, with the existing implementation as fallback.
- Existing native indicators remain calculated locally from OHLCV and are rendered on the chart; they are not falsely represented as TradingView's proprietary engine.

## TradingCore V Price Action / levels
- Keeps the same quantitative engine for both the indicator and live Levels: confirmed fractals + volume-weighted KDE-style density peaks, ATR-scaled clustering, impulse-origin supply/demand zones, mitigation state and higher-timeframe confluence.
- This keeps the indicator and live levels mechanically consistent while allowing different display settings.
