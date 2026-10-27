/**
 * Executable first-stage CoreSpirit port of the supplied Pine v5
 * "Smart Money Concepts [LuxAlgo]" indicator.
 *
 * This deliberately uses only the canonical CoreScript compiler/runtime and its
 * chart-output ABI. Structure levels are causal rolling extremes, not a byte-for-
 * byte recreation of Pine's custom pivot objects.
 *
 * Implemented in this stage:
 * - separate internal (default 5 bars) and swing (default 50 bars) structure levels
 * - BOS/CHoCH labels with independent retained trend bias for both structures
 * - optional order-block-like origin zones on structure breaks (last-bar range;
 *   explicitly an approximation until the runtime supports Pine's mutable OB pools)
 * - three-candle bullish/bearish FVG zones
 *
 * Still not equivalent to the full Pine source: Pine custom types/object arrays,
 * true leg/pivot confirmation, OB selection/mitigation lifecycle, EQH/EQL pivot
 * confirmation, request.security MTF levels, configurable historical/present
 * drawing lifecycle, strong/weak swing tracking, and premium/discount zones.
 * Those are not silently claimed as converted.
 */
export const CORESPIRIT_LUXALGO_SMC_SOURCE = `indicator("Smart Money Concepts [CoreSpirit]") {
    overlay: true
    input swingLength: int = 50 min=10 max=100
    input internalBars: int = 5 min=2 max=20
    input showInternalStructure: bool = true
    input showSwingStructure: bool = true
    input showStructureLevels: bool = true
    input showOrderBlockZones: bool = true
    input showFairValueGaps: bool = true
}

let swingRollingHigh = highest(high, swingLength)
let swingRollingLow = lowest(low, swingLength)
let swingHigh = swingRollingHigh[1]
let swingLow = swingRollingLow[1]

let internalRollingHigh = highest(high, internalBars)
let internalRollingLow = lowest(low, internalBars)
let internalHigh = internalRollingHigh[1]
let internalLow = internalRollingLow[1]

// Previous-bar extremes avoid using the still-forming current bar as its own level.
if showStructureLevels == true and showSwingStructure == true {
    plot(swingHigh, "#F23645", 1, 0, "Swing High")
    plot(swingLow, "#089981", 1, 0, "Swing Low")
}
if showStructureLevels == true and showInternalStructure == true {
    plot(internalHigh, "#F77C80", 1, 0, "Internal High")
    plot(internalLow, "#3179F5", 1, 0, "Internal Low")
}

// Explicit causal cross formulas avoid relying on stateful crossover call identity.
// A rolling level already represents the prior-bar extreme; a close beyond it is the break.
let swingBullishBreak = close > swingHigh
let swingBearishBreak = close < swingLow
let internalBullishBreak = close > internalHigh
let internalBearishBreak = close < internalLow

let swingBias: state<number> = 0
let internalBias: state<number> = 0

// TEMPORARY TEST PROBES — remove after bearish-break diagnosis.
if close < 90 {
    label("DEBUG close below 90", "below", "#FFFFFF", "#000000", 9, "pill")
}
if close < swingLow {
    label("DEBUG close below swing low", "below", "#FFFFFF", "#000000", 9, "pill")
}
if swingBearishBreak {
    label("DEBUG swing bearish break", "below", "#FFFFFF", "#000000", 9, "pill")
}
if close < 90 and swingBias > 0 {
    label("DEBUG positive swing bias", "below", "#FFFFFF", "#000000", 9, "pill")
}

if showSwingStructure == true and swingBullishBreak and swingBias < 0 {
    label("Swing CHoCH ↑", "below", "#089981", "#FFFFFF", 10, "pill")
}
if showSwingStructure == true and swingBullishBreak and swingBias >= 0 {
    label("Swing BOS ↑", "below", "#089981", "#FFFFFF", 10, "pill")
}
if showSwingStructure == true and swingBearishBreak and swingBias > 0 {
    label("Swing CHoCH ↓", "above", "#F23645", "#FFFFFF", 10, "pill")
}
if showSwingStructure == true and swingBearishBreak and swingBias <= 0 {
    label("Swing BOS ↓", "above", "#F23645", "#FFFFFF", 10, "pill")
}
if swingBullishBreak {
    swingBias := 1
}
if swingBearishBreak {
    swingBias := -1
}

if showInternalStructure == true and internalBullishBreak and internalBias < 0 {
    label("Internal CHoCH ↑", "below", "#089981", "#FFFFFF", 9, "pill")
}
if showInternalStructure == true and internalBullishBreak and internalBias >= 0 {
    label("Internal BOS ↑", "below", "#089981", "#FFFFFF", 9, "pill")
}
if showInternalStructure == true and internalBearishBreak and internalBias > 0 {
    label("Internal CHoCH ↓", "above", "#F23645", "#FFFFFF", 9, "pill")
}
if showInternalStructure == true and internalBearishBreak and internalBias <= 0 {
    label("Internal BOS ↓", "above", "#F23645", "#FFFFFF", 9, "pill")
}
if internalBullishBreak {
    internalBias := 1
}
if internalBearishBreak {
    internalBias := -1
}

// Provisional order-block origin zones: the immediately preceding candle range.
// This is a visual starter, not Pine's parsed-extreme selection/mitigation engine.
if showOrderBlockZones == true and swingBullishBreak {
    zone(time[1], time, high[1], low[1], "#1848CC", "#1848CC", 0.18)
}
if showOrderBlockZones == true and swingBearishBreak {
    zone(time[1], time, high[1], low[1], "#B22833", "#B22833", 0.18)
}

// Causal three-candle imbalance zones. No lookahead or higher-timeframe request.
let bullishFvg = low > high[2] and close > open
let bearishFvg = high < low[2] and close < open
if showFairValueGaps == true and bullishFvg {
    zone(time[2], time, low, high[2], "#00FF68", "#00FF68", 0.12)
}
if showFairValueGaps == true and bearishFvg {
    zone(time[2], time, low[2], high, "#FF0008", "#FF0008", 0.12)
}
`;
