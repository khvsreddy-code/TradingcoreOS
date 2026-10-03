import { useEffect, useRef } from 'react';
import type { IChartApi } from '../../../services/core/chart/velaChartFacade';

export type ChartUiEventHandlers = {
  setTimeframe: (timeframe: string) => void;
  toggleOI: () => void;
  toggleDepth: () => void;
  toggleVolume: () => void;
  toggleLevels: () => void;
  openIndicators: () => void;
  togglePredictions: () => void;
  toggleDrawings: () => void;
  setChartType: (type: 'line' | 'candlestick') => void;
  setDrawingTool: (tool: string) => void;
  clearDrawings: () => void;
  undoDrawing: () => void;
  redoDrawing: () => void;
};

/**
 * Workspace-to-chart command bridge. UI commands are DOM/window events today;
 * keeping the bridge in a hook prevents them from sharing a body with the
 * chart's data/rendering lifecycle. No market-data event updates React here.
 */
export function useChartUiEvents({
  chart,
  chartIndex,
  timeframe,
  brokerId,
  instrumentKey,
  handlers,
}: {
  chart: { current?: IChartApi };
  chartIndex?: number;
  timeframe: string;
  brokerId: string;
  instrumentKey: string;
  handlers: ChartUiEventHandlers;
}): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const matches = (detail: any) => detail?.chartIndex == null || detail.chartIndex === chartIndex;
    const onTimeframe = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!matches(detail)) return;
      const next = String(detail?.timeframe || '');
      if (next) handlersRef.current.setTimeframe(next);
    };
    const onToggleOI = (e: Event) => { const d=(e as CustomEvent).detail; if(matches(d)) handlersRef.current.toggleOI(); };
    const onToggleDepth = (e: Event) => { const d=(e as CustomEvent).detail; if(matches(d)) handlersRef.current.toggleDepth(); };
    const onToggleVolume = (e: Event) => { const d=(e as CustomEvent).detail; if(matches(d)) handlersRef.current.toggleVolume(); };
    const onToggleLevels = (e: Event) => { const d=(e as CustomEvent).detail; if(matches(d)) handlersRef.current.toggleLevels(); };
    const onIndicators = (e: Event) => { const d=(e as CustomEvent).detail; if(matches(d)) handlersRef.current.openIndicators(); };
    const onPredictions = (e: Event) => { const d=(e as CustomEvent).detail; if(matches(d)) handlersRef.current.togglePredictions(); };
    const onDrawMenu = (e: Event) => { const d=(e as CustomEvent).detail; if(matches(d)) handlersRef.current.toggleDrawings(); };
    const onChartType = (e: Event) => { const d=(e as CustomEvent).detail || {}; if(matches(d)) handlersRef.current.setChartType(d.type === 'line' ? 'line' : 'candlestick'); };
    const onFit = (e: Event) => { const d=(e as CustomEvent).detail || {}; if(!matches(d)) return; try { chart.current?.timeScale().fitContent(); chart.current?.applyOptions({ autoSize: true }); } catch {} };
    const onTool = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const targetIndex = typeof detail === 'object' ? detail?.chartIndex : undefined;
      if (targetIndex != null && targetIndex !== chartIndex) return;
      const tool = String(typeof detail === 'object' ? (detail?.tool || 'none') : detail || 'none');
      handlersRef.current.setDrawingTool(tool);
    };
    const onClear = (e: Event) => { const d=(e as CustomEvent).detail; if(matches(d)) handlersRef.current.clearDrawings(); };
    const onUndo = (e: Event) => { const d=(e as CustomEvent).detail; if(matches(d)) handlersRef.current.undoDrawing(); };
    const onRedo = (e: Event) => { const d=(e as CustomEvent).detail; if(matches(d)) handlersRef.current.redoDrawing(); };

    const entries: Array<[string, EventListener]> = [
      ['TRADINGCORE_SET_TIMEFRAME', onTimeframe as EventListener],
      ['TRADINGCORE_TOGGLE_OI', onToggleOI as EventListener],
      ['TRADINGCORE_TOGGLE_DEPTH', onToggleDepth as EventListener],
      ['TRADINGCORE_TOGGLE_VOLUME', onToggleVolume as EventListener],
      ['TRADINGCORE_TOGGLE_LEVELS', onToggleLevels as EventListener],
      ['TRADINGCORE_OPEN_INDICATORS', onIndicators as EventListener],
      ['TRADINGCORE_OPEN_PREDICTIONS', onPredictions as EventListener],
      ['TRADINGCORE_OPEN_DRAWINGS', onDrawMenu as EventListener],
      ['TRADINGCORE_CHART_TYPE', onChartType as EventListener],
      ['TRADINGCORE_FIT_CHART', onFit as EventListener],
      ['TRADINGCORE_DRAW_TOOL', onTool as EventListener],
      ['TRADINGCORE_CLEAR_DRAWINGS', onClear as EventListener],
      ['TRADINGCORE_UNDO_DRAWING', onUndo as EventListener],
      ['TRADINGCORE_REDO_DRAWING', onRedo as EventListener],
    ];
    entries.forEach(([name, listener]) => window.addEventListener(name, listener));
    return () => entries.forEach(([name, listener]) => window.removeEventListener(name, listener));
  }, [chart, chartIndex, timeframe, brokerId, instrumentKey]);
}
