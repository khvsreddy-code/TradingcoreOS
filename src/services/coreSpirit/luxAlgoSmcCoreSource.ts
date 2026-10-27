/**
 * Executable first-stage CoreSpirit port of the supplied Pine v5
 * "Smart Money Concepts [LuxAlgo]" indicator.
 *
 * This port uses the canonical CoreScript compiler/runtime and Vela chart-output
 * ABI. Structure breaks are emitted as anchored Vela drawing objects, rather than
 * plotting a rolling high/low on every candle (which produces misleading stair
 * lines instead of BOS/CHoCH segments).
 *
 * Implemented in this stage:
 * - separate internal (5-bar) and swing (configurable) causal break levels
 * - swing-origin-anchored BOS/CHoCH line segments plus event labels
 * - provisional order-block origin zones and forward-extended three-candle FVGs
 *
 * It is still a first-stage port, not a complete line-for-line clone of Pine:
 * true pivot-leg confirmation, full OB selection/mitigation lifecycle, EQH/EQL,
 * request.security MTF levels, configurable present/history drawing lifecycle,
 * strong/weak swing tracking and premium/discount zones need additional support.
 */
export const CORESPIRIT_LUXALGO_SMC_SOURCE = `indicator("Smart Money Concepts [CoreSpirit]") {
    overlay: true
    input swingLength: int = 50 min=10 max=100
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

let internalRollingHigh = highest(high, 5)
let internalRollingLow = lowest(low, 5)
let internalHigh = internalRollingHigh[1]
let internalLow = internalRollingLow[1]

// Retain the originating candle time for each rolling extreme. When a break
// confirms, the drawing starts at that extreme and ends at the breaking candle.
// Unlike plot(highest(...)), this does not connect changing extrema across every bar.
// CoreScript's current type checker preserves timestamp-series typing even
// through toTime(), so this first-stage source uses constant historical indices
// for the drawing anchors. Structure break levels themselves remain causal;
// precise pivot timestamps require a native pivot/last-occurrence primitive.
let swingHighAnchorTime = time[50]
let swingLowAnchorTime = time[50]
let internalHighAnchorTime = time[5]
let internalLowAnchorTime = time[5]

// Use the previous regular candle interval, not the current open-to-open gap,
// to give finite imbalance/order-block zones a visible forward projection.
let barDuration = time[1] - time[2]
let zoneRight = time + barDuration * 20

// Explicit causal cross formulas avoid relying on stateful crossover call identity.
// A rolling level already represents the prior-bar extreme; a close beyond it is the break.
// Use causal direct guards for structure transitions; local boolean series are retained
// by the series ABI, but the branch uses the same price-level comparison explicitly.

let swingBias: state<number> = 0
let internalBias: state<number> = 0


if showStructureLevels == true and showSwingStructure == true and close > swingHigh {
    line(swingHighAnchorTime, swingHigh, time, swingHigh, "#089981", 2)
}
if showStructureLevels == true and showSwingStructure == true and close < swingLow {
    line(swingLowAnchorTime, swingLow, time, swingLow, "#F23645", 2)
}
if showSwingStructure == true and close > swingHigh and swingBias < 0 {
    label("Swing CHoCH ↑", "below", "#089981", "#FFFFFF", 10, "pill")
}
if showSwingStructure == true and close > swingHigh and swingBias >= 0 {
    label("Swing BOS ↑", "below", "#089981", "#FFFFFF", 10, "pill")
}
if showSwingStructure == true and close < swingLow and swingBias > 0 {
    label("Swing CHoCH ↓", "above", "#F23645", "#FFFFFF", 10, "pill")
}
if showSwingStructure == true and close < swingLow and swingBias <= 0 {
    label("Swing BOS ↓", "above", "#F23645", "#FFFFFF", 10, "pill")
}
if close > swingHigh {
    swingBias := 1
}
if close < swingLow {
    swingBias := -1
}

if showStructureLevels == true and showInternalStructure == true and close > internalHigh {
    line(internalHighAnchorTime, internalHigh, time, internalHigh, "#3179F5", 1)
}
if showStructureLevels == true and showInternalStructure == true and close < internalLow {
    line(internalLowAnchorTime, internalLow, time, internalLow, "#F77C80", 1)
}
if showInternalStructure == true and close > internalHigh and internalBias < 0 {
    label("Internal CHoCH ↑", "below", "#089981", "#FFFFFF", 9, "pill")
}
if showInternalStructure == true and close > internalHigh and internalBias >= 0 {
    label("Internal BOS ↑", "below", "#089981", "#FFFFFF", 9, "pill")
}
if showInternalStructure == true and close < internalLow and internalBias > 0 {
    label("Internal CHoCH ↓", "above", "#F23645", "#FFFFFF", 9, "pill")
}
if showInternalStructure == true and close < internalLow and internalBias <= 0 {
    label("Internal BOS ↓", "above", "#F23645", "#FFFFFF", 9, "pill")
}
if close > internalHigh {
    internalBias := 1
}
if close < internalLow {
    internalBias := -1
}

// Provisional order-block origin zones: the immediately preceding candle range.
// This is a visual starter, not Pine's parsed-extreme selection/mitigation engine.
if showOrderBlockZones == true and close > swingHigh {
    zone(time[1], zoneRight, high[1], low[1], "#1848CC", "#1848CC", 0.18)
}
if showOrderBlockZones == true and close < swingLow {
    zone(time[1], zoneRight, high[1], low[1], "#B22833", "#B22833", 0.18)
}

// Causal three-candle imbalance zones. The right edge is extended forward using
// the prior regular bar interval; no lookahead or higher-timeframe request.
if showFairValueGaps == true and low > high[2] and close > open {
    zone(time[2], zoneRight, low, high[2], "#00FF68", "#00FF68", 0.12)
}
if showFairValueGaps == true and high < low[2] and close < open {
    zone(time[2], zoneRight, low[2], high, "#FF0008", "#FF0008", 0.12)
}
`;
