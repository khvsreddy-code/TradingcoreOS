import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { CoreEventBus, coreEventBus } from '../core/event/eventBus';
import { CoreSpiritObject, CoreSpiritProgram } from './types';
import { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { CoreSpiritCompiler } from './compiler';

export type CoreSpiritRuntimeOptions = {
  symbol?: string; timeframe?: string; sourceId?: string; maxStepsPerBar?: number;
};
export type CoreSpiritRuntimeState = {
  barIndex: number; time: number; locals: Record<string, unknown>; seriesState: Record<string, number[]>;
};
export type CoreSpiritExecutionResult = { outputs: CoreSpiritObject[]; state: CoreSpiritRuntimeState; diagnostics: string[] };

/** Stateful, chronological CoreSpirit executor. No DOM, network or broker APIs are exposed here. */
export class CoreSpiritRuntime {
  private readonly compiler = new CoreSpiritCompiler();
  private readonly options: Required<CoreSpiritRuntimeOptions>;
  private readonly bus: CoreEventBus;
  private state: CoreSpiritRuntimeState = { barIndex: -1, time: 0, locals: {}, seriesState: {} };
  private compiledIr?: CoreSpiritIrProgram;
  private loadedProgramId?: string;
  private history: HistoricalCandle[] = [];
  private crossState: Record<string, { a: number; b: number }> = {};

  constructor(options: CoreSpiritRuntimeOptions = {}, bus: CoreEventBus = coreEventBus) {
    this.options = { symbol: options.symbol || '', timeframe: options.timeframe || 'unknown', sourceId: options.sourceId || 'coreSpirit', maxStepsPerBar: Math.max(100, options.maxStepsPerBar || 10000) };
    this.bus = bus;
  }

  reset(): void { this.state = { barIndex: -1, time: 0, locals: {}, seriesState: {} }; this.history = []; this.crossState = {}; }
  getState(): CoreSpiritRuntimeState { return { ...this.state, locals: { ...this.state.locals }, seriesState: Object.fromEntries(Object.entries(this.state.seriesState).map(([k,v]) => [k,[...v]])) }; }

  loadProgram(program: CoreSpiritProgram): CoreSpiritIrProgram {
    const compiled = this.compiler.compile(program.ast, program.id || this.options.sourceId);
    const errors = compiled.diagnostics.filter(d => d.severity === 'error');
    if (!compiled.ir || errors.length) throw new Error(errors.map(d => d.message).join('; ') || 'CoreSpirit compilation failed');
    this.compiledIr = compiled.ir; this.loadedProgramId = program.id; this.reset();
    return compiled.ir;
  }

  execute(program: CoreSpiritProgram, bars: HistoricalCandle[]): CoreSpiritObject[] {
    this.loadProgram(program);
    return this.executeIr(this.compiledIr!, bars).outputs;
  }

  executeBar(bar: HistoricalCandle): CoreSpiritExecutionResult {
    if (!this.compiledIr) throw new Error('CoreSpirit program is not loaded');
    const outputs: CoreSpiritObject[] = [], diagnostics: string[] = [];
    const normalized = { ...bar };
    const last = this.history[this.history.length - 1];
    const sameBucket = last && Number(last.timestamp) === Number(normalized.timestamp);
    if (sameBucket) this.history[this.history.length - 1] = normalized; else this.history.push(normalized);
    const barIndex = this.history.length - 1;
    this.state.barIndex = barIndex; this.state.time = this.toEpoch(normalized.timestamp); this.state.locals = {};
    try { this.executeBlock(this.compiledIr.entry.instructions, normalized, this.history, barIndex, outputs, diagnostics); }
    catch (error) { diagnostics.push(`bar ${barIndex}: ${error instanceof Error ? error.message : String(error)}`); }
    return { outputs, state: this.getState(), diagnostics };
  }

  executeIr(ir: CoreSpiritIrProgram, bars: HistoricalCandle[]): CoreSpiritExecutionResult {
    const outputs: CoreSpiritObject[] = [], diagnostics: string[] = [];
    this.compiledIr = ir; this.reset();
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]; this.state.barIndex = i; this.state.time = this.toEpoch(bar.timestamp); this.state.locals = {};
      this.history.push(bar);
      try { this.executeBlock(ir.entry.instructions, bar, this.history, i, outputs, diagnostics); }
      catch (error) { diagnostics.push(`bar ${i}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return { outputs, state: this.getState(), diagnostics };
  }

  getLoadedProgramId(): string | undefined { return this.loadedProgramId; }
  getLoadedIr(): CoreSpiritIrProgram | undefined { return this.compiledIr; }

  private executeBlock(instructions: CoreSpiritIrInstruction[], bar: HistoricalCandle, bars: HistoricalCandle[], barIndex: number, outputs: CoreSpiritObject[], diagnostics: string[]): void {
    const values = new Map<string, unknown>(); let pc = 0; let steps = 0;
    while (pc < instructions.length) {
      if (++steps > this.options.maxStepsPerBar) throw new Error('execution step limit exceeded');
      const ins = instructions[pc];
      switch (ins.op) {
        case 'const': values.set(ins.dest, ins.value); pc++; break;
        case 'loadSeries': values.set(ins.dest, this.loadSeries(ins.name, ins.offset, bar, bars, barIndex)); pc++; break;
        case 'move': values.set(ins.dest, this.state.locals[ins.source]); pc++; break;
        case 'setLocal': this.state.locals[ins.name] = values.get(ins.source); pc++; break;
        case 'unary': values.set(ins.dest, this.unary(ins.operator, values.get(ins.operand))); pc++; break;
        case 'binary': values.set(ins.dest, this.binary(ins.operator, values.get(ins.left), values.get(ins.right))); pc++; break;
        case 'call': { const args = ins.args.map(a => values.get(a)); values.set(ins.dest, this.call(ins.dest, ins.name,args,bar,bars,barIndex,ins.seriesArgs||[])); pc++; break; }
        case 'index': {
          const index = Number(values.get(ins.index));
          if (!Number.isInteger(index) || index < 0) throw new Error(`invalid historical index ${String(index)}`);
          values.set(ins.dest, ins.seriesName ? this.loadSeries(ins.seriesName,index,bar,bars,barIndex) : (index > barIndex ? null : values.get(ins.target))); pc++; break;
        }
        case 'jumpIfFalse': pc = this.truthy(values.get(ins.condition)) ? pc + 1 : ins.target; break;
        case 'jump': pc = ins.target; break;
        case 'emit': this.emitIntent(ins.kind, ins.args.slice(1).map(a=>values.get(a)),bar,barIndex,outputs,diagnostics); pc++; break;
      }
    }
  }

  private loadSeries(name:string, offset:number, bar:HistoricalCandle, bars:HistoricalCandle[], barIndex:number):number|null {
    if (!Number.isInteger(offset) || offset < 0) throw new Error(`future indexing is not allowed for ${name}[${offset}]`);
    if (offset > barIndex) return null;
    const source = bars[barIndex-offset]; if (!source) return null;
    const value = name === 'time' ? this.toEpoch(source.timestamp) : Number((source as any)[name]);
    return Number.isFinite(value) ? value : null;
  }

  private call(callKey:string,name:string,args:unknown[],bar:HistoricalCandle,bars:HistoricalCandle[],index:number,seriesArgs:string[]):unknown {
    const series = seriesArgs[0] || 'close'; const length = Math.max(1,Math.floor(Number(args[1] ?? 14)));
    if (name==='nz') { const value=Number(args[0]); return Number.isFinite(value) ? value : Number(args[1] ?? 0); }
    if (name==='max') return Math.max(Number(args[0]), Number(args[1]));
    if (name==='min') return Math.min(Number(args[0]), Number(args[1]));
    if (name==='abs') return Math.abs(Number(args[0]));
    if (name==='sqrt') return Math.sqrt(Number(args[0]));
    if (name==='pow') return Math.pow(Number(args[0]), Number(args[1]));
    if (name==='crossover'||name==='crossunder') {
      const a=Number(args[0]), b=Number(args[1]);
      const previous=this.crossState[callKey];
      this.crossState[callKey]={a,b};
      if(!Number.isFinite(a)||!Number.isFinite(b)||!previous) return false;
      return name==='crossover' ? previous.a <= previous.b && a > b : previous.a >= previous.b && a < b;
    }
    if (name==='sma'||name==='highest'||name==='lowest'||name==='change') {
      const values=this.window(series,length,bars,index);
      if(name==='sma') return values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
      if(name==='highest') return values.length ? Math.max(...values) : null;
      if(name==='lowest') return values.length ? Math.min(...values) : null;
      const current=values[0], previous=this.loadSeries(series,1,bar,bars,index); return current==null||previous==null?null:current-previous;
    }
    if(name==='ema') { const key=`ema:${series}:${length}`, current=Number(args[0]); if(!Number.isFinite(current))return null; const prev=Number(this.state.seriesState[key]?.at(-1)); const alpha=2/(length+1); const value=Number.isFinite(prev)?alpha*current+(1-alpha)*prev:current; this.pushState(key,value); return value; }
    if(name==='rsi') { const key=`rsi:${series}:${length}`, current=Number(args[0]), previous=index>0?Number(this.loadSeries(series,1,bar,bars,index)):NaN; if(!Number.isFinite(current)||!Number.isFinite(previous))return null; const gain=Math.max(0,current-previous),loss=Math.max(0,previous-current),g=`${key}:gain`,l=`${key}:loss`,pg=Number(this.state.seriesState[g]?.at(-1)),pl=Number(this.state.seriesState[l]?.at(-1)); const ag=Number.isFinite(pg)?(pg*(length-1)+gain)/length:gain,al=Number.isFinite(pl)?(pl*(length-1)+loss)/length:loss; this.pushState(g,ag);this.pushState(l,al);return al===0?100:100-100/(1+ag/al); }
    if(name==='atr') { const key=`atr:${length}`, prevClose=index>0?Number(this.loadSeries('close',1,bar,bars,index)):Number(bar.open), h=Number(bar.high),l=Number(bar.low),tr=Math.max(h-l,Math.abs(h-prevClose),Math.abs(l-prevClose)),prev=Number(this.state.seriesState[key]?.at(-1)),value=Number.isFinite(prev)?(prev*(length-1)+tr)/length:tr;this.pushState(key,value);return value; }
    if(name==='vwap') { const pvKey='vwap:pv',volKey='vwap:vol',pv=Number(this.state.seriesState[pvKey]?.at(-1)||0)+((Number(bar.high)+Number(bar.low)+Number(bar.close))/3)*Math.max(0,Number(bar.volume)||0),vol=Number(this.state.seriesState[volKey]?.at(-1)||0)+Math.max(0,Number(bar.volume)||0);this.pushState(pvKey,pv);this.pushState(volKey,vol);return vol?pv/vol:null; }
    return args[0] ?? null;
  }

  private window(name:string,length:number,bars:HistoricalCandle[],index:number):number[] { const out:number[]=[];for(let i=index;i>=Math.max(0,index-length+1);i--){const v=Number(name==='time'?this.toEpoch(bars[i].timestamp):(bars[i] as any)[name]);if(Number.isFinite(v))out.push(v);}return out; }

  private emitIntent(kind:Extract<CoreSpiritIrInstruction,{op:'emit'}>['kind'],args:unknown[],bar:HistoricalCandle,barIndex:number,outputs:CoreSpiritObject[],diagnostics:string[]):void {
    const time=this.toEpoch(bar.timestamp);
    try {
      if(kind==='plot'){const value=Number(args[0]);outputs.push({kind:'series',time,value:Number.isFinite(value)?value:null});}
      else if(kind==='marker'){const price=Number(args[1]??args[0]);if(Number.isFinite(price))outputs.push({kind:'marker',time:Number(args[0])||time,price,metadata:{source:this.options.sourceId,barIndex}});}
      else if(kind==='line'){const a={time:Number(args[0])||time,price:Number(args[1])},b={time:Number(args[2])||time,price:Number(args[3])};if(Number.isFinite(a.price)&&Number.isFinite(b.price))outputs.push({kind:'line',start:a,end:b,style:{source:this.options.sourceId}});}
      else if(kind==='zone'){const left=Number(args[0])||time,right=Number(args[1])||time,top=Number(args[2]),bottom=Number(args[3]);if([left,right,top,bottom].every(Number.isFinite))outputs.push({kind:'zone',left,right,top,bottom,state:'active'});}
      else if(kind==='signal'){const type=String(args[0]??'signal');outputs.push({kind:'signal',time,type,metadata:{source:this.options.sourceId,barIndex}});this.bus.emit('script.signal',{scriptId:this.options.sourceId,time,type,metadata:{barIndex}});}
      else if(kind==='alert')this.bus.emit('script.alert',{scriptId:this.options.sourceId,time,payload:{args,barIndex}});
      else if(kind==='webhook')this.bus.emit('script.webhook',{scriptId:this.options.sourceId,time,endpoint:typeof args[0]==='string'?args[0]:undefined,payload:{args:typeof args[0]==='string'?args.slice(1):args,barIndex}});
    } catch(error) { diagnostics.push(`output ${kind} at bar ${barIndex}: ${error instanceof Error?error.message:String(error)}`); }
  }
  private pushState(key:string,value:number):void { const a=this.state.seriesState[key]||[];a.push(value);if(a.length>512)a.splice(0,a.length-512);this.state.seriesState[key]=a; }
  private unary(operator:string,value:unknown):unknown { if(operator==='!')return !this.truthy(value);if(operator==='+')return Number(value);return -Number(value); }
  private binary(operator:string,left:unknown,right:unknown):unknown { if(['+','-','*','/','%','<','<=','>','>='].includes(operator)&&(left==null||right==null))return null;switch(operator){case'+':return Number(left)+Number(right);case'-':return Number(left)-Number(right);case'*':return Number(left)*Number(right);case'/':return Number(right)===0?null:Number(left)/Number(right);case'%':return Number(left)%Number(right);case'==':return left===right;case'!=':return left!==right;case'<':return Number(left)<Number(right);case'<=':return Number(left)<=Number(right);case'>':return Number(left)>Number(right);case'>=':return Number(left)>=Number(right);case'and':return this.truthy(left)&&this.truthy(right);case'or':return this.truthy(left)||this.truthy(right);default:return null;} }
  private truthy(value:unknown):boolean{return Boolean(value);}
  private toEpoch(timestamp:string):number{const n=Number(timestamp);if(Number.isFinite(n))return n>1e12?Math.floor(n/1000):n;const parsed=Date.parse(timestamp);return Number.isFinite(parsed)?Math.floor(parsed/1000):0;}
}
export const coreSpiritRuntime = new CoreSpiritRuntime();
