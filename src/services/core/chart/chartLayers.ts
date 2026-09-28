export const CHART_LAYER_ORDER = Object.freeze({
  background: 0,
  grid: 10,
  data: 20,
  indicator: 30,
  structure: 40,
  liquidity: 50,
  drawing: 60,
  marker: 70,
  interaction: 80,
  overlay: 90,
  ui: 100,
} as const);

export type ChartLayerId = keyof typeof CHART_LAYER_ORDER;
export function chartLayerOrder(layer: ChartLayerId): number { return CHART_LAYER_ORDER[layer]; }
