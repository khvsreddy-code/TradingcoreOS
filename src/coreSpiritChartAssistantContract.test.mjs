import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const route = read('./server/routes/coreSpirit-copilot.routes.ts');
const liveChart = read('./components/workspace/LiveChart.tsx');
const assistant = read('./components/workspace/CoreSpiritChartAssistant.tsx');
const mainServer = read('../server.ts');

assert.match(route, /post\('\/chat\/stream'/, 'authenticated in-chart assistant stream route is registered');
assert.match(route, /generateContentStream/, 'assistant replies stream from the configured model provider');
assert.match(route, /sanitizeCoreSpiritChartAssistantContext/, 'assistant context is reduced through a whitelist sanitizer');
assert.match(route, /CHART_ASSISTANT_MAX_CONTEXT_BYTES = 16 \* 1024/, 'assistant context has a strict byte bound');
assert.match(route, /CHART_ASSISTANT_MAX_HISTORY_MESSAGES = 10/, 'chat history has a strict message-count bound');
assert.match(route, /AbortSignal\.timeout\(30_000\)/, 'chat provider work has a bounded timeout');
assert.match(route, /searchCoreSpiritCopilotKnowledge\(rawMessage, 6\)/, 'platform answers can use versioned CoreSpirit knowledge');
assert.match(route, /mayCreateOrderIntent: false/, 'assistant output is explicitly non-executable and cannot create order intent');
assert.match(route, /do not place, modify, or cancel orders/, 'system instruction makes the assistant read-only');
assert.doesNotMatch(route.slice(route.lastIndexOf('async function handleCoreSpiritChartAssistantStream')), /setHeader\('Cache-Control', 'no-store'\);\s*finishCopilotResponse/, 'stream does not mutate headers after flushing them');

assert.match(assistant, /\/api\/corespirit\/copilot\/chat\/stream/, 'chart assistant calls the authenticated stream endpoint');
assert.match(assistant, /getSupabaseClient\(\)\.auth\.getSession\(\)/, 'frontend supplies the authenticated session token');
assert.match(assistant, /AbortController/, 'users can stop an in-flight response and context changes cancel stale requests');
assert.match(assistant, /requestSequenceRef/, 'late auth/stream continuations cannot overwrite a newer conversation state');
assert.match(assistant, /aria-expanded/, 'chat launcher exposes its expanded state accessibly');
assert.match(assistant, /maxLength=\{2_000\}/, 'frontend bounds message length');
assert.match(assistant, /context\.symbol/, 'assistant is explicitly bound to the current chart context');

assert.match(liveChart, /CoreSpiritChartAssistant/, 'live chart mounts the in-chart assistant');
assert.match(liveChart, /recentBars: candles\.current\.slice\(-12\)/, 'only the latest bounded candle window is shared');
assert.match(liveChart, /timeframe,/, 'current chart timeframe is shared with the assistant');
assert.match(liveChart, /activeIndicators:/, 'active indicator labels can be supplied as chart context');
assert.match(mainServer, /app\.use\('\/api\/corespirit\/copilot', coreSpiritCopilotRoutes\)/, 'assistant route is mounted behind the existing CoreSpirit Copilot route');

console.log('CORESPIRIT_CHART_ASSISTANT_CONTRACT_OK');
