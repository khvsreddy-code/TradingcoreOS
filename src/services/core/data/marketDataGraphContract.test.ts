import assert from 'node:assert/strict';
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

// A delayed live packet from an older bar must not replace the entire
// graph with a single candle. Recovery/corrections use an explicit history API.
graph.updateBaseLast('NIFTY','1m',{
  timestamp:'2026-10-06T03:44:00.000Z',open:99,high:100,low:98,close:99.5,volume:5,
});
const baseAfterStale=graph.ensureNode('NIFTY','1m');
if(!baseAfterStale||baseAfterStale.plane.market.length!==base.length){
  throw new Error('stale live graph ticks must preserve the canonical history length');
}
if(baseAfterStale.plane.market.time[0]!==Date.parse(base[0]!.timestamp)/1000){
  throw new Error('stale live graph ticks must not replace the oldest retained timestamp');
}

const derived=graph.ensureNode('NIFTY','5m');
if(!derived)throw new Error('5m graph node was not derived from NIFTY 1m');
const view=derived.plane.market.views();
if(view.time.length!==1)throw new Error('5m aggregation must collapse five 1m bars into one bucket');
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

const exact=resolver.requestAt?.({
  symbol:'current',timeframe:'5m',field:'close',offset:0,
},{
  asOfTimestamp:Date.parse('2026-10-06T03:45:00.000Z')/1000,
  baseSymbol:'NIFTY',baseTimeframe:'1m',executionMode:'historical',
  revision:snapshot.revision,alignment:'exact',
});
if(exact?.value!==null||exact.source!=='data-graph:unconfirmed'||exact.state!=='developing'){
  throw new Error('historical exact alignment must not expose an unconfirmed higher-timeframe bar');
}
const exactRealtime=resolver.requestAt?.({
  symbol:'current',timeframe:'5m',field:'close',offset:0,
},{
  asOfTimestamp:Date.parse('2026-10-06T03:45:00.000Z')/1000,
  baseSymbol:'NIFTY',baseTimeframe:'1m',executionMode:'realtime',
  revision:snapshot.revision,alignment:'exact',
});
if(exactRealtime?.value!==104.5||exactRealtime.confirmationPhase!=='developing'){
  throw new Error('explicit realtime exact alignment may inspect the forming value but must label it developing');
}
const unaligned=resolver.requestAt?.({
  symbol:'current',timeframe:'5m',field:'close',offset:0,
},{
  asOfTimestamp:Date.parse('2026-10-06T03:46:00.000Z')/1000,
  baseSymbol:'NIFTY',baseTimeframe:'1m',executionMode:'historical',
  revision:snapshot.revision,alignment:'exact',
});
if(unaligned?.value!==null||unaligned?.source!=='data-graph:unaligned'){
  throw new Error('exact alignment must not silently return an earlier candle timestamp');
}
const nearest=resolver.requestAt?.({
  symbol:'current',timeframe:'5m',field:'close',offset:0,
},{
  asOfTimestamp:Date.parse('2026-10-06T03:49:30.000Z')/1000,
  baseSymbol:'NIFTY',baseTimeframe:'1m',executionMode:'realtime',
  revision:snapshot.revision,alignment:'nearest-confirmed',
});
if(nearest?.value!==null){
  throw new Error('nearest-confirmed alignment must not leak a still-forming higher-timeframe candle');
}
const freshAtClose=resolver.requestAt?.({
  symbol:'current',timeframe:'5m',field:'close',offset:0,
},{
  asOfTimestamp:Date.parse('2026-10-06T03:50:00.000Z')/1000,
  baseSymbol:'NIFTY',baseTimeframe:'1m',executionMode:'realtime',
  revision:snapshot.revision,alignment:'last-confirmed',maxStalenessMs:60_000,
});
if(freshAtClose?.value!==104.5){
  throw new Error('staleness must be measured from the higher-timeframe candle close boundary');
}
const stale=resolver.requestAt?.({
  symbol:'current',timeframe:'5m',field:'close',offset:0,
},{
  asOfTimestamp:Date.parse('2026-10-06T04:00:00.000Z')/1000,
  baseSymbol:'NIFTY',baseTimeframe:'1m',executionMode:'realtime',
  revision:snapshot.revision,alignment:'last-confirmed',maxStalenessMs:60_000,
});
if(stale?.value!==null||stale?.source!=='data-graph:stale'){
  throw new Error('market graph should return a missing value for a candle beyond its allowed staleness');
}

