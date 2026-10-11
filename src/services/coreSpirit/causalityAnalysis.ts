import type { CoreSpiritAst, CoreSpiritAstNode, CoreSpiritAnnotation } from './ast';

export type CoreSpiritCausalityPhase = 'historical'|'confirmed'|'developing'|'realtime'|'forecast'|'unknown';
export type CoreSpiritCausalityDiagnostic = Readonly<{
  severity:'warning'|'error'; message:string; line?:number; column?:number; start?:number; end?:number; code:string;
}>;
export type CoreSpiritCausalityDependency = Readonly<{
  kind:'timeframe'|'future-index'|'future-call'; phase:CoreSpiritCausalityPhase; label:string;
  line?:number; column?:number; start?:number; end?:number;
}>;
export type CoreSpiritCausalityReport = Readonly<{
  version:1; strictCausality:boolean; dependencies:readonly CoreSpiritCausalityDependency[];
  diagnostics:readonly CoreSpiritCausalityDiagnostic[];
}>;

type TemporalSelection = Exclude<CoreSpiritCausalityPhase,'unknown'>;
const TEMPORAL_SELECTORS:Readonly<Record<string,TemporalSelection>> = Object.freeze({
  confirmed:'confirmed', historical:'historical', developing:'developing', realtime:'realtime',
});
function annotations(node:CoreSpiritAstNode):readonly CoreSpiritAnnotation[] {
  return 'annotations' in node && Array.isArray(node.annotations) ? node.annotations as readonly CoreSpiritAnnotation[] : [];
}
function children(node:CoreSpiritAstNode):CoreSpiritAstNode[] {
  switch(node.type){
    case 'program': return node.body;
    case 'let': case 'assignment': return [node.expression];
    case 'onEvent': return node.body;
    case 'expressionStatement': return [node.expression];
    case 'if': return [node.condition,...node.thenBranch,...(node.elseBranch??[])];
    case 'unary': return [node.operand];
    case 'binary': return [node.left,node.right];
    case 'call': return node.args;
    case 'memberCall': return [node.target,...node.args];
    case 'index': return [node.target,node.index];
    case 'member': return [node.target];
    default: return [];
  }
}
function sourceFields(node:CoreSpiritAstNode) {
  return { ...(node.span ? {line:node.span.line,column:node.span.column,start:node.span.start,end:node.span.end} : {}) };
}
function negativeIndex(node:CoreSpiritAstNode):boolean {
  return node.type==='unary'&&node.operator==='-'&&node.operand.type==='number'&&Number(node.operand.value)>0;
}
function isDataReference(node:CoreSpiritAstNode,dataRefs:ReadonlySet<string>):boolean {
  if(node.type==='call')return ['market','timeframe','series'].includes(node.name);
  if(node.type==='identifier')return dataRefs.has(node.name);
  if(node.type==='memberCall'){
    const isSelector=['confirmed','developing','historical','realtime'].includes(node.member);
    return (['timeframe','tf'].includes(node.member)&&
      (node.target.type==='call'&&node.target.name==='market'||node.target.type==='identifier'&&dataRefs.has(node.target.name))) ||
      (isSelector&&isDataReference(node.target,dataRefs));
  }
  return false;
}
function selectorLabel(node:CoreSpiritAstNode):string {
  if(node.type==='call'&&node.name==='timeframe')return node.args[0]?.type==='string'?String(node.args[0].value):'dynamic timeframe';
  if(node.type==='memberCall'&&node.member==='timeframe')return node.args[0]?.type==='string'?String(node.args[0].value):'dynamic timeframe';
  if(node.type==='identifier')return "data reference '"+node.name+"'";
  return 'market data';
}

/**
 * Static causal analysis. A phase annotation alone is documentary; explicit
 * selectors lower to the VM's data-reference alignment contract. Developing
 * values are blocked by the runtime in historical execution to avoid completed
 * higher-timeframe candle leakage.
 */
