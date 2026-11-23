import assert from 'node:assert/strict';
import {
  canonicalInstrumentKey,
  createInstrument,
  getInstrumentById,
  getInstrumentBySymbol,
  normalizeOptionType,
  registerInstrument,
} from './services/marketData/instrumentIdentity';

const fyersIndex = canonicalInstrumentKey('fyers', 'NSE_INDEX|Nifty 50');
const upstoxIndex = canonicalInstrumentKey('upstox', 'NSE_INDEX|Nifty 50');
assert.equal(fyersIndex, 'NSE:NIFTY50-INDEX');
assert.equal(upstoxIndex, fyersIndex, 'index aliases normalize independently of broker transport');

const fyersOption = createInstrument({
  symbol: 'NSE_FO|NIFTY26NOV25000CE',
  provider: 'fyers',
  exchange: 'NSE',
  instrumentType: 'option',
  underlying: 'NSE_INDEX|Nifty 50',
  expiry: '26-11-2026',
  strike: 25_000,
  optionType: 'CALL',
  lotSize: 65,
  tickSize: 0.05,
  brokerInstrumentKey: 'NSE_FO|NIFTY26NOV25000CE',
});
const upstoxOption = createInstrument({
  symbol: 'NSE_FO|UPSTOX_NATIVE_TOKEN_123',
  provider: 'upstox',
  exchange: 'NSE',
  instrumentType: 'option',
  underlying: 'NSE:NIFTY50-INDEX',
  expiry: '20261126',
  strike: 25_000,
  optionType: 'CE',
  lotSize: 65,
  tickSize: 0.05,
  brokerInstrumentKey: 'NSE_FO|UPSTOX_NATIVE_TOKEN_123',
});
assert.equal(fyersOption.id, upstoxOption.id, 'the same option economics resolve to one identity across broker tokens');
assert.equal(fyersOption.symbol, 'NSE:NIFTY26NOV25000CE', 'FYERS option suffix must not be mistaken for an equity');
assert.equal(fyersOption.expiry, '2026-11-26');
assert.equal(normalizeOptionType('put'), 'PE');
assert.equal(normalizeOptionType('CALL'), 'CE');

const fyersFuture = createInstrument({
  symbol: 'NSE_FO|NIFTY26NOVFUT',
  provider: 'fyers',
  exchange: 'NSE',
  instrumentType: 'future',
  underlying: 'NIFTY',
  expiry: '2026-11-26',
});
const upstoxFuture = createInstrument({
  symbol: 'NSE_FO|ANOTHER_FUTURE_KEY',
  provider: 'upstox',
  exchange: 'NSE',
  instrumentType: 'future',
  underlying: 'NSE:NIFTY50-INDEX',
  expiry: '20261126',
});
assert.equal(fyersFuture.id, upstoxFuture.id, 'future identity is based on underlying and expiry, not provider token');

const fyersEquity = createInstrument({
  symbol: 'NSE_CM|RELIANCE',
  provider: 'fyers',
  exchange: 'NSE',
  instrumentType: 'equity',
  isin: 'INE002A01018',
});
const upstoxEquity = createInstrument({
  symbol: 'NSE_EQ|INE002A01018',
  provider: 'upstox',
  exchange: 'NSE',
  instrumentType: 'equity',
  isin: 'ine002a01018',
});
assert.equal(fyersEquity.id, upstoxEquity.id, 'equity identity uses the exchange-issued ISIN when present');
assert.equal(fyersEquity.isin, 'INE002A01018');

const registered = registerInstrument({
  symbol: 'NSE:NIFTY50-INDEX',
  provider: 'fyers',
  instrumentType: 'index',
  dataStatus: 'live',
});
assert.equal(getInstrumentById(registered.id)?.dataStatus, 'live');
assert.equal(getInstrumentBySymbol('nse:nifty50-index')?.id, registered.id);
assert.equal(createInstrument({ symbol: 'NSE:NIFTY50-INDEX' }).dataStatus, 'unknown',
  'absence of a feed must not be misrepresented as a disconnect');

console.log('INSTRUMENT_IDENTITY_CONTRACT_OK');
