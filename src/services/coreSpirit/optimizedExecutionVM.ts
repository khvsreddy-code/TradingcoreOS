import type { CoreSpiritIrInstruction } from './ir';
import type { CoreSpiritOutputCollector } from './outputCollector';
import type { CoreSpiritExecutionVMHost } from './executionVM';
import { CoreSpiritSlotValueStore } from './executionValueStore';
import type { CoreSpiritSeriesRegistry, CoreSpiritSeriesId } from './seriesRegistry';
import type { CoreSpiritSpecializedInstruction, CoreSpiritSpecializedPlan } from './specializedPlan';
import { buildCoreSpiritSpecializedPlan } from './specializedPlan';

type FastInstruction = CoreSpiritSpecializedInstruction;

interface CompiledPlan { readonly instructions: readonly FastInstruction[]; readonly store:CoreSpiritSlotValueStore; }

function compilePlan(
  instructions:readonly CoreSpiritIrInstruction[],
  seriesRegistry?:CoreSpiritSeriesRegistry,
  specializedPlan?:CoreSpiritSpecializedPlan,
):CompiledPlan {
  const plan = specializedPlan ?? buildCoreSpiritSpecializedPlan(instructions, seriesRegistry);
  const boundInstructions = seriesRegistry
    ? plan.instructions.map((instruction) => {
      if (instruction.op === 'setLocal' && instruction.series && instruction.seriesId < 0) {
        return { ...instruction, seriesId: seriesRegistry.idFor(instruction.name) };
      }
      if (instruction.op === 'index' && instruction.seriesId < 0 && instruction.instruction.seriesName) {
        return { ...instruction, seriesId: seriesRegistry.idFor(instruction.instruction.seriesName) };
      }
      return instruction;
    })
    : plan.instructions;
  return {
    instructions: Object.freeze(boundInstructions),
    store: new CoreSpiritSlotValueStore(plan.slotByName, plan.slotCount),
  };
}

/** Optimized scalar executor: one-time register lowering, then numeric-slot hot execution. */
export class CoreSpiritOptimizedExecutionVM {
  private readonly plans=new WeakMap<object,WeakMap<object,CompiledPlan>>();
  prepare(
    instructions:readonly CoreSpiritIrInstruction[],
    seriesRegistry?:CoreSpiritSeriesRegistry,
    specializedPlan?:CoreSpiritSpecializedPlan,
  ):void{
    const key=(seriesRegistry ?? this) as object;
    let variants=this.plans.get(instructions as object);
    if(!variants){variants=new WeakMap<object,CompiledPlan>();this.plans.set(instructions as object,variants);}
    if(!variants.has(key))variants.set(key,compilePlan(instructions,seriesRegistry,specializedPlan));
  }
  run(instructions:CoreSpiritIrInstruction[],barIndex:number,host:CoreSpiritExecutionVMHost,output:CoreSpiritOutputCollector,options:{reuseValues?:boolean;dirtyInstructions?:ReadonlySet<number>;seriesRegistry?:CoreSpiritSeriesRegistry;specializedPlan?:CoreSpiritSpecializedPlan} = {}):void{
    const key=(options.seriesRegistry ?? this) as object;
    let variants=this.plans.get(instructions as object);
    if(!variants){variants=new WeakMap<object,CompiledPlan>();this.plans.set(instructions as object,variants);}
    let plan=variants.get(key);
    if(!plan){plan=compilePlan(instructions,options.seriesRegistry,options.specializedPlan);variants.set(key,plan);}
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