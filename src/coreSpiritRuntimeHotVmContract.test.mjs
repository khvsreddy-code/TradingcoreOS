import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const runtime = read('src/services/coreSpirit/runtime.ts');
const vm = read('src/services/coreSpirit/executionVM.ts');
const state = read('src/services/coreSpirit/stateStore.ts');
const series = read('src/services/coreSpirit/seriesStore.ts');
const output = read('src/services/coreSpirit/outputCollector.ts');
const events = read('src/services/coreSpirit/eventRouter.ts');

assert(runtime.includes("new CoreSpiritExecutionVM()"));
assert(runtime.includes("new CoreSpiritStateStore()"));
assert(runtime.includes("this.executionVm.run("));
assert(runtime.includes("this.stateStore.beginRealtimeTransaction()"));
assert(runtime.includes("this.stateStore.rollbackRealtimeTransaction()"));
assert(runtime.includes("this.stateStore.commitRealtimeTransaction()"));
assert(!runtime.includes("cloneNumberMap(this.currentBarSnapshot"));
assert(!runtime.includes("cloneValueMap(this.currentBarSnapshot"));
assert(!runtime.includes("cloneCrossMap(this.currentBarSnapshot"));
assert(runtime.includes("getState({ clone:false })"));
assert(vm.includes("while (pc < instructions.length)"));
assert(vm.includes("host.tryFused"));
assert(series.includes("numberJournal"));
assert(series.includes("valueJournal"));
assert(series.includes("crossJournal"));
assert(output.includes("beginBar(clear = false)"));
assert(events.includes('beginTransaction'));
assert(events.includes('commitTransaction'));
assert(events.includes('rollbackTransaction'));
assert(runtime.includes('this.eventRouter.beginTransaction'));
assert(runtime.includes('this.eventRouter.rollbackTransaction'));
assert(runtime.includes('this.eventRouter.commitTransaction'));

console.log('TRADINGCORE_V132_CORESPIRIT_HOT_VM_AND_COW_CONTRACT_OK');
