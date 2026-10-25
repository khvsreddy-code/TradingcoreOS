# TradingCoreOS UI Pages Source Bundle

Exported from the TradingCoreOS main branch snapshot.

## Routes mapped from the router
- / and /landing — public home / landing
- /login — sign in
- /dashboard — command center dashboard
- /live — live trading terminal and Vela chart workspace
- /models — model research
- /predictions — prediction center
- /automations — automation workspace
- /indicators — indicator workspace
- /portfolio — portfolio
- /profile — profile and preferences
- /corespirit — CoreSpirit editor
- /corespirit/docs — CoreSpirit documentation
- /broker — broker connection
- /explore/indicators and /explore/scripts — public exploration pages
- /privacy and /terms — legal pages
- /auth/broker-callback — broker OAuth callback

## Where the page UI lives
- src/pages/ — full routed page implementations
- src/components/ — shared UI and workspace components
- src/appShells/ and src/routing/ — app shells and route map
- src/index.css — global styles and visual design tokens
- public/ — public assets
- vendor/vela/ — Vela charting engine source
- package.json and lockfiles — scripts and dependencies

## Notes
This is source code, not rendered screenshots. Workspace pages can require sign-in, environment variables, backend APIs and/or a connected broker. The bundle is for inspecting the actual implementations and dependencies, not a guaranteed offline demo.
