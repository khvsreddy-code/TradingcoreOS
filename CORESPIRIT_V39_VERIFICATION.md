# CoreSpirit v39 Verification

## Passed
- Focused TypeScript compilation of the new stages 1–16 contract and its direct dependencies.
- CommonJS transpile + Node execution of `stage1To16Contract.test.ts`.
- `STAGE1_16_ARCHITECTURE_OK` was produced.
- The canonical EMA + RSI source was recognized as strategy metadata, compiled, replayed twice deterministically, executed historically, executed through committed realtime bars, and checked against historical outputs.

## Full repository limitation
A full `src/services/coreSpirit/*.ts` type-check is not clean in the uploaded environment because the dependency tree is not installed. Current reported external/environment errors include missing `@supabase/supabase-js`, missing `lightweight-charts`, and older test files without Vitest/Jest globals. These are not counted as CoreSpirit v39 contract failures.
