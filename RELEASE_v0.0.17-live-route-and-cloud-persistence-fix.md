# TradingCoreOS v0.0.17 — live route and cloud persistence fix

## Live workspace
- Removed the second global legacy terminal mount from `main.tsx`.
- `/live` now has a guarded V5 module loader with V4 fallback.
- A live-module error no longer takes down the whole workspace route.
- The stable V4 terminal remains available as an automatic fallback.

## Prediction overlays
- Historical chart `fitContent()` now runs before prediction overlays are plotted.
- Prediction overlays are therefore not immediately hidden by the final chart fit operation.
- If a saved prediction-model selection is empty/corrupt, the chart uses the production XGBoost/LSTM/Transformer plus breakout/trend defaults.
- Future prediction paths remain visible through the prediction renderer's visible-range adjustment.

## Supabase
- Added an Auth trigger that creates `profiles` and `user_settings` rows when a new Supabase Auth user is created.
- First sign-in also materializes an empty `user_settings` row from the browser client.
- Workspace layout RLS policies are explicitly restricted to the `authenticated` role.
- Existing per-user workspace and settings upserts remain enabled.
