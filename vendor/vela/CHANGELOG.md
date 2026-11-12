# Changelog

All notable changes to Vela, newest first.

## [0.10.6]

### Added

- **Free pan across time and price in one drag.** Set `freePan` on the chart or workspace (or
  switch **Free pan** on under *Scales and lines â†’ Price scale*) so dragging an auto-scaled
  pane freezes its visible range into manual mode as soon as the drag begins, moving time and
  price together without a jump while leaving clicks and middle-click drawing deletion
  untouched. Pass `true` (plain left-drag), `'alt'`, `'shift'`, `'mod'`, or a custom
  `(e) => boolean` predicate â€” or update it live through `chart.renderer.set('freePan', â€¦)` â€”
  to bind free panning to any control. Its on/off state is saved in `priceScale.freePan` and
  travels across style-linked charts.
- **Rectangles can show their midline.** A rectangle's settings have a **Midline** switch, off
  by default, that draws a line halfway between its top and bottom, such as a range's 50%
  level, across the full width of the box, and breaks around the box's label so the text stays
  clear. The line moves with the box while you draw, resize or move it. Its color follows the
  border color until you pick one, and its style is dashed until you change it. The setting is
  saved with the drawing in its `props` (`midline`, `midColor`, `midStyle`), so it comes back on
  reload and travels with tool styles, copies and linked charts. Rectangles saved before this
  change look the same.

### Fixed

- **Synced drawings stay linked after ¶»§q«^