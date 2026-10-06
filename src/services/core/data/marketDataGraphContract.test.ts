import { MarketDataGraph, createGraphResolver, timeframeSeconds } from './marketDataGraph';

const graph=new MarketDataGraph({anchorSecondsUtc:13500});
const base=[
  {timestamp:'2026-10-06T03:45:00.000Z',open:100,high:101,low:99,close:100.5,volume:10},
  {timestamp:'2026-10-06T03:46:00.000Z',open:100.5,high:102,low:100,close:101.5,volume:12},
  {timestamp:'2026-10-06T03:47:00.000Z',open:101.5,high:103,low:101,close:102.5,volume:14},
  {timestamp:'2026-10-06T03:48:00.000Z',open:102.5,high:104,low:102,close:103.5,volume:16},
  {timestamp:'2026-10-06T03:49:00.000Z',open:103.5,high:105,low:103,close:104.5,volume:18},
];
graph.syncBase('NIFTY','1m',base);

const derived=graph.ensureNode('NIFTY','5m');
if(!derived)throw new Error('5m graph node was not derived from NIFTY 1m');
const view=derived.plane.market.views();
if(view.length!==1)throw new Error('5m aggregation must collapse five 1m bars into one bucket');
if(view.open[0]!==100||view.high[0]!==105||view.low[0]!==99||view.close[0]!==104.5||view.volume[0]!==70) {
  throw new Error('5m OHLCV aggregation mismatch');
}

graph.syncBase('BANKNIFTY','1m',base.map(row=>({...row,open:row.open+1000,high:row.high+1000,low:row.low+1000,close:row.close+1000})));
const snapshot=graph.snapshot([
  {symbol:'current',timeframe:'5m',fields:['close']},
  {symbol:'BANKNIFTY',timeframe:'5m',fields:['close']},
],'NIFTY','1m');
if(snapshot.nodes.length!==2)throw new Error('shared graph snapshot must deduplicate symbol/timeframe requests');

const resolver=createGraphResolver(snapshot,'NIFTY','1m');
const aligned=resolver.requestAt?.({
  symbol:'current',
  timeframe:'5m',
  field:'close',
  offset:0,
},{
  asOfTimestamp:base.at(-1)!.timestamp ? Date.parse(base.at(-1)!.timestamp)/1000 + 60 : 0,
  baseSymbol:'NIFTY',
  baseTimeframe:'1m',
  executionMode:'historical',
  revision:snapshot.revision,
  alignment:'last-confirmed',
});
if(!aligned||aligned.value!==104.5)throw new Error('last-confirmed MTF alignment must return the completed 5m bar');

const developing=resolver.requestAt?.({
  symbol:'current',
  timeframe:'5m',
  field:'close',
  offset:0,
},{
  asOfTimestamp:Date.parse('2026-10-06T03:49:30.000Z')/1000,
  baseSymbol:'NIFTY',
  baseTimeframe:'1m',
  executionMode:'realtime',
  revision:snapshot.revision,
  alignment:'last-confirmed',
});
if(developing?.value!==null&&developing?.state==='confirmed') {
  throw new Error('forming MTF bar must not be exposed as confirmed before its boundary');
}

if(timeframeSeconds('15m')!==900||timeframeSeconds('1H')!==3600||timeframeSeconds('1D')!==86400) {
  throw new Error('CoreSpirit graph timeframe normalization is incomplete');
}

console.log('CORESPIRIT_MARKET_DATA_GRAPH_CONTRACT_OK');
