import assert from 'node:assert/strict';
import { hasUnexpectedIntradayGap } from './services/marketData/liveGapPolicy.ts';

const ms = (value: string) => Date.parse(value);
const fiveMinutes = 5 * 60;
const base = {
  instrumentKey: 'NSE:NIFTY50-INDEX',
  previousTradeTimeMs: ms('2026-11-18T09:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T09:35:00+05:30'),
  timeframeSeconds: fiveMinutes,
};

assert.equal(hasUnexpectedIntradayGap(base), true, 'missing one full 5-minute bar inside NSE regular session requests reconciliation');
assert.equal(hasUnexpectedIntradayGap({
  ...base,
  instrumentKey: 'BSE:SENSEX-INDEX',
}), true, 'BSE regular-session gaps use the same exchange session policy');

assert.equal(hasUnexpectedIntradayGap({
  ...base,
  currentTradeTimeMs: ms('2026-11-18T09:34:59+05:30'),
}), false, 'sub-threshold gaps do not trigger extra history requests');

assert.equal(hasUnexpectedIntradayGap({
  ...base,
  previousTradeTimeMs: ms('2026-11-18T09:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T09:35:00+05:30'),
  sessionOpenMinute: 10 * 60,
}), false, 'timestamps before a configured session open do not trigger recovery');

assert.equal(hasUnexpectedIntradayGap({
  ...base,
  previousTradeTimeMs: ms('2026-11-18T15:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T15:35:00+05:30'),
}), false, 'a post-close timestamp is not a missing intraday candle');

assert.equal(hasUnexpectedIntradayGap({
  ...base,
  previousTradeTimeMs: ms('2026-11-18T15:20:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T15:30:00+05:30'),
}), false, 'the exchange close boundary is excluded from regular-session gap detection');

assert.equal(hasUnexpectedIntradayGap({
  ...base,
  previousTradeTimeMs: ms('2026-11-17T15:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T09:15:00+05:30'),
}), false, 'overnight session boundaries are not treated as missing intraday bars');

assert.equal(hasUnexpectedIntradayGap({
  ...base,
  previousTradeTimeMs: ms('2026-11-13T15:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-16T09:15:00+05:30'),
}), false, 'weekend boundaries are not treated as same-session gaps');

assert.equal(hasUnexpectedIntradayGap({
  ...base,
  previousTradeTimeMs: ms('2026-11-21T09:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-21T09:35:00+05:30'),
}), false, 'a Saturday is closed unless an exchange-authorized special session is configured');

assert.equal(hasUnexpectedIntradayGap({
  ...base,
  previousTradeTimeMs: ms('2026-11-18T09:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T09:35:00+05:30'),
  calendarHolidays: ['2026-11-18'],
}), false, 'configured full-calendar holidays are excluded');

assert.equal(hasUnexpectedIntradayGap({
  ...base,
  previousTradeTimeMs: ms('2026-11-21T09:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-21T09:35:00+05:30'),
  specialSessions: [{ date: '2026-11-21', openMinute: 9 * 60 + 15, closeMinute: 12 * 60 + 30 }],
}), true, 'an exchange-authorized Saturday special session can trigger reconciliation');

assert.equal(hasUnexpectedIntradayGap({
  ...base,
  instrumentKey: 'BINANCE:BTCUSDT',
  currentTradeTimeMs: ms('2026-11-18T10:00:00+05:30'),
}), false, 'non-India feeds must use their own session policy');

console.log('LIVE_GAP_POLICY_CONTRACT_OK');
