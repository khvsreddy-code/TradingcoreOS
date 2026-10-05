import type { CoreSpiritIrInstruction } from './ir';
import type { CoreSpiritOutputCollector } from './outputCollector';
import type { CoreSpiritExecutionVMHost } from './executionVM';
import { CoreSpiritSlotValueStore } from './executionValueStore';
import type { CoreSpiritSeriesRegistry, CoreSpiritSeriesId } from './seriesRegistry';

type FastInstruction =
  | { op:'const'; dest:number; value:number|string|boolean|null }
  | { op:'loadSeries'; dest:number; name:string; offset:number }
  | { op:'move'; dest:number; source:string }
  | { op:'setLocal'; name:string; source:number; series?:boolean; seriesId:CoreSpiritSeriesId }
  | { op:'unary'; dest:number; operator:'!'|'+'|'-'; operand:number }
  | { op:'binary'; dest:number; operator:string; left:number; right:number }
  | { op:'call'; dest:number; args:number[]; instruction:Extract<CoreSpiritIrInstruction,{op:'call'}> }
  | { op:'index'; dest:number; index:number; target:number; seriesId:CoreSpiritSeriesId; instruction:Extract<CoreSpiritIrInstruction,{op:'index'}> }
  | { op:'jumpIfFalse'; condition:number; target:number }
  | { op:'jump'; target:number }
  | { op:'emit'; args:number[]; instruction:Extract<CoreSpiritIrInstruction,{op:'emit'}> };

interface CompiledPlan { readonly instructions: readonly FastInstruction[]; readonly store:CoreSpiritSlotValueStore; }

function compilePlan(instructions:readonly CoreSpiritIrInstruction[], seriesRegistry?:CoreSpiritSeriesRegistry):CompiledPlan {
  const names=new Map<string,number>();
  const slot=(name:string):number=>{const existing=names.get(name);if(existing!=null)return existing;const next=names.size;names.set(name,next);return next;};
  const fast:FastInstruction[]=instructions.map((instruction):FastInstruction=>{
    switch(instruction.op){
      case 'const': return {op:'const',dest:slot(instruction.dest),value:instruction.value};
      case 'loadSeries': return {op:'loadSeries',dest:slot(instruction.dest),name:instruction.name,offset:instruction.offset};
      case 'move': return {op:'move',dest:slot(instruction.dest),source:instruction.source};
      case 'setLocal': return {op:'setLocal',name:instruction.name,source:slot(instruction.source),series:instruction.series,seriesId:seriesRegistry?.idFor(instruction.name) ?? -1};
      case 'unary': return {op:'unary',dest:slot(instruction.dest),operator:instruction.operator,operand:slot(instruction.operand)};
      case 'binary': return {op:'binary',dest:slot(instruction.dest),operator:instruction.operator,left:slot(instruction.left),right:slot(instruction.right)};
      case 'call': return {op:'call',dest:slot(instruction.dest),args:instruction.args.map(slot),instruction};
      case 'index': return {op:'index',dest:slot(instruction.dest),index:slot(instruction.index),target:slot(instruction.target),seriesId:instruction.seriesName && seriesRegistry ? seriesRegistry.idFor(instruction.seriesName) : -1,instruction};
      case 'jumpIfFalse': return {op:'jumpIfFalse',condition:slot(instruction.condition),target:instruction.target};
      case 'jump': return {op:'jump',target:instruction.target};
      case 'emit': return {op:'emit',args:instruction.args.slice(1).map(slot),instruction};
    }
  });
  return {instructions:Object.freeze(fast),store:new CoreSpiritSlotValueStore(names,names.size)};
}

/** Optimized scalar executor: one-time register lowering, then numeric-slot hot execution. */
export class CoreSpiritOptimizedExecutionVM {
  private readonly plans=new WeakMap<object,WeakMap<object,CompiledPlan>>();
  prepare(instructions:readonly CoreSpiritIrInstruction[],seriesRegistry?:CoreSpiritSeriesRegistry):void{
    const key=(seriesRegistry ?? this) as object;
    let variants=this.plans.get(instructions as object);
    if(!variants){variants=new WeakMap<object,CompiledPlan>();this.plans.set(instructions as object,variants);}
    if(!variants.has(key))variants.set(key,compilePlan(instructions,seriesRegistry));
  }
  run(instructions:CoreSpiritIrInstruction[],barIndex:number,host:CoreSpiritExecutionVMHost,output:CoreSpiritOutputCollector,options:{reuseValues?:boolean;dirtyInstructions?:ReadonlySet<number>;seriesRegistry?:CoreSpiritSeriesRegistry} = {}):void{
    const key=(options.seriesRegistry ?? this) as object;
    let variants=this.plans.get(instructions as object);
    if(!variants){variants=new WeakMap<object,CompiledPlan>();this.plans.set(instructions as object,variants);}
    let plan=variants.get(key);
    if(!plan){plan=compilePlan(instructions,options.seriesRegistry);variants.set(key,plan);}
    const values=plan.store; if(options.reuseValues !== true) values.clear(); const dirty=options.dirtyInstructions; let pc=0; let steps=0;
    while(pc<plan.instructions.length){
      if(++steps>host.maxStepsPerBar)throw new Error('execution step limit exceeded');
      if((steps&1023)===0)host.throwIfAborted();
      const ins=plan.instructions[pc];
      const computational = ins.op === 'const' || ins.op === 'loadSeries' || ins.op === 'move' || ins.op === 'unary' || ins.op === 'binary' || ins.op === 'call' || ins.op === 'index';
      if(dirty && computational && !dirty.has(pc)){ pc += 1; continue; }
      switch(ins.op){
        case 'const':values.set(ins.dest,ins.value);pc+=1;break;
        case 'loadSeries':values.set(ins.dest,host.loadSeries(ins.name,ins.offset));pc+=1;break;
        case 'move':values.set(ins.dest,host.moveLocal(ins.source));pc+=1;break;
        case 'setLocal':
          if(ins.series!==false && ins.seriesId>=0 && host.setLocalBySeriesId) host.setLocalBySeriesId(ins.seriesId,ins.name,values.get(ins.source));
          else host.setLocal(ins.name,values.get(ins.source),ins.series!==false);
          pc+=1;break;
        case 'unary':values.set(ins.dest,host.unary(ins.operator,values.get(ins.operand)));pc+=1;break;
        case 'binary':values.set(ins.dest,host.binary(ins.operator,values.get(ins.left),values.get(ins.right)));pc+=1;break;
        case 'call':{if(host.tryFused(pc,values,instructions,barIndex)){pc+=1;break;}const args=ins.args.map(arg=>values.get(arg));values.set(ins.dest,host.call(ins.instruction,args));pc+=1;break;}
        case 'index':{
          const index=Number(values.get(ins.index));if(!Number.isInteger(index)||index<0)throw new Error('invalid historical index '+String(index));
          const value=ins.seriesId>=0 && host.loadIndexedSeriesById ? host.loadIndexedSeriesById(ins.seriesId,index) : host.loadIndexed(ins.instruction,index,values);
          values.set(ins.dest,value);pc+=1;break;
        }
        case 'jumpIfFalse':pc=host.truthy(values.get(ins.condition))?pc+1:ins.target;break;
        case 'jump':pc=ins.target;break;
        case 'emit':host.emit(ins.instruction,values,output);pc+=1;break;
      }
    }
  }
}