if(timeframeSeconds('5')!==300||timeframeSeconds('15')!==900||timeframeSeconds('5m')!==300||timeframeSeconds('15m')!==900||timeframeSeconds('1H')!==3600||timeframeSeconds('1D')!==86400) {
  throw new Error('CoreSpirit graph timeframe normalization is incomplete');
}

// Cache identities follow the requested symbol/timeframe data revision, not
// the global graph revision. An unrelated symbol refresh is not a cache miss.
const cacheSnapshotBefore=graph.snapshot([
  {symbol:'NIFTY',timeframe:'5m',fields:['close']},
  {symbol:'BANKNIFTY',timeframe:'5m',fields:['close']},
],'NIFTY','1m');
const cacheResolver=createGraphResolver(cacheSnapshotBefore,'NIFTY','1m');
const cacheRequest={symbol:'NIFTY',timeframe:'5m',field:'close' as const,offset:0};
const bankRequest={symbol:'BANKNIFTY',timeframe:'5m',field:'close' as const,offset:0};
const niftyKeyBefore=cacheResolver.cacheKey?.(cacheRequest);
const bankKeyBefore=cacheResolver.cacheKey?.(bankRequest);
graph.syncBase('BANKNIFTY','1m',base.map(row=>({...row,close:row.close+25,open:row.open+25,high:row.high+25,low:row.low+25})));
const bankUpdatedSnapshot=graph.snapshot([
  {symbol:'NIFTY',timeframe:'5m',fields:['close']},
  {symbol:'BANKNIFTY',timeframe:'5m',fields:['close']},
],'NIFTY','1m');
cacheResolver.replaceSnapshot(bankUpdatedSnapshot);
assert.equal(cacheResolver.cacheKey?.(cacheRequest),niftyKeyBefore,
  'unrelated BANKNIFTY updates must not invalidate the NIFTY 5m cache identity');
assert.notEqual(cacheResolver.cacheKey?.(bankRequest),bankKeyBefore,
  'BANKNIFTY cache identity must change when its canonical source data changes');
graph.syncBase('NIFTY','1m',base.map(row=>({...row,close:row.close+50,open:row.open+50,high:row.high+50,low:row.low+50})));
const niftyUpdatedSnapshot=graph.snapshot([{symbol:'NIFTY',timeframe:'5m',fields:['close']}],'NIFTY','1m');
cacheResolver.replaceSnapshot(niftyUpdatedSnapshot);
assert.notEqual(cacheResolver.cacheKey?.(cacheRequest),niftyKeyBefore,
  'the requested NIFTY cache identity must change after its own canonical revision advances');


