# Vela upstream foundation

- Upstream project: https://github.com/LuxAlgo/Vela
- Upstream source version: **0.8.4**
- Upstream source commit: `850fa1f431e2065e9b0074c4b0555a48a2999eaf`
- Version verified from upstream `package.json` and the release commit on 2026-10-14.
- Source lives in `vendor/vela/src`; the app compiles against these sources directly.

## TradingCoreOS integration overlay

This directory combines the Vela 0.8.4 foundation with deliberate TradingCoreOS extensions:
This upgrade rebases the 0.8.4 release delta onto the TCO integration rather than replacing
TCO-specific code wholesale. TCO additions remain in place: typed columnar history and scene
patching, lazy native-indicator catalog, advanced drawing registries, and the FYERS provider /
CoreSpirit engine adapters. See `src/TcoVelaDataProvider.ts` and `src/services/core/chart/`.

`src/renderers/native/chrome/SettingsDialog.ts` retains TCO's desktop presentation layer:
horizontal tabs, the Appearance Preview panel, and TCO host-setting hooks. The engine-owned
controls continue to edit the live Vela `ChartConfig`; the preview uses sample data only.

`vendor/vela/CHANGELOG.md` records upstream changes, including the 0.8.3 release.
