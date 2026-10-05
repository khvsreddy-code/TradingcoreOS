import type { CoreSpiritIrInstruction } from './ir';
import { getCoreSpiritBuiltin } from './standardLibrary';
import type { CoreSpiritSeriesRegistry, CoreSpiritSeriesId } from './seriesRegistry';

export type CoreSpiritSpecializedInstruction =
  | { op:'const'; dest:number; value:number|string|boolean|null }
  | { op:'loadSeries'; dest:number; name:string; offset:number }
  | { op:'move'; dest:number; source:string }
  | { op:'setLocal'; name:string; source:number; series:boolean; seriesId:CoreSpiritSeriesId }
  | { op:'unary'; dest:number; operator:'!'|'+'|'-'; operand:number }
  | { op:'binary'; dest:number; operator:string; left:number; right:number }
  | { op:'call'; dest:number; name:string; args:number[]; instruction:Extract<CoreSpiritIrInstruction,{op:'call'}> }
  | { op:'index'; dest:number; index:number; target:number; seriesId:CoreSpiritSeriesId; instruction:Extract<CoreSpiritIrInstruction,{op:'index'}> }
  | { op:'jumpIfFalse'; condition:number; target:number }
  | { op:'jump'; target:number }
  | { op:'emit'; args:number[]; instruction:Extract<CoreSpiritIrInstruction,{op:'emit'}> };

export type CoreSpiritSpecializedSeriesFanout = Readonly<{
  inputRegister:number;
  inputName:string;
  stages:readonly Readonly<{
    instruction:number;
    dest:number;
    name:string;
    period?:number;
  }>[];
}>;

export type CoreSpiritSpecializedKernelRegion = Readonly<{
  id:string;
  inputRegister:number;
  inputName:string;
  instructions:readonly number[];
  seriesInstructions:readonly number[];
  scalarInstructions:readonly number[];
  outputRegisters:readonly number[];
  stateful:boolean;
  singleTraversal:true;
  eligibleBackends:readonly ('cpu'|'wasm'|'gpu')[];
}>;

export type CoreSpiritSpecializedPlan = Readonly<{
  version:1;
  strategy:'specialized-straight-line'|'specialized-control-flow';
  slotCount:number;
  slotByName:ReadonlyMap<string,number>;
  instructions:readonly CoreSpiritSpecializedInstruction[];
  seriesFanouts:readonly CoreSpiritSpecializedSeriesFanout[];
  regions:readonly CoreSpiritSpecializedKernelRegion[];
  hasControlFlow:boolean;
  hasEffects:boolean;
  wasmEligible:readonly number[];
  explanation:readonly string[];
}>;

function isLoadableMarketSeries(name:string): name is 'open'|'high'|'low'|'close'|'volume'|'time' {
  return name === 'open' || name === 'high' || name === 'low' || name === 'close' || name === 'volume' || name === 'time';
}

function constantNumber(instructions:readonly CoreSpiritIrInstruction[], register:string):number|undefined {
  for (let i=instructions.length-1;i>=0;i-=1) {
    const instruction=instructions[i]!;
    if (instruction.op==='const' && instruction.dest===register) {
      const n=Number(instruction.value);
      return Number.isFinite(n) ? n : undefined;
    }
    if ('dest' in instruction && instruction.dest===register) return undefined;
  }
  return undefined;
}

