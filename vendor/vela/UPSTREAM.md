# Vela upstream foundation

- Upstream project: https://github.com/LuxAlgo/Vela
- Upstream source version: **0.10.6**
- Upstream release tag: v0.10.6
- Upstream source commit: f6769868c5c0e78ba7977a5c89640df896a8f2f3
- Direct source upgrade base: Vela 0.10.5 at 34d11f1a8a88c7dd5657c9b3a791abf43560218d.
- Vela 0.10.6 source is vendored in vendor/vela/src; TradingCoreOS compiles it directly.
- The extracted UI kit is supplied by @luxalgo/vela-ui 0.4.1, which remains the required kit version for 0.10.6.
- vendor/vela/CHANGELOG.md, README.md, and ui/CHANGELOG.md are synchronized with the upstream 0.10.6 release.
- vendor/vela/NOTICE remains present; preserve visible Vela attribution as required by Apache-2.0 Â§4(d).

## 0.10.6 changes adopted

Vela 0.10.6 adds optional free panning that moves time and price together in one gesture, with configurable mouse/modifier/custom triggers and persisted price-scale state. Rectangles gain an optional screen-space midline whose color/style can be customized and whose label gap is kept clear. Workspace drawing synchronization now relinks matching copies after reload and brings drawings onto charts added or restored by a layout change. Inline date-time and session inputs in indicator settings retain their full width.

## Overlay boundaries

Keep TradingCoreOS-owned columnar history, retained scene patches, lazy native-indicator catalog, advanced drawing registries, pane persistence, canonical data provider, and CoreSpirit output adapter. Recon¶»§q«^