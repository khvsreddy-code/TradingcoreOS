import { useEffect, useRef, type MutableRefObject } from 'react';
import type { NormalizedMarketTick } from '../../../types/market';
import { chartMarketKey, chartMarketStore } from '../../../services/marketData/chartMarketStore';
import { chartPerformanceTelemetry } from '../../../services/marketData/chartPerformanceTelemetry';

export type ChartRealtimeFeedHandlers = {
  onTick: (tick: NormalizedMarketTick) => void;
};

/**
 * Subscribes a chart renderer directly to the external market-data store.
 * No React state update occurs when a tick arrives.
 */
export function useChartRealtimeFeed(brokerId: string, instrumentKey: string, handlers: ChartRealtimeFeedHandlers): MutableRefObject<NormalizedMarketTick | undefined> {
  const latestTick = useRef<NormalizedMarketTick | undefined>(chartMarketStore.getTick(chartMarketKey(brokerId, instrumentKey)));
  const handlerRef = useRef(handlers.onTick);
  handlerRef.current = handlers.onTick;

  useEffect(() => {
    const key = chartMarketKey(brokerId, instrumentKey);
    latestTick.current = chartMarketStore.getTick(key);
    const unsubscribe = chartMarketStore.subscribe(key, () => {
      const tick = chartMarketStore.getTick(key);
      if (!tick) return;
      latestTick.current = tick;
      const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
      try {
        handlerRef.current(tick);
      } finally {
        const finished = typeof performance !== 'undefined' ? performance.now() : Date.now();
        chartPerformanceTelemetry.recordRendererUpdate(key, Math.max(0, finished - started));
      }
    });
    return unsubscribe;
  }, [brokerId, instrumentKey]);

  return latestTick;
}
