# SUPERSEDED BY RELEASE_PROGRESSIVE_HISTORY_30K.md

# RELEASE — 50K Candle History + Workspace Chrome Correction

**Date:** 2026-09-19

## Changes

### Chart history
- Chart history target is now **50,000 candles per symbol/timeframe**.
- Browser adapter requests 50,000.
- Runtime normalization/cache retains up to 50,000.
- Fyers history route accepts a 50,000 target and merges broker-safe historical windows.
- Upstox history route now walks backward through broker-safe date windows and merges results until the target is reached or older data is exhausted.
- Duplicate/out-of-order timestamps continue to be normalized away.
- The implementation never fabricates candles to reach the target; actual broker history remains the upper bound.

### Workspace chrome
- Removed the injected duplicate `CHARTS / MODELS / AUTOMATIONS / PORTFOLIO / INDICATORS / PROFILE` strip from `/live`.
- The existing top command bar remains the command/navigation surface.
- Removed the standalone Crosshair button from the embedded drawing rail.

## Validation
- Source edits completed against the supplied Stage 2–10 cumulative ZIP.
- Full `npm run lint` / `npm run build` could not be completed because dependency installation timed out in the validation environment.


This release is retained only as historical documentation. The active chart-history contract is the progressive 10k initial + 5k backward-page + 30k maximum implementation described in RELEASE_PROGRESSIVE_HISTORY_30K.md.
