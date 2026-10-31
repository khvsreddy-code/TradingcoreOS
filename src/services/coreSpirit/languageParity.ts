/**
 * CoreSpirit language feature parity.
 * Simple and advanced authoring are two surfaces over one language pipeline.
 */
export type CoreSpiritParityStatus='implemented'|'partial'|'surface-only'|'planned';
export type CoreSpiritParityDomain='pine-language'|'trading-data'|'quant'|'research'|'runtime';

export type CoreSpiritFeatureParity=Readonly<{
  id:string;
  domain:CoreSpiritParityDomain;
  status:CoreSpiritParityStatus;
  scope:string;
  nativeSurface?:string;
  proof?:string;
}>;

export const CORE_SPIRIT_AUTHORING_SURFACES=Object.freeze({
  simple:Object.freeze({
    id:'simple',
    description:'Concise trading surface: DATA / LET / WHEN / SHOW.',
    parser:'CoreSpiritParser',
    ast:'CoreSpiritAst',
    compiler:'CoreSpiritCompiler',
    runtime:'CoreSpiritExecutionVM',
  }),
  advanced:Object.freeze({
    id:'advanced',
    description:'Explicit quantitative/system surface: types, functions, models, events, state and research.',
    parser:'CoreSpiritParser',
    ast:'CoreSpiritAst',
    compiler:'CoreSpiritCompiler',
    runtime:'CoreSpiritExecutionVM',
  }),
} as const);

