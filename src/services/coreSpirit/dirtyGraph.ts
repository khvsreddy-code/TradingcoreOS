import type { CoreSpiritSemanticGraph, CoreSpiritReactivePlan } from './semanticGraph';
import type { CoreSpiritIrInstruction } from './ir';

export type CoreSpiritDirtySource = 'time' | 'open' | 'high' | 'low' | 'close' | 'volume' | 'external-data' | 'bar_index';

export interface CoreSpiritDirtyNode {
  readonly id: string;
  readonly instruction: number;
  readonly inputs: readonly string[];
  readonly output?: string;
  readonly lookback: number;
  readonly stateful: boolean;
  readonly incremental: boolean;
  readonly viewportDependent: boolean;
  readonly realtimeSafe: boolean;
  readonly dependents: readonly string[];
  readonly dependencies: readonly string[];
  readonly alwaysRecompute: boolean;
}

export interface CoreSpiritDirtyRange { readonly from: number; readonly to: number; }

export interface CoreSpiritDirtyExecutionPlan {
  readonly sourceFields: readonly CoreSpiritDirtySource[];
  readonly nodes: ReadonlySet<string>;
  readonly instructions: ReadonlySet<number>;
  readonly ranges: ReadonlyMap<string, CoreSpiritDirtyRange>;
  readonly earliest: number;
  readonly latest: number;
  readonly allHistory: boolean;
}

function inferLookback(node: CoreSpiritDirtyNode, instructionName: string | undefined, constantValue?: number): number {
  if (node.stateful && /^(ema|rma|rsi|atr|vwap|cross|crossover|crossunder|bar_index)$/.test(instructionName || '')) return -1;
  if (instructionName === 'change' || instructionName === 'pctchange' || instructionName === 'cross' || instructionName === 'crossover' || instructionName === 'crossunder') return 1;
  if (instructionName === 'rising' || instructionName === 'falling') return Math.max(1, Math.floor(constantValue || 1));
  if (node.stateful) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor(constantValue || 0));
}

export function buildCoreSpiritDirtyGraph(graph: CoreSpiritSemanticGraph, reactive: CoreSpiritReactivePlan, instructions: readonly CoreSpiritIrInstruction[] = []): readonly CoreSpiritDirtyNode[] {
  const dependents = reactive.dependents;
  const output = graph.nodes.map((node) => {
    const name = node.name;
    const viewportDependent = Boolean(name && /visible_(bar|range|time)|chart\.left|chart\.right/.test(name));
    const realtimeSafe = node.deterministic && !node.effectful && !viewportDependent;
    const incremental = realtimeSafe || (node.stateful && node.deterministic);
    const constants = new Map<string, number>();
    for (const instruction of instructions) if (instruction.op === 'const' && typeof instruction.value === 'number' && Number.isFinite(instruction.value)) constants.set(instruction.dest, instruction.value);
    const instruction = instructions[node.instruction];
    const constantValue = instruction?.op === 'call' ? Number(constants.get(instruction.args[1] || '')) : instruction?.op === 'index' ? Number(constants.get(instruction.index)) : instruction?.op === 'loadSeries' ? instruction.offset : undefined;
    const lookback = inferLookback({id:node.id,instruction:node.instruction,inputs:node.sourceInputs,output:node.dest,lookback:0,stateful:node.stateful,incremental,viewportDependent,realtimeSafe,dependents:dependents[node.id]||[],dependencies:node.dependencies,alwaysRecompute:reactive.alwaysRecompute.includes(node.id)}, name, Number.isFinite(constantValue) ? constantValue : undefined);
    return Object.freeze({ id:node.id, instruction:node.instruction, inputs:Object.freeze([...(node.sourceInputs||[])]), output:node.dest, lookback, stateful:node.stateful, incremental, viewportDependent, realtimeSafe, dependents:Object.freeze([...(dependents[node.id]||[])]), dependencies:Object.freeze([...node.dependencies]), alwaysRecompute:reactive.alwaysRecompute.includes(node.id) });
  });
  return Object.freeze(output);
}

