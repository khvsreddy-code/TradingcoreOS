import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateTerminalAlertRule, isEligibleTerminalAlertTick } from './terminalAlertEngine.js';

const armed = (condition, target_price = 100) => ({ condition, target_price, status: 'armed' });

assert.equal(evaluateTerminalAlertRule(armed('above'), 99, 100.01), true);
assert.equal(evaluateTerminalAlertRule(armed('above'), 101, 100.01), true);
assert.equal(evaluateTerminalAlertRule(armed('above'), 99, 99.99), false);
assert.equal(evaluateTerminalAlertRule(armed('below'), 101, 99.99), true);
assert.equal(evaluateTerminalAlertRule(armed('below'), 99, 99.99), true);
assert.equal(evaluateTerminalAlertRule(armed('below'), 101, 100.01), false);
assert.equal(evaluateTerminalAlertRule(armed('crosses_above'), 100, 100.01), true);
assert.equal(evaluateTerminalAlertRule(armed('crosses_above'), null, 100.01), false);
assert.equal(evaluateTerminalAlertRule(armed('crosses_above'), 99, 99.99), false);
assert.equal(evaluateTerminalAlertRule(armed('crosses_below'), 100, 99.99), true);
assert.equal(evaluateTerminalAlertRule(armed('crosses_below'), null, 99.99), false);
assert.equal(evaluateTerminalAlertRule({ ...armed('above'), status: 'paused' }, 99, 101), false);
assert.equal(evaluateTerminalAlertRule(armed('above', Number.NaN), 99, 101), false);
assert.equal(evaluateTerminalAlertRule(armed('above'), 99, Number.NaN), false);

const now = 1_800_000_000_000;
assert.equal(isEligibleTerminalAlertTick({ source: 'fyers', ltp: 101, receivedAtEpoch: now - 1_000 }, now), true);
assert.equal(isEligibleTerminalAlertTick({ source: 'upstox', ltp: 101, receivedAt: new Date(now - 1_000).toISOString() }, now), true);
assert.equal(isEligibleTerminalAlertTick({ source: 'yahoo', ltp: 101, receivedAtEpoch: now - 1_000 }, now), false);
assert.equal(isEligibleTerminalAlertTick({ source: 'paper', ltp: 101, receivedAtEpoch: now - 1_000 }, now), false);
assert.equal(isEligibleTerminalAlertTick({ source: 'fyers', ltp: 101, receivedAtEpoch: now - 31_000 }, now), false);
assert.equal(isEligibleTerminalAlertTick({ source: 'fyers', ltp: 0, receivedAtEpoch: now - 1_000 }, now), false);
assert.equal(isEligibleTerminalAlertTick({ source: 'fyers', ltp: 101 }, now), false);
assert.equal(isEligibleTerminalAlertTick({ source: 'fyers', ltp: 101, brokerTimestamp: now, timestamp: now }, now), false, 'exchange timestamps alone cannot prove local packet freshness');

const repository = readFileSync(new URL('./terminalDataService.ts', import.meta.url), 'utf8');
const claimStart = repository.indexOf('export async function claimTerminalAlertRuleTrigger(');
assert.ok(claimStart >= 0, 'Supabase alert trigger claim exists');
const claim = repository.slice(claimStart);
assert.match(claim, /\.eq\('id', rule\.id\)/, 'claim targets one rule');
assert.match(claim, /\.eq\('user_id', userId\)/, 'claim is scoped to the authenticated owner');
assert.match(claim, /\.eq\('status', 'armed'\)/, 'claim is an atomic armed-to-triggered compare-and-set');
assert.match(claim, /\.select\('id'\)/, 'claim reads whether this caller won the race');
assert.match(claim, /status: 'triggered'/, 'a successful claim transitions the rule to triggered');

console.log('TERMINAL_LIVE_PRICE_ALERT_ENGINE_OK');

const runtime = readFileSync(new URL('../runtime/TradingCoreRuntime.ts', import.meta.url), 'utf8');
assert.match(runtime, /const receivedAtEpoch = Date\.now\(\)/, 'broker ingress stamps local packet receive time');
assert.match(runtime, /receivedAtEpoch,\s*receivedAt,/, 'normalized broker ticks carry the trusted receive timestamp');
assert.match(runtime, /listener\(normalizedEvent\)/, 'subscribers receive the timestamped normalized tick');
