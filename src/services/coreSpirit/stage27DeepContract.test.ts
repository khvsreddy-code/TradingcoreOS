import { planCoreSpiritDataRequests, resolveCoreSpiritDataPlan } from './dataPlanner';
import { CoreSpiritEditorModel } from './editorModel';

describe('CoreSpirit v27 data planner + coder contract', () => {
  it('deduplicates identical market requests before host resolution', async () => {
    const plan = planCoreSpiritDataRequests([
      { symbol: 'NSE:NIFTY', timeframe: '5', field: 'close' },
      { symbol: 'NSE:NIFTY', timeframe: '5', field: 'close' },
      { symbol: 'NSE:BANKNIFTY', timeframe: '5', field: 'close' },
    ]);
    expect(plan.requests).toHaveLength(2);
    expect(plan.dedupedCount).toBe(1);
    let calls = 0;
    const result = await resolveCoreSpiritDataPlan(plan, { request: async r => { calls++; return { value: 100, source: 'test', symbol: r.symbol, timeframe: r.timeframe }; } });
    expect(calls).toBe(2);
    expect(result.values.size).toBe(2);
  });

  it('builds reusable editor intelligence without a DOM', () => {
    const model = new CoreSpiritEditorModel('fast = ema(close, 20)\nplot(fast)');
    expect(model.getSnapshot().symbols.map(x => x.name)).toContain('fast');
    expect(model.getSnapshot().tokens.length).toBeGreaterThan(0);
    model.applyEdit({ start: model.getSource().length, end: model.getSource().length, text: '\nplot(close)' });
    expect(model.getVersion()).toBe(1);
    expect(model.compile().ir).toBeTruthy();
  });
});
