import {
  fetchCoreSpiritDatasetBars,
  resolveCoreSpiritMarketDataset,
} from '../../server/marketData/CoreSpiritDatasetProvider.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const nifty = resolveCoreSpiritMarketDataset('NIFTY_5M');
assert(nifty.symbol === 'NSE:NIFTY50-INDEX' && nifty.resolution === '5' && nifty.intervalMinutes === 5,
  'NIFTY_5M should resolve to the canonical FYERS index symbol and five-minute resolution');
const stock = resolveCoreSpiritMarketDataset('NSE:RELIANCE-EQ_1D');
assert(stock.symbol === 'NSE:RELIANCE-EQ' && stock.resolution === 'D',
  'explicit exchange-qualified equity datasets should retain their canonical symbol');
const sensex = resolveCoreSpiritMarketDataset('SENSEX_1W');
assert(sensex.symbol === 'BSE:SENSEX-INDEX' && sensex.resolution === '1W',
  'SENSEX weekly datasets should resolve to the BSE index');
let invalidName = false;
try { resolveCoreSpiritMarketDataset('NIFTY_5M;DROP_TABLE'); }
catch (error) { invalidName = error instanceof Error && /Unsupported market dataset name/.test(error.message); }
assert(invalidName, 'dataset identifiers must be strict names, not executable/provider paths');

const range = { from: '2025-01-01', to: '2025-01-02' };
const start = Date.parse('2025-01-01T00:00:00.000Z');
const requests: Array<{ symbol: string; resolution: string; from: string; to: string }> = [];
const bars = await fetchCoreSpiritDatasetBars('NIFTY_5M', range, async (dataset, from, to) => {
  requests.push({ symbol: dataset.symbol, resolution: dataset.resolution, from, to });
  const candles: number[][] = [
    [Math.floor((start - 300_000) / 1000), 99, 101, 98, 100, 10],
    ...Array.from({ length: 24 }, (_, index) => {
      const timestamp = Math.floor((start + index * 300_000) / 1000);
      const close = 100 + index / 10;
      return [timestamp, close - 0.1, close + 0.4, close - 0.5, close, 100 + index];
    }),
  ];
  return { s: 'ok', candles };
});
assert(requests.length === 1 && requests[0]?.symbol === 'NSE:NIFTY50-INDEX' && requests[0]?.resolution === '5',
  'provider should call the authenticated history adapter with the resolved symbol and timeframe');
assert(requests[0]!.from < range.from && requests[0]!.to === range.to,
  'provider should include pre-range history for indicator warm-up and stop at the requested end date');
assert(bars.length === 25 && bars[0]!.timestamp < start && bars.every((bar, index) => index === 0 || bar.timestamp > bars[index - 1]!.timestamp),
  'provider should preserve chronological warm-up bars and deduplicate/sort candle timestamps');

let oversizedRejected = false;
try {
  await fetchCoreSpiritDatasetBars('NIFTY_5M', range, async () => ({
    s: 'ok',
    candles: Array.from({ length: 1_537 }, (_, index) => {
      const timestamp = Math.floor((start + index * 60_000) / 1000);
      const close = 100 + index / 100;
      return [timestamp, close, close + 1, close - 1, close, 1000];
    }),
  }));
} catch (error) {
  oversizedRejected = error instanceof Error && /1,024 usable observations/.test(error.message);
}
assert(oversizedRejected, 'provider must fail closed before fetching an oversized HMM training range');

console.log('CORESPIRIT_NAMED_DATASET_PROVIDER_OK');
