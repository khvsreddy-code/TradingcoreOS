import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const chromeRenderer = readFileSync(new URL('../vendor/vela/src/renderers/native/chrome/ChromeRenderer.ts', import.meta.url), 'utf8');
const nativeRenderer = readFileSync(new URL('../vendor/vela/src/renderers/native/NativeRenderer.ts', import.meta.url), 'utf8');
const sceneGraph = readFileSync(new URL('../vendor/vela/src/renderers/native/core/SceneGraph.ts', import.meta.url), 'utf8');
const chartConfig = readFileSync(new URL('../vendor/vela/src/renderers/native/core/chartConfig.ts', import.meta.url), 'utf8');
const settingsDialog = readFileSync(new URL('../vendor/vela/src/renderers/native/chrome/SettingsDialog.ts', import.meta.url), 'utf8');
assert.match(chromeRenderer, /indiaSessionCountdownText\(lastTime, coords\.barInterval, Date\.now\(\)\)/,
  'Vela chrome must use the India-session policy rather than the generic wall-clock countdown');
assert.match(nativeRenderer, /this\.scene\.timezone = 'Asia\/Kolkata'/,
  'native feature edits cannot switch the TCO chart out of India time');
assert.match(nativeRenderer, /this\.scene\.timezone = 'Asia\/Kolkata';/,
  'imported settings must be applied with the India timezone');
assert.match(sceneGraph, /timezone = 'Asia\/Kolkata'/,
  'fresh scenes must default to Asia/Kolkata');
assert.match(chartConfig, /timezone: 'Asia\/Kolkata'/,
  'saved and imported chart config must normalize to Asia/Kolkata');
assert.match(settingsDialog, /return \[\['Asia\/Kolkata', 'Asia\/Kolkata \(IST\)'\] as const\]/,
  'the chart settings timezone selector must offer only IST');


console.log('INDIA_MARKET_SESSION_COUNTDOWN_CONTRACT_OK');
