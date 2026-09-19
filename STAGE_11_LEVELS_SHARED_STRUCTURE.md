# Stage 11 — Levels / Shared Structure Engine

**Date:** 2026-09-19  
**Status:** IMPLEMENTED — dependency-complete application/browser validation pending

## Objective

Make Levels a consumer of the canonical Stage 10 quantitative structure engine rather than a competing S/R implementation.

## Architecture

```text
Validated OHLCV
      ↓
Core Structure Engine
  ├── fractal candidates
  ├── volume-weighted KDE
  ├── ATR-scaled clustering
  ├── Supply / Demand
  └── MTF confluence
      ↓
Canonical Structure
      ↓
Levels lifecycle
  ├── session/opening contextual anchors
  ├── breakout
  ├── retest / flip
  └── failure
      ↓
ChartAnalytics
      ↓
Core Chart / ML / future CoreSpirit consumers
```

## Implemented

- `levelEngine.ts` is now a compatibility facade over `structureEngine.ts`.
- Structural Levels consume the same Stage 10 fractal/KDE/cluster output used by TradingCore V.
- Canonical levels expose a source candle index for chronological lifecycle processing.
- Session and opening-range anchors remain contextual inputs.
- Breakout, retest, flip and failure events are processed chronologically.
- ATR values for lifecycle scanning are precomputed once per candle.
- `dynamicSupportResistance()` now consumes the shared structure engine.
- `ChartAnalytics.structure` exposes the underlying canonical structure.
- Added deterministic shared-structure validation in `levelEngine.test.ts`.

## Validation

```text
TRADINGCORE_V_STRUCTURE_TEST=PASS
TRADINGCORE_LEVELS_SHARED_STRUCTURE_TEST=PASS
```

Changed Stage 11 files compile cleanly with standalone TypeScript 5.8.3 validation.

The broader `indicatorEngine.ts` standalone compile still reports an unrelated pre-existing type error at line 258 (`Property 'value' does not exist on type 'number'`). This is not introduced by the Stage 11 structure/Levels files.

A full Vite build and browser/FPS/memory validation remain pending until the project's full dependencies can be installed.

## Anti-drift rule

Do not add a second Levels/S&R detector to `indicatorEngine`, `LiveChart`, CoreSpirit, ML, or another service. All future structural consumers must use `structureEngine.ts`.
