import type { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import type { CoreSpiritGraphNode } from './semanticGraph';
import { getCoreSpiritBuiltin } from './standardLibrary';
import {
  type CoreSpiritSeriesOperation,
  type CoreSpiritSeriesOperationName,
  coreSpiritSeriesLength,
  coreSpiritSeriesMaxLookback,
  executeCoreSpiritFusedSeriesPipeline,
  asCoreSpiritNumericSeries,
} from './seriesVector';

export type CoreSpiritSeriesFusionStage=Readonly<{
  instruction:number;nodeId:string;name:CoreSpiritSeriesOperationName;input:string;output:string;length:number;
}>;
export type CoreSpiritSeriesFusionGroup=Readonly<{
  id:string;nodeIds:readonly string[];instructions:readonly number[];inputRegister:string;outputRegister:string;
  operations:readonly CoreSpiritSeriesOperation[];maxLookback:number;strategy:'single-pass-streaming';
  eligibleBackends:readonly ('cpu'|'wasm'|'gpu')[];intermediateSeriesAllocations:0;
}>;
export type CoreSpiritSeriesFusionPlan=Readonly<{
  version:1;groups:readonly CoreSpiritSeriesFusionGroup[];fusedInstructionCount:number;
  rejectedPureSeriesInstructions:readonly number[];explanation:readonly string[];
}>;

const fusable=(name:string)=>{const b=getCoreSpiritBuiltin(name);return !!(b?.pure&&b.seriesExecution?.vectorizable&&b.seriesExecution?.fusible);};
const constant=(ins:readonly CoreSpiritIrInstruction[],reg:string)=>{const x=ins.find(i=>i.op==='const'&&i.dest===reg);if(!x||x.op!=='const')return undefined;const n=Number(x.value);return Number.isFinite(n)?n:undefined;};
const nodeMap=(p:CoreSpiritIrProgram)=>new Map((p.graphs?.semantic.nodes??[]).map(n=>[n.instruction,n] as const));

export function planCoreSpiritSeriesFusion(program:CoreSpiritIrProgram):CoreSpiritSeriesFusionPlan{
  const ins=program.entry.instructions;
  const nodes=nodeMap(program);
  const alias=new Map<string,string>();
  const canon=(r:string)=>{let x=r;const seen=new Set<string>();while(alias.has(x)&&!seen.has(x)){seen.add(x);x=alias.get(x)!;}return x;};
  for(const i of ins){if(i.op==='move')alias.set(i.dest,canon(i.source));else if(i.op==='setLocal')alias.set(i.name,canon(i.source));}
  const uses=new Map<string,number>();
  for(const i of ins){
    const refs=i.op==='call'?i.args:i.op==='binary'?[i.left,i.right]:i.op==='unary'?[i.operand]:i.op==='index'?[i.target,i.index]:[];
    for(const r of refs){const k=canon(r);uses.set(k,(uses.get(k)??0)+1);}
  }
  const producedBy=new Map<string,number>();
  ins.forEach((i,n)=>{if('dest' in i&&i.dest)producedBy.set(i.dest,n);});
  const groups:CoreSpiritSeriesFusionGroup[]=[];const used=new Set<number>();const rejected:number[]=[];
  for(let start=0;start<ins.length;start++){
    if(used.has(start))continue;
    const first=ins[start];
    if(first.op!=='call'||first.args.length<1||!fusable(first.name))continue;
    const src=canon(first.args[0]);const producer=producedBy.get(src);
    if(producer!=null&&ins[producer].op!=='loadSeries')continue;
    const stages:CoreSpiritSeriesFusionStage[]=[];let cur=start;
    while(cur>=0){
      const i=ins[cur]; if(i.op!=='call'||i.args.length<1||!fusable(i.name))break;
      const node=nodes.get(cur);
      if(node?.effectful||node?.deterministic===false)break;
      if(stages.length>0&&uses.get(canon(i.args[0]))!==1)break;
      const nextLength=Math.max(1,Math.floor(Number(constant(ins,i.args[1])??14)));
      stages.push({instruction:cur,nodeId:node?.id??`i:${cur}`,name:i.name as CoreSpiritSeriesOperationName,input:canon(i.args[0]),output:i.dest,length:nextLength});
      used.add(cur);
      const next:number[]=[];
      for(let j=cur+1;j<ins.length;j++){const x=ins[j];if(x.op==='call'&&canon(x.args[0])===canon(i.dest))next.push(j);}
      if(next.length===1){const nextInstr=ins[next[0]!];cur=nextInstr.op==='call'&&fusable(nextInstr.name)?next[0]!: -1;}else{cur=-1;}
    }
    if(stages.length<2){for(const s of stages)used.delete(s.instruction);continue;}
    const operations=Object.freeze(stages.map(s=>({name:s.name,length:s.length})));
    groups.push(Object.freeze({
      id:`series-fusion:${start}:${stages.at(-1)!.instruction}`,
      nodeIds:Object.freeze(stages.map(s=>s.nodeId)),
      instructions:Object.freeze(stages.map(s=>s.instruction)),
      inputRegister:first.args[0],outputRegister:stages.at(-1)!.output,
      operations,maxLookback:coreSpiritSeriesMaxLookback(operations),
      strategy:'single-pass-streaming',
      eligibleBackends:Object.freeze(['cpu','wasm','gpu'] as const),
      intermediateSeriesAllocations:0,
    }));
  }
  for(let i=0;i<ins.length;i++){const x=ins[i];if(x.op==='call'&&x.args.length&&fusable(x.name)&&!used.has(i))rejected.push(i);}
  return Object.freeze({
    version:1,groups:Object.freeze(groups),
    fusedInstructionCount:groups.reduce((n,g)=>n+g.instructions.length,0),
    rejectedPureSeriesInstructions:Object.freeze(rejected),
    explanation:Object.freeze(groups.map(g=>`series fusion: fused ${g.operations.length} pure series operations into ${g.strategy}; lookback=${g.maxLookback}`)),
  });
}

export type CoreSpiritFusedSeriesInput=Readonly<{register:string;values:ArrayLike<number>}>;
export function executeCoreSpiritSeriesFusionGroup(group:CoreSpiritSeriesFusionGroup,input:CoreSpiritFusedSeriesInput){
  if(input.register!==group.inputRegister)throw new Error(`fusion input register mismatch: expected '${group.inputRegister}', got '${input.register}'`);
  return executeCoreSpiritFusedSeriesPipeline(asCoreSpiritNumericSeries(input.values),group.operations);
}
export function validateCoreSpiritSeriesFusionPlan(plan:CoreSpiritSeriesFusionPlan):string[]{
  const e:string[]=[];
  for(const g of plan.groups){
    if(g.operations.length<2)e.push(`fusion group '${g.id}' must contain at least two operations`);
    if(g.intermediateSeriesAllocations!==0)e.push(`fusion group '${g.id}' must not allocate full intermediate series`);
    if(g.strategy!=='single-pass-streaming')e.push(`fusion group '${g.id}' has unsupported strategy '${g.strategy}'`);
    if(!g.eligibleBackends.length)e.push(`fusion group '${g.id}' has no eligible compute backend`);
    for(const op of g.operations)if(coreSpiritSeriesLength(op)<1)e.push(`fusion group '${g.id}' has invalid operation length`);
  }
  return e;
}
