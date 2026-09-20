import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { CoreEventBus, coreEventBus } from '../core/event/eventBus';
import { CoreSpiritObject, CoreSpiritProgram, CoreSpiritValue } from './types';
import { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { CoreSpiritCompiler } from './compiler';

export type CoreSpiritRuntimeOptions = {
  symbol?: string; timeframe?: string; sourceId?: string; maxStepsPerBar?: number;
};
export type CoreSpiritRuntimeState = {
  barIndex: number; time: number; locals: Record<string, unknown>; seriesState: Record<string, number[]>; localSeries: Record<string, Array<number | boolean | string | null>>; barState: { index:number; time:number; isFirst:boolean; isLast:boolean; isRealtime:boolean; isConfirmed:boolean };
};
export type CoreSpiritExecutionResult = { outputs: CoreSpiritObject[]; state: CoreSpiritRuntimeState; diagnostics: string[] };

/** Stateful, chronological CoreSpirit executor. No DOM, network or broker APIs are exposed here. */
export class CoreSpiritRuntime {
  private readonly compiler = new CoreSpiritCompiler();
  private readonly options: Required<CoreSpiritRuntimeOptions>;
  private readonly bus: CoreEventBus;
  private state: CoreSpiritRuntimeState = { barIndex: -1, time: 0, locals: {}, seriesState: {}, localSeries: {}, barState: { index:-1, time:0, isFirst:true, isLast:false, isRealtime:false, isConfirmed:true } };
  private compiledIr?: CoreSpiritIrProgram;
  private loadedProgramId?: string;
  private history: HistoricalCandle[] = [];
  private crossState: Record<string, { a: number; b: number }> = {};
  private committedSeriesState: Record<string, number[]> = {};
  private committedLocalSeries: Record<string, Array<number | boolean | string | null>> = {};
  private committedCrossState: Record<string, { a:number; b:number }> = {};
  private currentBarSnapshot?: { seriesState: Record<string, number[]>; localSeries: Record<string, Array<number | boolean | string | null>>; crossState: Record<string, {a:number;b:number}>; historyLength:number };
  private realtime = false;
  private lastBarWasRealtime = false;

  constructor(options: CoreSpiritRuntimeOptions = {}, bus: CoreEventBus = coreEventBus) {
    this.options = { symbol: options.symbol || '', timeframe: options.timeframe || 'unknown', sourceId: options.sourceId || 'coreSpirit', maxStepsPerBar: Math.max(100, options.maxStepsPerBar || 10000) };
    this.bus = bus;
  }

  reset(): void { this.state = { barIndex: -1, time: 0, locals: {}, seriesState: {}, localSeries: {}, barState: { index:-1, time:0, isFirst:true, isLast:false, isRealtime:false, isConfirmed:true } }; this.history = []; this.crossState = {}; this.committedSeriesState = {}; this.committedLocalSeries = {}; this.committedCrossState = {}; this.currentBarSnapshot = undefined; }
  getState(): CoreSpiritRuntimeState { return { ...this.state, locals: { ...this.state.locals }, seriesState: Object.fromEntries(Object.entries(this.state.seriesState).map(([k,v]) => [k,[...v]])), localSeries: Object.fromEntries(Object.entries(this.state.localSeries).map(([k,v]) => [k,[...v]])) }; }

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
    const sameBucket = !!last && this.toEpoch(last.timestamp) === this.toEpoch(normalized.timestamp);

    // A realtime bar may be evaluated many times. Roll back the previous
    // unconfirmed evaluation so stateful functions commit exactly once.
    if (!sameBucket && this.currentBarSnapshot && this.lastBarWasRealtime) this.confirmRealtimeBar();

    if (sameBucket && this.currentBarSnapshot) {
      this.state.seriesState = cloneNumberMap(this.currentBarSnapshot.seriesState);
      this.state.localSeries = cloneValueMap(this.currentBarSnapshot.localSeries);
      this.crossState = cloneCrossMap(this.currentBarSnapshot.crossState);
      this.history[this.history.length - 1] = normalized;
    } else {
      this.currentBarSnapshot = {
        seriesState: cloneNumberMap(this.state.seriesState),
        localSeries: cloneValueMap(this.state.localSeries),
        crossState: cloneCrossMap(this.crossState),
        historyLength: this.history.length,
      };
      this.history.push(normalized);
    }
    const barIndex = this.history.length - 1;
    this.state.barIndex = barIndex;
    this.state.time = this.toEpoch(normalized.timestamp);
    this.state.locals = {};
    this.state.barState = { index:barIndex, time:this.state.time, isFirst:barIndex===0, isLast:false, isRealtime:true, isConfirmed:false };
    this.lastBarWasRealtime = true;
    try { this.executeBlock(this.compiledIr.entry.instructions, normalized, this.history, barIndex, outputs, diagnostics); }
    catch (error) { diagnostics.push(`bar ${barIndex}: ${error instanceof Error ? error.message : String(error)}`); }
    return { outputs, state: this.getState(), diagnostics };
  }

  /** Commit the current realtime bar as historical/confirmed state. */
  confirmRealtimeBar(): void {
    if (this.state.barIndex < 0) return;
    this.state.barState = { ...this.state.barState!, isRealtime:false, isConfirmed:true, isLast:true };
    this.committedSeriesState = cloneNumberMap(this.state.seriesState);
    this.committedLocalSeries = cloneValueMap(this.state.localSeries);
    this.committedCrossState = cloneCrossMap(this.crossState);
    this.currentBarSnapshot = undefined;
    this.lastBarWasRealtime = false;
  }

  executeIr(ir: CoreSpiritIrProgram, bars: HistoricalCandle[]): CoreSpiritExecutionResult {
    const outputs: CoreSpiritObject[] = [], diagnostics: string[] = [];
    this.compiledIr = ir; this.reset();
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i]; this.state.barIndex = i; this.state.time = this.toEpoch(bar.timestamp); this.state.locals = {};
      this.state.barState = { index:i, time:this.state.time, isFirst:i===0, isLast:i===bars.length-1, isRealtime:false, isConfirmed:true };
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
        case 'setLocal': { const value = values.get(ins.source); this.state.locals[ins.name] = value; if (ins.series !== false) this.pushLocalState(ins.name, value as any); pc++; break; }
        case 'unary': values.set(ins.dest, this.unary(ins.operator, values.get(ins.operand))); pc++; break;
        case 'binary': values.set(ins.dest, this.binary(ins.operator, values.get(ins.left), values.get(ins.right))); pc++; break;
        case 'call': { const args = ins.args.map(a => values.get(a)); values.set(ins.dest, this.call(ins.dest, ins.name,args,bar,bars,barIndex,ins.seriesArgs||[])); pc++; break; }
        case 'index': {
          const index = Number(values.get(ins.index));
          if (!Number.isInteger(index) || index < 0) throw new Error(`invalid historical index ${String(index)}`);
          values.set(ins.dest, ins.seriesName ? this.loadIndexedValue(ins.seriesName,index,bar,bars,barIndex) : (index > barIndex ? null : values.get(ins.target))); pc++; break;
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
    if (name==='isNa') return args[0] == null || (typeof args[0] === 'number' && !Number.isFinite(args[0]));
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
      if(name==='sma') return values.length === length ? values.reduce((a,b)=>a+b,0)/values.length : null;
      if(name==='highest') return values.length === length ? Math.max(...values) : null;
      if(name==='lowest') return values.length === length ? Math.min(...values) : null;
      const current=values[0], previous=this.loadSeries(series,length,bar,bars,index); return current==null||previous==null?null:current-previous;
    }
    if(name==='ema') { const key=`ema:${series}:${length}`, current=Number(args[0]); if(!Number.isFinite(current))return null; const historyValues=this.window(series,length,bars,index); if(historyValues.length<length)return null; const prev=Number(this.state.seriesState[key]?.at(-1)); const alpha=2/(length+1); const seed=historyValues.reduce((a,b)=>a+b,0)/length; const value=Number.isFinite(prev)?alpha*current+(1-alpha)*prev:seed; this.pushState(key,value); return value; }
    if(name==='rsi') { const key=`rsi:${series}:${length}`, current=Number(args[0]), previous=index>0?Number(this.loadSeries(series,1,bar,bars,index)):NaN; if(!Number.isFinite(current)||!Number.isFinite(previous)||index<length)return null; const gain=Math.max(0,current-previous),loss=Math.max(0,previous-current),g=`${key}:gain`,l=`${key}:loss`,pg=Number(this.state.seriesState[g]?.at(-1)),pl=Number(this.state.seriesState[l]?.at(-1)); const ag=Number.isFinite(pg)?(pg*(length-1)+gain)/length:this.averageGain(series,length,bars,index),al=Number.isFinite(pl)?(pl*(length-1)+loss)/length:this.averageLoss(series,length,bars,index); this.pushState(g,ag);this.pushState(l,al);return al===0?100:100-100/(1+ag/al); }
    if(name==='atr') { const key=`atr:${length}`, trKey=`atr:tr:${length}`, prevClose=index>0?Number(this.loadSeries('close',1,bar,bars,index)):Number(bar.open), h=Number(bar.high),l=Number(bar.low),tr=Math.max(h-l,Math.abs(h-prevClose),Math.abs(l-prevClose)); this.pushState(trKey,tr); const trHistory=this.state.seriesState[trKey]||[]; if(trHistory.length<length)return null; const prev=Number(this.state.seriesState[key]?.at(-1)); const value=Number.isFinite(prev)?(prev*(length-1)+tr)/length:trHistory.slice(-length).reduce((a,b)=>a+b,0)/length; this.pushState(key,value); return value; }
    if(name==='vwap') { const day=this.sessionDay(bar.timestamp),dayKey='vwap:day',pvKey='vwap:pv',volKey='vwap:vol'; const dayNumber=Number(day.replace(/-/g,'')); const previousDay=this.state.seriesState[dayKey]?.at(-1); if(previousDay!==dayNumber){this.state.seriesState[pvKey]=[];this.state.seriesState[volKey]=[];this.state.seriesState[dayKey]=[];} this.pushState(dayKey,Number(day.replace(/-/g,''))); const pv=Number(this.state.seriesState[pvKey]?.at(-1)||0)+((Number(bar.high)+Number(bar.low)+Number(bar.close))/3)*Math.max(0,Number(bar.volume)||0),vol=Number(this.state.seriesState[volKey]?.at(-1)||0)+Math.max(0,Number(bar.volume)||0);this.pushState(pvKey,pv);this.pushState(volKey,vol);return vol?pv/vol:null; }
    return args[0] ?? null;
  }

  private window(name:string,length:number,bars:HistoricalCandle[],index:number):number[] { const out:number[]=[];for(let i=index;i>=Math.max(0,index-length+1);i--){const v=Number(name==='time'?this.toEpoch(bars[i].timestamp):(bars[i] as any)[name]);if(Number.isFinite(v))out.push(v);}return out; }

  private loadIndexedValue(name:string,index:number,bar:HistoricalCandle,bars:HistoricalCandle[],barIndex:number):number|null|CoreSpiritValue {
    if (!Number.isInteger(index) || index < 0) throw new Error(`future indexing is not allowed for ${name}[${index}]`);
    if (index > barIndex) return null;
    if (['open','high','low','close','volume','time'].includes(name)) return this.loadSeries(name,index,bar,bars,barIndex);
    const values = this.state.localSeries[name] || [];
    const position = values.length - 1 - index;
    return position >= 0 ? values[position] ?? null : null;
  }

  private pushLocalState(key:string,value:CoreSpiritValue):void { const a=this.state.localSeries[key]||[]; a.push(value); if(a.length>512)a.splice(0,a.length-512); this.state.localSeries[key]=a; }
  private sessionDay(timestamp:string):string { const d=new Date(timestamp); return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(d); }
  private averageGain(series:string,length:number,bars:HistoricalCandle[],index:number):number { let total=0; for(let i=index-length+1;i<=index;i++){ if(i<=0)continue; const c=Number((bars[i] as any)[series]),p=Number((bars[i-1] as any)[series]); total+=Math.max(0,c-p); } return total/length; }
  private averageLoss(series:string,length:number,bars:HistoricalCandle[],index:number):number { let total=0; for(let i=index-length+1;i<=index;i++){ if(i<=0)continue; const c=Number((bars[i] as any)[series]),p=Number((bars[i-1] as any)[series]); total+=Math.max(0,p-c); } return total/length; }

  private emitIntent(kind:Extract<CoreSpiritIrInstruction,{op:'emit'}>['kind'],args:unknown[],bar:HistoricalCandle,barIndex:number,outputs:CoreSpiritObject[],diagnostics:string[]):void {
    const time=this.toEpoch(bar.timestamp);
    try {
      if(kind==='plot'){const value=args[0] == null ? null : Number(args[0]);outputs.push({kind:'series',time,value:value !== null && Number.isFinite(value)?value:null});}
      else if(kind==='marker'){const price=Number(args[1]??args[0]);if(Number.isFinite(price))outputs.push({kind:'marker',time:Number(args[0])||time,price,metadata:{source:this.options.sourceId,barIndex}});}
      else if(kind==='line'){const a={time:Number(args[0])||time,price:Number(args[1])},b={time:Number(args[2])||time,price:Number(args[3])};if(Number.isFinite(a.price)&&Number.isFinite(b.price))outputs.push({kind:'line',start:a,end:b,style:{source:this.options.sourceId}});}
      else if(kind==='zone'){const left=Number(args[0])||time,right=Number(args[1])||time,top=Number(args[2]),bottom=Number(args[3]);if([left,right,top,bottom].every(Number.isFinite))outputs.push({kind:'zone',left,right,top,bottom,state:'active'});}
      else if(kind==='signal'){const type=String(args[0]??'signal');outputs.push({kind:'signal',time,type,metadata:{source:this.options.sourceId,barIndex}});this.bus.emit('script.signal',{scriptId:this.options.sourceId,time,type,metadata:{barIndex}});}
      else if(kind==='alert')this.bus.emit('script.alert',{scriptId:this.options.sourceId,time,payload:{args,barIndex}});
      else if(kind==='webhook')this.bus.emit('script.webhook',{scriptId:this.options.sourceId,time,endpoint:typeof args[0]==='string'?args[0]:undefined,payload:{args:typeof args[0]==='string'?args.slice(1):args,barIndex}});
    } catch(error) { diagnostics.push(`output ${kind} at bar ${barIndex}: ${error instanceof Error?error.message:String(error)}`); }
  }
  private pushState(key:string,value:number|string):void { const a=this.state.seriesState[key]||[];a.push(Number(value));if(a.length>512)a.splice(0,a.length-512);this.state.seriesState[key]=a; }
  private unary(operator:string,value:unknown):unknown { if(operator==='!')return !this.truthy(value);if(operator==='+')return Number(value);return -Number(value); }
  private binary(operator:string,left:unknown,right:unknown):unknown { if(['+','-','*','/','%','<','<=','>','>='].includes(operator)&&(left==null||right==null))return null;switch(operator){case'+':return Number(left)+Number(right);case'-':return Number(left)-Number(right);case'*':return Number(left)*Number(right);case'/':return Number(right)===0?null:Number(left)/Number(right);case'%':return Number(left)%Number(right);case'==':return left===right;case'!=':return left!==right;case'<':return Number(left)<Number(right);case'<=':return Number(left)<=Number(right);case'>':return Number(left)>Number(right);case'>=':return Number(left)>=Number(right);case'and':return this.truthy(left)&&this.truthy(right);case'or':return this.truthy(left)||this.truthy(right);default:return null;} }
  private truthy(value:unknown):boolean{return Boolean(value);}
  private toEpoch(timestamp:string):number{const n=Number(timestamp);if(Number.isFinite(n))return n>1e12?Math.floor(n/1000):n;const parsed=Date.parse(timestamp);return Number.isFinite(parsed)?Math.floor(parsed/1000):0;}
}
export const coreSpiritRuntime = new CoreSpiritRuntime();

function cloneNumberMap(input:Record<string,number[]>):Record<string,number[]>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,[...v]])); }
function cloneValueMap<T=any>(input:Record<string,T[]>):Record<string,T[]>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,[...v]])) as Record<string,T[]>; }
function cloneCrossMap(input:Record<string,{a:number;b:number}>):Record<string,{a:number;b:number}>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,{...v}])); }
