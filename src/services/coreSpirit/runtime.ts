import { HistoricalCandle } from '../brokers/BrokerAdapter';
import { CoreEventBus, coreEventBus } from '../core/event/eventBus';
import { CoreSpiritObject, CoreSpiritProgram, CoreSpiritValue } from './types';
import { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { CoreSpiritCompiler } from './compiler';
import { createCoreSpiritExecutionContext } from './executionContext';
import type { CoreSpiritExecutionContext, CoreSpiritExecutionMode, CoreSpiritDataResolver, CoreSpiritTick, CoreSpiritFootprint, CoreSpiritIntrabar, CoreSpiritDataRequest, CoreSpiritDataSnapshot } from './types';
import { sma as kernelSma, highest as kernelHighest, lowest as kernelLowest, emaStep, trueRange, rsiFromAverages } from './indicatorKernel';

export type CoreSpiritRuntimeOptions = {
  symbol?: string; timeframe?: string; sourceId?: string; maxStepsPerBar?: number;
  timezone?: string; stateHistoryLimit?: number; maxOutputsPerBar?: number; maxHistoryBars?: number; executionMode?: CoreSpiritExecutionMode; runId?: string; abortSignal?: AbortSignal; dataResolver?: CoreSpiritDataResolver; executionPolicy?: CoreSpiritExecutionContext['policy'];
};
export type CoreSpiritRuntimeState = {
  barIndex: number; time: number; locals: Record<string, unknown>; seriesState: Record<string, number[]>; localSeries: Record<string, Array<number | boolean | string | null>>; barState: { index:number; time:number; isFirst:boolean; isLast:boolean; isRealtime:boolean; isConfirmed:boolean };
};
export type CoreSpiritExecutionResult = { outputs: CoreSpiritObject[]; state: CoreSpiritRuntimeState; diagnostics: string[] };

/** Stateful, chronological CoreSpirit executor. No DOM, network or broker APIs are exposed here. */
export class CoreSpiritRuntime {
  private readonly dataResolver?: CoreSpiritDataResolver;
  private readonly compiler = new CoreSpiritCompiler();
  private readonly options: { symbol:string; timeframe:string; sourceId:string; maxStepsPerBar:number; timezone:string; stateHistoryLimit:number };
  private readonly bus: CoreEventBus;
  private readonly timezone: string;
  private readonly abortSignal?: AbortSignal;
  private stateHistoryLimit: number;
  private readonly maxOutputsPerBar: number;
  private readonly maxHistoryBars: number;
  private readonly executionContext: CoreSpiritExecutionContext;
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
  private plotOrdinal = 0;
  private indicatorMemo = new Map<string, unknown>();
  private outputCount = 0;
  private dataMemo = new Map<string, unknown>();

  constructor(options: CoreSpiritRuntimeOptions = {}, bus: CoreEventBus = coreEventBus) {
    this.dataResolver = options.dataResolver;
    this.options = { symbol: options.symbol || '', timeframe: options.timeframe || 'unknown', sourceId: options.sourceId || 'coreSpirit', maxStepsPerBar: Math.max(100, options.maxStepsPerBar || 10000), timezone: options.timezone || 'Asia/Kolkata', stateHistoryLimit: Math.max(512, Math.floor(options.stateHistoryLimit || 2048)) };
    this.timezone = this.options.timezone;
    this.abortSignal = options.abortSignal;
    this.stateHistoryLimit = this.options.stateHistoryLimit;
    this.maxOutputsPerBar = Math.max(100, Math.floor(options.maxOutputsPerBar || 10000));
    this.maxHistoryBars = Math.max(2048, Math.floor(options.maxHistoryBars || 60000));
    this.executionContext = createCoreSpiritExecutionContext({ mode: options.executionMode || 'historical', symbol: this.options.symbol, timeframe: this.options.timeframe, timezone: this.timezone, runId: options.runId, policy: options.executionPolicy });
    this.bus = bus;
  }

  reset(): void { this.state = { barIndex: -1, time: 0, locals: {}, seriesState: {}, localSeries: {}, barState: { index:-1, time:0, isFirst:true, isLast:false, isRealtime:false, isConfirmed:true } }; this.history = []; this.crossState = {}; this.committedSeriesState = {}; this.committedLocalSeries = {}; this.committedCrossState = {}; this.currentBarSnapshot = undefined; this.plotOrdinal = 0; this.indicatorMemo.clear(); this.dataMemo.clear(); this.outputCount = 0; }
  getState(): CoreSpiritRuntimeState { return { ...this.state, locals: { ...this.state.locals }, seriesState: Object.fromEntries(Object.entries(this.state.seriesState).map(([k,v]) => [k,[...v]])), localSeries: Object.fromEntries(Object.entries(this.state.localSeries).map(([k,v]) => [k,[...v]])) }; }

  loadProgram(program: CoreSpiritProgram): CoreSpiritIrProgram {
    const compiled = this.compiler.compile(program.ast, program.id || this.options.sourceId);
    const errors = compiled.diagnostics.filter(d => d.severity === 'error');
    if (!compiled.ir || errors.length) throw new Error(errors.map(d => d.message).join('; ') || 'CoreSpirit compilation failed');
    this.compiledIr = compiled.ir; this.loadedProgramId = program.id;
    // State retention must always cover the program's declared lookback plus a safety margin.
    if (compiled.ir.maxLookback + 32 > this.stateHistoryLimit) this.stateHistoryLimit = Math.min(this.maxHistoryBars, compiled.ir.maxLookback + 32);
    this.reset();
    return compiled.ir;
  }

  execute(program: CoreSpiritProgram, bars: HistoricalCandle[]): CoreSpiritObject[] {
    this.loadProgram(program);
    return this.executeIr(this.compiledIr!, bars).outputs;
  }

  executeBar(bar: HistoricalCandle): CoreSpiritExecutionResult {
    this.throwIfAborted();
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
      if (this.history.length > this.maxHistoryBars) this.history.splice(0, this.history.length - this.maxHistoryBars);
    }
    const barIndex = this.history.length - 1;
    this.state.barIndex = barIndex;
    this.state.time = this.toEpoch(normalized.timestamp);
    this.state.locals = {};
    this.plotOrdinal = 0;
    this.indicatorMemo.clear();
    this.outputCount = 0;
    this.validateBar(normalized);
    this.state.barState = { index:barIndex, time:this.state.time, isFirst:barIndex===0, isLast:false, isRealtime:true, isConfirmed:false };
    this.lastBarWasRealtime = true;
    try { this.executeBlock(this.compiledIr.entry.instructions, normalized, this.history, barIndex, outputs, diagnostics); }
    catch (error) { diagnostics.push(`bar ${barIndex}: ${error instanceof Error ? error.message : String(error)}`); }
    return { outputs, state: this.getState(), diagnostics };
  }

  /** Execute a host-supplied tick against the current realtime bar. The VM remains socket-free. */
  executeTick(tick: CoreSpiritTick, baseBar: HistoricalCandle, historicalTick = false): CoreSpiritExecutionResult {
    const price = Number(tick.price);
    if (!Number.isFinite(price)) throw new Error('invalid realtime tick price');
    const bar: HistoricalCandle = {
      timestamp: new Date(Number(tick.timestamp)).toISOString(),
      open: Number(baseBar.open),
      high: Math.max(Number(baseBar.high), price),
      low: Math.min(Number(baseBar.low), price),
      close: price,
      volume: Math.max(0, Number(baseBar.volume || 0) + Number(tick.volume || 0)),
    };
    const result = this.executeBar(bar);
    this.state.barState = { ...this.state.barState, isRealtime: !historicalTick, isConfirmed: historicalTick };
    return result;
  }

  /**
   * Execute a sequence of host-supplied historical ticks against one bar.
   * This is deliberately separate from realtime sockets: replay/backtest hosts
   * can feed exact tick sequences through the same VM semantics.
   */
  executeHistoricalTicks(ticks: CoreSpiritTick[], baseBar: HistoricalCandle): CoreSpiritExecutionResult[] {
    const results: CoreSpiritExecutionResult[] = [];
    let workingBar = { ...baseBar };
    for (const tick of ticks) {
      this.throwIfAborted();
      results.push(this.executeTick(tick, workingBar, true));
      const price=Number(tick.price);
      workingBar={
        ...workingBar,
        timestamp:new Date(Number(tick.timestamp)).toISOString(),
        high:Math.max(Number(workingBar.high),price),
        low:Math.min(Number(workingBar.low),price),
        close:price,
        volume:Math.max(0,Number(workingBar.volume||0)+Number(tick.volume||0)),
      };
    }
    return results;
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
      this.throwIfAborted();
      this.plotOrdinal = 0;
      this.indicatorMemo.clear();
      this.outputCount = 0;
      const bar = bars[i];
      this.validateBar(bar); this.state.barIndex = i; this.state.time = this.toEpoch(bar.timestamp); this.state.locals = {};
      this.state.barState = { index:i, time:this.state.time, isFirst:i===0, isLast:i===bars.length-1, isRealtime:false, isConfirmed:true };
      this.history.push(bar);
      if (this.history.length > this.maxHistoryBars) this.history.splice(0, this.history.length - this.maxHistoryBars);
      try { this.executeBlock(ir.entry.instructions, bar, this.history, i, outputs, diagnostics); }
      catch (error) { diagnostics.push(`bar ${i}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    return { outputs, state: this.getState(), diagnostics };
  }

  getExecutionContext(): CoreSpiritExecutionContext { return { ...this.executionContext }; }
  getLoadedProgramId(): string | undefined { return this.loadedProgramId; }
  getLoadedIr(): CoreSpiritIrProgram | undefined { return this.compiledIr; }
  loadIr(ir: CoreSpiritIrProgram): void {
    this.compiledIr = ir;
    this.loadedProgramId = ir.sourceId;
    this.stateHistoryLimit = Math.min(this.maxHistoryBars, Math.max(this.stateHistoryLimit, ir.maxLookback + 32));
  }

  exportCheckpoint() {
    return {
      state: this.getState(),
      history: (this as any).history.map((x:any)=>({ ...x })),
      crossState: cloneCrossMap((this as any).crossState),
      committedSeriesState: cloneNumberMap((this as any).committedSeriesState),
      committedLocalSeries: cloneValueMap((this as any).committedLocalSeries),
      committedCrossState: cloneCrossMap((this as any).committedCrossState),
    };
  }

  restoreCheckpoint(checkpoint: { state: CoreSpiritRuntimeState; history:any[]; crossState:Record<string,{a:number;b:number}>; committedSeriesState:Record<string,number[]>; committedLocalSeries:Record<string,Array<number|boolean|string|null>>; committedCrossState:Record<string,{a:number;b:number}> }): boolean {
    try {
      this.state = { ...checkpoint.state, locals:{...checkpoint.state.locals}, seriesState:cloneNumberMap(checkpoint.state.seriesState), localSeries:cloneValueMap(checkpoint.state.localSeries) };
      (this as any).history = checkpoint.history.map((x:any)=>({ ...x })).slice(-this.maxHistoryBars);
      (this as any).crossState = cloneCrossMap(checkpoint.crossState);
      (this as any).committedSeriesState = cloneNumberMap(checkpoint.committedSeriesState);
      (this as any).committedLocalSeries = cloneValueMap(checkpoint.committedLocalSeries);
      (this as any).committedCrossState = cloneCrossMap(checkpoint.committedCrossState);
      return true;
    } catch { return false; }
  }

  private executeBlock(instructions: CoreSpiritIrInstruction[], bar: HistoricalCandle, bars: HistoricalCandle[], barIndex: number, outputs: CoreSpiritObject[], diagnostics: string[]): void {
    const values = new Map<string, unknown>(); let pc = 0; let steps = 0;
    while (pc < instructions.length) {
      if (++steps > this.options.maxStepsPerBar) throw new Error('execution step limit exceeded');
      if ((steps & 1023) === 0) this.throwIfAborted();
      const ins = instructions[pc];
      switch (ins.op) {
        case 'const': values.set(ins.dest, ins.value); pc++; break;
        case 'loadSeries': values.set(ins.dest, this.loadSeries(ins.name, ins.offset, bar, bars, barIndex)); pc++; break;
        case 'move': values.set(ins.dest, this.state.locals[ins.source]); pc++; break;
        case 'setLocal': { const value = values.get(ins.source); this.state.locals[ins.name] = value; if (ins.series !== false) this.pushLocalState(ins.name, value as any); pc++; break; }
        case 'unary': values.set(ins.dest, this.unary(ins.operator, values.get(ins.operand))); pc++; break;
        case 'binary': values.set(ins.dest, this.binary(ins.operator, values.get(ins.left), values.get(ins.right))); pc++; break;
        case 'call': { const args = ins.args.map(a => values.get(a)); values.set(ins.dest, this.call(ins.callId || ins.dest, ins.name,args,bar,bars,barIndex,ins.seriesArgs||[])); pc++; break; }
        case 'index': {
          const index = Number(values.get(ins.index));
          if (!Number.isInteger(index) || index < 0) throw new Error(`invalid historical index ${String(index)}`);
          values.set(ins.dest, ins.seriesName ? this.loadIndexedValue(ins.seriesName,index,bar,bars,barIndex) : (index > barIndex ? null : values.get(ins.target))); pc++; break;
        }
        case 'jumpIfFalse': pc = this.truthy(values.get(ins.condition)) ? pc + 1 : ins.target; break;
        case 'jump': pc = ins.target; break;
        case 'emit': this.emitIntent(ins.kind, ins.args.slice(1).map(a=>values.get(a)),bar,barIndex,outputs,diagnostics,ins.outputId); pc++; break;
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
    const memoKey = `${name}|${series}|${length}|${index}|${args.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(',')}`;
    if (this.indicatorMemo.has(memoKey)) return this.indicatorMemo.get(memoKey);
    const finish = (value: unknown) => { this.indicatorMemo.set(memoKey, value); return value; };
    if (name==='nz') { const value=Number(args[0]); return finish(Number.isFinite(value) ? value : Number(args[1] ?? 0)); }
    if (name==='isNa') return finish(args[0] == null || (typeof args[0] === 'number' && !Number.isFinite(args[0])));
    if (name==='max') return finish(Math.max(Number(args[0]), Number(args[1])));
    if (name==='min') return finish(Math.min(Number(args[0]), Number(args[1])));
    if (name==='abs') return finish(Math.abs(Number(args[0])));
    if (name==='sqrt') return finish(Math.sqrt(Number(args[0])));
    if (name==='pow') return finish(Math.pow(Number(args[0]), Number(args[1])));
    if (name==='crossover'||name==='crossunder') {
      const a=Number(args[0]), b=Number(args[1]);
      const previous=this.crossState[callKey];
      this.crossState[callKey]={a,b};
      if(!Number.isFinite(a)||!Number.isFinite(b)||!previous) return finish(false);
      return finish(name==='crossover' ? previous.a <= previous.b && a > b : previous.a >= previous.b && a < b);
    }
    if (name==='sma'||name==='highest'||name==='lowest'||name==='change') {
      const values=this.window(series,length,bars,index);
      if(name==='sma') return finish(kernelSma(values, length));
      if(name==='highest') return finish(kernelHighest(values, length));
      if(name==='lowest') return finish(kernelLowest(values, length));
      const current=values[0], previous=this.loadSeries(series,length,bar,bars,index); return finish(current==null||previous==null?null:current-previous);
    }
    if(name==='ema') { const key=`ema:${series}:${length}`, current=Number(args[0]); if(args[0] == null || !Number.isFinite(current))return finish(null); const historyValues=this.window(series,length,bars,index); if(historyValues.length<length)return null; const prevRaw=this.state.seriesState[key]?.at(-1); const prev=prevRaw == null ? null : Number(prevRaw); const value=emaStep(current, Number.isFinite(prev as number) ? prev : null, historyValues, length); if(value == null) return finish(null); this.pushState(key,value); return finish(value); }
    if(name==='rsi') { const key=`rsi:${series}:${length}`, current=Number(args[0]), previous=index>0?Number(this.loadSeries(series,1,bar,bars,index)):NaN; if(args[0] == null || !Number.isFinite(current)||!Number.isFinite(previous)||index<length)return finish(null); const gain=Math.max(0,current-previous),loss=Math.max(0,previous-current),g=`${key}:gain`,l=`${key}:loss`,pg=Number(this.state.seriesState[g]?.at(-1)),pl=Number(this.state.seriesState[l]?.at(-1)); const ag=Number.isFinite(pg)?(pg*(length-1)+gain)/length:this.averageGain(series,length,bars,index),al=Number.isFinite(pl)?(pl*(length-1)+loss)/length:this.averageLoss(series,length,bars,index); this.pushState(g,ag);this.pushState(l,al);return finish(rsiFromAverages(ag,al)); }
    if(name==='atr') { const key=`atr:${length}`, trKey=`atr:tr:${length}`, prevClose=index>0?Number(this.loadSeries('close',1,bar,bars,index)):Number(bar.open), h=Number(bar.high),l=Number(bar.low),tr=Math.max(h-l,Math.abs(h-prevClose),Math.abs(l-prevClose)); this.pushState(trKey,tr); const trHistory=this.state.seriesState[trKey]||[]; if(trHistory.length<length)return null; const prev=Number(this.state.seriesState[key]?.at(-1)); const value=Number.isFinite(prev)?(prev*(length-1)+tr)/length:trHistory.slice(-length).reduce((a,b)=>a+b,0)/length; this.pushState(key,value); return finish(value); }
    if(name==='vwap') { const day=this.sessionDay(bar.timestamp),dayKey='vwap:day',pvKey='vwap:pv',volKey='vwap:vol'; const dayNumber=Number(day.replace(/-/g,'')); const previousDay=this.state.seriesState[dayKey]?.at(-1); if(previousDay!==dayNumber){this.state.seriesState[pvKey]=[];this.state.seriesState[volKey]=[];this.state.seriesState[dayKey]=[];} this.pushState(dayKey,Number(day.replace(/-/g,''))); const pv=Number(this.state.seriesState[pvKey]?.at(-1)||0)+((Number(bar.high)+Number(bar.low)+Number(bar.close))/3)*Math.max(0,Number(bar.volume)||0),vol=Number(this.state.seriesState[volKey]?.at(-1)||0)+Math.max(0,Number(bar.volume)||0);this.pushState(pvKey,pv);this.pushState(volKey,vol);return finish(vol?pv/vol:null); }
    if(name==='request') {
      const symbol=String(args[0] ?? this.executionContext.symbol), timeframe=String(args[1] ?? this.executionContext.timeframe), field=String(args[2] ?? 'close') as any, offset=Math.max(0,Math.floor(Number(args[3] ?? 0)));
      const resolver=this.dataResolver?.request;
      if(!resolver) return finish(null);
      const key=`request:${index}:${symbol}:${timeframe}:${field}:${offset}`;
      if (this.dataMemo.has(key)) return finish(this.dataMemo.get(key));
      const value=resolver({symbol,timeframe,field,offset});
      // Synchronous resolvers are intentionally supported in the VM; async hosts must prefetch into a snapshot.
      if(value && typeof (value as any).then==='function') return finish(null);
      const resolved=(value as any)?.value ?? null; this.dataMemo.set(key,resolved); return finish(resolved);
    }
    if(name==='lowerTf') {
      const timeframe=String(args[0] ?? ''), field=String(args[1] ?? 'close') as any;
      const resolver=this.dataResolver?.lowerTimeframe; if(resolver){
        const key=`ltf:${index}:${timeframe}:${field}`; if(this.dataMemo.has(key)) return finish(this.dataMemo.get(key));
        const values=resolver(timeframe,field); if(values && typeof (values as any).then==='function') return finish(null);
        const latest=(values as number[]).length ? Number((values as number[]).at(-1)) : null; this.dataMemo.set(key,latest); return finish(latest);
      }
      const intrabarsResolver=this.dataResolver?.intrabars; if(!intrabarsResolver) return finish(null);
      const rows=intrabarsResolver(timeframe); if(rows && typeof (rows as any).then==='function') return finish(null);
      const resolvedRows=rows as CoreSpiritIntrabar[]; const latest=resolvedRows?.at(-1) as any; return finish(latest?.[field] ?? null);
    }
    if(name==='depthImbalance') return finish(this.dataResolver?.depthImbalance?.() ?? null);
    const footprint=this.dataResolver?.footprint?.();
    if(name==='footprintDelta') return finish(footprint?.delta ?? null);
    if(name==='footprintBuy') return finish(footprint?.buyVolume ?? null);
    if(name==='footprintSell') return finish(footprint?.sellVolume ?? null);
    if(name==='footprintPoc') return finish(footprint?.poc ?? null);
    if(name==='footprintVah') return finish(footprint?.vah ?? null);
    if(name==='footprintVal') return finish(footprint?.val ?? null);
    if(name==='footprintRows') return finish(footprint?.rows?.length ?? 0);
    return finish(args[0] ?? null);
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

  private pushLocalState(key:string,value:CoreSpiritValue):void { const a=this.state.localSeries[key]||[]; a.push(value); if(a.length>this.stateHistoryLimit)a.splice(0,a.length-this.stateHistoryLimit); this.state.localSeries[key]=a; }
  private sessionDay(timestamp:string):string { const d=new Date(timestamp); return new Intl.DateTimeFormat('en-CA',{timeZone:this.timezone}).format(d); }
  private averageGain(series:string,length:number,bars:HistoricalCandle[],index:number):number { let total=0; for(let i=index-length+1;i<=index;i++){ if(i<=0)continue; const c=Number((bars[i] as any)[series]),p=Number((bars[i-1] as any)[series]); total+=Math.max(0,c-p); } return total/length; }
  private averageLoss(series:string,length:number,bars:HistoricalCandle[],index:number):number { let total=0; for(let i=index-length+1;i<=index;i++){ if(i<=0)continue; const c=Number((bars[i] as any)[series]),p=Number((bars[i-1] as any)[series]); total+=Math.max(0,p-c); } return total/length; }

  private emitIntent(kind:Extract<CoreSpiritIrInstruction,{op:'emit'}>['kind'],args:unknown[],bar:HistoricalCandle,barIndex:number,outputs:CoreSpiritObject[],diagnostics:string[],outputId?:string):void {
    const time=this.toEpoch(bar.timestamp);
    if (++this.outputCount > this.maxOutputsPerBar) throw new Error(`output limit exceeded (${this.maxOutputsPerBar})`);
    const finite = (v:unknown) => Number.isFinite(Number(v));
    const num = (v:unknown) => Number(v);
    const color = (v:unknown, fallback:string) => typeof v === 'string' && v ? v : fallback;
    try {
      if(kind==='plot'){
        const value=args[0] == null ? null : Number(args[0]);
        const seriesId=outputId ? `${this.options.sourceId}:${outputId}` : `${this.options.sourceId}:plot:${this.plotOrdinal++}`;
        const style={color:typeof args[1]==='string'?args[1]:undefined,lineWidth:Number.isFinite(Number(args[2]))?Math.max(1,Math.min(5,Number(args[2]))):2,lineStyle:Number.isFinite(Number(args[3]))?Number(args[3]):0,title:typeof args[4]==='string'?args[4]:undefined,priceLineVisible:false,lastValueVisible:true};
        outputs.push({kind:'series',time,value:value !== null && Number.isFinite(value)?value:null,seriesId,style});
      }
      else if(kind==='marker'){
        const price=Number(args[1]??args[0]);
        if(Number.isFinite(price)) outputs.push({kind:'marker',id:`${this.options.sourceId}:marker:${barIndex}`,time:Number(args[0])||time,price,metadata:{source:this.options.sourceId,barIndex}});
      }
      else if(kind==='label'||kind==='labelAt'){
        const isAt=kind==='labelAt'; const price=Number(isAt?args[0]:(String(args[1]??'above')==='below'?bar.low:bar.high));
        const text=String(isAt?args[1]:args[0]??''); const position=String(isAt?args[2]??'price':args[1]??'above') as any;
        const background=String(isAt?args[3]??'#2563eb':args[2]??'#2563eb'); const textColor=String(isAt?args[4]??'#ffffff':args[3]??'#ffffff');
        const fontSize=Number(isAt?args[5]??12:args[4]??12); const shape=String(isAt?args[6]??'pill':args[5]??'pill') as any;
        const fontWeight=String(isAt?args[7]??'600':args[6]??'600'); const fontStyle=String(isAt?args[8]??'normal':args[7]??'normal') as any;
        if(Number.isFinite(price)&&text) outputs.push({kind:'label',id:`${this.options.sourceId}:label:${barIndex}:${outputId||text}`,time,price,text,position,style:{background,color:textColor,fontSize,shape,fontWeight,fontStyle},metadata:{source:this.options.sourceId,barIndex}});
      }
      else if(kind==='line'){
        const a={time:num(args[0])||time,price:num(args[1])},b={time:num(args[2])||time,price:num(args[3])};
        if(Number.isFinite(a.price)&&Number.isFinite(b.price)) outputs.push({kind:'line',id:`${this.options.sourceId}:line:${outputId||barIndex}`,start:a,end:b,style:{source:this.options.sourceId,color:color(args[4],'#f59e0b'),lineWidth:Math.max(1,Math.min(6,num(args[5])||1))}});
      }
      else if(kind==='zone'){
        const left=num(args[0])||time,right=num(args[1])||time,top=num(args[2]),bottom=num(args[3]);
        if([left,right,top,bottom].every(Number.isFinite)) outputs.push({kind:'zone',id:`${this.options.sourceId}:zone:${outputId||barIndex}`,left,right,top,bottom,state:'active',style:{color:color(args[4],'#38bdf8'),fillColor:color(args[5],color(args[4],'#38bdf8')),fillOpacity:Number.isFinite(Number(args[6]))?Math.max(0,Math.min(1,num(args[6]))):0.12,pattern:(typeof args[7]==='string'?args[7]:'solid') as any}});
      }
      else if(kind==='box'){
        const left=num(args[0])||time,right=num(args[1])||time,top=num(args[2]),bottom=num(args[3]);
        if([left,right,top,bottom].every(Number.isFinite)) outputs.push({kind:'box',id:`${this.options.sourceId}:box:${outputId||barIndex}`,left,right,top,bottom,style:{fillColor:color(args[4],'#2563eb'),color:color(args[5],'#2563eb'),fillOpacity:Number.isFinite(Number(args[6]))?Math.max(0,Math.min(1,num(args[6]))):0.16,pattern:(typeof args[7]==='string'?args[7]:'solid') as any}});
      }
      else if(kind==='band'||kind==='fill'||kind==='gradient'){
        const top=num(args[0]),bottom=num(args[1]);
        if(finite(top)&&finite(bottom)){
          const c1=color(args[2],kind==='gradient'?'#38bdf8':'#2563eb');
          const c2=kind==='gradient'?color(args[3],'#8b5cf6'):c1;
          const opacity=Number.isFinite(Number(kind==='gradient'?args[4]:args[3]))?Math.max(0,Math.min(1,num(kind==='gradient'?args[4]:args[3]))):0.16;
          outputs.push({kind:'band',id:`${this.options.sourceId}:band:${outputId||barIndex}`,time,top,bottom,style:{fillColor:c1,fillColor2:c2,color:c1,fillOpacity:opacity,opacity}});
        }
      }
      else if(kind==='arrow'){
        const a={time:num(args[0])||time,price:num(args[1])},b={time:num(args[2])||time,price:num(args[3])};
        if([a.time,a.price,b.time,b.price].every(Number.isFinite)) outputs.push({kind:'arrow',id:`${this.options.sourceId}:arrow:${outputId||barIndex}`,start:a,end:b,style:{color:color(args[4],'#f59e0b'),lineWidth:Number.isFinite(Number(args[5]))?Math.max(1,Math.min(8,num(args[5]))):2}});
      }
      else if(kind==='shape'||kind==='heatmap'){
        const price=num(args[0]),shape=kind==='heatmap'?'square':String(args[1]||'circle') as any;
        if(finite(price)){ const intensity=kind==='heatmap'?Math.max(0,Math.min(1,Math.abs(num(args[1])))):1; outputs.push({kind:'shape',id:`${this.options.sourceId}:shape:${outputId||barIndex}`,time,price,shape,style:{color:color(kind==='heatmap'?args[2]:args[2],'#f59e0b'),fillColor:color(args[2],'#f59e0b'),opacity:kind==='heatmap'?Math.max(.08,intensity):1,size:Number.isFinite(Number(kind==='heatmap'?args[3]:args[3]))?Math.max(4,Math.min(40,num(args[3])||10)):10,text:typeof args[4]==='string'?args[4]:undefined}}); }
      }
      else if(kind==='polyline'){
        const points: {time:number;price:number}[]=[]; let i=0;
        while(i+1<args.length && typeof args[i] !== 'string' && Number.isFinite(num(args[i])) && Number.isFinite(num(args[i+1])) && points.length<8){ points.push({time:num(args[i]),price:num(args[i+1])}); i+=2; }
        const stroke=color(args[i],'#38bdf8'); const width=Number.isFinite(num(args[i+1]))?Math.max(1,Math.min(8,num(args[i+1]))):2;
        if(points.length>=2) outputs.push({kind:'polyline',id:`${this.options.sourceId}:polyline:${outputId||barIndex}`,points,style:{color:stroke,lineWidth:width,pattern:(typeof args[i+2]==='string'?args[i+2]:'solid') as any}});
      }
      else if(kind==='hline'){
        const price=num(args[0]); if(Number.isFinite(price)) outputs.push({kind:'hline',id:`${this.options.sourceId}:hline:${outputId||barIndex}`,price,style:{color:color(args[1],'#64748b'),lineWidth:Number.isFinite(num(args[2]))?Math.max(1,Math.min(6,num(args[2]))):1,lineStyle:Number.isFinite(num(args[3]))?num(args[3]):0}});
      }
      else if(kind==='bg' || kind==='barcolor'){
        const c=color(args[0],'#2563eb'), opacity=Number.isFinite(num(args[1]))?Math.max(0,Math.min(1,num(args[1]))):0.12;
        outputs.push({kind:kind==='bg'?'background':'barcolor',id:`${this.options.sourceId}:${kind}:${barIndex}`,time,color:c,opacity,metadata:{barIndex,source:this.options.sourceId}} as any);
      }
      else if(kind==='table'){
        const position=String(args[0]||'topRight') as any, row=Math.max(0,Math.floor(num(args[1]))), column=Math.max(0,Math.floor(num(args[2]))), text=String(args[3]??'');
        outputs.push({kind:'table',id:`${this.options.sourceId}:table:${position}:${row}:${column}:${outputId||barIndex}`,position,row,column,text,style:{background:color(args[4],'rgba(15,23,42,.88)'),color:color(args[5],'#fff'),fontSize:Number.isFinite(num(args[6]))?Math.max(8,Math.min(32,num(args[6]))):12},metadata:{source:this.options.sourceId}});
      }
      else if(kind==='signal'){
        const type=String(args[0]??'signal'); outputs.push({kind:'signal',time,type,metadata:{source:this.options.sourceId,barIndex}});
        this.bus.emit('script.signal',{scriptId:this.options.sourceId,time,type,metadata:{barIndex}});
      }
      else if(kind==='entry') {
        const condition=Boolean(args[0]); if(!condition) return;
        const side=String(args[1]??'long').toLowerCase();
        const normalizedSide=(side==='short'?'short':side==='flat'?'flat':'long') as 'long'|'short'|'flat';
        const confidence=Math.max(0,Math.min(1,Number(args[2]??0.5)));
        const stop=Number.isFinite(Number(args[3]))?Number(args[3]):null;
        const target=Number.isFinite(Number(args[4]))?Number(args[4]):null;
        const tag=typeof args[5]==='string'?args[5]:undefined;
        const id=`${this.options.sourceId}:entry:${barIndex}:${tag||normalizedSide}`;
        const intent={kind:'orderIntent' as const,id,time,side:normalizedSide,confidence,stop,target,tag,metadata:{source:this.options.sourceId,barIndex,mode:this.executionContext.mode}};
        outputs.push(intent);
        this.bus.emit('execution.intent',{source:this.options.sourceId,payload:intent});
      }
      else if(kind==='exit') {
        const condition=Boolean(args[0]); if(!condition) return;
        const tag=typeof args[1]==='string'?args[1]:undefined;
        const intent={kind:'orderIntent' as const,id:`${this.options.sourceId}:exit:${barIndex}:${tag||'exit'}`,time,side:'flat' as const,confidence:1,stop:null,target:null,tag,metadata:{source:this.options.sourceId,barIndex,exit:true,mode:this.executionContext.mode}};
        outputs.push(intent);
        this.bus.emit('execution.intent',{source:this.options.sourceId,payload:intent});
      }
      else if(kind==='alert') this.bus.emit('script.alert',{scriptId:this.options.sourceId,time,payload:{args,barIndex}});
      else if(kind==='webhook') this.bus.emit('script.webhook',{scriptId:this.options.sourceId,time,endpoint:typeof args[0]==='string'?args[0]:undefined,payload:{args:typeof args[0]==='string'?args.slice(1):args,barIndex}});
    } catch(error) { diagnostics.push(`output ${kind} at bar ${barIndex}: ${error instanceof Error?error.message:String(error)}`); }
  }
  private pushState(key:string,value:number|string):void { const a=this.state.seriesState[key]||[];a.push(Number(value));if(a.length>this.stateHistoryLimit)a.splice(0,a.length-this.stateHistoryLimit);this.state.seriesState[key]=a; }
  private unary(operator:string,value:unknown):unknown { if(operator==='!')return !this.truthy(value);if(operator==='+')return Number(value);return -Number(value); }
  private binary(operator:string,left:unknown,right:unknown):unknown { if(['+','-','*','/','%','<','<=','>','>='].includes(operator)&&(left==null||right==null))return null;switch(operator){case'+':return Number(left)+Number(right);case'-':return Number(left)-Number(right);case'*':return Number(left)*Number(right);case'/':return Number(right)===0?null:Number(left)/Number(right);case'%':return Number(left)%Number(right);case'==':return left===right;case'!=':return left!==right;case'<':return Number(left)<Number(right);case'<=':return Number(left)<=Number(right);case'>':return Number(left)>Number(right);case'>=':return Number(left)>=Number(right);case'and':return this.truthy(left)&&this.truthy(right);case'or':return this.truthy(left)||this.truthy(right);default:return null;} }
  private truthy(value:unknown):boolean{return Boolean(value);}
  private validateBar(bar: HistoricalCandle): void {
    const values = [bar.open, bar.high, bar.low, bar.close, bar.volume];
    if (!values.every(v => Number.isFinite(Number(v)))) throw new Error('CoreSpirit received a non-finite OHLCV bar');
    if (Number(bar.high) < Number(bar.low)) throw new Error('CoreSpirit received an invalid bar: high < low');
    const t = this.toEpoch(bar.timestamp);
    if (!Number.isFinite(t) || t <= 0) throw new Error('CoreSpirit received an invalid bar timestamp');
    const last = this.history[this.history.length - 1];
    if (last && t < this.toEpoch(last.timestamp)) throw new Error('CoreSpirit bars must be chronological');
  }

  private throwIfAborted(): void { if (this.abortSignal?.aborted) throw new DOMException('CoreSpirit execution aborted', 'AbortError'); }
  private toEpoch(timestamp:string):number{const n=Number(timestamp);if(Number.isFinite(n))return n>1e12?Math.floor(n/1000):n;const parsed=Date.parse(timestamp);return Number.isFinite(parsed)?Math.floor(parsed/1000):0;}
}
export const coreSpiritRuntime = new CoreSpiritRuntime();

function cloneNumberMap(input:Record<string,number[]>):Record<string,number[]>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,[...v]])); }
function cloneValueMap<T=any>(input:Record<string,T[]>):Record<string,T[]>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,[...v]])) as Record<string,T[]>; }
function cloneCrossMap(input:Record<string,{a:number;b:number}>):Record<string,{a:number;b:number}>{ return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,{...v}])); }
