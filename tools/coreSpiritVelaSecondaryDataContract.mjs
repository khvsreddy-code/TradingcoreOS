import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const engine = read('../src/CoreSpiritVelaEngine.ts');
const graph = read('../src/services/core/data/marketDataGraph.ts');
const workerPool = read('../src/services/coreSpirit/coreSpiritWorkerPool.ts');
const runtime = read('../src/services/coreSpirit/runtime.ts');
const synchronization = read('../src/services/coreSpirit/multiSymbolTimeframe.ts');
const types = read('../src/services/coreSpirit/types.ts');

// The engine is responsible for bounded, latest-wins acquisition and for
// attaching exchange-aware close times to the immutable secondary graph snapshot.
assert.match(engine, /const dataDependencies = token\.ir\.tradingNativePlan\?\.dataDependencies/);
assert.match(engine, /loadSecondaryData = async \(force=false\)/);
assert.match(engine, /const requestVersion = \+\+secondaryRequestVersion/);
assert.match(engine, /requestVersion !== secondaryRequestVersion/);
assert.match(engine, /requestVersion === secondaryRequestVersion/);
assert.match(engine, /if \(force\) secondaryAbortController\?\.abort\(\)/);
assert.match(engine, /secondaryFailed = new Set/);
assert.match(engine, /secondaryPending = new Set/);
assert.match(engine, /secondaryDegraded = secondaryFailed\.size>0 \|\| secondaryPending\.size>0/);
assert.match(engine, /Secondary market data unavailable/);
assert.match(engine, /Secondary market data refresh failed/);
assert.match(engine, /const makeSecondaryGraphSnapshot=/);
assert.match(engine, /req\.marketCalendar\?\.resolveBarCloseTime/);
assert.match(engine, /closeTime:Float64Array\.from\(temporalRows/);
assert.match(engine, /graphSnapshot:makeSecondaryGraphSnapshot\(\)/);

// The worker pool installs the graph resolver as the runtime's only secondary
// market-data boundary. It is refreshed by graph revision, not by a second
// engine-local resolver or a second provider fetch.
assert.match(workerPool, /createGraphResolver\(graphSnapshot,graphBaseSymbol,graphBaseTimeframe\)/);
assert.match(workerPool, /dataResolver:graphResolver/);
assert.match(workerPool, /context\.graphResolver\.replaceSnapshot\(graphSnapshot\)/);

// Graph alignment is causal and exchange-calendar-aware. Exact means exact;
// confirmed alignment walks back until the sample's real close boundary has
// passed; developing samples carry explicit phase metadata.
assert.match(graph, /if\(alignment==='exact'\)return node\.time\[index\]===asOf\?index:-1/);
assert.match(graph, /alignment==='last-confirmed'\|\|alignment==='nearest-confirmed'/);
assert.match(graph, /if\(!Number\.isFinite\(close\)\|\|close>asOf\)index-=1/);
assert.match(graph, /ctx\?\.maxStalenessMs!=null/);
assert.match(graph, /effectiveStaleAgeMs>ctx\.maxStalenessMs/);
assert.match(graph, /confirmationPhase:isConfirmed \? 'confirmed' as const : 'developing' as const/);
assert.match(graph, /state:isConfirmed\?'confirmed':'developing'/);

// Runtime language reads cannot bypass the graph policy: developing is only
// admitted for real-time execution, then the shared temporal validator checks
// timestamp, close boundary, confirmation and any supplied staleness budget.
assert.match(runtime, /phase==='developing'\|\|phase==='realtime'\?'developing':'last-confirmed'/);
assert.match(runtime, /alignment==='developing' && this\.executionContext\.mode!=='realtime'/);
assert.match(runtime, /validateSynchronizedSnapshot\(snapshot,ctx\)/);
assert.match(synchronization, /context\.maxStalenessMs/);
assert.match(synchronization, /if \(markedDeveloping && context\.alignment !== 'developing'\) return null/);
assert.match(synchronization, /resolvedCloseTimestamp > context\.asOfTimestamp/);
assert.match(types, /maxStalenessMs\?: number/);

console.log('CORESPIRIT_VELA_SECONDARY_DATA_GRAPH_CONTRACT_OK');