// Exchange-calendar fixture: daily buckets align to the actual session open,
// ignore lunch breaks/holidays, and use the real session close for confirmation.
const DAY = 86_400;
const openOfDay = (day:number) => day * DAY + 9 * 3600;
const lunchStartOfDay = (day:number) => openOfDay(day) + 3 * 3600;
const lunchEndOfDay = (day:number) => openOfDay(day) + 4 * 3600;
const sessionProfile = {
  anchorSecondsUtc:0,
  calendarId:'fixture-exchange-calendar-v1',
  sessionAt(timestampSeconds:number) {
    const day=Math.floor(timestampSeconds/DAY);
    const secondOfDay=timestampSeconds-day*DAY;
    if(day===2 || secondOfDay<9*3600 || secondOfDay>=16*3600 ||
       (secondOfDay>=12*3600 && secondOfDay<13*3600)) return null;
    return {id:'session-'+day,openSeconds:openOfDay(day),closeSeconds:day*DAY+16*3600};
  },
};
const fixtureBar=(timestampSeconds:number,close:number,volume=1)=>({
  timestamp:new Date(timestampSeconds*1000).toISOString(),
  open:close-0.5,high:close+1,low:close-1,close,volume,
});
const calendarRows=[
  fixtureBar(openOfDay(0),100,2),
  fixtureBar(openOfDay(0)+60,101,3),
  fixtureBar(lunchStartOfDay(0)-60,109,5),
  fixtureBar(lunchEndOfDay(0),110,7),
  fixtureBar(lunchEndOfDay(0)+60,112,11),
  fixtureBar(openOfDay(1),120,13),
  fixtureBar(openOfDay(1)+60,121,17),
  fixtureBar(openOfDay(2)+60,999,999), // A provider artifact on a market holiday.
  fixtureBar(openOfDay(3),130,19),
  fixtureBar(openOfDay(3)+60,131,23),
];
const allAtOnce=new MarketDataGraph(sessionProfile);
allAtOnce.syncBase('TEST','1m',calendarRows,sessionProfile);
const daily=allAtOnce.ensureNode('TEST','1D');
if(!daily)throw new Error('session-aware daily derived node was not created');
const dailyView=daily.plane.market.views();
if(dailyView.time.length!==3)throw new Error('daily aggregation must ignore a holiday and retain one bar per open session');
if(dailyView.time[0]!==openOfDay(0)||dailyView.time[1]!==openOfDay(1)||dailyView.time[2]!==openOfDay(3)){
  throw new Error('daily buckets must be anchored to session opens, skipping the market holiday');
}
if(dailyView.close[0]!==112)throw new Error('scheduled lunch break must not split one daily OHLCV bucket');
const dailySnapshot=allAtOnce.snapshot([{symbol:'TEST',timeframe:'1D',fields:['close']}],'TEST','1m');
const dailyResolver=createGraphResolver(dailySnapshot,'TEST','1m');
const beforeClose=dailyResolver.requestAt?.({
  symbol:'TEST',timeframe:'1D',field:'close',offset:0,
},{
  asOfTimestamp:lunchStartOfDay(1)+30*60,
  baseSymbol:'TEST',baseTimeframe:'1m',executionMode:'historical',
  revision:dailySnapshot.revision,alignment:'last-confirmed',
});
if(beforeClose?.value!==112)throw new Error('unconfirmed current-session daily values must fall back to the prior completed session');
const liveDeveloping=dailyResolver.requestAt?.({
  symbol:'TEST',timeframe:'1D',field:'close',offset:0,
},{
  asOfTimestamp:lunchStartOfDay(1)+30*60,
  baseSymbol:'TEST',baseTimeframe:'1m',executionMode:'realtime',
  revision:dailySnapshot.revision,alignment:'developing',
});
if(liveDeveloping?.value!==121||liveDeveloping.confirmationPhase!=='developing'){
  throw new Error('realtime daily values are allowed only with an explicit developing label');
}
const atSessionClose=dailyResolver.requestAt?.({
  symbol:'TEST',timeframe:'1D',field:'close',offset:0,
},{
  asOfTimestamp:openOfDay(1)+7*3600,
  baseSymbol:'TEST',baseTimeframe:'1m',executionMode:'historical',
  revision:dailySnapshot.revision,alignment:'last-confirmed',
});
if(atSessionClose?.value!==121||atSessionClose.confirmationPhase!=='confirmed'){
  throw new Error('daily values become confirmed at the exchange session close, not 24 hours after the open');
}

