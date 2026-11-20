# Vela upstream foundation

- Upstream project: https://github.com/LuxAlgo/Vela
- Upstream source version: **0.10.13**
- Upstream release tag: `v0.10.13`
- Upstream source commit: `9e6861d67c1fbab13083ec6cd97825852678d5dd`
- Previous direct source base: Vela **0.10.6** at `f6769868c5c0e78ba7977a5c89640df896a8f2f3`.
- Historical overlay fork point: Vela 0.10.2 at `305521811eabc35c3797e5b6ab58adb25e70c1c7`.
- Vela 0.10.13 source is vendored in `vendor/vela/src`; TradingCoreOS compiles this source directly.
- The extracted UI kit dependency is `@luxalgo/vela-ui` **0.4.3**, matching the 0.10.13 release.
- Upstream `CHANGELOG.md`, `README.md`, source locales, and catalog metadata are synchronized to v0.10.13 where they do not conflict with TradingCoreOS's local integration.
- `vendor/vela/NOTICE` remains present; preserve visible Vela attribution as required by Apache-2.0 §4(d).

## 0.10.13 changes adopted

The release adds host-contributed actions to selected drawings, improves keyboard and symbol-search controls, updates the classic-indicator catalog and its translations, improves thin-candle rendering when wicks are hidden, and adds drawing/controller and input-dialog behavior. The renderer merge preserves TradingCoreOS's volume-candle and hollow-candle customizations, per-instrument market-time formatting, lazy drawing controller, and indexed candle aggregation.

## TradingCoreOS integration boundaries

TradingCoreOS continues to own the canonical market-data plane, FYERS/Investiny adapters, typed-column history and gap recovery, saved watchlists, multi-chart workspace integration, and CoreSpirit output adapter. Vela remains the chart rendering and workspace engine. CoreSpirit continues to emit chart patches through the existing Vela output adapter; it does not implement a parallel renderer.

## Overlay and attribution

The 0.10.13 upgrade is reconciled against the 0.10.6 base file-by-file. Preserve local changes in `vendor/vela/patches.json` and keep the upstream provenance manifest current. Never replace the vendor directory wholesale. Keep `vendor/vela/NOTICE` and visible Vela attribution on the chart or an equivalent visible attribution on the same screen.
