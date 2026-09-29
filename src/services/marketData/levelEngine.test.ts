import { buildChartAnalytics } from './levelEngine';
import { buildTradingCoreVStructure } from './structureEngine';
import { HistoricalCandle } from '../brokers/BrokerAdapter';

const bars: HistoricalCandle[] = [];
for (let i = 0; i < 320; i++) {
  const base = 100 + Math.sin(i / 10) * 5 + Math.sin(i / 3) * 0.7;
  const close = base + (i % 5 === 0 ? 1.2 : -0.3);
  const open = close - (i % 2 ? 0.4 : -0.25);
  const high = Math.max(open, close) + 0.8;
  const low = Math.min(open, close) - 0.8;
  bars.push({
    timestamp: new Date(1_700_100_000_000 + i * 60_000).toISOString(),
    open, high, low, close, volume: 1000 + (i % 17) * 50,
  });
}

const spot = bars.at(-1)!.close;
const canonical = buildTradingCoreVStructure(bars, {
  fractalPeriod: 5,
  lookback: 300,
  maxLevels: 60,
  clusterAtrTolerance: 0.5,
});
const analytics = buildChartAnalytics(bars, spot, {
  pivotLength: 5,
  lookbackPeriod: 300,
  maxLevelsPerType: 30,
});

if (!analytics.structure) throw new Error('Levels did not expose canonical structure output');
if (!analytics.structure.levels.length || !canonical.levels.length) throw new Error('Canonical structure produced no levels');

const canonicalPrices = new Set(canonical.levels.map(x => Math.round(x.price * 100) / 100));
const structuralLevels = [...analytics.support, ...analytics.resistance]
  .filter(x => x.source === 'STRUCTURE');
if (!structuralLevels.length) throw new Error('Levels did not consume structure levels');
if (structuralLevels.some(x => !canonicalPrices.has(Math.round(x.price * 100) / 100))) {
  throw new Error('Levels contain a structural price outside canonical structure output');
}

if (analytics.support.some(x => x.price >= spot) || analytics.resistance.some(x => x.price <= spot)) {
  throw new Error('Levels side partition is invalid');
}
if (analytics.events.some(x => !Number.isInteger(x.index) || x.index < 0 || x.index >= bars.length)) {
  throw new Error('Level lifecycle event index is invalid');
}

console.log('TRADINGCORE_LEVELS_SHARED_STRUCTURE_TEST=PASS');
