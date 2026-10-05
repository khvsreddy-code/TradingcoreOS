import type { CoreSpiritIrInstruction } from './ir';

export type CoreSpiritProfilerMode = 'summary' | 'full';

export type CoreSpiritProfilerOptions = Readonly<{
  enabled?: boolean;
  mode?: CoreSpiritProfilerMode;
  retainSamples?: number;
}>;

export type CoreSpiritProfilerPhase = 'compile' | 'data' | 'execution' | 'rendering' | 'historical' | 'realtime' | 'idle';

export type CoreSpiritProfilerNodeStat = Readonly<{
  id: string;
  label: string;
  phase: CoreSpiritProfilerPhase;
  calls: number;
  timeMs: number;
  percentage: number;
  trackedAllocations: number;
  trackedAllocationBytes: number;
}>;

export type CoreSpiritProfilerFlameNode = Readonly<{
  id: string;
  label: string;
  startMs: number;
  durationMs: number;
  depth: number;
  calls: number;
}>;

export type CoreSpiritProfilerSnapshot = Readonly<{
  version: 1;
  enabled: boolean;
  mode: CoreSpiritProfilerMode;
  compileMs: number;
  historicalMs: number;
  realtimeMs: number;
  bars: number;
  ticks: number;
  instructions: number;
  instructionsPerBar: number;
  avgTickMs: number;
  minTickMs: number;
  maxTickMs: number;
  trackedAllocations: number;
  trackedAllocationBytes: number;
  trackedAllocationsPerTick: number;
  topNodes: readonly CoreSpiritProfilerNodeStat[];
  flameGraph: readonly CoreSpiritProfilerFlameNode[];
  phases: Readonly<Record<CoreSpiritProfilerPhase,{timeMs:number;calls:number;percentage:number}>>;
  note: string;
}>;

type MutableNodeStat = {
  id: string;
  label: string;
  phase: CoreSpiritProfilerPhase;
  calls: number;
  timeMs: number;
  trackedAllocations: number;
  trackedAllocationBytes: number;
};

type MutablePhase = { timeMs:number; calls:number };