// The same canonical rows delivered incrementally or in one batch must produce
// byte-for-byte equivalent OHLCV aggregation despite session gaps and a holiday.
const incremental=new MarketDataGraph(sessionProfile);
incremental.syncBase('TEST','1m',calendarRows.slice(0,2),sessionProfile);
incremental.ensureNode('TEST','5m');
incremental.ensureNode('TEST','1D');
for(const row of calendarRows.slice(2)) incremental.updateBaseLast('TEST','1m',row,sessionProfile);
const incDaily=incremental.ensureNode('TEST','1D')!.plane.market.views();
assert.deepEqual(
  {
    time:Array.from(incDaily.time),open:Array.from(incDaily.open),high:Array.from(incDaily.high),
    low:Array.from(incDaily.low),close:Array.from(incDaily.close),volume:Array.from(incDaily.volume),
  },
  {
    time:Array.from(dailyView.time),open:Array.from(dailyView.open),high:Array.from(dailyView.high),
    low:Array.from(dailyView.low),close:Array.from(dailyView.close),volume:Array.from(dailyView.volume),
  },
  'all-at-once and incremental session-aware aggregation must be equivalent',
);
assert.ok(allAtOnce.snapshot([{symbol:'TEST',timeframe:'1D',fields:['close']}],'TEST','1m').nodes[0]?.closeTime,
  'session close boundaries must travel with graph snapshots');


// Forming source candle replacements update a retained bucket aggregate rather
// than rescanning source history. The indexed extrema heaps restore displaced
// prior highs/lows when the latest source bar is revised down.
const hotGraph=new MarketDataGraph({anchorSecondsUtc:13500});
hotGraph.syncBase('HOT','1m',base);
const hotDerived=hotGraph.ensureNode('HOT','5m');
if(!hotDerived)throw new Error('hot-path 5m derived node missing');
const beforeHot=hotGraph.stats();
hotGraph.updateBaseLast('HOT','1m',{
  timestamp:base.at(-1)!.timestamp,open:103.5,high:120,low:98,close:110,volume:20,
});
hotGraph.updateBaseLast('HOT','1m',{
  timestamp:base.at(-1)!.timestamp,open:103.5,high:103,low:100,close:102,volume:22,
});
const afterHot=hotGraph.stats();
assert.equal(afterHot.fullAggregationRebuilds,beforeHot.fullAggregationRebuilds,
  'forming source-candle revisions do not trigger a historical aggregate rebuild');
assert.equal(afterHot.incrementalTailUpdates,beforeHot.incrementalTailUpdates+2,
  'each forming source-candle revision updates retained aggregate state');
const hotView=hotDerived.plane.market.views();
assert.equal(hotView.high[0],104,'revising the latest high reveals the next-highest earlier candle');
assert.equal(hotView.low[0],99,'revising the latest low reveals the next-lowest earlier candle');
assert.equal(hotView.close[0],102);
assert.equal(hotView.volume[0],74,'replacement volume is applied as a delta');

const nextSource={timestamp:'2026-10-06T03:50:00.000Z',open:102,high:106,low:101,close:105,volume:9};
hotGraph.updateBaseLast('HOT','1m',nextSource);
hotGraph.updateBaseLast('HOT','1m',{...nextSource,high:104,low:100,close:103,volume:11});
const hotBoundary=hotDerived.plane.market.views();
assert.equal(hotBoundary.time.length,2,'new source bucket appends one derived timeframe candle');
assert.equal(hotBoundary.high[1],104);
assert.equal(hotBoundary.low[1],100);
assert.equal(hotBoundary.close[1],103);
assert.equal(hotBoundary.volume[1],11);

// Time-based idle expiry works even below capacity, and a live symbol pin wins.
const idleGraph=new MarketDataGraph({anchorSecondsUtc:13500},64,128*1024*1024,30_000);
idleGraph.syncBase('IDLE','1m',base);
idleGraph.ensureNode('IDLE','5m');
const releaseIdlePin=idleGraph.retainSymbol('IDLE');
const futureIdleTime=Date.now()+60_000;
assert.equal(idleGraph.trimIdleSymbols(futureIdleTime),0,'pinned graph nodes cannot be evicted');
assert.equal(idleGraph.listNodes().filter(node=>node.symbol==='IDLE').length,2);
releaseIdlePin();
assert.equal(idleGraph.trimIdleSymbols(futureIdleTime),2,'expired unpinned graph nodes are evicted without capacity pressure');
assert.equal(idleGraph.listNodes().some(node=>node.symbol==='IDLE'),false);


