import assert from 'node:assert/strict';
import { countdownText, indiaSessionCountdownText } from '../vendor/vela/src/renderers/native/chrome/countdown.ts';

const open = Date.parse('2026-10-14T03:45:00.000Z'); // 09:15 Asia/Kolkata
const fiveMinutes = 5 * 60 * 1000;

assert.equal(indiaSessionCountdownText(open, fiveMinutes, Date.parse('2026-10-14T03:47:00.000Z')), '03:00',
  'active Indian session should show the countdown to the current bar close');
assert.equal(indiaSessionCountdownText(open, fiveMinutes, Date.parse('2026-10-14T03:00:00.000Z')), null,
  'pre-open market should not show an intrabar countdown');
assert.equal(indiaSessionCountdownText(open, fiveMinutes, Date.parse('2026-10-14T10:01:00.000Z')), null,
  'market close should hide the countdown');
assert.equal(indiaSessionCountdownText(open, fiveMinutes, Date.parse('2026-10-15T03:47:00.000Z')), null,
  'a stale previous-session candle should not show a next-day countdown');
assert.equal(indiaSessionCountdownText(Date.parse('2026-10-18T03:45:00.000Z'), fiveMinutes, Date.parse('2026-10-18T03:47:00.000Z')), null,
  'weekend should not display an intrabar countdown');

const lateBar = Date.parse('2026-10-14T09:45:00.000Z'); // 15:15 Asia/Kolkata
assert.equal(indiaSessionCountdownText(lateBar, 30 * 60 * 1000, Date.parse('2026-10-14T09:55:00.000Z')), '05:00',
  'a candle that nominally extends beyond 15:30 is capped at the regular market close');
assert.equal(indiaSessionCountdownText(open, 24 * 60 * 60 * 1000, Date.parse('2026-10-14T03:47:00.000Z')), null,
  'daily bars do not get an intraday countdown');

assert.equal(countdownText(open, fiveMinutes, Date.parse('2026-10-14T03:47:00.000Z')), '03:00',
  'retain generic countdown behavior for non-TCO callers');

console.log('INDIA_MARKET_SESSION_COUNTDOWN_CONTRACT_OK');
