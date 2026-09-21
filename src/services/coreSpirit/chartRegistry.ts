export type CoreSpiritChartTarget = {
  chartId: string;
  symbol: string;
  timeframe: string;
  run: (source: string, sourceId?: string) => Promise<{ barsProcessed: number; plotsEmitted: number; signalsEmitted: number; diagnostics: string[] }>;
};

class CoreSpiritChartRegistry {
  private targets = new Map<string, CoreSpiritChartTarget>();
  private activeId: string | null = null;
  register(target: CoreSpiritChartTarget) { this.targets.set(target.chartId, target); if (!this.activeId) this.activeId = target.chartId; return () => { this.targets.delete(target.chartId); if (this.activeId === target.chartId) this.activeId = this.targets.keys().next().value || null; }; }
  activate(chartId: string) { if (this.targets.has(chartId)) this.activeId = chartId; }
  getActive() { return this.activeId ? this.targets.get(this.activeId) || null : null; }
}
export const coreSpiritChartRegistry = new CoreSpiritChartRegistry();
