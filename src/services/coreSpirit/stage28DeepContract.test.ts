import { CoreSpiritDataCache } from './dataCache';
import { planCoreSpiritDataRequests, resolveCoreSpiritDataPlanCached } from './dataPlanner';
import { alignSnapshots, classifyDataState, groupIntrabars } from './timeframeAlignment';
import { createFootprintScene } from './footprintScene';

describe('CoreSpirit v28 data + visual deep contract', () => {
  it('uses shared cache before invoking the host', async () => {
    const plan = planCoreSpiritDataRequests([{ symbol: 'NSE:NIFTY', timeframe: '5', field: 'close' }]);
    const cache = new CoreSpiritDataCache(); let calls = 0;
    const resolver = { request: async (r: any) => { calls++; return { value: 100 + calls, source: 'test', symbol: r.symbol, timeframe: r.timeframe, timestamp: 10, state: 'confirmed' as const }; } };
    const a = await resolveCoreSpiritDataPlanCached(plan, resolver, cache);
    const b = await resolveCoreSpiritDataPlanCached(plan, resolver, cache);
    expect(a.values.get(plan.requests[0].key)?.value).toBe(101);
    expect(b.values.get(plan.requests[0].key)?.value).toBe(101);
    expect(calls).toBe(1);
  });

  it('aligns higher timeframe snapshots without inventing a leading value', () => {
    const aligned = alignSnapshots([1000, 2000, 3000], [
      { value: 10, source: 'x', symbol: 'NIFTY', timeframe: '5', timestamp: 2000, state: 'confirmed' },
      { value: 20, source: 'x', symbol: 'NIFTY', timeframe: '5', timestamp: 3000, state: 'developing' },
    ]);
    expect(aligned.map(x => x.value)).toEqual([null, 10, 20]);
    expect(classifyDataState({ realtime: true })).toBe('realtime');
  });

  it('groups lower timeframe observations deterministically', () => {
    const grouped = groupIntrabars([{ timestamp: 0 }, { timestamp: 60000 }], [
      { timestamp: 1000, close: 1 }, { timestamp: 61000, close: 2 },
    ], 60000);
    expect(grouped[0].points).toHaveLength(1);
    expect(grouped[1].points).toHaveLength(1);
  });

  it('normalizes footprint rows for high-cardinality rendering', () => {
    const scene = createFootprintScene('fp-1', { timestamp: 1000, buyVolume: 80, sellVolume: 40, delta: 40, rows: [
      { price: 100, buyVolume: 60, sellVolume: 10, delta: 50, totalVolume: 70 },
      { price: 99, buyVolume: 20, sellVolume: 30, delta: -10, totalVolume: 50 },
    ] });
    expect(scene.rows[0].intensity).toBe(1);
    expect(scene.rows[0].side).toBe('buy');
    expect(scene.rows[1].side).toBe('sell');
  });
});
