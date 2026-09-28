# TradingCoreOS Build Fixes

Applied fixes for the reported Vercel TypeScript/runtime failures.

## TypeScript fixes

- `src/server/fyers/symbols/FyersSymbolMasterService.ts`: store the narrowed `rowRecord` instead of the original `unknown` row.
- `src/server/brokers/adapters/BaseBroker.ts`: import the broker contract/service types used by the abstract adapter methods.
- `src/server/brokers/adapters/BrokerAdapters.ts`: restore Upstox market-quote and historical-data methods to Upstox APIs instead of calling FYERS endpoints from the Upstox adapter.
- `src/server/brokers/adapters/BrokerAdapters.ts`: normalize dynamic `BrokerOrderPayload` fields with `String(...)` before string-only operations to eliminate `unknown` type errors.

## Vercel runtime failure

- The uploaded source already contains the `.js` extension on the `brokerApiValidation` import used by `src/server/routes/trading.routes.ts`.
- Live Vercel runtime logs for the prior production deployment showed `ERR_MODULE_NOT_FOUND` for the extensionless `brokerApiValidation` import; that prior deployment is the source of the reported HTTP 500.

## Validation

- Targeted TypeScript validation of the changed server files passed with TypeScript 5.8.3 after isolating unavailable dependency type packages.
- All available Node-based contract tests in the repository passed.
- Full `npm run typecheck` / `npm run build` could not be executed locally because the sandbox dependency installation timed out and left an incomplete `node_modules` tree.
