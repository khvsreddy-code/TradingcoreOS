import type { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { coreSpiritSourceMapFromInstructions } from './ir';
import { getCoreSpiritBuiltin } from './standardLibrary';

export type CoreSpiritOptimizationNode = Readonly<{
  instruction: number;
  op: CoreSpiritIrInstruction['op'];
  name?: string;
  dest?: string;
  dependencies: readonly number[];
  users: readonly number[];
  pure: boolean;
  deterministic: boolean;
  stateful: boolean;
  effectful: boolean;
  cacheable: boolean;
  estimatedBarWork: number;
}>;

export type CoreSpiritOptimizationPass = Readonly<{
  name: string;
  changed: boolean;
  instructionsBefore: number;
  instructionsAfter: number;
}>;

export type CoreSpiritOptimizationCost = Readonly<{
  estimatedBarWork: number;
  pureBarWork: number;
  effectBarWork: number;
  statefulBarWork: number;
  historyReadOps: number;
  sourceReadReuse: number;
  cseEliminated: number;
  peakLiveRegisters: number;
  chronologicalPasses: 1;
  estimatedSavedBarWork: number;
}>;

export type CoreSpiritOptimizationPlan = Readonly<{
  version: 1;
  strategy: 'chronological-query-optimization';
  passes: readonly CoreSpiritOptimizationPass[];
  nodes: readonly CoreSpiritOptimizationNode[];
  roots: readonly number[];
  outputs: readonly number[];
  barriers: readonly number[];
  cost: CoreSpiritOptimizationCost;
  explanation: readonly string[];
}>;

const STATEFUL_CALLS = new Set([
  'ema','rma','wilder','rsi','atr','tr','trueRange','vwap','highest','lowest',
  'sma','wma','vwma','valuewhen','stdev','variance','median','percentile','mad','beta','trendStrength',
]);

function pureDeterministicCall(ins: Extract<CoreSpiritIrInstruction, { op:'call' }>): boolean {
  if (ins.componentPure === true && ins.componentStateful !== true && ins.componentDeterministic !== false) return true;
  const builtin = getCoreSpiritBuiltin(ins.name);
  return Boolean(builtin?.pure) && !STATEFUL_CALLS.has(ins.name) && ins.componentStateful !== true && ins.componentDeterministic !== false;
}

/** Fold constants, safely reuse pure expression/input work, then emit a cost model. */
export function optimizeCoreSpiritIr(program: CoreSpiritIrProgram): CoreSpiritIrProgram {
  const before = program.entry.instructions;
  const folded = constantFold(before);
  const cse = commonSubexpressionEliminate(folded);
  const instructions = cse.instructions;
  const plan = buildOptimizationPlan(before, instructions, folded !== before, cse.eliminated);
  return {
    ...program,
    entry: { ...program.entry, instructions },
    sourceMap: coreSpiritSourceMapFromInstructions(program.sourceId, instructions),
    diagnostics: [...program.diagnostics],
    optimizationPlan: plan,
  };
}

function constantFold(instructions: readonly CoreSpiritIrInstruction[]): CoreSpiritIrInstruction[] {
  const constants = new Map<string, number|string|boolean|null>();
  return instructions.map((instruction): CoreSpiritIrInstruction => {
    if (instruction.op === 'const') {
      constants.set(instruction.dest, instruction.value);
      return instruction;
    }
    if (instruction.op === 'unary' && constants.has(instruction.operand)) {
      const value = constants.get(instruction.operand)!;
      const folded = foldUnary(instruction.operator, value);
      constants.set(instruction.dest, folded);
      return { op:'const', dest:instruction.dest, value:folded, origin:instruction.origin };
    }
    if (instruction.op === 'binary' && constants.has(instruction.left) && constants.has(instruction.right)) {
      const folded = foldBinary(instruction.operator, constants.get(instruction.left)!, constants.get(instruction.right)!);
      constants.set(instruction.dest, folded);
      return { op:'const', dest:instruction.dest, value:folded, origin:instruction.origin };
    }
    if (instruction.op === 'move' && constants.has(instruction.source)) {
      const value = constants.get(instruction.source)!;
      constants.set(instruction.dest, value);
      return { op:'const', dest:instruction.dest, value, origin:instruction.origin };
    }
    return instruction;
  });
}

function cseKey(instruction: CoreSpiritIrInstruction): string | undefined {
  switch (instruction.op) {
    case 'loadSeries':
      return ['loadSeries',instruction.name,String(instruction.offset)].join('|');
    case 'unary':
      return ['unary',instruction.operator,instruction.operand].join('|');
    case 'binary': {
      const args = ['+','*','==','!=','and','or'].includes(instruction.operator)
        ? [instruction.left,instruction.right].sort()
        : [instruction.left,instruction.right];
      return ['binary',instruction.operator,...args].join('|');
    }
    case 'index':
      return ['index',instruction.seriesName ?? '',instruction.target,instruction.index].join('|');
    case 'call':
      if (!pureDeterministicCall(instruction)) return undefined;
      return ['call',instruction.name,instruction.componentId ?? '',instruction.args.join(','),JSON.stringify(instruction.seriesSources ?? [])].join('|');
    default:
      return undefined;
  }
}

function commonSubexpressionEliminate(instructions: readonly CoreSpiritIrInstruction[]): { instructions: CoreSpiritIrInstruction[]; eliminated: number } {
  const canonical = new Map<string,string>();
  const out: CoreSpiritIrInstruction[] = [];
  let eliminated = 0;
  for (const instruction of instructions) {
    const dest = 'dest' in instruction ? instruction.dest : undefined;
    const key = dest ? cseKey(instruction) : undefined;
    const existing = key ? canonical.get(key) : undefined;
    if (key && dest && existing && existing !== dest) {
      out.push({ op:'move', dest, source:existing, origin:instruction.origin });
      eliminated += 1;
      continue;
    }
    out.push(instruction);
    if (key && dest) canonical.set(key, dest);
  }
  return { instructions:out, eliminated };
}

function info(instruction: CoreSpiritIrInstruction) {
  if (instruction.op === 'const') return { pure:true,deterministic:true,stateful:false,effectful:false,cacheable:true,work:0.05 };
  if (instruction.op === 'move') return { pure:true,deterministic:true,stateful:false,effectful:false,cacheable:true,work:0.05 };
  if (instruction.op === 'loadSeries') return { pure:true,deterministic:true,stateful:false,effectful:false,cacheable:true,work:1 };
  if (instruction.op === 'unary') return { pure:true,deterministic:true,stateful:false,effectful:false,cacheable:true,work:0.75 };
  if (instruction.op === 'binary') return { pure:true,deterministic:true,stateful:false,effectful:false,cacheable:true,work:1 };
  if (instruction.op === 'index') return { pure:true,deterministic:true,stateful:false,effectful:false,cacheable:true,work:1.25 };
  if (instruction.op === 'loadState') return { pure:false,deterministic:true,stateful:true,effectful:false,cacheable:false,work:0.5 };
  if (instruction.op === 'setState') return { pure:false,deterministic:true,stateful:true,effectful:true,cacheable:false,work:0.25 };
  if (instruction.op === 'eventGate') return { pure:false,deterministic:true,stateful:false,effectful:true,cacheable:false,work:0.1 };
  if (instruction.op === 'setLocal') return { pure:false,deterministic:true,stateful:true,effectful:true,cacheable:false,work:0.25 };
  if (instruction.op === 'jump' || instruction.op === 'jumpIfFalse') return { pure:false,deterministic:true,stateful:false,effectful:true,cacheable:false,work:0.1 };
  if (instruction.op === 'emit') return { pure:false,deterministic:true,stateful:false,effectful:true,cacheable:false,work:0.5 };
  const stateful = instruction.componentStateful === true || STATEFUL_CALLS.has(instruction.name);
  const deterministic = instruction.componentDeterministic !== false && Boolean(instruction.componentDeterministic ?? getCoreSpiritBuiltin(instruction.name)?.pure);
  const pure = pureDeterministicCall(instruction);
  return { pure,deterministic,stateful,effectful:!deterministic || instruction.componentStateful === true,cacheable:pure && deterministic && !stateful,work:!deterministic ? 3 : stateful ? 2 : 1.5 };
}

function deps(instruction: CoreSpiritIrInstruction): string[] {
  switch (instruction.op) {
    case 'move': return [instruction.source];
    case 'unary': return [instruction.operand];
    case 'binary': return [instruction.left,instruction.right];
    case 'call': return instruction.args;
    case 'index': return [instruction.target,instruction.index];
    case 'setLocal': return [instruction.source];
    case 'jumpIfFalse': return [instruction.condition];
    case 'emit': return instruction.args.slice(1);
    default: return [];
  }
}

function buildOptimizationPlan(
  original: readonly CoreSpiritIrInstruction[],
  instructions: readonly CoreSpiritIrInstruction[],
  constantPassChanged: boolean,
  eliminated: number,
): CoreSpiritOptimizationPlan {
  const producer = new Map<string,number>();
  const dependencyMap = new Map<number,number[]>();
  const userMap = new Map<number,number[]>();
  for (let index=0; index<instructions.length; index+=1) {
    const ds = deps(instructions[index]!).map(r=>producer.get(r)).filter((v):v is number=>v!==undefined);
    dependencyMap.set(index,ds);
    for (const d of ds) {
      const users = userMap.get(d) ?? [];
      users.push(index);
      userMap.set(d,users);
    }
    const instruction=instructions[index]!;
    if ('dest' in instruction && instruction.dest) producer.set(instruction.dest,index);
    if (instruction.op==='setLocal' || instruction.op==='setState') producer.set(instruction.name,index);
  }
  const nodes=instructions.map((instruction,index)=>{
    const x=info(instruction);
    return Object.freeze({
      instruction:index,
      op:instruction.op,
      ...('name' in instruction && instruction.op==='call' ? {name:instruction.name}:{}),
      ...('dest' in instruction ? {dest:instruction.dest}:{}),
      dependencies:Object.freeze([...(dependencyMap.get(index)??[])]),
      users:Object.freeze([...(userMap.get(index)??[])]),
      pure:x.pure, deterministic:x.deterministic, stateful:x.stateful, effectful:x.effectful, cacheable:x.cacheable,
      estimatedBarWork:x.work,
    });
  });
  const historyReadOps=instructions.filter(i=>i.op==='loadSeries'||i.op==='index').length;
  const originalHistoryReadOps=original.filter(i=>i.op==='loadSeries'||i.op==='index').length;
  const sourceReadReuse=Math.max(0,originalHistoryReadOps-historyReadOps);
  const pureBarWork=nodes.filter(n=>n.pure&&!n.effectful).reduce((s,n)=>s+n.estimatedBarWork,0);
  const effectBarWork=nodes.filter(n=>n.effectful).reduce((s,n)=>s+n.estimatedBarWork,0);
  const statefulBarWork=nodes.filter(n=>n.stateful).reduce((s,n)=>s+n.estimatedBarWork,0);
  const estimatedBarWork=pureBarWork+effectBarWork;
  const originalWork=original.reduce((s,i)=>s+info(i).work,0);
  const lastUse=new Map<string,number>();
  instructions.forEach((instruction,index)=>{ for(const register of deps(instruction)) lastUse.set(register,index); });
  const live=new Set<string>();
  let peakLiveRegisters=0;
  for(let index=0;index<instructions.length;index+=1){
    const instruction=instructions[index]!;
    if('dest' in instruction && instruction.dest) live.add(instruction.dest);
    for(const register of deps(instruction)) if(lastUse.get(register)===index) live.delete(register);
    peakLiveRegisters=Math.max(peakLiveRegisters,live.size);
  }
  const roots=nodes.filter(n=>n.dependencies.length===0).map(n=>n.instruction);
  const barriers=nodes.filter(n=>n.effectful).map(n=>n.instruction);
  const outputs=nodes.filter(n=>n.op==='emit').map(n=>n.instruction);
  const estimatedSavedBarWork=Math.max(0,originalWork-estimatedBarWork);
  return Object.freeze({
    version:1,
    strategy:'chronological-query-optimization',
    passes:Object.freeze([
      Object.freeze({name:'constant-fold',changed:constantPassChanged,instructionsBefore:original.length,instructionsAfter:instructions.length}),
      Object.freeze({name:'pure-cse-and-series-read-reuse',changed:eliminated>0,instructionsBefore:instructions.length,instructionsAfter:instructions.length}),
    ]),
    nodes:Object.freeze(nodes),
    roots:Object.freeze(roots),
    outputs:Object.freeze(outputs),
    barriers:Object.freeze(barriers),
    cost:Object.freeze({
      estimatedBarWork,pureBarWork,effectBarWork,statefulBarWork,historyReadOps,sourceReadReuse,cseEliminated:eliminated,peakLiveRegisters,
      chronologicalPasses:1 as const,estimatedSavedBarWork,
    }),
    explanation:Object.freeze([
      'All execution remains one chronological bar traversal; no second semantic runtime is introduced.',
      sourceReadReuse>0 ? `Reused ${sourceReadReuse} repeated series read(s).` : 'No repeated series reads required reuse.',
      eliminated>0 ? `Eliminated ${eliminated} safe pure duplicate expression(s).` : 'No additional safe pure expression duplicates were found.',
      'Stateful indicator calls remain ordered stream operators and are not aliased by generic CSE.',
      `Estimated peak temporary register pressure: ${peakLiveRegisters}.`,
    ]),
  });
}

function foldUnary(operator:'!'|'+'|'-', value:unknown): number|boolean|null {
  if(operator==='!') return !Boolean(value);
  const n=Number(value);
  return Number.isFinite(n) ? (operator==='+' ? n : -n) : null;
}

function foldBinary(operator:string,left:unknown,right:unknown): number|boolean|null {
  if(['+','-','*','/','%','<','<=','>','>='].includes(operator)&&(left==null||right==null)) return null;
  const a=Number(left),b=Number(right);
  switch(operator){
    case '+':return a+b; case '-':return a-b; case '*':return a*b; case '/':return b===0?null:a/b; case '%':return a%b;
    case '==':return left===right; case '!=':return left!==right; case '<':return a<b; case '<=':return a<=b; case '>':return a>b; case '>=':return a>=b;
    case 'and':return Boolean(left)&&Boolean(right); case 'or':return Boolean(left)||Boolean(right);
    default:return null;
  }
}