export function analyzeCoreSpiritCausality(ast:CoreSpiritAst):CoreSpiritCausalityReport {
  const diagnostics:CoreSpiritCausalityDiagnostic[]=[];
  const dependencies:CoreSpiritCausalityDependency[]=[];
  const dataRefs=new Set<string>();
  let strictCausality=false;
  const isDataExpression=(node:CoreSpiritAstNode):boolean=>{
    if(node.type==='call')return ['market','timeframe','series'].includes(node.name);
    if(node.type==='identifier')return dataRefs.has(node.name);
    if(node.type==='memberCall'){
      if(['timeframe','tf'].includes(node.member))
        return (node.target.type==='call'&&node.target.name==='market') ||
          (node.target.type==='identifier'&&dataRefs.has(node.target.name));
      if(['confirmed','historical','developing','realtime'].includes(node.member))
        return isDataExpression(node.target);
    }
    return false;
  };
  const gather=(node:CoreSpiritAstNode):void=>{
    if(annotations(node).some(a=>a.name.toLowerCase()==='strictcausality'))strictCausality=true;
    // Resolve simple source aliases in lexical order, so a regular indicator
    // series is not mistaken for a market-data handle by .confirmed().
    if(node.type==='program'){for(const child of node.body)gather(child);return;}
    if(node.type==='let'){
      gather(node.expression);
      if(isDataExpression(node.expression))dataRefs.add(node.name);
      return;
    }
    if(node.type==='assignment'){
      gather(node.expression);
      if(isDataExpression(node.expression))dataRefs.add(node.name);
      else dataRefs.delete(node.name);
      return;
    }
    for(const child of children(node))gather(child);
  };
  gather(ast);

  const visited=new Set<string>();
  const add=(node:CoreSpiritAstNode,kind:CoreSpiritCausalityDependency['kind'],phase:CoreSpiritCausalityPhase,label:string,message:string,code:string,severity:'warning'|'error')=>{
    const dedupeKey=code+':'+(node.span?.start??label);
    if(visited.has(dedupeKey))return;
    visited.add(dedupeKey);
    dependencies.push(Object.freeze({kind,phase,label,...sourceFields(node)}));
    const actualSeverity: 'warning'|'error' = strictCausality&&severity==='warning'?'error':severity;
    diagnostics.push(Object.freeze({
      severity:actualSeverity,
      message:strictCausality&&severity==='warning'?'@strictCausality: '+message:message,
      code,...sourceFields(node),
    }));
  };

  const visit=(node:CoreSpiritAstNode,selectedPhase:TemporalSelection|'unknown'='unknown'):void=>{
    if(node.type==='call'&&node.name==='timeframe'){
      const label=selectorLabel(node);
      if(selectedPhase==='developing'||selectedPhase==='realtime'){
        add(node,'timeframe',selectedPhase,label,"Secondary-timeframe data '"+label+"' uses "+selectedPhase+" alignment. It may change before the higher-timeframe candle closes and is unsafe for historical causal inference.",'CAUSALITY_DEVELOPING_HTF','warning');
      }else if(selectedPhase==='unknown'){
        add(node,'timeframe','unknown',label,"Secondary-timeframe data '"+label+"' has no explicit temporal selector. Use .confirmed() for last-confirmed values, or .developing() only for realtime logic; an unqualified request can make historical and realtime results diverge.",'CAUSALITY_UNQUALIFIED_MTF','warning');
      }
    }else if(node.type==='memberCall'&&node.member==='timeframe'&&
      ((node.target.type==='call'&&node.target.name==='market')||node.target.type==='identifier')){
      const label=selectorLabel(node);
      if(selectedPhase==='developing'||selectedPhase==='realtime'){
        add(node,'timeframe',selectedPhase,label,"Secondary-timeframe data '"+label+"' uses "+selectedPhase+" alignment. It may change before the higher-timeframe candle closes and is unsafe for historical causal inference.",'CAUSALITY_DEVELOPING_HTF','warning');
      }else if(selectedPhase==='unknown'){
        add(node,'timeframe','unknown',label,"Secondary-timeframe data '"+label+"' has no explicit temporal selector. Use .confirmed() for last-confirmed values, or .developing() only for realtime logic; an unqualified request can make historical and realtime results diverge.",'CAUSALITY_UNQUALIFIED_MTF','warning');
      }
    }

    if(node.type==='memberCall'&&Object.prototype.hasOwnProperty.call(TEMPORAL_SELECTORS,node.member)&&node.args.length===0&&isDataReference(node.target,dataRefs)){
      const phase=TEMPORAL_SELECTORS[node.member]!;
      if((phase==='developing'||phase==='realtime')&&(node.target.type==='identifier'||(node.target.type==='memberCall'&&node.target.member!=='timeframe'))){
        const label=selectorLabel(node.target);
        add(node,'timeframe',phase,label,"Data dependency '"+label+"' uses "+phase+" alignment. It may change during the current candle and is unavailable in historical execution to prevent completed-bar leakage.",'CAUSALITY_DEVELOPING_HTF','warning');
      }
      visit(node.target,phase);
      for(const arg of node.args)visit(arg);
      return;
    }
    if(node.type==='index'&&negativeIndex(node.index)){
      add(node,'future-index','unknown','negative series offset','Future-bar indexing is non-causal. Replace the negative index with a current or historical offset; CoreSpirit will not treat future data as valid history.','CAUSALITY_FUTURE_INDEX','error');
    }
    if(node.type==='call'&&node.name==='request'){
      const rawAlignment=node.args[4];
      const label=[
        node.args[0]?.type==='string'?String(node.args[0].value):'symbol',
        node.args[1]?.type==='string'?String(node.args[1].value):'timeframe',
      ].join(' / ');
      if(!rawAlignment){
        add(node,'timeframe','confirmed',label,
          "request(...) currently defaults to last-confirmed alignment, but the temporal contract is implicit. Add the fifth argument 'confirmed' or 'historical' to make backtest/live assumptions reviewable.",
          'CAUSALITY_UNQUALIFIED_REQUEST','warning');
      }else if(rawAlignment.type!=='string'){
        add(node,'timeframe','unknown',label,
          "request(...) alignment must be a static string: 'confirmed', 'historical', 'developing' or 'realtime'. A dynamic alignment cannot be verified by the compiler.",
          'CAUSALITY_DYNAMIC_REQUEST_ALIGNMENT','warning');
      }else{
        const phase=String(rawAlignment.value).toLowerCase();
        if(phase==='developing'||phase==='realtime'){
          add(node,'timeframe',phase,label,
            "request(...) explicitly consumes "+phase+" data. This can change before its candle closes and is blocked during historical execution; use 'confirmed' or 'historical' for reproducible backtests.",
            'CAUSALITY_DEVELOPING_REQUEST','warning');
        }else if(phase!=='confirmed'&&phase!=='historical'){
          add(node,'timeframe','unknown',label,
            "Unsupported request(...) alignment '"+phase+"'. Use 'confirmed', 'historical', 'developing' or 'realtime'.",
            'CAUSALITY_INVALID_REQUEST_ALIGNMENT','error');
        }
      }
    }
    if(node.type==='call'&&/(?:future|forward|lookahead|offset_future)/i.test(node.name)){
      add(node,'future-call','forecast',node.name,"Call '"+node.name+"' appears to request future-dependent data; verify that it is a forecast output rather than an observed market input.",'CAUSALITY_FUTURE_CALL','warning');
    }
    for(const child of children(node))visit(child,'unknown');
  };
  visit(ast);
  return Object.freeze({version:1,strictCausality,dependencies:Object.freeze(dependencies),diagnostics:Object.freeze(diagnostics)});
}
