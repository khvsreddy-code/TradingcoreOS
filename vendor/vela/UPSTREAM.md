# Vela upstream foundation

- Upstream project: https://github.com/LuxAlgo/Vela
- Upstream source version: **0.10.6**
- Upstream release tag: `v0.10.6`
- Upstream source commit: `f6769868c5c0e78ba7977a5c89640df896a8f2f3`
- Direct source upgrade base: Vela **0.10.5** at `34d11f1a8a88c7dd5657c9b3a791abf43560218d`.
- Historical TCO overlay fork point: Vela **0.10.2** at `aecb13847dff3c1a50a2f3433e9804d26fc581ed`.
- The reproducible release-inventory comparison retains the previous 0.10.2 baseline commit `305521811eabc35c3797e5b6ab58adb25e70c1c7`.
- Vela 0.10.6 source is vendored in `vendor/vela/src`; TradingCoreOS compiles it directly.
- The extracted UI kit is supplied by `@luxalgo/vela-ui` **0.4.1**, which remains the version required by Vela 0.10.6.
- `vendor/vela/CHANGELOG.md`, `README.md`, and all 21 locale/catalog files are synchronized with the upstream v0.10.6 source tree.
- `vendor/vela/NOTICE` remains present; preserve visible Vela attribution as required by Apache-2.0 §4(d).

## 0.10.6 changes adopted

Vela 0.10.6 adds configurable free-pan gestures that can unlock manual price scaling while a drag pans time and price together; persisted rectangle midlines with per-drawing color and line style; relinking of identical synced drawings after reload and `applyState`; and full-width inline date/time and session controls in indicator settings.

TradingCoreOS keeps its existing market-data and execution boundaries: FYERS remains the primary live provider, Investiny remains the historical backfill, Yahoo remains the delayed fallback, and the canonical typed-column history path remains owned by TradingCoreOS. The bundled Vela exchange providers are not substituted for that pipeline. CoreSpirit continues to emit chart patches through the existing Vela output adapter.

## Overlay boundaries

Keep TradingCoreOS-owned columnar history, retained scene patches, lazy native-indicator catalog, advanced drawing registries, pane persistence, canonical data provider, and CoreSpirit output adapter. The 0.10.6 overlay is reconciled file-by-file against the 0.10.5 source base; never replace the vendor directory wholesale.

Vela remains the chart-rendering owner. CoreSpirit owns language semantics and its output adapter; it must not implement a parallel renderer or bypass Vela's retained scene lifecycle.

## Attribution

Keep `vendor/vela/NOTICE` and the Vela attribution visible in the chart or an equivalent visible attribution on the same screen.
