# Vela upstream foundation

- Upstream project: https://github.com/LuxAlgo/Vela
- Upstream source version: **0.8.5**
- Upstream source commit: `596cbbdeba15406cfb72465afd07f8c60c6b1852`
- Version verified from the signed upstream release commit on 2026-10-19. The 0.8.5 commit descends from 0.8.4 commit `850fa1f431e2065e9b0074c4b0555a48a2999eaf`.
- Source lives in `vendor/vela/src`; the app compiles against these sources directly.

## TradingCoreOS integration overlay

The Vela 0.8.5 release delta is merged against the 0.8.4 base and the deliberate TradingCoreOS integration rather than replacing
TCO-specific code wholesale. The merge preserves TradingCoreOS's typed columnar history/scene patches, retained-scene
culling, lazy native-indicator catalog, advanced drawing registries, chart data-plane integration, and FYERS provider /
CoreSpirit engine adapters. Upstream 0.8.5 features are retained for programmatic pane height weights, pane-aware pointer
events, history-gated native indicators, sparse/future plot slots, overlay order control, and the LSMA/regression-slope
replacement for the removed `linear-regression` built-in. TCO additions remain in place: typed columnar history and scene
patching, lazy native-indicator catalog, advanced drawing registries, and the FYERS provider /
CoreSpirit engine adapters. See `src/TcoVelaDataProvider.ts` and `src/services/core/chart/`.

`src/renderers/native/chrome/SettingsDialog.ts` retains TCO's desktop presentation layer:
horizontal tabs, the Appearance Preview panel, and TCO host-setting hooks. The engine-owned
controls continue to edit the live Vela `ChartConfig`; the preview uses sample data only.

`vendor/vela/CHANGELOG.md` records upstream changes, including the 0.8.4 release.
