import assert from 'node:assert/strict';
import { evaluateAutomation, evaluateAutomationBatch, type AutomationContext, type AutomationRule } from './automationEngine.ts';

const candles = [
  { timestamp: '2026-10-20T03:45:00.000Z', open: 98, high: 100, low: 97, close: 99, volume: 100 },
  { timestamp: '2026-10-20T03:50:00.000Z', open: 99, high: 102, low: 98, close: 101, volume: 120 },
];
const context = (overrides: Partial<AutomationContext> = {}): AutomationContext => ({
  symbol: 'NSE:NIFTY50-INDEX',
  timeframe: '5m',
  exchangeTimezone: 'Asia/Kolkata',
  price: 101,
  candles,
  timestamp: Date.parse(candles[1]!.timestamp),
  barIndex: 1,
  barRevision: 0,
  barConfirmed: true,
  executionMode: 'paper',
  sessionDate: '2026-10-20',
  ...overrides,
});
const rule = (overrides: Partial<AutomationRule> = {}): AutomationRule => ({
  id: 'regression-test',
  name: 'Automation regression test',
  enabled: true,
  mode: 'Paper',
  lifecycle: 'PAPER',
  logic: 'ALL',
  conditions: [{ field: 'price', operator: '>=', value: 100 }],
  actions: [{ type: 'NOTIFY', payload: { message: 'condition matched' } }],
  cooldownSeconds: 0,
  maxRunsPerDay: 5,
  allowOrderExecution: false,
  requireConfirmation: true,
  runTimestamps: [],
  ...overrides,
});

{
  const evaluation = evaluateAutomation(
    rule({ conditions: [{ field: 'mystery_price_field', operator: '=', value: 0 }] }),
    context(),
    Date.parse('2026-10-20T05:00:00.000Z'),
  );
  assert.equal(evaluation.triggered, false, 'an unknown field must not resolve to zero and accidentally pass equality');
  assert.equal(evaluation.results[0]?.error, 'unknown_or_unavailable_field');
}

{
  const crossRule = rule({ conditions: [{ field: 'price', operator: 'crosses_above', value: 100 }] });
  const developing = evaluateAutomation(crossRule, context({ barConfirmed: false }), Date.parse('2026-10-20T05:00:00.000Z'));
  assert.equal(developing.triggered, false, 'crossover must wait for a confirmed bar');
  assert.equal(developing.results[0]?.error, 'confirmed_bar_required');

  const confirmed = evaluateAutomation(crossRule, context({ barConfirmed: true }), Date.parse('2026-10-20T05:00:00.000Z'));
  assert.equal(confirmed.triggered, true, 'confirmed crossover uses previous and current bar values');
  assert.equal(confirmed.results[0]?.previousActual, 99);
  assert.equal(confirmed.results[0]?.actual, 101);
}

{
  const now = Date.parse('2026-10-20T05:00:00.000Z');
  const priorSession = Date.parse('2026-10-19T04:00:00.000Z');
  const dailyRule = rule({ maxRunsPerDay: 1, runTimestamps: [priorSession] });
  const evaluation = evaluateAutomation(dailyRule, context({ sessionDate: '2026-10-20' }), now);
  assert.equal(evaluation.triggered, true, 'a previous session run must not consume the current session daily limit');
  assert.deepEqual(evaluation.runTimestamps, [now]);
}

{
  const liveRule = rule({
    mode: 'Live',
    lifecycle: 'LIVE',
    allowOrderExecution: true,
    requireConfirmation: false,
    actions: [{ type: 'PLACE_ORDER', payload: { side: 'Buy', quantity: 1 } }, { type: 'NOTIFY' }],
  });
  // The developing LTP crosses, but the close is still below the trigger.
  const developing = evaluateAutomation(
    liveRule,
    context({ price: 120, barConfirmed: false, executionMode: 'live', candles: candles.map((c, index) => index === 1 ? { ...c, close: 99 } : c) }),
    Date.parse('2026-10-20T05:00:00.000Z'),
  );
  assert.equal(developing.triggered, true);
  assert.equal(developing.actions.some(action => action.type === 'PLACE_ORDER'), false, 'unconfirmed bars cannot expose live order actions');
  assert.equal(developing.blockedActions.some(action => action.type === 'PLACE_ORDER'), true);

  const confirmed = evaluateAutomation(
    rule({
      mode: 'Live', lifecycle: 'LIVE', allowOrderExecution: true, requireConfirmation: false,
      actions: [{ type: 'PLACE_ORDER', payload: { side: 'Buy', quantity: 1 } }],
    }),
    context({ price: 120, barConfirmed: true, executionMode: 'live', candles: candles.map((c, index) => index === 1 ? { ...c, close: 99 } : c) }),
    Date.parse('2026-10-20T05:00:00.000Z'),
  );
  assert.equal(confirmed.triggered, false, 'confirmed-bar rules use the canonical close rather than an out-of-bar LTP');
}

{
  const stable = rule({ lastRunBarKey: ['NSE:NIFTY50-INDEX', '5m', 1, Date.parse(candles[1]!.timestamp)].join('|') });
  const evaluation = evaluateAutomation(stable, context(), Date.parse('2026-10-20T05:00:00.000Z'));
  assert.equal(evaluation.triggered, false, 'same-bar packet/revision changes cannot re-run the rule');
}

{
  const rules = [
    rule({ id: 'batch-price-a' }),
    rule({ id: 'batch-price-b', conditions: [{ field: 'price', operator: '>', value: 100 }] }),
  ];
  const singleRules = rules.map(item => ({
    ...item,
    conditions: item.conditions.map(condition => ({ ...condition })),
    actions: item.actions.map(action => ({ ...action })),
    runTimestamps: [...(item.runTimestamps ?? [])],
  }));
  const now = Date.parse('2026-10-20T05:00:00.000Z');
  const batch = evaluateAutomationBatch(rules, context(), now);
  const singles = singleRules.map(item => evaluateAutomation(item, context(), now));
  assert.deepEqual(batch.map(item => [item.triggered, item.results.map(result => result.actual), item.reason]),
    singles.map(item => [item.triggered, item.results.map(result => result.actual), item.reason]),
    'batch evaluation must preserve per-rule semantics while sharing one per-bar feature frame');
}

console.log('AUTOMATION_CONFIRMED_BAR_DAILY_BUDGET_AND_UNKNOWN_FIELD_REGRESSION_OK');
