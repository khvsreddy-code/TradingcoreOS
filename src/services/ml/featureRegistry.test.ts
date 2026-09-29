import { buildFeatureVector, validateFeatureVector } from './featureRegistry';
import { HistoricalCandle } from '../brokers/BrokerAdapter';

function syntheticCandles(count = 60): HistoricalCandle[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(1700000000000 + index * 300000).toISOString(),
    open: 100 + index * 0.05,
    high: 101 + index * 0.05,
    low: 99 + index * 0.05,
    close: 100.5 + index * 0.05,
    volume: 1000 + index,
  }));
}

export function runFeatureRegistrySelfTest(): string {
  const values = buildFeatureVector({
    candles: syntheticCandles(),
    timeframe: '5m',
    source: 'test',
  }, ['price.return_1', 'momentum.rsi14', 'volatility.atr14_pct', 'volume.ratio20', 'options.pcr']);
  const result = validateFeatureVector(values);
  if (!result.valid) throw new Error(result.errors.join('; '));
  if (!values.find(value => value.id === 'price.return_1')?.available) throw new Error('price return feature unavailable');
  if (values.find(value => value.id === 'options.pcr')?.available) throw new Error('missing options data was fabricated');
  return 'TRADINGCORE_FEATURE_REGISTRY_TEST=PASS';
}
