import { buildTradingCoreVStructure, tradingCoreVPriceAction } from './structureEngine';
import { HistoricalCandle } from '../brokers/BrokerAdapter';

const bars: HistoricalCandle[] = [];
for (let i = 0; i < 180; i++) {
  const base = 100 + Math.sin(i / 8) * 4 + (i > 90 ? 2 : 0);
  const close = base + Math.sin(i / 3) * 0.8;
  const open = close + (i % 2 ? -0.25 : 0.2);
  const high = Math.max(open, close) + 0.8 + (i % 17 === 0 ? 4 : 0);
  const low = Math.min(open, close) - 0.8 - (i % 23 === 0 ? 4 : 0);
  bars.push({
    timestamp: new Date(1_700_000_000_000 + i * 60_000).toISOString(),
    open, high, low, close, volume: 1000 + (i % 11) * 150,
  });
}

const result = buildTradingCoreVStructure(bars, { fractalPeriod: 5, impulseAtrMultiplier: 1.2, lookback: 150 });
if (!result.atr || !result.levels.length) throw new Error('Structure engine did not produce ATR/levels');
if (result.levels.some(x => !Number.isFinite(x.price) || x.score < 0 || x.score > 1)) throw new Error('Invalid structure level');
if (result.zones.some(x => x.upper < x.lower || x.score < 0 || x.score > 1 || x.mitigated)) throw new Error('Invalid unmitigated zone');

const mtf = tradingCoreVPriceAction(bars, 5, 1.2, 150, [3, 12]);
if (!mtf.confluence || mtf.confluence.length !== 3) throw new Error('MTF confluence missing');
if (mtf.levels.some(x => x.side !== 'support' && x.side !== 'resistance')) throw new Error('Invalid level side');

const malformed = [...bars];
malformed[20] = { ...malformed[20], high: malformed[20].low - 1 };
const guarded = buildTradingCoreVStructure(malformed);
if (guarded.levels.some(x => !Number.isFinite(x.price))) throw new Error('Malformed candle leaked into structure output');

console.log('TRADINGCORE_V_STRUCTURE_TEST=PASS');