// Live dependency traversal is indexed by source, and no whole-graph capacity
// trim is performed per market update. Unrelated visited symbols do no work.
const fanoutGraph=new MarketDataGraph({anchorSecondsUtc:13500},64);
fanoutGraph.syncBase('HOT-FANOUT','1m',base);
fanoutGraph.ensureNode('HOT-FANOUT','5m');
for(let index=0;index<32;index+=1){
  const symbol='VISITED-'+index;
  fanoutGraph.syncBase(symbol,'1m',base);
  fanoutGraph.ensureNode(symbol,'5m');
}
const beforeFanout=fanoutGraph.stats();
fanoutGraph.updateBaseLast('HOT-FANOUT','1m',{
  timestamp:base.at(-1)!.timestamp,open:103.5,high:106,low:102,close:105,volume:19,
});
const afterFanout=fanoutGraph.stats();
assert.equal(afterFanout.dependencyNodesVisited-beforeFanout.dependencyNodesVisited,1,
  'a base candle visits only its own direct derived-timeframe children');
assert.equal(afterFanout.fullAggregationRebuilds,beforeFanout.fullAggregationRebuilds,
  'unrelated graph history is not rebuilt during a live candle update');


// Session calendar identity/anchor changes invalidate retained aggregation
// state and deliberately take the full rebuild path.
const calendarChangeGraph=new MarketDataGraph(sessionProfile);
calendarChangeGraph.syncBase('CALENDAR-CHANGE','1m',calendarRows,sessionProfile);
const calendarDerived=calendarChangeGraph.ensureNode('CALENDAR-CHANGE','1D');
if(!calendarDerived)throw new Error('session-calendar derived node missing');
const beforeCalendarChange=calendarChangeGraph.stats();
const nextSessionProfile={...sessionProfile,calendarId:'fixture-exchange-calendar-v2'};
calendarChangeGraph.updateBaseLast('CALENDAR-CHANGE','1m',calendarRows.at(-1)!,nextSessionProfile);
const afterCalendarChange=calendarChangeGraph.stats();
assert.equal(afterCalendarChange.fullAggregationRebuilds,beforeCalendarChange.fullAggregationRebuilds+1,
  'a calendar identity change must rebuild derived history instead of reusing old bucket state');

console.log('CORESPIRIT_MARKET_DATA_GRAPH_CONTRACT_OK');


// Derived timeframes age independently from a hot base timeframe. A live 1m
// stream must not keep old 5m/15m nodes registered forever.
const perNodeIdleGraph=new MarketDataGraph({anchorSecondsUtc:13500},64,128*1024*1024,30_000);
perNodeIdleGraph.syncBase('PER-NODE-IDLE','1m',base);
perNodeIdleGraph.ensureNode('PER-NODE-IDLE','5m');
perNodeIdleGraph.ensureNode('PER-NODE-IDLE','15m');
const internals=perNodeIdleGraph as unknown as {nodes:Map<string,{lastUsedAt:number}>};
const baseNode=internals.nodes.get('PER-NODE-IDLE::1m');
const fiveNode=internals.nodes.get('PER-NODE-IDLE::5m');
const fifteenNode=internals.nodes.get('PER-NODE-IDLE::15m');
if(!baseNode||!fiveNode||!fifteenNode)throw new Error('per-node idle dependency fixture was not created');
fiveNode.lastUsedAt=Date.now()-60_000;fifteenNode.lastUsedAt=Date.now()-60_000;baseNode.lastUsedAt=Date.now();
perNodeIdleGraph.updateBaseLast('PER-NODE-IDLE','1m',{...base.at(-1)!,timestamp:'2026-10-06T03:50:00.000Z',open:104.5,high:106,low:104,close:105,volume:7});
assert.equal(perNodeIdleGraph.trimIdleSymbols(),2,'idle derived leaves are evicted while the base remains active');
assert.deepEqual(perNodeIdleGraph.listNodes().map(node=>node.timeframe),['1m']);
assert.equal(perNodeIdleGraph.stats().idleEvictions,2);
console.log('CORESPIRIT_MARKET_DATA_GRAPH_PER_NODE_IDLE_OK');
