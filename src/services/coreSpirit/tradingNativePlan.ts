import type { CoreSpiritAst, CoreSpiritAstNode } from './ast';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';

export type CoreSpiritDataDomain =
  | 'bar-series'
  | 'market'
  | 'orderbook'
  | 'trade'
  | 'footprint'
  | 'volume-profile'
  | 'matrix'
  | 'tensor';

export type CoreSpiritMarketHandle = Readonly<{
  kind:'market';
  symbol:string;
  timeframe:string;
}>;

export type CoreSpiritDataDependency = Readonly<{
  id:string;
  domain:CoreSpiritDataDomain;
  symbol:string;
  timeframe:string;
  fields:readonly ('open'|'high'|'low'|'close'|'volume'|'time'|'bid'|'ask'|'depth'|'trade'|'orderbook'|'footprint'|'volumeProfile')[];
  batchKey:string;
  batchable:boolean;
}>;

export type CoreSpiritEventKind =
  | 'bar'
  | 'tick'
  | 'session.open'
  | 'session.close'
  | 'breakout'
  | 'signal'
  | 'order'
  | 'fill'
  | 'market.status'
  | 'replay.step';

export type CoreSpiritEventTrigger = Readonly<{
  kind:CoreSpiritEventKind;
  source:string;
  busEvent:string;
  symbol?:string;
  timeframe?:string;
}>;

export type CoreSpiritComputeClass =
  | 'scalar'
  | 'fused'
  | 'simd'
  | 'worker'
  | 'wasm'
  | 'gpu';

export type CoreSpiritTradingNativePlan = Readonly<{
  version:1;
  dataDependencies:readonly CoreSpiritDataDependency[];
  batches:readonly Readonly<{ batchKey:string; dependencyIds:readonly string[]; requestCount:number }>;
  eventTriggers:readonly CoreSpiritEventTrigger[];
  computeClasses:readonly CoreSpiritComputeClass[];
  multiSymbol:boolean;
  multiTimeframe:boolean;
  dataNative:boolean;
  eventNative:boolean;
}>;

const FIELD_SET = new Set(['open','high','low','close','volume','time','bid','ask','depth','trade','orderbook','footprint','volumeProfile']);

function literalString(node?:CoreSpiritAstNode):string|undefined {
  return node?.type === 'string' ? String(node.value) : undefined;
}

function fieldName(node:CoreSpiritAstNode):string|undefined {
  return node.type === 'member' && FIELD_SET.has(node.member) ? node.member : undefined;
}

function domainForField(field:string):CoreSpiritDataDomain {
  if(field==='orderbook') return 'orderbook';
  if(field==='trade') return 'trade';
  if(field==='footprint') return 'footprint';
  if(field==='volumeProfile') return 'volume-profile';
  return 'market';
}

function eventTrigger(value:string):CoreSpiritEventTrigger {
  const normalized=value.trim().toLowerCase().replace(/\s+/g,'.');
  const aliases:Record<string,CoreSpiritEventKind> = {
    'on.bar':'bar',
    'bar':'bar',
    'bar.closes':'bar',
    'on.tick':'tick',
    'tick':'tick',
    'on.session.open':'session.open',
    'session.open':'session.open',
    'on.session.close':'session.close',
    'session.close':'session.close',
    'on.breakout':'breakout',
    'breakout':'breakout',
    'on.signal':'signal',
    'signal':'signal',
    'on.order':'order',
    'order':'order',
    'on.fill':'fill',
    'fill':'fill',
  };
  const kind=aliases[normalized] ?? 'bar';
  const busEvent:Record<CoreSpiritEventKind,string> = {
    'bar':'market.bar',
    'tick':'market.tick',
    'session.open':'market.session.open',
    'session.close':'market.session.close',
    'breakout':'market.breakout',
    'signal':'script.signal',
    'order':'execution.order',
    'fill':'execution.fill',
    'market.status':'market.status',
    'replay.step':'replay.step',
  };
  return { kind, source:value, busEvent:busEvent[kind] };
}

