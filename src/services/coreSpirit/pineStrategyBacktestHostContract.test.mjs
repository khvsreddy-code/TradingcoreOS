import assert from 'node:assert/strict';
import {CoreSpiritCompiler} from './compiler.ts';
import {runCoreSpiritPineStrategyBacktest} from './pineStrategySimulationAdapter.ts';
import {CORE_SPIRIT_MARKET_DATA_VERSION} from './marketData.ts';

const source=`//@version=6
strategy("End to end simulated strategy", pyramiding=1)
strategy.entry("Long", strategy.long, 1)
strategy.exit("Protect", "Long", 1, null, null, 101, null, 98)`;
const compiled=new CoreSpiritCompiler().compileSource(source,'end-to-end-pine-backtest',{frontend:'pine-v6'});
assert.ok(compiled.artifact,compiled.diagnostics.map(item=>item.code+': '+item.message).join('\n'));
const bars=[
 {timestamp:'2026-03-01T09:15:00.000Z',open:100,high:102,low:99,close:101,volume:1000},
 {timestamp:'2026-03-01T09:20:00.000Z',open:101,high:103,low:100,close:102,volume:1000},
 {timestamp:'2026-03-01T09:25:00.000Z',open:102,high:104,low:97,close:99,volume:1000},
 {timestamp:'2026-03-01T09:30:00.000Z',open:99,high:101,low:97,close:100,volume:1000},
];
const result=runCoreSpiritPineStrategyBacktest({
 runId:'backtest-run-1',
 artifact:compiled.artifact!,
 dataset:{version:CORE_SPIRIT_MARKET_DATA_VERSION,id:'synthetic-bars-1',symbol:'NSE:TEST',timeframe:'5m',bars,source:'synthetic'},
 defaultQuantity:1,
 config:{slippageBps:0,spreadBps:0,brokeragePerOrder:0,maxParticipationRate:1,allowShort:false},
});
assert.equal(result.hostRun.identity.mode,'backtest');
assert.equal(result.hostRun.identity.target,'backtest');
assert.ok(result.hostRun.outputs.some(output=>output.kind==='event'&&output.name==='strategy.entry'));
assert.ok(result.simulation.ledger.some(event=>event.eventType==='fill'));
assert.equal(result.simulation.executionAuthority,'simulation-only');
assert.ok(result.metrics,'the end-to-end backtest returns performance analytics');
assert.equal(result.diagnostics.length,0);
console.log('CORESPIRIT_PINE_BACKTEST_EXECUTION_HOST_OK');
