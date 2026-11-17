import type { HistoricalCandle } from '../../brokers/BrokerAdapter';
import type { ChartAnalytics } from '../../marketData/levelEngine';
import type { AutomationConfig } from '../workspace/workspaceState';
import { markerForAutomation } from './chartRuntimeSupport';
import type { ISeriesApi } from './velaNativeChartKernel';

type Ref<T> = { current: T };
type PriceLineHandle = ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>;
type AutomationMarker = { time: number; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown'; text: string; size: 'small' };

export type ChartAnnotationController = {
  renderLevels(analytics?: ChartAnalytics | null): void;
  renderAutomations(automations: readonly AutomationConfig[], data?: readonly HistoricalCandle[]): void;
  dispose(): void;
};
export type ChartAnnotationControllerDeps = {
  candle: Ref<ISeriesApi<'Candlestick'> | null>;
  candles: Ref<HistoricalCandle[]>;
  isLevelsVisible: () => boolean;
  setMarkers: (namespace: string, markers: readonly AutomationMarker[]) => void;
};

/** Projects analytic annotations into Vela; marker storage stays in the shared native marker owner. */
export function createChartAnnotationController(deps: ChartAnnotationControllerDeps): ChartAnnotationController {
  let latestAnalytics: ChartAnalytics | null = null;
  let levelLines: PriceLineHandle[] = [];
  let levelSignature = '';
  let automationSignature = '';
  const clearLevelLines = () => {
    for (const line of levelLines) { try { line.remove(); } catch { /* chart may already be disposed */ } }
    levelLines = [];
  };
  const renderLevels = (analytics: ChartAnalytics | null = latestAnalytics) => {
    latestAnalytics = analytics;
    if (!deps.isLevelsVisible() || !analytics) {
      if (levelLines.length) clearLevelLines();
      levelSignature = '';
      return;
    }
    const levels = [...analytics.support.slice(0, 6), ...analytics.resistance.slice(0, 6)].filter(level => Number.isFinite(Number(level.price)));
    const nextSignature = levels.map(level => [level.side, level.price, level.state, level.strength ?? ''].join(':')).join('|');
    if (nextSignature === levelSignature) return;
    clearLevelLines();
    levelSignature = nextSignature;
    const candle = deps.candle.current;
    if (!candle || !levels.length) return;
    for (const level of levels) {
      const broken = level.state === 'BROKEN';
      const base = level.side === 'support' ? '#3b82f6' : '#ef4444';
      const title = (broken ? 'BROKEN · ' : '') + (level.side === 'support' ? 'S' : 'R') + (level.strength != null ? ' · ' + Math.round(level.strength * 100) + '%' : '');
      try { levelLines.push(candle.createPriceLine({ price: Number(level.price), color: broken ? '#64748b' : base, lineWidth: broken ? 1 : Math.max(1, Math.min(3, Math.round((level.strength || 0.5) * 3))), lineStyle: broken ? 2 : 0, axisLabelVisible: true, title })); }
      catch { /* invalid/stale level cannot interrupt a chart update */ }
    }
  };
  const renderAutomations = (automations: readonly AutomationConfig[], data: readonly HistoricalCandle[] = deps.candles.current) => {
    const markers: AutomationMarker[] = [];
    if (data.length >= 3) for (const automation of automations) {
      const signal = markerForAutomation(automation, data as HistoricalCandle[]);
      if (!signal || !Number.isFinite(signal.time)) continue;
      markers.push({ time: signal.time, position: signal.position, color: signal.color, shape: signal.shape, text: automation.name + ' · ' + signal.text, size: 'small' });
    }
    const nextSignature = markers.map(marker => [marker.time, marker.position, marker.color, marker.shape, marker.text].join(':')).join('|');
    if (nextSignature === automationSignature) return;
    automationSignature = nextSignature;
    deps.setMarkers('automation', markers);
  };
  const dispose = () => { clearLevelLines(); latestAnalytics = null; levelSignature = ''; automationSignature = ''; deps.setMarkers('automation', []); };
  return { renderLevels, renderAutomations, dispose };
}
