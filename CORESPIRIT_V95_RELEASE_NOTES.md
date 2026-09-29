# CoreSpirit v95 — canonical shared data plane + chart engine decomposition

## Scope

v95 deepens the v94 zero-copy work into a shared market-data ownership plane and a renderer-neutral chart platform architecture. Lightweight Charts remains the production workspace backend.

## #12 — Shared canonical history ownership

- CanonicalDataPlane owns one MarketDataStore per timeline key.
- IndicatorStore, ModelStore, StructureStore, LiquidityStore and OrderFlowStore remain derived-output domains and borrow the canonical timeline.
- Indicator and model bindings expose typed views directly from canonical market columns.
- A shared consumer registry makes chart/indicator/model attachment inspectable.
- Revisions and dirty ranges remain owned by the canonical market store.
- Legacy object-array APIs remain explicit compatibility boundaries.

## #13 — Chart engine as the major platform subsystem

- ChartDataEngine isolates market-data access from rendering.
- ChartInteractionEngine isolates gestures and hit testing from React and renderer APIs.
- ChartScaleModel provides renderer-neutral time, price, volume, percent and log transforms.
- ChartRenderingEngine coordinates retained scene rendering independently of the UI framework.

## #14 — Recommended chart architecture

```text
TradingCore Chart
├── Data Engine
│   ├── CanonicalDataPlane
│   ├── MarketDataStore
│   ├── IndicatorStore
│   ├── ModelStore
│   ├── StructureStore
│   ├── LiquidityStore
│   └── OrderFlowStore
├── Interaction Engine
│   ├── pointer
│   ├── pan/zoom/pinch
│   └── hit testing
└── Rendering Engine
    ├── viewport/scales
    ├── retained scene
    ├── panes/layers
    ├── WebGL2 experimental
    ├── Canvas2D fallback
    └── Lightweight Charts production bridge
```

## Migration status

Native WebGL2 remains experimental. No production switch is made in v95.
