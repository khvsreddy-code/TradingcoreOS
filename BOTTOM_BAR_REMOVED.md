# Bottom Bar Removed

- Removed the duplicate bottom action bar from the live terminal.
- The top website toolbar is now the only chart/workspace control bar.
- Removed the bottom-bar CSS from the V4 live terminal.
- Expanded chart/panel geometry to use the space previously reserved for the bottom bar.
- Existing top-bar controls remain unchanged.


## v99 superseding shell model — 2026-09-28

The historical duplicate action bar remains removed. v99 introduces a different concept: a persistent **terminal bottom dock** owned by the canonical `/live` workspace. It is not a duplicate chart toolbar; it hosts operational tabs for Positions, Orders, Trades, Activity, Strategy Log, and the inline Order Ticket.


## v100 terminal visual-density pass — 2026-09-29

The `/live` shell now uses a flatter terminal visual language. This is a presentation-only refinement layered on top of the v99 composition boundary. The landing page and premium marketing surfaces retain their existing visual treatment.

- Chart infrastructure uses squared or nearly squared geometry (0–2px radius).
- Terminal controls use 0–4px radius; popovers use up to 6px.
- Decorative shadows are removed from chart, dock, toolbar and bottom-terminal infrastructure.
- Separators are thin and information density is increased through spacing and typography rather than cards.
- The terminal uses blue as the structural accent; market semantics such as positive/negative values remain distinguishable.
- The historical bottom-bar work remains intact; v100 only changes its visual treatment. Existing chart/feed/CoreSpirit/runtime contracts are unchanged.
