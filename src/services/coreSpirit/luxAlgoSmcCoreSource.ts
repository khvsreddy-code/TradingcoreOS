/**
 * CoreSpirit's deterministic first-stage Smart Money Concepts implementation.
 *
 * This deliberately describes the implemented semantics rather than claiming a
 * line-for-line LuxAlgo Pine clone. It uses right-confirmed pivots (the configured
 * lookback bars on both sides), causal BOS/CHoCH transitions, swing-point labels,
 * equal-high/low detection, latest active order-block/FVG lifecycle, current
 * premium/discount ranges and gap-inferred prior-session levels.
 *
 * Still not source-equivalent to the complete LuxAlgo original: the original
 * multi-timeframe request.security graph, all historical OB arrays/mitigation
 * modes, strong/weak swing rules, present-vs-historical drawing modes, and its
 * full input surface require further native semantic support. Prior-session
 * boundaries are inferred from timestamp gaps; hosts with explicit exchange
 * session metadata should supply that contract before this is treated as exact.
 */
export const CORESPIRIT_LUXALGO_SMC_SOURCE = `indicator("Smart Money Concepts [CoreSpirit]") {
    overlay: true
    input swingLength: int = 50 min=10 max=100
    input internalLength: int = 5 min=2 max=20
    input sessionGapBars: int = 3 min=2 max=500
    input equalLevelTolerance: float = 0.0015 min=0.0001 max=0.01
    input showInternalStructure: bool = true
    input showSwingStructure: bool = true
    input showSwingPoints: bool = true
    input showEqualHighsLows: bool = true
    input showStructureLevels: bool = true
    input showOrderBlockZones: bool = true
    input showFairValueGaps: bool = true
    input showPremiumDiscount: bool = true
    input showPreviousSessionLevels: bool = true
}

let barDuration = time[1] - time[2]
let projectedRight = time + barDuration * 20

// A pivot candidate is not usable until swingLength bars have arrived after it.
// The left-side comparison is read at the candidate bar; the right-side window
// ends at the current bar. This deliberately preserves the confirmation delay.
let swingRollingHigh = highest(high, swingLength)
let swingLeftWindowHigh = swingRollingHigh[swingLength]
let swingRightWindowHigh = swingRollingHigh
let swingRollingLow = lowest(low, swingLength)
let swingLeftWindowLow = swingRollingLow[swingLength]
let swingRightWindowLow = swingRollingLow
let swingCandidateHigh = high[swingLength]
let swingCandidateLow = low[swingLength]
let swingPivotHighConfirmed = swingCandidateHigh >= swingLeftWindowHigh and swingCandidateHigh > swingRightWindowHigh
let swingPivotLowConfirmed = swingCandidateLow <= swingLeftWindowLow and swingCandidateLow < swingRightWindowLow

let internalRollingHigh = highest(high, internalLength)
let internalLeftWindowHigh = internalRollingHigh[internalLength]
let internalRightWindowHigh = internalRollingHigh
let internalRollingLow = lowest(low, internalLength)
let internalLeftWindowLow = internalRollingLow[internalLength]
let internalRightWindowLow = internalRollingLow
let internalCandidateHigh = high[internalLength]
let internalCandidateLow = low[internalLength]
let internalPivotHighConfirmed = internalCandidateHigh >= internalLeftWindowHigh and internalCandidateHigh > internalRightWindowHigh
let internalPivotLowConfirmed = internalCandidateLow <= internalLeftWindowLow and internalCandidateLow < internalRightWindowLow

let swingPivotHigh: state<number> = 0
let swingPivotLow: state<number> = 0
let swingPivotHighTime: state<number> = 0
let swingPivotLowTime: state<number> = 0
let swingHighBroken: state<bool> = false
let swingLowBroken: state<bool> = false
let swingBias: state<number> = 0

let internalPivotHigh: state<number> = 0
let internalPivotLow: state<number> = 0
let internalPivotHighTime: state<number> = 0
let internalPivotLowTime: state<number> = 0
let internalHighBroken: state<bool> = false
let internalLowBroken: state<bool> = false
let internalBias: state<number> = 0

let priorSwingPivotHigh = swingPivotHigh
let priorSwingPivotHighTime = swingPivotHighTime
let priorSwingPivotLow = swingPivotLow
let priorSwingPivotLowTime = swingPivotLowTime

if swingPivotHighConfirmed == true {
    swingPivotHigh := swingCandidateHigh
    swingPivotHighTime := time[swingLength]
    swingHighBroken := false
}
if swingPivotLowConfirmed == true {
    swingPivotLow := swingCandidateLow
    swingPivotLowTime := time[swingLength]
    swingLowBroken := false
}
if internalPivotHighConfirmed == true {
    internalPivotHigh := internalCandidateHigh
    internalPivotHighTime := time[internalLength]
    internalHighBroken := false
}
if internalPivotLowConfirmed == true {
    internalPivotLow := internalCandidateLow
    internalPivotLowTime := time[internalLength]
    internalLowBroken := false
}

// Swing structure labels are anchored to the pivot's actual bar/time and price,
// not the later bar on which the right-side confirmation finally arrives.
if showSwingPoints == true and swingPivotHighConfirmed == true and priorSwingPivotHigh <= 0 {
    labelAt(time[swingLength], swingCandidateHigh, "SH", "above", "#F23645", "#FFFFFF", 9, "pill", "600")
}
if showSwingPoints == true and swingPivotHighConfirmed == true and priorSwingPivotHigh > 0 and swingCandidateHigh > priorSwingPivotHigh {
    labelAt(time[swingLength], swingCandidateHigh, "HH", "above", "#F23645", "#FFFFFF", 9, "pill", "600")
}
if showSwingPoints == true and swingPivotHighConfirmed == true and priorSwingPivotHigh > 0 and swingCandidateHigh < priorSwingPivotHigh {
    labelAt(time[swingLength], swingCandidateHigh, "LH", "above", "#F23645", "#FFFFFF", 9, "pill", "600")
}
if showSwingPoints == true and swingPivotLowConfirmed == true and priorSwingPivotLow <= 0 {
    labelAt(time[swingLength], swingCandidateLow, "SL", "below", "#089981", "#FFFFFF", 9, "pill", "600")
}
if showSwingPoints == true and swingPivotLowConfirmed == true and priorSwingPivotLow > 0 and swingCandidateLow > priorSwingPivotLow {
    labelAt(time[swingLength], swingCandidateLow, "HL", "below", "#089981", "#FFFFFF", 9, "pill", "600")
}
if showSwingPoints == true and swingPivotLowConfirmed == true and priorSwingPivotLow > 0 and swingCandidateLow < priorSwingPivotLow {
    labelAt(time[swingLength], swingCandidateLow, "LL", "below", "#089981", "#FFFFFF", 9, "pill", "600")
}

// EQH/EQL is an ATR-free, price-relative tolerance rule. Both candidate levels
// are confirmed pivots, so these labels never use a future unconfirmed extreme.
if showEqualHighsLows == true and swingPivotHighConfirmed == true and priorSwingPivotHigh > 0 and abs(swingCandidateHigh - priorSwingPivotHigh) <= abs(priorSwingPivotHigh) * equalLevelTolerance {
    line(priorSwingPivotHighTime, priorSwingPivotHigh, time[swingLength], swingCandidateHigh, "#F23645", 1)
    labelAt(time[swingLength], swingCandidateHigh, "EQH", "above", "#F23645", "#FFFFFF", 9, "pill", "600")
}
if showEqualHighsLows == true and swingPivotLowConfirmed == true and priorSwingPivotLow > 0 and abs(swingCandidateLow - priorSwingPivotLow) <= abs(priorSwingPivotLow) * equalLevelTolerance {
    line(priorSwingPivotLowTime, priorSwingPivotLow, time[swingLength], swingCandidateLow, "#089981", 1)
    labelAt(time[swingLength], swingCandidateLow, "EQL", "below", "#089981", "#FFFFFF", 9, "pill", "600")
}

// One-shot break events are keyed to the confirmed swing level. Latches prevent
// the same level from generating a fresh BOS/CHoCH on every bar beyond it.
let swingBullBreak = swingPivotHigh > 0 and swingHighBroken == false and close > swingPivotHigh and close[1] <= swingPivotHigh
let swingBearBreak = swingPivotLow > 0 and swingLowBroken == false and close < swingPivotLow and close[1] >= swingPivotLow
let internalBullBreak = internalPivotHigh > 0 and internalHighBroken == false and close > internalPivotHigh and close[1] <= internalPivotHigh
let internalBearBreak = internalPivotLow > 0 and internalLowBroken == false and close < internalPivotLow and close[1] >= internalPivotLow

if showStructureLevels == true and showSwingStructure == true and swingBullBreak == true {
    line(swingPivotHighTime, swingPivotHigh, time, swingPivotHigh, "#089981", 2)
}
if showStructureLevels == true and showSwingStructure == true and swingBearBreak == true {
    line(swingPivotLowTime, swingPivotLow, time, swingPivotLow, "#F23645", 2)
}
if showSwingStructure == true and swingBullBreak == true and swingBias < 0 {
    label("Swing CHoCH ↑", "below", "#089981", "#FFFFFF", 10, "pill")
}
if showSwingStructure == true and swingBullBreak == true and swingBias >= 0 {
    label("Swing BOS ↑", "below", "#089981", "#FFFFFF", 10, "pill")
}
if showSwingStructure == true and swingBearBreak == true and swingBias > 0 {
    label("Swing CHoCH ↓", "above", "#F23645", "#FFFFFF", 10, "pill")
}
if showSwingStructure == true and swingBearBreak == true and swingBias <= 0 {
    label("Swing BOS ↓", "above", "#F23645", "#FFFFFF", 10, "pill")
}
if swingBullBreak == true {
    swingHighBroken := true
    swingBias := 1
}
if swingBearBreak == true {
    swingLowBroken := true
    swingBias := -1
}

if showStructureLevels == true and showInternalStructure == true and internalBullBreak == true {
    line(internalPivotHighTime, internalPivotHigh, time, internalPivotHigh, "#3179F5", 1)
}
if showStructureLevels == true and showInternalStructure == true and internalBearBreak == true {
    line(internalPivotLowTime, internalPivotLow, time, internalPivotLow, "#F77C80", 1)
}
if showInternalStructure == true and internalBullBreak == true and internalBias < 0 {
    label("Internal CHoCH ↑", "below", "#089981", "#FFFFFF", 9, "pill")
}
if showInternalStructure == true and internalBullBreak == true and internalBias >= 0 {
    label("Internal BOS ↑", "below", "#089981", "#FFFFFF", 9, "pill")
}
if showInternalStructure == true and internalBearBreak == true and internalBias > 0 {
    label("Internal CHoCH ↓", "above", "#F23645", "#FFFFFF", 9, "pill")
}
if showInternalStructure == true and internalBearBreak == true and internalBias <= 0 {
    label("Internal BOS ↓", "above", "#F23645", "#FFFFFF", 9, "pill")
}
if internalBullBreak == true {
    internalHighBroken := true
    internalBias := 1
}
if internalBearBreak == true {
    internalLowBroken := true
    internalBias := -1
}

// Track the most recent opposite candle as a displacement-origin candidate.
// This is explicitly a latest-zone model, not the original's full OB array.
let lastBearishTime: state<number> = 0
let lastBearishHigh: state<number> = 0
let lastBearishLow: state<number> = 0
let lastBullishTime: state<number> = 0
let lastBullishHigh: state<number> = 0
let lastBullishLow: state<number> = 0
if close < open {
    lastBearishTime := time[0]
    lastBearishHigh := high[0]
    lastBearishLow := low[0]
}
if close > open {
    lastBullishTime := time[0]
    lastBullishHigh := high[0]
    lastBullishLow := low[0]
}

let bullObExists: state<bool> = false
let bullObActive: state<bool> = false
let bullObLeft: state<number> = 0
let bullObRight: state<number> = 0
let bullObTop: state<number> = 0
let bullObBottom: state<number> = 0
let bullObCreatedAt: state<number> = 0
let bullObOpacity: state<number> = 0.16
let bearObExists: state<bool> = false
let bearObActive: state<bool> = false
let bearObLeft: state<number> = 0
let bearObRight: state<number> = 0
let bearObTop: state<number> = 0
let bearObBottom: state<number> = 0
let bearObCreatedAt: state<number> = 0
let bearObOpacity: state<number> = 0.16

if showOrderBlockZones == true and swingBullBreak == true and lastBearishTime > 0 {
    bullObExists := true
    bullObActive := true
    bullObLeft := lastBearishTime
    bullObRight := projectedRight
    bullObTop := lastBearishHigh
    bullObBottom := lastBearishLow
    bullObCreatedAt := time
    bullObOpacity := 0.16
}
if showOrderBlockZones == true and swingBearBreak == true and lastBullishTime > 0 {
    bearObExists := true
    bearObActive := true
    bearObLeft := lastBullishTime
    bearObRight := projectedRight
    bearObTop := lastBullishHigh
    bearObBottom := lastBullishLow
    bearObCreatedAt := time
    bearObOpacity := 0.16
}
if bullObActive == true and time > bullObCreatedAt and low < bullObBottom {
    bullObActive := false
    bullObRight := time
    bullObOpacity := 0.04
}
if bearObActive == true and time > bearObCreatedAt and high > bearObTop {
    bearObActive := false
    bearObRight := time
    bearObOpacity := 0.04
}
if bullObActive == true {
    bullObRight := projectedRight
}
if bearObActive == true {
    bearObRight := projectedRight
}
if showOrderBlockZones == true and bullObExists == true {
    zone(bullObLeft, bullObRight, bullObTop, bullObBottom, "#1848CC", "#1848CC", bullObOpacity)
}
if showOrderBlockZones == true and bearObExists == true {
    zone(bearObLeft, bearObRight, bearObTop, bearObBottom, "#B22833", "#B22833", bearObOpacity)
}

// Keep the most recent bullish/bearish fair-value gap as a retained object.
// Re-emission uses the same output call-site + left-time identity; the output
// collector upserts the geometry instead of manufacturing a new rectangle per bar.
let bullFvgExists: state<bool> = false
let bullFvgActive: state<bool> = false
let bullFvgLeft: state<number> = 0
let bullFvgRight: state<number> = 0
let bullFvgTop: state<number> = 0
let bullFvgBottom: state<number> = 0
let bullFvgCreatedAt: state<number> = 0
let bullFvgOpacity: state<number> = 0.12
let bearFvgExists: state<bool> = false
let bearFvgActive: state<bool> = false
let bearFvgLeft: state<number> = 0
let bearFvgRight: state<number> = 0
let bearFvgTop: state<number> = 0
let bearFvgBottom: state<number> = 0
let bearFvgCreatedAt: state<number> = 0
let bearFvgOpacity: state<number> = 0.12

if showFairValueGaps == true and low > high[2] {
    bullFvgExists := true
    bullFvgActive := true
    bullFvgLeft := time[2]
    bullFvgRight := projectedRight
    bullFvgTop := low[0]
    bullFvgBottom := high[2]
    bullFvgCreatedAt := time
    bullFvgOpacity := 0.12
}
if showFairValueGaps == true and high < low[2] {
    bearFvgExists := true
    bearFvgActive := true
    bearFvgLeft := time[2]
    bearFvgRight := projectedRight
    bearFvgTop := low[2]
    bearFvgBottom := high[0]
    bearFvgCreatedAt := time
    bearFvgOpacity := 0.12
}
if bullFvgActive == true and time > bullFvgCreatedAt and low <= bullFvgBottom {
    bullFvgActive := false
    bullFvgRight := time
    bullFvgOpacity := 0.03
}
if bearFvgActive == true and time > bearFvgCreatedAt and high >= bearFvgTop {
    bearFvgActive := false
    bearFvgRight := time
    bearFvgOpacity := 0.03
}
if bullFvgActive == true {
    bullFvgRight := projectedRight
}
if bearFvgActive == true {
    bearFvgRight := projectedRight
}
if showFairValueGaps == true and bullFvgExists == true {
    zone(bullFvgLeft, bullFvgRight, bullFvgTop, bullFvgBottom, "#00FF68", "#00FF68", bullFvgOpacity)
}
if showFairValueGaps == true and bearFvgExists == true {
    zone(bearFvgLeft, bearFvgRight, bearFvgTop, bearFvgBottom, "#FF0008", "#FF0008", bearFvgOpacity)
}

// The latest confirmed high/low define the current dealing range. These zones
// end at the current bar, so a new swing range does not create a future-spanning
// stale premium/discount overlay.
let premiumDiscountLeft: state<number> = 0
if swingPivotHighConfirmed == true {
    premiumDiscountLeft := time[swingLength]
}
if swingPivotLowConfirmed == true {
    premiumDiscountLeft := time[swingLength]
}
let swingEquilibrium = (swingPivotHigh + swingPivotLow) / 2
if showPremiumDiscount == true and swingPivotHigh > swingPivotLow and premiumDiscountLeft > 0 {
    zone(premiumDiscountLeft, time, swingPivotHigh, swingEquilibrium, "#F23645", "#F23645", 0.06)
    zone(premiumDiscountLeft, time, swingEquilibrium, swingPivotLow, "#089981", "#089981", 0.06)
    line(premiumDiscountLeft, swingEquilibrium, time, swingEquilibrium, "#787B86", 1)
}

// Approximate prior-session levels from a configurable gap between bars. This
// keeps the indicator deterministic without inventing an exchange calendar.
let runningSessionHigh: state<number> = 0
let runningSessionLow: state<number> = 0
let priorSessionHigh: state<number> = 0
let priorSessionLow: state<number> = 0
if runningSessionHigh <= 0 {
    runningSessionHigh := high[0]
    runningSessionLow := low[0]
}
if time > time[1] and barDuration > 0 and time - time[1] > barDuration * sessionGapBars and runningSessionHigh > 0 {
    priorSessionHigh := runningSessionHigh
    priorSessionLow := runningSessionLow
    runningSessionHigh := high[0]
    runningSessionLow := low[0]
}
if high > runningSessionHigh {
    runningSessionHigh := high[0]
}
if low < runningSessionLow {
    runningSessionLow := low[0]
}
if showPreviousSessionLevels == true and priorSessionHigh > 0 {
    hline(priorSessionHigh, "#F5A623", 1)
}
if showPreviousSessionLevels == true and priorSessionLow > 0 {
    hline(priorSessionLow, "#3B82F6", 1)
}
`;
