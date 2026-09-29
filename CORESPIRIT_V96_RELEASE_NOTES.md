# CoreSpirit v96 — viewport and scale engine deepening

## Scope

v96 deepens chart platform stages #15 and #16 without expanding the CoreSpirit language surface. The release establishes a renderer-neutral viewport and dedicated time/price scale engines above the canonical data plane.

## Implemented

### Viewport

- Explicit visible-bar state: first/last visible bar, pixels-per-bar, price domain, zoom, fractional scroll, pixel width and device-pixel ratio.
- Cached affine bar-index ↔ pixel transform.
- Deterministic pan, zoom anchoring and resize behavior.

### Time scale

- Continuous, compressed and session-compressed modes.
- Explicit IANA timezone.
- Injectable trading-day, holiday and session-window calendar callbacks.
- Deterministic special-session support through the calendar contract.
- Timeframe parsing for safe interpolation across multiple bar intervals.
- Ordered timeline search with no candle-object materialization.

### Price scale

- Linear, logarithmic, percent and indexed modes.
- Auto, manual and locked domain policies.
- Visible-range autoscale with deterministic padding.
- Cached forward and inverse transform coefficients.

### Engine integration

`TradingCoreChartEngine` now binds canonical timeline data to the time scale and updates the price domain from the active visible range when auto-scale is enabled.

## Production decision

Lightweight Charts remains the production backend. Native WebGL2/Canvas2D remain experimental. No production migration is claimed by v96.

## Validation

```text
STAGE96_VIEWPORT_ENGINE_OK
STAGE96_FAST_BAR_PIXEL_TRANSFORMS_OK
STAGE96_SESSION_AWARE_TIME_SCALE_OK
STAGE96_PRICE_SCALE_MODES_OK
STAGE96_AUTOSCALE_MANUAL_LOCK_CONTRACT_OK
```

## Environment note

The supplied archive does not contain the full installed dependency tree, so a repository-wide Vite production build is not claimed from this package. Focused v96 TypeScript compilation and runtime contracts are the validation basis for this release.
