# CoreSpirit v43 — Renderer + Event System

## Stage 46
`VisualScene` is the renderer-neutral ABI. Backend adapters consume scenes and scene diffs; the CoreSpirit runtime has no DOM/canvas/lightweight-charts references in this contract. A deterministic headless renderer is the reference adapter for replay/conformance.

## Stage 47
Signals are immutable typed events routed through a native CoreSpirit event bus. Consumers are priority ordered and per-consumer idempotent. Webhooks use named endpoint keys and an injected host `WebhookSink`; the VM performs no network I/O. The same signal can fan out to chart, alert, webhook, automation, and strategy consumers.

The existing `CoreSpiritOutputDispatcher` now publishes `signal` outputs into the new event system and bridges them to the legacy TradingCoreOS event bus for compatibility.
