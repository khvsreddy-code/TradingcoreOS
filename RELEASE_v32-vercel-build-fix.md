# TradingCoreOS v32 — Vercel build fix

## Root cause
`src/services/runtime/TradingCoreRuntime.ts` imports `../core/event/eventBus`, but the chart-history-fixed package did not contain that module. Vercel therefore failed Rollup resolution with:

`Could not resolve "../core/event/eventBus" from "src/services/runtime/TradingCoreRuntime.ts"`

The runtime also contained the same `coreEventBus` import twice.

## Fix
- Restored the existing legacy `src/services/core/event/eventBus.ts` implementation from the supplied legacy v32 archive.
- Removed the duplicate `coreEventBus` import from `TradingCoreRuntime.ts`.
- No chart-history architecture/UI changes were reverted.

## Expected Vercel result
`npm run build` can now resolve the runtime event-bus dependency instead of failing at Rollup module resolution.
