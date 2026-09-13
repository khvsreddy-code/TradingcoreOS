import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { IndicatorConfig, series, vwap, bollinger, keltner, donchian, rsi, macd, supertrend, stochastic, ichimoku } from './indicatorEngine';

const workerKinds = new Set([
  'EMA','SMA','HMA','VWAP','Bollinger Bands','Keltner Channels','Donchian Channels','RSI','MACD','ATR','ADX','Stochastic','CCI','OBV','MFI','Supertrend','Ichimoku Cloud'
]);

self.onmessage = (event: MessageEvent<{ id: number; candles: HistoricalCandle[]; configs: IndicatorConfig[] }>) => {
  const { id, candles, configs } = event.data;
  try {
    const results = configs.filter(c => c.enabled && workerKinds.has(c.kind)).map(cfg => {
      if (cfg.kind === 'VWAP') return { id: cfg.id, kind: cfg.kind, data: vwap(candles, cfg.source || 'hlc3') };
      if (cfg.kind === 'Bollinger Bands') return { id: cfg.id, kind: cfg.kind, data: bollinger(candles, cfg.period || 20, cfg.multiplier || 2, cfg.source || 'close') };
      if (cfg.kind === 'Keltner Channels') return { id: cfg.id, kind: cfg.kind, data: keltner(candles, cfg.period || 20, cfg.multiplier || 2, cfg.source || 'close') };
      if (cfg.kind === 'Donchian Channels') return { id: cfg.id, kind: cfg.kind, data: donchian(candles, cfg.period || 20) };
      if (cfg.kind === 'RSI') return { id: cfg.id, kind: cfg.kind, data: rsi(candles, cfg.period || 14, cfg.source || 'close') };
      if (cfg.kind === 'MACD') return { id: cfg.id, kind: cfg.kind, data: macd(candles, cfg.fast || 12, cfg.slow || 26, cfg.signal || 9, cfg.source || 'close') };
      if (cfg.kind === 'Supertrend') return { id: cfg.id, kind: cfg.kind, data: supertrend(candles, cfg.period || 10, cfg.multiplier || 3) };
      if (cfg.kind === 'Stochastic') return { id: cfg.id, kind: cfg.kind, data: stochastic(candles, cfg.period || 14, cfg.smooth || 3, cfg.signal || 3, cfg.source || 'close') };
      if (cfg.kind === 'Ichimoku Cloud') return { id: cfg.id, kind: cfg.kind, data: ichimoku(candles, cfg.period || 9, cfg.slow || 26, cfg.displacement || 26) };
      return { id: cfg.id, kind: cfg.kind, data: series(candles, cfg.kind, cfg) };
    });
    self.postMessage({ id, results });
  } catch (error: any) {
    self.postMessage({ id, error: error?.message || 'Indicator worker failed' });
  }
};

export {};
