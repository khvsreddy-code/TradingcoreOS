/**
 * TradingCoreOS chart-grid ceiling.
 *
 * Vela's picker canvas is 4×4, but TradingCoreOS runs at most eight live chart
 * cells in one workspace to keep data fan-out and rendering bounded.
 */
export const WORKSPACE_MAX_CHART_CELLS = 8;
