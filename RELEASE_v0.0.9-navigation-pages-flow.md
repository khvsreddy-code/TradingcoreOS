# TradingCore OS v0.0.9 — Navigation Pages & Auth Flow

- Added a dedicated `/login` page instead of relying on an authentication modal for primary sign-in.
- Added explicit `/landing` route for the public landing experience while preserving `/` as the public entry for signed-out users.
- Signed-in users entering `/`, `/landing`, or `/login` are routed to `/dashboard`.
- Signed-out users attempting protected workspace routes are routed to `/login`.
- Successful sign-in continues to `/broker` when no broker session is connected, otherwise `/dashboard`.
- Landing-page Sign In now navigates to `/login`.
- Existing `/broker` onboarding remains the dedicated broker connection step.
- Existing workspace routes remain `/dashboard`, `/live`, `/models`, `/predictions`, `/automations`, `/indicators`, `/portfolio`, and `/profile`.
- This separates public, authentication, broker onboarding, and authenticated workspace concerns to make navigation predictable.
