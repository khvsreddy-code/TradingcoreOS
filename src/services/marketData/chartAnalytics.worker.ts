import { buildChartAnalytics } from './levelEngine';
import { HistoricalCandle } from '../brokers/BrokerAdapter';

self.onmessage = (event: MessageEvent<{ requestId: number; candles: HistoricalCandle[]; spot: number }>) => {
  const { requestId, candles, spot } = event.data;
  try {
    const analytics = buildChartAnalytics(candles, spot);
    self.postMessage({ requestId, analytics });
  } catch (error: any) {
    self.postMessage({ requestId, error: error?.message || 'Chart analytics worker failed' });
  }
};

export {};
