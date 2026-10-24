import assert from 'node:assert/strict';
import { replayTimestampMs, validateReplayBars } from './replayValidator';

const valid = [
  {timestamp:'2026-01-01T09:15:00.000Z',open:100,high:102,low:99,close:101,volume:10},
  {timestamp:'2026-01-01T09:20:00.000Z',open:101,high:104,low:100,close:103,volume:20},
];
assert.equal(replayTimestampMs(valid[0]!.timestamp),Date.parse(valid[0]!.timestamp));
assert.equal(replayTimestampMs('1767258900000'),1767258900000);
assert.equal(replayTimestampMs('1767258900'),1767258900000);
assert.equal(validateReplayBars(valid).valid,true);
const epoch = [{...valid[0]!,timestamp:String(Date.parse(valid[0]!.timestamp))}];
assert.equal(validateReplayBars(epoch).valid,true);
const duplicate=validateReplayBars([valid[0]!,{...valid[1]!,timestamp:valid[0]!.timestamp}]);
assert.equal(duplicate.valid,false,'duplicate ISO timestamps must be detected');
const reversed=validateReplayBars([...valid].reverse());
assert.equal(reversed.valid,false,'source bars are not silently reordered');
assert.ok(reversed.errors.some(error=>error.includes('strictly chronological')));
console.log('REPLAY_TIMESTAMP_AND_ORDERING_VALIDATION_OK');