export class CoreSpiritDirtyGraph {
  readonly nodesById: ReadonlyMap<string, CoreSpiritDirtyNode>;
  readonly sourceDependents: ReadonlyMap<string, readonly string[]>;
  readonly statefulInstructions: ReadonlySet<number>;
  constructor(nodes: readonly CoreSpiritDirtyNode[], reactive: CoreSpiritReactivePlan) {
    this.nodesById = new Map(nodes.map((node) => [node.id, node] as const));
    this.sourceDependents = new Map(Object.entries(reactive.sourceDependents).map(([key, ids]) => [key, Object.freeze([...ids])] as const));
    this.statefulInstructions = new Set(nodes.filter((node) => node.stateful).map((node) => node.instruction));
  }

  nodeForInstruction(instruction: number): CoreSpiritDirtyNode | undefined {
    for (const node of this.nodesById.values()) {
      if (node.instruction === instruction) return node;
    }
    return undefined;
  }

  planTail(sources: readonly CoreSpiritDirtySource[], barIndex: number, executionEnd = barIndex): CoreSpiritDirtyExecutionPlan {
    const dirty = new Map<string, CoreSpiritDirtyRange>();
    const queue: string[] = [];
    const mark = (id:string, from:number, to:number):void => {
      const node=this.nodesById.get(id); if(!node)return;
      const nextFrom=Math.max(0,from), nextTo=Math.max(nextFrom,Math.min(executionEnd,to));
      const previous=dirty.get(id);
      if(previous && previous.from<=nextFrom && previous.to>=nextTo)return;
      dirty.set(id, previous ? {from:Math.min(previous.from,nextFrom),to:Math.max(previous.to,nextTo)} : {from:nextFrom,to:nextTo});
      queue.push(id);
    };
    for(const source of sources) for(const id of this.sourceDependents.get(source) || []) mark(id,barIndex,barIndex);
    for(const node of this.nodesById.values()) if(node.alwaysRecompute) mark(node.id,barIndex,barIndex);
    while(queue.length){
      const id=queue.shift()!, node=this.nodesById.get(id)!; const range=dirty.get(id)!;
      const nextTo=node.lookback >= 0 ? Math.min(executionEnd,range.to+node.lookback) : executionEnd;
      for(const dependent of node.dependents) mark(dependent,range.from,nextTo);
    }
    const instructions=new Set<number>(); for(const id of dirty.keys()) instructions.add(this.nodesById.get(id)!.instruction);
    const ranges=new Map<string,CoreSpiritDirtyRange>(dirty);
    const values=[...ranges.values()];
    return {sourceFields:Object.freeze([...sources]),nodes:new Set(dirty.keys()),instructions,ranges,earliest:values.length?Math.min(...values.map(r=>r.from)):barIndex,latest:values.length?Math.max(...values.map(r=>r.to)):barIndex,allHistory:false};
  }

  planFull(executionEnd:number): CoreSpiritDirtyExecutionPlan {
    const nodes=new Set<string>(this.nodesById.keys());
    const instructions=new Set<number>([...this.nodesById.values()].map((node)=>node.instruction));
    const ranges=new Map<string,CoreSpiritDirtyRange>([...this.nodesById.keys()].map((id)=>[id,{from:0,to:executionEnd}] as const));
    return {sourceFields:Object.freeze([]),nodes,instructions,ranges,earliest:0,latest:executionEnd,allHistory:true};
  }
}

export function dirtySourcesForBar(previous:{open:number;high:number;low:number;close:number;volume:number}|undefined,current:{open:number;high:number;low:number;close:number;volume:number}): CoreSpiritDirtySource[] {
  if(!previous) return ['time','open','high','low','close','volume','bar_index'];
  const out:CoreSpiritDirtySource[]=[];
  if(previous.open!==current.open)out.push('open');
  if(previous.high!==current.high)out.push('high');
  if(previous.low!==current.low)out.push('low');
  if(previous.close!==current.close)out.push('close');
  if(previous.volume!==current.volume)out.push('volume');
  return out;
}