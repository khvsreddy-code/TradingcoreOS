# Vela upstream foundation

- Upstream project: https://github.com/LuxAlgo/Vela
- Upstream source version: **0.10.5**
- Upstream branch: `main`
- Upstream source commit: `34d11f1a8a88c7dd5657c9b3a791abf43560218d`
- Previous source baseline for the TradingCoreOS overlay: Vela 0.10.2 at `305521811eabc35c3797e5b6ab58adb25e70c1c7`.
- Vela 0.10.5 source is vendored in `vendor/vela/src`; TradingCoreOS compiles it directly.
- The extracted UI kit is supplied by `@luxalgo/vela-ui` **0.4.1**.
- `vendor/vela/CHANGELOG.md`, `README.md`, and `ui/CHANGELOG.md` are synchronized with the upstream 0.10.5 source tree.
- `vendor/vela/NOTICE` remains present; preserve visible Vela attribution as required by Apache-2.0 §4(d).

## 0.10.5 changes adopted

Vela 0.10.5 adds line-with-markers, step-line, and columns chart styles, and declares symbol facts that gate which chart styles can render. It also introduces a typed permanent-data-unavailable error so a provider can refuse unsupported markets/timeframes explicitly. The new style applicability, data-unavailable, and close-only rendering modules are vendored.

TradingCoreOS continues to own market data: FYERS, Investiny, Yahoo fallback, canonical history, provider health, and admission controls remain in TradingCoreOS. The bundled Vela Binance/Coinbase/Hyperliquid providers are not substituted for that pipeline. CoreSpirit continues to emit chart patches through the existing Vela output adapter.

## Overlay boundaries

Keep TradingCoreOS-owned columnar history, retained scene patches, lazy native-indicator catalog, advanced drawing registries, pane persistence, canonical data provider, and CoreSpirit output adapter. Reconcile every locally modified source file against the upstream 0.10.5 delta; never replace the vendor directory wholesale.

Vela remains the chart-rendering owner. CoreSpirit owns language semantics and its output adapter; it must not implement a parallel renderer or bypass Vela's retained scene lifecycle.

## Attribution

Keep `vendor/vela/NOTICE` and the Vela attribution visible in the chart or an equivalent visible attribution on the same screen.
