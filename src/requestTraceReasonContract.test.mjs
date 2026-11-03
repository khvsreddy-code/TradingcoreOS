import assert from 'node:assert/strict';import fs from 'node:fs';
const context=fs.readFileSync(new URL('./server/middleware/requestContext.ts',import.meta.url),'utf8');
const metrics=fs.readFileSync(new URL('./server/observability/requestMetrics.ts',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.ts',import.meta.url),'utf8');
assert.match(context,/x-request-id/);assert.match(context,/x-request-reason/);assert.match(context,/X-Request-Reason/);
assert.match(metrics,/byReason/);assert.match(metrics,/byRoute/);assert.match(metrics,/requestId/);
assert.match(server,/tradingCoreRequestReason/);
console.log('request trace/reason contract: ok');
