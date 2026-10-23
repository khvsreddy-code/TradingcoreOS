# Reversal Price — experimental approximation

## Status

This is a TradingCoreOS-native, non-repainting **approximation**, inspired by the five horizontal levels visible in public OptionMate livestream screenshots. It is not claimed to reproduce OptionMate's proprietary formula. We have not verified the source formula, whether it uses option-chain data, or whether its levels recalculate intraday.

## Current calculation

For the last fully completed India-market session, let:

- H = the session high
- L = the session low
- C = the final close
- R = H − L
- P = (H + L + C) / 3

The study plots:

| Label | Formula | Visual role |
| --- | --- | --- |
| Reversal Price R2 | P + R | Outer upper reference |
| Reversal Price R1 | 2P − L | Inner upper reference |
| Trend Decide Price | P | Central reference |
| Reversal Price S1 | 2P − H | Inner lower reference |
| Reversal Price S2 | P − R | Outer lower reference |

The levels are fixed during the current session because they use only the prior completed session. They are anchored to the first available candle of the current session and extend to the latest candle.

## Limitations and validation plan

- The formula is the classic pivot ladder, selected as a transparent baseline—not a claim about the original indicator.
- The implementation does not use live option-chain/OI data and does not train or call an AI model.
- It requires candle history for at least two sessions. If the loaded history does not contain the complete previous session, the output can be inaccurate.
- Before treating it as a trading signal, compare it with timestamped OptionMate chart captures and run out-of-sample tests across multiple instruments and sessions. Evaluate level error, touches/rejections, breakouts, intraday stability, and fees/slippage.
- If new evidence shows a different source—such as a live option-chain calculation—replace the calculation behind this same indicator contract rather than creating a second chart/rendering pipeline.

## Code path

- Calculation: `src/services/marketData/indicatorEngine.ts`
- Rendering: `src/services/core/chart/controllers/ChartIndicatorController.ts`
- Settings schema: `src/services/coreSpirit/indicatorSettingsSchema.ts`
- Calculation test: `src/services/marketData/reversalPriceLevels.test.ts`
