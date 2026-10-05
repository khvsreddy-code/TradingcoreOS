import type { CoreSpiritIrInstruction } from './ir';
import type { CoreSpiritOutputCollector } from './outputCollector';
import type { CoreSpiritExecutionVMHost } from './executionVM';
import { CoreSpiritSlotValueStore } from './executionValueStore';

type FastInstruction =
  | { op:'const'; dest:number; value:number|string|boolean|null }
  | { op:'loadSeries'; dest:number; name:string; offset:number }
  | { op:'move'; dest:number; source:string }
  | { op:'setLocal'; name:string; source:number; series?:boolean }
  | { op:'unary'; dest:number; operator:'!'|'+'|'-'; operand:number }
  | { op:'binary'; dest:number; operator:string; left:number; right:number }
  | { op:'call'; dest:number; args:number[]; instruction:Extract<CoreSpiritIrInstruction,{op:'call'}> }
  | { op:'index'; dest:number; index:number; target:number; instruction:Extract<CoreSpiritIrInstruction,{op:'index'}> }
  | { op:'jumpIfFalse'; condition:number; target:number }
  | { op:'jump'; target:number }
  | { op:'emit'; args:number[]; instruction:Extract<CoreSpiritIrInstruction,{op:'emit'}> };

interface CompiledPlan { readonly instructions: readonly FastInstruction[]; readonly store:CoreSpiritSlotValueStore; }

function compilePlan(instructions:readonly CoreSpiritIrInstruction[]):CompiledPlan {
  const names=new Map<string,number>();
  const slot=(name:string):number=>{const existing=names.get(name);if(existing!=null)return existing;const next=names.size;names.set(name,next);return next;};
  const fast:FastInstruction[]=instructions.map((instruction):FastInstruction=>{
    switch(instruction.op){
      case 'const': return {op:'const',dest:slot(instruction.dest),value:instruction.value};
      case 'loadSeries': return {op:'loadSeries',dest:slot(instruction.dest),name:instruction.name,offset:instruction.offset};
      case 'move': return {op:'move',dest:slot(instruction.dest),source:instruction.source};
      case 'setLocal': return {op:'setLocal',name:instruction.name,source:slot(instruction.source),series:instruction.series};
      case 'unary': return {op:'unary',dest:slot(instruction.dest),operator:instruction.operator,operand:slot(instruction.operand)};
      case 'binary': return {op:'binary',dest:slot(instruction.dest),operator:instruction.operator,left:slot(instruction.left),right:slot(instruction.right)};
      case 'call': return {op:'call',dest:slot(instruction.dest),args:instruction.args.map(slot),instruction};
      case 'index': return {op:'index',dest:slot(instruction.dest),index:slot(instruction.index),target:slot(instruction.target),instruction};
      case 'jumpIfFalse': return {op:'jumpIfFalse',condition:slot(instruction.condition),target:instruction.target};
      case 'jump': return {op:'jump',target:instruction.target};
      case 'emit': return {op:'emit',args:instruction.args.slice(1).map(slot),instruction};
    }
  });
  return {instructions:Object.freeze(fast),store:new CoreSpiritSlotValueStore(names,names.size)};
}

/** Optimized scalar executor: one-time register lowering, then numeric-slot hot execution. */
export class CoreSpiritOptimizedExecutionVM {
  private readonly plans=new WeakMap<object,CompiledPlan>();
  prepare(instructions:readonly CoreSpiritIrInstruction[]):void{if(!this.plans.has(instructions as object))this.plans.set(instructions as object,compilePlan(instructions));}
  run(instructions:CoreSpiritIrInstruction[],barIndex:number,host:CoreSpiritExecutionVMHost,output:CoreSpiritOutputCollector):void{
    let plan=this.plans.get(instructions as object);
    if(!plan){plan=compilePlan(instructions);this.plans.set(instructions as object,plan);}
    const values=plan.store; values.clear(); let pc=0; let steps=0;
    while(pc<plan.instructions.length){
      if(++steps>host.maxStepsPerBar)throw new Error('execution step limit exceeded');
      if((steps&1023)===0)host.throwIfAborted();
      const ins=plan.instructions[pc];
      switch(ins.op){
        case 'const':values.set(ins.dest,ins.value);pc+=1;break;
        case 'loadSeries':values.set(ins.dest,host.loadSeries(ins.name,ins.offset));pc+=1;break;
        case 'move':values.set(ins.dest,host.moveLocal(ins.source));pc+=1;break;
        case 'setLocal':host.setLocal(ins.name,values.get(ins.source),ins.series!==false);pc+=1;break;
        case 'unary':values.set(ins.dest,host.unary(ins.operator,values.get(ins.operand)));pc+=1;break;
        case 'binary':values.set(ins.dest,host.binary(ins.operator,values.get(ins.left),values.get(ins.right)));pc+=1;break;
        case 'call':{if(host.tryFused(pc,values,instructions,barIndex)){pc+=1;break;}const args=ins.args.map(arg=>values.get(arg));values.set(ins.dest,host.call(ins.instruction,args));pc+=1;break;}
        case 'index':{const index=Number(values.get(ins.index));if(!Number.isInteger(index)||index<0)throw new Error('invalid historical index '+String(index));values.set(ins.dest,host.loadIndexed(ins.instruction,index,values));pc+=1;break;}
        case 'jumpIfFalse':pc=host.truthy(values.get(ins.condition))?pc+1:ins.target;break;
        case 'jump':pc=ins.target;break;
        case 'emit':host.emit(ins.instruction,values,output);pc+=1;break;
      }
    }
  }
}