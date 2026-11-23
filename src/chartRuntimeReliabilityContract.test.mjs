import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const runtime = read('./services/core/chart/ChartRuntimeController.ts');
const indicator = read('./services/core/chart/controllers/ChartIndicatorController.ts');
const workspace = read('./LiveTradingWorkspace.tsx');

const snapshotStart = runtime.indexOf('const applySnapshot=(event:any)=>{');
const snapshotEnd = runtime.indexOf('const interactionController=', snapshotStart);
assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart, 'chart snapshot handler must remain a single lifecycle-owned boundary');
const snapshotHandler = runtime.slice(snapshotStart, snapshotEnd);
const statusGuard = snapshotHandler.indexOf("if(event.type==='quote'||event.type==='status')return;");
const tickBranch = snapshotHandler.indexOf("if(event.type==='tick')");
const fullHistoryRewrite = snapshotHandler.indexOf('setHistoryFromCanonical');
assert.ok(statusGuard >= 0, 'quote and transport status events must not trigger candle history work');
assert.ok(tickBranch > statusGuard, 'the tick fast path must run after non-candle event filtering');
assert.ok(fullHistoryRewrite > tickBranch, 'full history projection must only run after the tick fast path returns');
assert.ok(snapshotHandler.includes('realtimeController.handleTick('), 'live ticks must flow through the forming-bar renderer path');
assert.ok(snapshotHandler.includes('realtimeController.hydrateHistory('), 'history mutations must still rehydrate calculation state');
assert.ok(snapshotHandler.includes('chartIndicatorController.renderStudies(data,true)'), 'history refreshes must preserve committed worker indicator output until replacement data commits');
assert.ok(indicator.includes('const activeIds=new Set(nextIndicators.filter(item=>item.enabled).map(item=>item.id))'), 'disabled or removed indicators must release their retained worker series');
assert.ok(indicator.includes('workerSeriesMap.delete(id)'), 'removed worker series must be removed from the worker output registry');
assert.ok(snapshotHandler.includes('snapshot.columns?.time.length'), 'columnar history must not be reported as empty during a broker status error');

const workerStart = indicator.indexOf('const requestIndicatorWorker=');
const workerEnd = indicator.indexOf('\n\n  return {', workerStart);
assert.ok(workerStart >= 0 && workerEnd > workerStart, 'worker request function must be available for chart indicators');
const workerRequest = indicator.slice(workerStart, workerEnd);
assert.ok(workerRequest.includes('.catch(error=>'), 'indicator worker and fallback rejections must be handled at the chart boundary');
assert.ok(workerRequest.includes('AbortError'), 'expected superseded worker cancellation must not be reported as a runtime failure');
assert.ok(workerRequest.includes('requestSeq!==indicatorRequestSeq.current'), 'late worker failures must be ignored after a newer request');
assert.ok(workerRequest.includes('previous indicator output was retained'), 'worker failure reporting must state that retained output was not replaced');
assert.ok(workerRequest.includes('tco:chart:indicator-worker-error'), 'unexpected current worker failures must be observable by the workspace');

const drawings = readFileSync(new URL('../vendor/vela/src/core/DrawingsControl.ts', import.meta.url), 'utf8');
assert.ok(drawings.includes('group(ids?: readonly string[])'), 'public chart.drawings facade must expose grouping');
assert.ok(drawings.includes('ungroup(ids?: readonly string[])'), 'public chart.drawings facade must expose ungrouping');
assert.ok(workspace.includes("addEventListener('tco:chart:indicator-worker-error', onIndicatorWorkerError)"), 'workspace must capture indicator worker failures in bounded diagnostics');
assert.ok(workspace.includes("removeEventListener('tco:chart:indicator-worker-error', onIndicatorWorkerError)"), 'workspace must release its indicator failure listener on teardown');

console.log('CHART_RUNTIME_RELIABILITY_CONTRACT_OK');
