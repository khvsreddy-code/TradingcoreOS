import assert from 'node:assert/strict';
import {
  blackScholes,
  impliedVolatility,
  normalCdf,
  optionTimeToExpiryYears,
  parseOptionExpiryTimestamp,
  valuationPremium,
} from './services/marketData/options/optionPricing.ts';

const near = (actual, expected, label, epsilon = 1e-6) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon, `${label}: ${actual} vs ${expected}`);

near(normalCdf(0), 0.5, 'normal CDF at zero');
near(normalCdf(1.96), 0.975002, 'normal CDF at 1.96', 1e-5);
near(normalCdf(-1.96), 0.024998, 'normal CDF symmetry', 1e-5);

const callInput = { right: 'CE', spot: 100, strike: 100, timeToExpiryYears: 1, volatility: 0.2, riskFreeRate: 0.05 };
const call = blackScholes(callInput);
near(call.price, 10.4506, 'Black–Scholes ATM call price', 1e-3);
near(call.delta, 0.6368, 'ATM call delta', 1e-3);
near(call.gamma, 0.01876, 'ATM call gamma', 1e-4);
near(call.vegaPerVolPoint, 0.3752, 'ATM call vega per vol point', 1e-3);
near(call.rhoPerRatePoint, 0.5323, 'ATM call rho per rate point', 1e-3);
near(call.thetaPerDay, -0.0172, 'ATM call theta per day', 1e-3);

const put = blackScholes({ ...callInput, right: 'PE' });
near(put.price, 5.5735, 'Black–Scholes ATM put price', 1e-3);
near(put.delta, -0.3632, 'ATM put delta', 1e-3);
near(call.price - put.price, 100 - 100 * Math.exp(-0.05), 'European put-call parity', 1e-8);

for (const right of ['CE', 'PE']) {
  const input = { ...callInput, right, spot: 22_700, strike: 22_700, timeToExpiryYears: 30 / 365, volatility: 0.24, riskFreeRate: 0.06, dividendYield: 0.01 };
  const theoretical = blackScholes(input);
  const recovered = impliedVolatility({ ...input, optionPrice: theoretical.price });
  assert.ok(recovered != null, `IV should solve for ${right}`);
  near(recovered, input.volatility, `IV round-trip ${right}`, 2e-6);
}
assert.equal(impliedVolatility({ ...callInput, optionPrice: 0 }), null, 'premium below intrinsic/no-arbitrage boundary is rejected');
assert.equal(impliedVolatility({ ...callInput, optionPrice: Number.NaN }), null, 'invalid premiums never create IV');
assert.equal(blackScholes({ ...callInput, timeToExpiryYears: 0 }).price, 0, 'zero-time ATM call converges to intrinsic value');

const expiry = parseOptionExpiryTimestamp('27-NOV-2026');
assert.equal(new Date(expiry).toISOString(), '2026-11-27T10:00:00.000Z', 'NSE expiry cutoff is 15:30 IST');
assert.equal(optionTimeToExpiryYears('2026-11-27', '2026-11-18T10:00:00.000Z') != null, true);
assert.equal(optionTimeToExpiryYears('not-an-expiry', new Date().toISOString()), null);
assert.equal(valuationPremium({ bidPrice: 9, askPrice: 11, ltp: 20 }), 10, 'bid/ask midpoint is used');
assert.equal(valuationPremium({ bidPrice: 12, askPrice: 11, ltp: 13 }), 13, 'crossed quote falls back to LTP');
assert.equal(valuationPremium({}), null, 'missing price stays unavailable');

console.log('OPTIONS_BLACK_SCHOLES_AND_IV_CONTRACT_OK');
