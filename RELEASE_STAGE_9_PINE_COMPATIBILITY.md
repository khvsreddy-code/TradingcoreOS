# TradingCoreOS — Stage 9 Release

## Delivered

Stage 9 adds a fail-closed Pine compatibility adapter that translates a documented Pine indicator subset into native CoreSpirit source/AST/IR and then uses the existing CoreSpirit compiler/runtime.

### Supported
- Pine version metadata
- indicator/study declarations
- scalar input defaults
- common `ta.*` indicators
- crossover/crossunder
- common `math.*` helpers and `nz`
- OHLCV history indexing
- plot / plotshape / alertcondition
- simple assignments

### Safety / anti-drift
- No proprietary Pine runtime is embedded.
- No unofficial TradingView execution endpoint is required.
- Unsupported strategy/request/function/loop/array/table/ternary constructs fail closed with diagnostics.
- CoreSpirit remains the native language and execution boundary.

## Validation

- Core strict TypeScript: PASS
- Pine compatibility test: PASS
- Stateful translated crossover execution test: PASS
- Full Vite build: blocked by dependency installation transport timeout in the validation environment
- Browser smoke/FPS/memory: pending

## Next

After the full application build/browser gate is available, proceed to Stage 10: TradingCore V Price Action.