export function buildCoreSpiritSpecializedPlan(
  instructions:readonly CoreSpiritIrInstruction[],
  seriesRegistry?:CoreSpiritSeriesRegistry,
): CoreSpiritSpecializedPlan {
  const names=new Map<string,number>();
  const slot=(name:string):number=>{
    const existing=names.get(name);
    if(existing!==undefined) return existing;
    const next=names.size;
    names.set(name,next);
    return next;
  };

  const lowered:CoreSpiritSpecializedInstruction[]=instructions.map((instruction):CoreSpiritSpecializedInstruction=>{
    switch(instruction.op){
      case 'const': return {op:'const',dest:slot(instruction.dest),value:instruction.value};
      case 'loadSeries':
        return {op:'loadSeries',dest:slot(instruction.dest),name:instruction.name,offset:instruction.offset};
      case 'move': return {op:'move',dest:slot(instruction.dest),source:instruction.source};
      case 'setLocal': return {op:'setLocal',name:instruction.name,source:slot(instruction.source),series:instruction.series!==false,seriesId:seriesRegistry?.idFor(instruction.name) ?? -1};
      case 'unary': return {op:'unary',dest:slot(instruction.dest),operator:instruction.operator,operand:slot(instruction.operand)};
      case 'binary': return {op:'binary',dest:slot(instruction.dest),operator:instruction.operator,left:slot(instruction.left),right:slot(instruction.right)};
      case 'call': return {op:'call',dest:slot(instruction.dest),name:instruction.name,args:instruction.args.map(slot),instruction};
      case 'index': return {op:'index',dest:slot(instruction.dest),index:slot(instruction.index),target:slot(instruction.target),seriesId:instruction.seriesName && seriesRegistry ? seriesRegistry.idFor(instruction.seriesName) : -1,instruction};
      case 'jumpIfFalse': return {op:'jumpIfFalse',condition:slot(instruction.condition),target:instruction.target};
      case 'jump': return {op:'jump',target:instruction.target};
      case 'emit': return {op:'emit',args:instruction.args.slice(1).map(slot),instruction};
    }
  });

  const seriesFanouts:CoreSpiritSpecializedSeriesFanout[]=[];
  const byInput=new Map<string,{instruction:number;dest:number;name:string;period?:number}[]>();
  for(let i=0;i<lowered.length;i+=1){
    const instruction=lowered[i]!;
    if(instruction.op!=='call' || instruction.args.length<1) continue;
    const builtin=getCoreSpiritBuiltin(instruction.name);
    if(!builtin?.seriesExecution?.vectorizable) continue;
    const input=instruction.args[0]!;
    const sourceName=instructions[i]?.op==='call' ? (instructions[i] as Extract<CoreSpiritIrInstruction,{op:'call'}>).seriesArgs?.[0] : undefined;
    const originalInput='callId' in instruction.instruction ? instruction.instruction.callId ?? String(input) : String(input);
    const key=String(input);
    const list=byInput.get(key) ?? [];
    const length=constantNumber(instructions, instructions[i]!.op==='call' ? (instructions[i] as Extract<CoreSpiritIrInstruction,{op:'call'}>).args[1] ?? '' : '');
    list.push({instruction:i,dest:instruction.dest,name:instruction.name,period:length});
    byInput.set(key,list);
    if(sourceName){
      void originalInput;
      void sourceName;
    }
  }

  for(const [input,stages] of byInput){
    if(stages.length<2) continue;
    const sourceName = instructions[stages[0]!.instruction]?.op==='call'
      ? ((instructions[stages[0]!.instruction] as Extract<CoreSpiritIrInstruction,{op:'call'}>).seriesArgs?.[0] ?? input)
      : input;
    seriesFanouts.push(Object.freeze({
      inputRegister:Number(input),
      inputName:sourceName,
      stages:Object.freeze(stages.map((stage)=>Object.freeze(stage))),
    }));
  }

  const regions:CoreSpiritSpecializedKernelRegion[]=[];
  for(let groupIndex=0;groupIndex<seriesFanouts.length;groupIndex+=1){
    const fanout=seriesFanouts[groupIndex]!;
    const owned=new Set<number>();
    const queue:number[]=[];
    for(const stage of fanout.stages){ owned.add(stage.instruction); queue.push(stage.dest); }
    const scalar:number[]=[];
    for(let i=0;i<lowered.length;i+=1){
      const instruction=lowered[i]!;
      const refs=instruction.op==='binary' ? [instruction.left,instruction.right]
        : instruction.op==='unary' ? [instruction.operand]
        : instruction.op==='call' ? instruction.args
        : instruction.op==='index' ? [instruction.target,instruction.index]
        : [];
      if(refs.some((ref)=>queue.includes(ref)) && instruction.op!=='call'){
        if(!owned.has(i)){ owned.add(i); scalar.push(i); }
        if('dest' in instruction && instruction.dest) queue.push(instruction.dest);
      }
    }
    const seriesInstructions=fanout.stages.map((stage)=>stage.instruction);
    const instructions=Object.freeze([...seriesInstructions,...scalar].sort((a,b)=>a-b));
    const outputRegisters=Object.freeze(scalar.length ? scalar.map((index)=>('dest' in lowered[index]! ? (lowered[index] as any).dest : -1)).filter((id)=>id>=0) : fanout.stages.map((stage)=>stage.dest));
    const stateful=fanout.stages.some((stage)=>['ema','rma','rsi','atr','vwap','change','pctchange','persistence'].includes(stage.name));
    regions.push(Object.freeze({
      id:`fused-kernel:${groupIndex}`,
      inputRegister:fanout.inputRegister,
      inputName:fanout.inputName,
      instructions,
      seriesInstructions:Object.freeze(seriesInstructions),
      scalarInstructions:Object.freeze(scalar),
      outputRegisters,
      stateful,
      singleTraversal:true,
      eligibleBackends:Object.freeze(stateful ? ['cpu','wasm'] as const : ['cpu','wasm','gpu'] as const),
    }));
  }

  const hasControlFlow=lowered.some((instruction)=>instruction.op==='jump'||instruction.op==='jumpIfFalse');
  const hasEffects=lowered.some((instruction)=>instruction.op==='setLocal'||instruction.op==='emit');
  const wasmEligible=lowered.flatMap((instruction,index)=>{
    if(instruction.op==='call'){
      const builtin=getCoreSpiritBuiltin(instruction.name);
      return builtin?.seriesExecution?.vectorizable ? [index] : [];
    }
    if(instruction.op==='binary'||instruction.op==='unary') return [index];
    return [];
  });

  const strategy=hasControlFlow ? 'specialized-control-flow' : 'specialized-straight-line';
  return Object.freeze({
    version:1,
    strategy,
    slotCount:names.size,
    slotByName:names,
    instructions:Object.freeze(lowered),
    seriesFanouts:Object.freeze(seriesFanouts),
    regions:Object.freeze(regions),
    hasControlFlow,
    hasEffects,
    wasmEligible:Object.freeze(wasmEligible),
    explanation:Object.freeze([
      `lowered ${lowered.length} IR instruction(s) into ${names.size} stable VM slot(s)`,
      `${seriesFanouts.length} shared-input series fanout group(s) are ready for fused multi-output traversal`,
      hasControlFlow ? 'Control flow remains explicitly represented; straight-line backend lowering is not assumed.' : 'Straight-line program shape permits direct specialized execution lowering.',
      wasmEligible.length ? `${wasmEligible.length} instruction(s) are candidates for numerical backend lowering.` : 'No numerical WASM candidates were identified.',
    ]),
  });
}
