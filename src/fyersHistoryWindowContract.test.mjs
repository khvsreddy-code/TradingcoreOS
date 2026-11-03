import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  clampFyersHistoryRange,
  normalizeFyersExpiredFnoRange,
} from './server/fyers/core/FyersHistoryWindow.ts';

const now = Date.UTC(2026, 10, 3, 12, 0, 0);
const thirtyDaysAgo = now - 30 * 86_400_000;
const ordinary = clampFyersHistoryRange(thirtyDaysAgo, now, now);
assert.ok(ordinary);
assert.equal(ordinary.fromMs, now - 7 * 86_400_000,
  'ordinary FYERS /history remains clamped to the trailing seven calendar days');
assert.equal(ordinary.clipped, true);

const expiredIntraday = normalizeFyersExpiredFnoRange(thirtyDaysAgo, now, null, now);
assert.ok(expiredIntraday);
assert.equal(expiredIntraday.fromMs, thirtyDaysAgo,
  'expired F&O intraday history is not silently truncated to the standard seven-day window');
assert.equal(expiredIntraday.clipped, false);

const expiredDaily = normalizeFyersExpiredFnoRange(now - 365 * 86_400_000, now, 2, now);
assert.ok(expiredDaily);
assert.equal(expiredDaily.fromMs, now - 365 * 86_400_000,
  'expired F&O daily history remains available inside the configured two-year entitlement');

const outsideDailyEntitlement = normalizeFyersExpiredFnoRange(now - 3 * 365 * 86_400_000, now - 2.5 * 365 * 86_400_000, 2, now);
assert.equal(outsideDailyEntitlement, null,
  'expired F&O daily history outside the entitlement window is rejected rather than silently fetched');

const apiClient = fs.readFileSync(new URL('./server/fyers/core/FyersApiClient.ts', import.meta.url), 'utf8');
const marketService = fs.readFileSync(new URL('./server/fyers/market/FyersMarketDataService.ts', import.meta.url), 'utf8');
assert.match(apiClient, /normalizeFyersExpiredFnoRange/,
  'expired F&O endpoints use their dedicated lookback policy');
assert.match(apiClient, /isExpiredFnoIntradayHistory/,
  'expired F&O intraday requests are identified separately from ordinary history');
assert.match(apiClient, /expired-fno-intraday/,
  'expired F&O intraday requests use a dedicated account-scoped quota bucket');
assert.match(apiClient, /maxPerDay: dailyLimit/,
  'expired F&O intraday requests are limited by the verified plan daily allowance');
assert.match(marketService, /expiredHistoricalData[\\s\\S]*?'lowest'/,
  'expired F&O history is admitted at the lowest request priority');
assert.match(marketService, /expiredExpiryDates[\\s\\S]*?'lowest'/,
  'expired F&O expiry discovery is admitted at the lowest request priority');

console.log('FYERS_STANDARD_AND_EXPIRED_FNO_HISTORY_POLICY_OK');
