/**
 * First executable CoreSpirit conversion of the user-supplied LuxAlgo Smart Money
 * Concepts Pine v5 indicator.
 *
 * Supported in this initial port:
 * - rolling swing high/low levels
 * - bullish/bearish structure breaks, classified as BOS or CHoCH by retained trend bias
 * - three-candle bullish/bearish Fair Value Gap zones
 *
 * Not ported in this initial pass: Pine custom types/arrays, mutable object pools,
 * internal-vs-swing pivot engines, order blocks/mitigation, MTF security levels,
 * equal-high/low pivot confirmation, and premium/discount zones. Those require
 * additional CoreSpirit state/visual contracts and are deliberately not faked here.
 */
export const CORESPIRIT_LUXALGO_SMC_SOURCE = `indicator("Smart Money Concepts [CoreSpirit]") {
    overlay: true
    input swingLength: int = 5 min=2 max=50
    input showStructureLevels: bool = true
    input showStructureBreaks: bool = true
    input showFairValueGaps: bool = true
}

rollingHigh = highest(high, swingLength)
rollingLow = lowest(low, swingLength)
swingHigh = rollingHigh[1]
swingLow = rollingLow[1]

// The prior rolling extremes act as confirmed, causal structure levels.
if showStructureLevels {
    plot(swingHigh, "#F23645", 1, 0, "Swing High")
    plot(swingLow, "#089981", 1, 0, "Swing Low")
}

bullishBreak = crossover(close, swingHigh)
bearishBreak = crossunder(close, swingLow)
let structureBias: state<int> = 0

if showStructureBreaks and bullishBreak and structureBias < 0 {
    label("CHoCH ↑", "below", "#089981", "#FFFFFF", 10, "pill")
}
if showStructureBreaks and bullishBreak and structureBias >= 0 {
    label("BOS ↑", "below", "#089981", "#FFFFFF", 10, "pill")
}
if showStructureBreaks and bearishBreak and structureBias > 0 {
    label("CHoCH ↓", "above", "#F23645", "#FFFFFF", 10, "pill")
}
if showStructureBreaks and bearishBreak and structureBias <= 0 {
    label("BOS ↓", "above", "#F23645", "#FFFFFF", 10, "pill")
}
if bullishBreak {
    structureBias := 1
}
if bearishBreak {
    structureBias := -1
}

// Three-candle imbalance: the current low/high does not overlap two bars back.
bullishFvg = low > high[2] and close > open
bearishFvg = high < low[2] and close < open
if showFairValueGaps and bullishFvg {
    zone(time[2], time, low, high[2], "#00FF68", "#00FF68", 0.12)
}
if showFairValueGaps and bearishFvg {
    zone(time[2], time, low[2], high, "#FF0008", "#FF0008", 0.12)
}
`;
