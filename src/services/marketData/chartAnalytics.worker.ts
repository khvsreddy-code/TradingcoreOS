import { buildChartAnalytics } from './levelEngine';
import { HistoricalCandle } from '../brokers/BrokerAdapter';

self.onmessage = (event: MessageEvent<{ id: number; candles: HistoricalCandle[]; spot: number }>) => {
  const { id, candles, spot } = event.data;
  try {
    const analytics = buildChartAnalytics(candles, spot);
    self.postMessage({ id, analytics });
  } catch (error: any) {
    self.postMessage({ id, error: error?.message || 'Chart analytics worker failed' });
  }
};

export {};
