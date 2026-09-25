# CoreSpirit v40 — Trading-Native Layered Platform

CoreSpirit is no longer modeled as one monolithic script language. It is a shared language/runtime ecosystem with four abstraction layers that compile into the same artifact family.

## 1. CoreSpirit Script

Purpose: simple trading-native calculations, visuals, and signals.

`series + indicators + visuals + signals`

## 2. CoreSpirit Model

Purpose: deterministic feature engineering and typed model outputs. The model layer describes features and outputs; training/deployment infrastructure remains outside the language VM.

`features -> model output`

## 3. CoreSpirit Strategy

Purpose: turn observations/model outputs into declarative strategy events.

`conditions -> entry/exit/position intent`

## 4. CoreSpirit Automation

Purpose: orchestrate approved signals/strategy events under explicit platform policy. `market.buy()` creates an order intent; it is not a direct broker call. `execute(intent)` is a mediated platform capability, not a raw venue API.

## Shared runtime rule

All four layers ultimately use the same lexer/parser/type system/IR/artifact/VM family where applicable. Layer capability profiles restrict what each layer is permitted to do.

No layer has:
- broker credentials
- direct broker API access
- direct account mutation
- raw networking
- filesystem access
- arbitrary process execution

## Product target

The same program ecosystem can support:

`Chart -> Research -> Model -> Strategy -> Automation -> Risk -> Execution`

without creating a second language or second runtime for each surface.