export const CORE_SPIRIT_PINE_FEATURE_MATRIX:readonly CoreSpiritFeatureParity[]=Object.freeze([
  {id:'declarations',domain:'pine-language',status:'implemented',scope:'let/type/on declarations',nativeSurface:'let / type / on'},
  {id:'inputs',domain:'pine-language',status:'partial',scope:'input-like surface lowers to let declarations',nativeSurface:'input …'},
  {id:'variables',domain:'pine-language',status:'implemented',scope:'locals and state mutation',nativeSurface:'let / :='},
  {id:'types',domain:'pine-language',status:'implemented',scope:'scalar, series, temporal, model and research types',nativeSurface:'typed declarations'},
  {id:'series',domain:'pine-language',status:'implemented',scope:'historical typed series and indexing',nativeSurface:'series<T> / close[n]'},
  {id:'arrays',domain:'pine-language',status:'planned',scope:'typed mutable collections',nativeSurface:'array<T>'},
  {id:'maps',domain:'pine-language',status:'planned',scope:'typed key/value collections',nativeSurface:'map<K,V>'},
  {id:'matrices',domain:'pine-language',status:'partial',scope:'matrix<T> type exists; constructors/operations pending',nativeSurface:'matrix<T>'},
  {id:'functions',domain:'pine-language',status:'planned',scope:'user-defined functions and return typing',nativeSurface:'fn …'},
  {id:'methods',domain:'pine-language',status:'partial',scope:'member-call surface exists for namespaces and typed references',nativeSurface:'value.method(...)'},
  {id:'enums',domain:'pine-language',status:'planned',scope:'closed symbolic value types',nativeSurface:'enum …'},
  {id:'udts',domain:'pine-language',status:'implemented',scope:'user-defined types and member metadata',nativeSurface:'type Foo { … }'},
  {id:'libraries',domain:'pine-language',status:'partial',scope:'component/library registry exists; import/export source syntax pending',nativeSurface:'component/library registry'},
  {id:'plots',domain:'pine-language',status:'implemented',scope:'universal SHOW plus plot compatibility',nativeSurface:'show / plot'},
  {id:'shapes',domain:'pine-language',status:'implemented',scope:'shape/marker/arrow projections',nativeSurface:'show / shape / marker'},
  {id:'labels',domain:'pine-language',status:'implemented',scope:'labels and text annotations',nativeSurface:'label / text'},
  {id:'lines',domain:'pine-language',status:'implemented',scope:'line geometry',nativeSurface:'line'},
  {id:'boxes',domain:'pine-language',status:'implemented',scope:'box/zone geometry',nativeSurface:'box / zone'},
  {id:'tables',domain:'pine-language',status:'implemented',scope:'table projections',nativeSurface:'table'},
  {id:'alerts',domain:'pine-language',status:'implemented',scope:'alert and webhook events',nativeSurface:'alert / webhook'},
  {id:'strategies',domain:'pine-language',status:'partial',scope:'strategy/order-intent semantics with host-owned execution',nativeSurface:'signal / order / entry / exit'},
  {id:'orders',domain:'pine-language',status:'partial',scope:'order-intent exists; broker execution stays outside CoreSpirit',nativeSurface:'order intent'},
  {id:'positions',domain:'pine-language',status:'partial',scope:'portfolio position query boundary',nativeSurface:'portfolio.position'},
  {id:'sessions',domain:'pine-language',status:'implemented',scope:'session-aware execution frame',nativeSurface:'time/session context'},
  {id:'time',domain:'pine-language',status:'implemented',scope:'time/bar index/temporal phases',nativeSurface:'time / bar_index / temporal<T>'},
  {id:'symbols',domain:'pine-language',status:'implemented',scope:'market references in semantic/data graph',nativeSurface:'market("…")'},
  {id:'timeframes',domain:'pine-language',status:'implemented',scope:'explicit timeframe references',nativeSurface:'market(...).timeframe(...)'},
  {id:'multi-timeframe',domain:'pine-language',status:'partial',scope:'multi-timeframe graph/planning exists; confirmed-bar publication, gaps, lookahead and exchange-session alignment still require end-to-end semantic fixtures',nativeSurface:'timeframe / data graph'},
  {id:'multi-symbol',domain:'pine-language',status:'implemented',scope:'multi-symbol graph/planning',nativeSurface:'multiple market refs'},
  {id:'lower-timeframe',domain:'pine-language',status:'implemented',scope:'lower-TF resolution surface',nativeSurface:'lowerTf'},
  {id:'financial-data',domain:'pine-language',status:'partial',scope:'generic host market-data request path',nativeSurface:'request'},
  {id:'fundamental-data',domain:'pine-language',status:'partial',scope:'generic host data boundary',nativeSurface:'request'},
  {id:'economic-data',domain:'pine-language',status:'partial',scope:'generic host data boundary',nativeSurface:'request'},
  {id:'corporate-actions',domain:'pine-language',status:'planned',scope:'corporate event semantics',nativeSurface:'corporate.actions.*'},
  {id:'backtesting',domain:'research',status:'partial',scope:'backtest plan extraction/context; full metrics engine remains research work',nativeSurface:'backtest / evaluate'},
  {id:'optimization',domain:'research',status:'partial',scope:'optimization context exists; orchestration/contracts pending',nativeSurface:'optimization context'},
  {id:'debugging',domain:'runtime',status:'implemented',scope:'debug trace/checkpoint diagnostics',nativeSurface:'debug host'},
  {id:'logging',domain:'runtime',status:'partial',scope:'runtime diagnostics/telemetry',nativeSurface:'diagnostics / telemetry'},
  {id:'matrices-vector-math',domain:'quant',status:'partial',scope:'matrix<T> type plus scalar math; vector kernels pending',nativeSurface:'matrix<T> / math.*'},
  {id:'orderbook',domain:'trading-data',status:'implemented',scope:'orderbook host market-data access',nativeSurface:'orderbook / data.*'},
  {id:'footprint',domain:'trading-data',status:'implemented',scope:'footprint and row analytics',nativeSurface:'footprint.*'},
  {id:'volume-profile',domain:'trading-data',status:'implemented',scope:'volume-profile data surface',nativeSurface:'volumeProfile / footprint rows'},
  {id:'market-profile',domain:'trading-data',status:'planned',scope:'session/TPO market-profile model',nativeSurface:'marketProfile.*'},
  {id:'options-chain',domain:'trading-data',status:'surface-only',scope:'options namespace; concrete chain data pending',nativeSurface:'options.*'},
  {id:'greeks',domain:'trading-data',status:'surface-only',scope:'Greeks namespace catalog',nativeSurface:'options.delta/gamma/theta/vega'},
  {id:'implied-volatility',domain:'trading-data',status:'surface-only',scope:'IV catalog; pricing kernel pending',nativeSurface:'options.impliedVolatility'},
  {id:'term-structure',domain:'trading-data',status:'planned',scope:'expiry/strike IV curve analytics',nativeSurface:'options.termStructure.*'},
  {id:'tick-data',domain:'trading-data',status:'partial',scope:'realtime/tick-adjacent paths; canonical tick object pending',nativeSurface:'trade / stream<T>'},
  {id:'microstructure',domain:'trading-data',status:'implemented',scope:'depth imbalance, footprint delta and related data',nativeSurface:'orderflow.*'},
  {id:'portfolio',domain:'trading-data',status:'partial',scope:'portfolio namespace and host query boundary',nativeSurface:'portfolio.*'},
  {id:'risk',domain:'runtime',status:'implemented',scope:'host risk query boundary',nativeSurface:'risk.allowed'},
  {id:'execution',domain:'runtime',status:'implemented',scope:'order-intent → execution-authority → broker adapter outside CoreSpirit',nativeSurface:'order-intent'},
  {id:'ml-models',domain:'quant',status:'implemented',scope:'typed model/prediction declarations and model ABI',nativeSurface:'model / prediction'},
  {id:'feature-pipelines',domain:'quant',status:'implemented',scope:'model-input nodes and research feature metadata',nativeSurface:'model.features / feature<T>'},
  {id:'event-streams',domain:'runtime',status:'implemented',scope:'event values, gates, signal routing',nativeSurface:'event<T> / stream<T> / on'},
  {id:'data-graph',domain:'runtime',status:'implemented',scope:'semantic dependency graph + trading-native planner',nativeSurface:'market/timeframe graph'},
  {id:'temporal-types',domain:'quant',status:'implemented',scope:'confirmed/developing/forecast/state/window semantics',nativeSurface:'temporal<T>'},
  {id:'repaint-proofs',domain:'runtime',status:'implemented',scope:'causality/lookahead/realtime safety analysis',nativeSurface:'@causal / @lookahead'},
  {id:'execution-plans',domain:'runtime',status:'implemented',scope:'specialized/fused execution plans',nativeSurface:'execution plan'},
  {id:'profiler',domain:'runtime',status:'implemented',scope:'repaint/performance profiling contracts',nativeSurface:'profiler/telemetry'},
]);

export function getCoreSpiritFeatureParity(id:string){return CORE_SPIRIT_PINE_FEATURE_MATRIX.find(item=>item.id===id);}
export function validateCoreSpiritFeatureMatrix():string[]{
  const errors:string[]=[]; const ids=new Set<string>();
  for(const item of CORE_SPIRIT_PINE_FEATURE_MATRIX){
    if(ids.has(item.id)) errors.push(`duplicate feature matrix id: ${item.id}`);
    ids.add(item.id);
    if(!item.scope.trim()) errors.push(`empty scope for feature matrix id: ${item.id}`);
    if((item.status==='implemented'||item.status==='partial')&&!item.nativeSurface) errors.push(`implemented/partial feature missing native surface: ${item.id}`);
  }
  return errors;
}
