# CoreSpirit v39 — Deep Stages 1–16

This release consolidates the CoreSpirit architecture into a single contract-driven roadmap. It adds a 16-stage dependency model, execution lifecycle rules, sandbox quotas/capabilities, source metadata extraction, and an end-to-end architecture contract around the EMA + RSI example.

The most important rule is: **one language, one compiler, one stable IR, one VM, multiple execution environments**.

Production concerns are deliberately separated into language/runtime concerns and TradingCoreOS platform concerns. CoreSpirit calculates and emits; the platform controls risk and execution.
