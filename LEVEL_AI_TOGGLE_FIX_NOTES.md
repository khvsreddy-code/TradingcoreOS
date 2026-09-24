# Levels / AI toggle fix

## Levels
- The top-bar **Levels** button is now a true chart visibility toggle.
- It no longer opens the Levels settings dialog.
- The button shows its active state while support/resistance levels are visible.
- The bottom-bar Levels control uses the same visibility toggle.
- The live route's separate Level Settings dock has been removed.
- Old saved workspace state cannot reopen the removed Levels settings panel.

## AI
- The top-bar **AI** button now toggles the prediction dialog.
- Clicking AI once opens it; clicking AI again closes it.
- The AI button follows the focused chart's open/closed prediction state.
- Opening Indicators still closes the AI dialog.

## Validation
- TypeScript/TSX transpilation validation passed for all modified files.
- A full `npm run build` could not be run because the project dependencies were not installed in the execution environment; `npm ci` timed out.
