import type { CoreSpiritUiState } from './uiRuntime';
import type { CoreSpiritWorkspaceState } from './workspaceRuntime';
import type { CoreSpiritMarketBar } from './marketData';
import type { CoreSpiritExecutableArtifact } from './artifact';
export type CoreSpiritChartRunResult = {
  barsProcessed:number;plotsEmitted:number;signalsEmitted:number;diagnostics:string[];
  diagnosticDetails?:readonly import('./coreSpiritWorkerPool').CoreSpiritExecutionDiagnostic[];
  runId?:string;outputs?:readonly import('./types').CoreSpiritObject[];
  state?:{uiState?:CoreSpiritUiState;workspaceState?:CoreSpiritWorkspaceState};
};
export type CoreSpiritChartTarget = {
  chartId:string;
  symbol:string;
  timeframe:string;
  getBars?:()=>readonly CoreSpiritMarketBar[];
  run:(source:string,sourceId?:string)=>Promise<CoreSpiritChartRunResult>;
  /** Transactional source replacement: preserve current visuals unless the compiled artifact completes successfully. */
  updateCode?:(source:string,artifact:CoreSpiritExecutableArtifact,sourceId?:string)=>Promise<CoreSpiritChartRunResult>;
};

class CoreSpiritChartRegistry {
  private targets = new Map<string, CoreSpiritChartTarget>();
  private activeId: string | null = null;
  register(target: CoreSpiritChartTarget) { this.targets.set(target.chartId, target); if (!this.activeId) this.activeId = target.chartId; return () => { this.targets.delete(target.chartId); if (this.activeId === target.chartId) this.activeId = this.targets.keys().next().value || null; }; }
  activate(chartId: string) { if (this.targets.has(chartId)) this.activeId = chartId; }
  getActive() { return this.activeId ? this.targets.get(this.activeId) || null : null; }
}
export const coreSpiritChartRegistry = new CoreSpiritChartRegistry();
