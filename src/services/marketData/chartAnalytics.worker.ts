import { buildChartAnalytics } from './levelEngine';
import type { CanonicalMarketDataPacket } from '../core/data/canonicalMarketDataTransport';
import type { HistoricalCandle } from '../brokers/BrokerAdapter';

function packetToCandles(packet: CanonicalMarketDataPacket): HistoricalCandle[] {
  const rows = new Array<HistoricalCandle>(packet.length);
  for (let i = 0; i < packet.length; i += 1) {
    rows[i] = {
      timestamp: new Date(packet.time[i]! * 1000).toISOString(),
      open: packet.open[i]!,
      high: packet.high[i]!,
      low: packet.low[i]!,
      close: packet.close[i]!,
      volume: packet.volume[i] || 0,
    };
  }
  return rows;
}

self.onmessage = (event: MessageEvent<{ requestId: number; market: CanonicalMarketDataPacket; spot: number }>) => {
  const { requestId, market, spot } = event.data;
  try {
    const analytics = buildChartAnalytics(packetToCandles(market), spot);
    self.postMessage({ requestId, analytics });
  } catch (error: any) {
    self.postMessage({ requestId, error: error?.message || 'Chart analytics worker failed' });
  }
};

export {};
