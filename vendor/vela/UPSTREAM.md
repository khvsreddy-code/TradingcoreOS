# Vela upstream foundation

- Upstream project: https://github.com/LuxAlgo/Vela
- Upstream source version: **0.8.3**
- Upstream source commit: `766a0f134935ac714871c5e89ba63940a245965f`
- Version verified from upstream `package.json` on 2026-10-13.
- Source lives in `vendor/vela/src`; the app compiles against these sources directly.

## TradingCoreOS integration overlay

This directory combines the Vela 0.8.3 foundation with deliberate TradingCoreOS extensions:
the typed columnar history path and scene patching, lazy native-indicator catalog, advanced
drawing registries, and TCO's FYERS provider/engine integration. Files that are TCO-specific
or adapted must be rebased onto the upstream foundation rather than replaced wholesale.
See the top-level `src/TcoVelaDataProvider.ts` and `src/services/core/chart/` adapters.

`vendor/vela/CHANGELOG.md` records upstream changes, including the 0.8.3 release.