function visit(
  node:CoreSpiritAstNode,
  dependencies:Map<string,{domain:CoreSpiritDataDomain;symbol:string;timeframe:string;fields:Set<string>}>,
  events:Map<string,CoreSpiritEventTrigger>,
):void {
  switch(node.type){
    case 'program': node.body.forEach((child)=>visit(child,dependencies,events)); return;
    case 'call': {
      if(node.name==='event'){
        const name=literalString(node.args[0]) ?? 'bar';
        const trigger=eventTrigger(name);
        events.set(trigger.source,trigger);
      } else if(node.name==='market'){
        const symbol=literalString(node.args[0]) ?? 'current';
        const timeframe='chart';
        const key=`market:${symbol}:${timeframe}`;
        const dep=dependencies.get(key) ?? {domain:'market',symbol,timeframe,fields:new Set<string>()};
        dependencies.set(key,dep);
      } else if(node.name==='timeframe'){
        const symbol='current';
        const timeframe=literalString(node.args[0]) ?? 'requested';
        const key=`market:${symbol}:${timeframe}`;
        const dep=dependencies.get(key) ?? {domain:'market',symbol,timeframe,fields:new Set<string>()};
        dependencies.set(key,dep);
      }
      node.args.forEach((arg)=>visit(arg,dependencies,events));
      return;
    }
    case 'member': {
      if(node.target.type==='call' && (node.target.name==='market'||node.target.name==='timeframe')){
        const symbol=node.target.name==='market' ? (literalString(node.target.args[0]) ?? 'current') : 'current';
        const timeframe=node.target.name==='timeframe' ? (literalString(node.target.args[0]) ?? 'requested') : 'chart';
        const field=fieldName(node);
        const domain=field ? domainForField(field) : 'market';
        const key=`${domain}:${symbol}:${timeframe}`;
        const dep=dependencies.get(key) ?? {domain,symbol,timeframe,fields:new Set<string>()};
        if(field) dep.fields.add(field);
        dependencies.set(key,dep);
      }
      visit(node.target,dependencies,events);
      return;
    }
    case 'memberCall': {
      if(node.member==='timeframe' && (node.target.type==='call' && node.target.name==='market')){
        const symbol=literalString(node.target.args[0]) ?? 'current';
        const timeframe=literalString(node.args[0]) ?? 'requested';
        const key=`market:${symbol}:${timeframe}`;
        dependencies.set(key,dependencies.get(key) ?? {domain:'market',symbol,timeframe,fields:new Set<string>()});
      }
      visit(node.target,dependencies,events);
      node.args.forEach((arg)=>visit(arg,dependencies,events));
      return;
    }
    case 'let': visit(node.expression,dependencies,events); return;
    case 'assignment': visit(node.expression,dependencies,events); return;
    case 'onEvent': {
      const trigger=eventTrigger(node.eventName);
      events.set(trigger.source,trigger);
      node.body.forEach((child)=>visit(child,dependencies,events));
      return;
    }
    case 'if': visit(node.condition,dependencies,events); node.thenBranch.forEach((child)=>visit(child,dependencies,events)); node.elseBranch?.forEach((child)=>visit(child,dependencies,events)); return;
    case 'expressionStatement': visit(node.expression,dependencies,events); return;
    case 'identifier': {
      if(FIELD_SET.has(node.name)){
        const key='market:current:chart';
        const dep=dependencies.get(key) ?? {domain:'bar-series',symbol:'current',timeframe:'chart',fields:new Set<string>()};
        dep.fields.add(node.name);
        dependencies.set(key,dep);
      }
      return;
    }
    case 'binary': visit(node.left,dependencies,events); visit(node.right,dependencies,events); return;
    case 'unary': visit(node.operand,dependencies,events); return;
    case 'index': visit(node.target,dependencies,events); visit(node.index,dependencies,events); return;
    default: return;
  }
}

export function buildCoreSpiritTradingNativePlan(ast:CoreSpiritAst, surface?:CoreSpiritSurfaceMetadata):CoreSpiritTradingNativePlan {
  const dependencies=new Map<string,{domain:CoreSpiritDataDomain;symbol:string;timeframe:string;fields:Set<string>}>();
  const events=new Map<string,CoreSpiritEventTrigger>();
  visit(ast,dependencies,events);
  for(const declaration of surface?.declarations ?? []){
    if(declaration.kind!=='automation') continue;
    for(const trigger of declaration.triggers){
      const normalized=eventTrigger(trigger);
      events.set(`${declaration.name}:${normalized.source}`,Object.freeze({...normalized,source:`${declaration.name}:${normalized.source}`}));
    }
  }

  const deps:CoreSpiritDataDependency[]=[];
  for(const [key,value] of dependencies){
    if(value.fields.size===0) value.fields.add('close');
    deps.push(Object.freeze({
      id:key,
      domain:value.domain,
      symbol:value.symbol,
      timeframe:value.timeframe,
      fields:Object.freeze([...value.fields].sort()) as CoreSpiritDataDependency['fields'],
      batchKey:'market-batch',
      batchable:(value.symbol!=='current' || value.timeframe!=='chart') &&
        value.domain==='market' &&
        [...value.fields].every((field)=>['open','high','low','close','volume','time'].includes(field)),
    }));
  }

  const eventTriggers:CoreSpiritEventTrigger[]=[];
  for(const trigger of events.values()) eventTriggers.push(trigger);

  const concreteSymbols=new Set(deps.map((dep)=>dep.symbol).filter((symbol)=>symbol!=='current'));
  const concreteTimeframes=new Set(deps.map((dep)=>dep.timeframe).filter((timeframe)=>timeframe!=='chart'));
  const multiSymbol=concreteSymbols.size>0 && (
    concreteSymbols.size>1 || deps.some((dep)=>dep.symbol==='current')
  );
  const multiTimeframe=concreteTimeframes.size>0 && (
    concreteTimeframes.size>1 || deps.some((dep)=>dep.timeframe==='chart')
  );

  return Object.freeze({
    version:1,
    dataDependencies:Object.freeze(deps),
    batches:Object.freeze(
      [...new Map(deps.map((dep)=>[dep.batchKey,dep])).entries()].map(([batchKey])=>{
        const ids=deps.filter((dep)=>dep.batchKey===batchKey && dep.batchable).map((dep)=>dep.id);
        return ids.length ? Object.freeze({batchKey,dependencyIds:Object.freeze(ids),requestCount:ids.length}) : null;
      }),
    ).filter((batch): batch is NonNullable<typeof batch> => batch !== null),
    eventTriggers:Object.freeze(eventTriggers),
    computeClasses:Object.freeze(['scalar','fused','simd','worker','wasm','gpu'] as const),
    multiSymbol,
    multiTimeframe,
    dataNative:deps.length>0,
    eventNative:eventTriggers.length>0,
  });
}