function nowMs(): number {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function phaseForInstruction(instruction: CoreSpiritIrInstruction): CoreSpiritProfilerPhase {
  if (instruction.op === 'emit') return 'rendering';
  if (instruction.op === 'loadSeries' || instruction.op === 'loadState') return 'data';
  if (instruction.op === 'call' && /^(request|requestBatch|lowerTf|__member_get|__market_timeframe)$/.test(instruction.name)) return 'data';
  if (instruction.op === 'eventGate') return 'execution';
  return 'execution';
}

function labelForInstruction(instruction: CoreSpiritIrInstruction, pc: number): string {
  if (instruction.op === 'call') return instruction.name;
  if (instruction.op === 'emit') return `emit:${instruction.kind}`;
  return instruction.op;
}

function phasePercentage(time: number, total: number): number {
  return total > 0 ? (time / total) * 100 : 0;
}

/**
 * First-class CoreSpirit profiler.
 *
 * Profiling is opt-in. Disabled mode has no instruction callbacks installed in
 * the runtime, preserving the normal hot path. Full mode measures individual
 * IR instructions; summary mode keeps the same aggregate shape with fewer
 * retained flame samples.
 *
 * "tracked allocations" intentionally means allocations surfaced through the
 * CoreSpirit runtime's allocation accounting seam. JavaScript GC allocations
 * are runtime-dependent and are not claimed as exact heap measurements.
 */
export class CoreSpiritProfiler {
  readonly enabled: boolean;
  readonly mode: CoreSpiritProfilerMode;
  private readonly retainSamples: number;
  private readonly nodes = new Map<string,MutableNodeStat>();
  private readonly phases = new Map<CoreSpiritProfilerPhase,MutablePhase>();
  private readonly flame: CoreSpiritProfilerFlameNode[] = [];
  private pendingInstructionStart = 0;
  private pendingInstructionId = '';
  private compileMs = 0;
  private historicalMs = 0;
  private realtimeMs = 0;
  private bars = 0;
  private ticks = 0;
  private instructions = 0;
  private tickStart = 0;
  private tickDurations:number[] = [];
  private trackedAllocations = 0;
  private trackedAllocationBytes = 0;
  private currentRuntimePhase: 'historical'|'realtime' = 'historical';

  constructor(options: CoreSpiritProfilerOptions = {}) {
    this.enabled = options.enabled === true;
    this.mode = options.mode ?? 'summary';
    this.retainSamples = Math.max(32, Math.floor(options.retainSamples ?? 4096));
  }

  reset(): void {
    this.nodes.clear();
    this.phases.clear();
    this.flame.length = 0;
    this.pendingInstructionStart = 0;
    this.pendingInstructionId = '';
    this.compileMs = 0;
    this.historicalMs = 0;
    this.realtimeMs = 0;
    this.bars = 0;
    this.ticks = 0;
    this.instructions = 0;
    this.tickStart = 0;
    this.tickDurations = [];
    this.trackedAllocations = 0;
    this.trackedAllocationBytes = 0;
  }

  measureCompile<T>(fn:()=>T): T {
    if(!this.enabled) return fn();
    const start=nowMs();
    try { return fn(); }
    finally { this.compileMs += nowMs()-start; this.recordPhase('compile',nowMs()-start); }
  }

  beginBar(phase:'historical'|'realtime', instructionCount=0): void {
    if(!this.enabled) return;
    this.currentRuntimePhase=phase;
    this.tickStart=nowMs();
    this.ticks += 1;
    this.bars += 1;
    if(this.mode==='summary') this.instructions += Math.max(0,Math.floor(instructionCount));
  }

  endBar(): void {
    if(!this.enabled || this.tickStart===0) return;
    const elapsed=nowMs()-this.tickStart;
    this.tickDurations.push(elapsed);
    if(this.tickDurations.length>this.retainSamples) this.tickDurations.shift();
    if(this.currentRuntimePhase==='historical') this.historicalMs += elapsed;
    else this.realtimeMs += elapsed;
    this.recordPhase(this.currentRuntimePhase,elapsed);
    this.tickStart=0;
  }

  recordAllocation(count=1, bytes=0): void {
    if(!this.enabled) return;
    this.trackedAllocations += Math.max(0,count);
    this.trackedAllocationBytes += Math.max(0,bytes);
  }

  recordPhase(phase:CoreSpiritProfilerPhase,timeMs:number,calls=1):void {
    if(!this.enabled) return;
    const current=this.phases.get(phase) ?? {timeMs:0,calls:0};
    current.timeMs += Math.max(0,timeMs);
    current.calls += calls;
    this.phases.set(phase,current);
  }

  beforeInstruction(pc:number,instruction:CoreSpiritIrInstruction):void {
    if(!this.enabled || this.mode!=='full') return;
    this.pendingInstructionStart=nowMs();
    this.pendingInstructionId=`i:${pc}`;
    this.instructions += 1;
  }

  afterInstruction(pc:number,instruction:CoreSpiritIrInstruction):void {
    if(!this.enabled || this.mode!=='full') return;
    const elapsed=Math.max(0,nowMs()-this.pendingInstructionStart);
    const id=this.pendingInstructionId || `i:${pc}`;
    const phase=phaseForInstruction(instruction);
    const label=labelForInstruction(instruction,pc);
    const node=this.nodes.get(id) ?? {id,label,phase,calls:0,timeMs:0,trackedAllocations:0,trackedAllocationBytes:0};
    node.calls += 1;
    node.timeMs += elapsed;
    this.nodes.set(id,node);
    this.recordPhase(phase,elapsed);
    if(this.flame.length<this.retainSamples){
      this.flame.push({
        id,
        label,
        startMs:this.relativeNow(),
        durationMs:elapsed,
        depth:phase==='data'?2:phase==='rendering'?2:1,
        calls:1,
      });
    }
  }

  recordInstructionAggregate(pc:number,instruction:CoreSpiritIrInstruction,timeMs:number):void {
    if(!this.enabled || this.mode!=='summary') return;
    const id=`i:${pc}`;
    const phase=phaseForInstruction(instruction);
    const label=labelForInstruction(instruction,pc);
    const node=this.nodes.get(id) ?? {id,label,phase,calls:0,timeMs:0,trackedAllocations:0,trackedAllocationBytes:0};
    node.calls += 1;
    node.timeMs += Math.max(0,timeMs);
    this.nodes.set(id,node);
    this.instructions += 1;
  }

  snapshot(): CoreSpiritProfilerSnapshot {
    const totalExecution=this.historicalMs+this.realtimeMs;
    const phaseEntries:Record<string,{timeMs:number;calls:number;percentage:number}>={};
    for(const [phase,value] of this.phases){
      phaseEntries[phase]={timeMs:value.timeMs,calls:value.calls,percentage:phasePercentage(value.timeMs,totalExecution+this.compileMs)};
    }
    const topNodes=[...this.nodes.values()]
      .sort((a,b)=>b.timeMs-a.timeMs)
      .slice(0,64)
      .map(node=>Object.freeze({
        ...node,
        percentage:phasePercentage(node.timeMs,totalExecution),
      }));
    const avg=this.tickDurations.length ? this.tickDurations.reduce((sum,value)=>sum+value,0)/this.tickDurations.length : 0;
    const min=this.tickDurations.length ? Math.min(...this.tickDurations) : 0;
    const max=this.tickDurations.length ? Math.max(...this.tickDurations) : 0;
    return Object.freeze({
      version:1,
      enabled:this.enabled,
      mode:this.mode,
      compileMs:this.compileMs,
      historicalMs:this.historicalMs,
      realtimeMs:this.realtimeMs,
      bars:this.bars,
      ticks:this.ticks,
      instructions:this.instructions,
      instructionsPerBar:this.bars ? this.instructions/this.bars : 0,
      avgTickMs:avg,
      minTickMs:min,
      maxTickMs:max,
      trackedAllocations:this.trackedAllocations,
      trackedAllocationBytes:this.trackedAllocationBytes,
      trackedAllocationsPerTick:this.ticks ? this.trackedAllocations/this.ticks : 0,
      topNodes:Object.freeze(topNodes),
      flameGraph:Object.freeze(this.flame.slice()),
      phases:Object.freeze(phaseEntries as CoreSpiritProfilerSnapshot['phases']),
      note:'Tracked allocation counts are CoreSpirit accounting events, not exact JavaScript heap/GC allocation counts.',
    });
  }

  hooks(): { beforeInstruction:(pc:number,instruction:CoreSpiritIrInstruction)=>void; afterInstruction:(pc:number,instruction:CoreSpiritIrInstruction)=>void } | undefined {
    if(!this.enabled || this.mode!=='full') return undefined;
    return {
      beforeInstruction:(pc,instruction)=>this.beforeInstruction(pc,instruction),
      afterInstruction:(pc,instruction)=>this.afterInstruction(pc,instruction),
    };
  }

  private relativeNow(): number {
    return this.tickStart ? Math.max(0,nowMs()-this.tickStart) : 0;
  }
}

export function createCoreSpiritProfiler(options: CoreSpiritProfilerOptions = {}): CoreSpiritProfiler {
  return new CoreSpiritProfiler(options);
}
