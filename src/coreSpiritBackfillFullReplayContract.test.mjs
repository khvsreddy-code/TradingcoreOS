import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync('src/CoreSpiritVelaEngine.ts','utf8');
const start=source.indexOf("if(reason==='backfill'){");
const end=source.indexOf("if(reason==='complete'){",start);
assert.ok(start>=0&&end>start,'backfill lifecycle branch must be present');
const branch=source.slice(start,end);
assert.match(branch,/workerDatasetVersions\.delete\(mainContextKey\)/,'retire the prior main worker dataset version');
assert.match(branch,/mainRunGeneration\+=1/,'invalidate in-flight main worker generations');
assert.match(branch,/viewportRunGeneration\+=1/,'invalidate in-flight viewport runs');
assert.match(branch,/initializeFromBars\(currentBars\)/,'rebuild from the complete canonical history on backfill');
assert.doesNotMatch(branch,/const rangeBars=currentBars\.slice\(executionStart,end\)/,'do not truncate recursive indicator warm-up to finite maxLookback');
assert.doesNotMatch(branch,/backfillContextKey/,'the active chart must not patch from a disconnected partial-history context');
console.log('CORESPIRIT_BACKFILL_FULL_HISTORY_REPLAY_OK');
