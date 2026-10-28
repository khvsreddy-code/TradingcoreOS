import assert from 'node:assert/strict';
import { historicalSourcePriority } from './HistoricalDataService';

const sources = ['nse', 'investiny', 'fyers', 'tvdatafeed'] as const;
const ordered = [...sources].sort((left, right) => historicalSourcePriority(right) - historicalSourcePriority(left));
assert.deepEqual(ordered, ['nse', 'investiny', 'fyers', 'tvdatafeed']);
assert.ok(historicalSourcePriority('nse') > historicalSourcePriority('investiny'));
assert.ok(historicalSourcePriority('investiny') > historicalSourcePriority('fyers'));
assert.ok(historicalSourcePriority('fyers') > historicalSourcePriority('tvdatafeed'));
console.log('MARKET_DATA_SOURCE_PRIORITY_OK');
