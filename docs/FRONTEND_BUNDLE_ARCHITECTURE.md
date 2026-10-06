# TradingCoreOS Frontend Bundle Architecture

## Three application shells

TradingCoreOS now treats the browser application as three separate loading domains:

```text
Landing Shell
  ├─ public landing
  └─ auth modal on demand

Trading Workspace Shell
  ├─ dashboard
  ├─ models
  ├─ predictions
  ├─ automations
  ├─ indicators
  ├─ portfolio
  ├─ profile
  └─ CoreSpirit authoring routes

Live Trading Shell
  └─ Vela live terminal
```

The shells themselves are lightweight orchestrators. The actual pages remain route-lazy.

## Live trading critical path

The live route does not import the CoreSpirit implementation directly.

```text
LiveTradingWorkspace
       ↓
LazyCoreSpiritVelaEngine
       ↓
Vela engine requested?
       │
       ├─ no → candles/data/workspace can boot without compiler
       │
       └─ yes
            ↓
       dynamic import CoreSpiritVelaEngine
            ↓
       compiler/runtime chunk
```

This is stronger than merely making the editor route lazy. It prevents a hidden chart-engine dependency from pulling the compiler into the live terminal bundle.

## Authoring path

```text
CoreSpirit Editor route
       ↓
editor UI chunk
       ↓
editor/compiler implementation
```

Indicator authoring follows an even narrower boundary:

```text
Indicators page
       ↓
IndicatorSourceEditor interaction
       ↓
dynamic editor component
       ↓
compile action
       ↓
dynamic compiler loader
```

Reading public indicator listings does not require the compiler implementation.

## Chunk policy

Vite explicitly separates:

- live workspace
- live chart
- live data adapter
- generic runtime
- CoreSpirit engine
- CoreSpirit compiler

The compiler is not assigned to a generic workspace chunk.

## Budget policy

The existing bundle budget remains the hard guard. New target values are informational until the measured application reaches them:

- landing target: 200 KB gzip
- workspace target: 450 KB gzip
- live target: 650 KB gzip

The budget script additionally checks that the CoreSpirit compiler chunk is absent from the landing and dashboard/workspace initial closures.

## Design rule

**A route being lazy is not sufficient. Every capability behind that route must also avoid static transitive imports into critical shells.**

That means the architecture has two boundaries:

```text
route boundary
     +
capability boundary
```

The capability boundary is what prevents a live chart from accidentally importing the compiler, language tooling, AI, debugger or other authoring-only machinery.
