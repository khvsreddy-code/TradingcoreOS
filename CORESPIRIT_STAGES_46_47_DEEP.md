# CoreSpirit Stages 46–47 — Rendering ABI + Native Event System

## Stage 46 — Rendering abstraction

The CoreSpirit runtime emits `VisualScene`, not renderer-specific commands.

The stable boundary is:

`CoreSpirit -> VisualScene -> Renderer ABI -> backend`

Supported backend identities:
- web
- desktop
- mobile
- image
- replay
- headless

A renderer owns:
- device coordinates
- pixels/vector output
- hit testing
- pointer/gesture handling
- animation scheduling
- platform lifecycle

CoreSpirit owns:
- node identity
- layer/pane
- anchors
- style/payload
- scene revisions
- deterministic scene checksums

A renderer may implement different capabilities, but it must not reinterpret CoreSpirit semantics.

The headless renderer is the deterministic reference adapter used for replay/conformance.

## Stage 47 — Native events and webhooks

Signals are immutable CoreSpirit events.

One event can fan out to multiple consumers:
`chart`, `alert`, `webhook`, `automation`, `strategy`

The event envelope includes:
- event id
- type
- source/program
- run id
- execution mode
- bar/timestamp
- sequence
- correlation/causation
- dedupe key
- payload

Delivery is ordered by priority and then consumer id. Per-consumer idempotency prevents duplicate delivery.

Webhooks are host capabilities:
- CoreSpirit specifies an endpoint key and payload projection.
- The VM never opens network connections.
- The host supplies the `WebhookSink`.
- The same signal can feed chart/alerts/automation and a webhook without recomputing the signal.

This makes webhook automation part of the event architecture instead of a separate feature.
