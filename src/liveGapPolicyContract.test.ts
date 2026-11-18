import assert from 'node:assert/strict';
import { hasUnexpectedIntradayGap } from './services/marketData/liveGapPolicy.ts';

const ms = (value: string) => Date.parse(value);
const fiveMinutes = 5 * 60;

assert.equal(hasUnexpectedIntradayGap({
  instrumentKey: 'NSE:NIFTY50-INDEX',
  previousTradeTimeMs: ms('2026-11-18T09:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T09:35:00+05:30'),
  timeframeSeconds: fiveMinutes,
}), true, 'missing one full 5-minute bar inside an NSE session requests history reconciliation');

assert.equal(hasUnexpectedIntradayGap({
  instrumentKey: 'BSE:SENSEX-INDEX',
  previousTradeTimeMs: ms('2026-11-18T10:00:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T10:15:00+05:30'),
  timeframeSeconds: fiveMinutes,
}), true, 'BSE same-session gaps use the same explicit policy');

assert.equal(hasUnexpectedIntradayGap({
  instrumentKey: 'NSE:NIFTY50-INDEX',
  previousTradeTimeMs: ms('2026-11-18T09:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T09:34:59+05:30'),
  timeframeSeconds: fiveMinutes,
}), false, 'sub-threshold gaps do not trigger extra history requests');

assert.equal(hasUnexpectedIntradayGap({
  instrumentKey: 'NSE:NIFTY50-INDEX',
  previousTradeTimeMs: ms('2026-11-17T15:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T09:15:00+05:30'),
  timeframeSeconds: fiveMinutes,
}), false, 'overnight session boundaries are not treated as missing intraday bars');

assert.equal(hasUnexpectedIntradayGap({
  instrumentKey: 'NSE:NIFTY50-INDEX',
  previousTradeTimeMs: ms('2026-11-13T15:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-16T09:15:00+05:30'),
  timeframeSeconds: fiveMinutes,
}), false, 'weekend boundaries are not treated as same-session gaps');

assert.equal(hasUnexpectedIntradayGap({
  instrumentKey: 'BINANCE:BTCUSDT',
  previousTradeTimeMs: ms('2026-11-18T09:25:00+05:30'),
  currentTradeTimeMs: ms('2026-11-18T10:00:00+05:30'),
  timeframeSeconds: fiveMinutes,
}), false, 'non-India feeds must use their own session policy');

console.log('LIVE_GAP_POLICY_CONTRACT_OK');
