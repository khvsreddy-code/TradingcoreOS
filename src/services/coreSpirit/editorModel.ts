import { CoreSpiritIncrementalCompiler } from './incrementalCompiler';
import { CoreSpiritIncrementalAst } from './incrementalAst';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpiritRepaintSafety, type CoreSpiritRepaintSafetyReport } from './repaintSafety';
import type { CoreSpiritProfilerSnapshot } from './profiler';
import type { CoreSpiritExecutionPlanVisualization } from './executionPlanVisualizer';
import { getCoreSpiritEditorSnapshot, getCoreSpiritEditorPreviewSnapshot, getCoreSpiritHover, getCoreSpiritCompletionContext, getCoreSpiritDefinitionAt, getCoreSpiritCodeActions, type CoreSpiritCompletion, type CoreSpiritEditorDiagnostic, type CoreSpiritSemanticToken, type CoreSpiritDefinition, type CoreSpiritCodeAction, type CoreSpiritFoldingRange } from './languageService';
import type { CoreSpiritCompileResult } from './compiler';

export type CoreSpiritSymbol = {
  name: string;
  kind: 'variable' | 'builtin';
  line: number;
  column: number;
};

export type CoreSpiritEditorModelSnapshot = {
  source: string;
  version: number;
  diagnostics: CoreSpiritEditorDiagnostic[];
  completions: CoreSpiritCompletion[];
  tokens: CoreSpiritSemanticToken[];
  symbols: CoreSpiritSymbol[];
  definitions: CoreSpiritDefinition[];
  folds: CoreSpiritFoldingRange[];
  formatted: string;
  repaintSafety: CoreSpiritRepaintSafetyReport;
  profiler?: CoreSpiritProfilerSnapshot;
  executionPlanVisualization?: CoreSpiritExecutionPlanVisualization;
};

export type CoreSpiritEditorEdit = { start: number; end: number; text: string };

/** Incremental editor model. It deliberately owns no DOM so Monaco/CodeMirror/textarea
 * adapters can consume the same language intelligence later. */
export class CoreSpiritEditorModel {
  private source: string;
  private version = 0;
  private snapshot: CoreSpiritEditorModelSnapshot;
  private lastCompileSource = '';
  private lastCompile: ReturnType<CoreSpiritIncrementalCompiler['compile']> | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private profilerSnapshot?: CoreSpiritProfilerSnapshot;
  private readonly incrementalAst = new CoreSpiritIncrementalAst();
  private readonly incrementalCompiler = new CoreSpiritIncrementalCompiler();
  private compiledSymbols:NonNullable<CoreSpiritCompileResult['symbols']>=[];

  constructor(source = '') {
    this.source = source;
    this.snapshot = this.compute('',true);
  }

  getSnapshot() { return this.snapshot; }
  getSource() { return this.source; }
  getVersion() { return this.version; }
  getProfilerSnapshot() { return this.profilerSnapshot; }
  setProfilerSnapshot(snapshot: CoreSpiritProfilerSnapshot | undefined) { this.profilerSnapshot = snapshot; this.snapshot = { ...this.snapshot, profiler:snapshot }; return this.snapshot; }

  updateSource(source: string, completionPrefix = '', options: {deferSemanticAnalysis?:boolean} = {}) {
    if (source === this.source && !completionPrefix) return this.snapshot;
    this.undoStack.push(this.source); if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    const old=this.source; this.source = source;
    this.compiledSymbols=[];
    this.version += 1;
    const change={start:0,end:old.length,text:source};
    if(!options.deferSemanticAnalysis)this.incrementalAst.update(source,change);
    this.snapshot = this.compute(completionPrefix,options.deferSemanticAnalysis===true);
    return this.snapshot;
  }

  /** Accepts only a worker result for the exact current source; never runs compiler work in the UI thread. */
  applyWorkerCompileResult(result: CoreSpiritCompileResult, source=this.source) {
    if(source!==this.source)return this.snapshot;
    this.compiledSymbols=[...(result.symbols??[])];
    this.snapshot = {
      ...this.snapshot,
      executionPlanVisualization:result.ir?.executionPlanVisualization,
      ...(result.ir?.repaintSafety ? {repaintSafety:result.ir.repaintSafety as CoreSpiritRepaintSafetyReport} : {}),
    };
    return this.snapshot;
  }

  applyEdit(edit: CoreSpiritEditorEdit, completionPrefix = '', options:{deferSemanticAnalysis?:boolean} = {}) {
    const start = Math.max(0, Math.min(edit.start, this.source.length));
    const end = Math.max(start, Math.min(edit.end, this.source.length));
    return this.updateSource(this.source.slice(0, start) + edit.text + this.source.slice(end), completionPrefix,options);
  }

  undo() { const previous=this.undoStack.pop(); if(previous===undefined) return this.snapshot; this.redoStack.push(this.source); this.source=previous; this.version+=1; this.lastCompileSource=''; this.snapshot=this.compute('',true); return this.snapshot; }

  redo() { const next=this.redoStack.pop(); if(next===undefined) return this.snapshot; this.undoStack.push(this.source); this.source=next; this.version+=1; this.lastCompileSource=''; this.snapshot=this.compute('',true); return this.snapshot; }

  completionAt(cursor:number) {
    const ctx=getCoreSpiritCompletionContext(this.source,cursor);
    const completions=getCoreSpiritEditorPreviewSnapshot(this.source,ctx.prefix).completions.slice();
    const seen=new Set(completions.map(item=>item.label));
    for(const symbol of this.compiledSymbols){
      if(ctx.prefix&&!symbol.name.toLowerCase().startsWith(ctx.prefix.toLowerCase()))continue;
      if(seen.has(symbol.name))continue;
      completions.push({label:symbol.name,kind:symbol.kind==='type'?'type':'property',detail:symbol.type,insertText:symbol.name});
      seen.add(symbol.name);
    }
    return {...ctx,completions};
  }
  definitionAt(cursor:number) { return getCoreSpiritDefinitionAt(this.source,cursor); }
  codeActions(diagnostic:CoreSpiritEditorDiagnostic): CoreSpiritCodeAction[] { return getCoreSpiritCodeActions(this.source,diagnostic); }

  compile() {
    if (this.lastCompileSource === this.source && this.lastCompile) return this.lastCompile;
    this.lastCompileSource = this.source;
    this.lastCompile = this.incrementalCompiler.compile(this.source, 'editor');
    this.snapshot = { ...this.snapshot, executionPlanVisualization: this.lastCompile.ir?.executionPlanVisualization };
    return this.lastCompile;
  }

  getExecutionPlanVisualization() { return this.compile().ir?.executionPlanVisualization; }

  hover(name: string) { return getCoreSpiritHover(name); }

  private compute(prefix: string, deferSemanticAnalysis=false): CoreSpiritEditorModelSnapshot {
    const base = deferSemanticAnalysis
      ? getCoreSpiritEditorPreviewSnapshot(this.source,prefix)
      : getCoreSpiritEditorSnapshot(this.source,prefix);
    let repaintSafety: CoreSpiritRepaintSafetyReport;
    if(deferSemanticAnalysis){
      repaintSafety=Object.freeze({
        version:1,causality:'unknown',lookahead:'unknown',realtimeSafe:'unknown',backtestLiveEquivalent:'unknown',
        nodes:[],warnings:['Semantic and repaint checks are running in the CoreSpirit compiler worker.'],errors:[],
      });
    }else try {
      const parsed = new CoreSpiritParser(this.source).parseDetailed();
      repaintSafety = parsed.diagnostics.length
        ? Object.freeze({version:1,causality:'unknown',lookahead:'unknown',realtimeSafe:'unknown',backtestLiveEquivalent:'unknown',nodes:[],warnings:['Repaint analysis unavailable while source contains syntax errors.'],errors:[]})
        : analyzeCoreSpiritRepaintSafety(parsed.ast);
    } catch {
      repaintSafety = Object.freeze({version:1,causality:'unknown',lookahead:'unknown',realtimeSafe:'unknown',backtestLiveEquivalent:'unknown',nodes:[],warnings:['Repaint analysis unavailable.'],errors:[]});
    }
    const symbols: CoreSpiritSymbol[] = [];
    const lines = this.source.split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = line.match(/^\s*(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match) symbols.push({ name: match[1], kind: 'variable', line: index + 1, column: (match.index ?? 0) + line.slice(match.index ?? 0).indexOf(match[1]) + 1 });
    });
    return { source: this.source, version: this.version, diagnostics: base.diagnostics, completions: base.completions, tokens: base.tokens, symbols, definitions: base.definitions, folds: base.folds, formatted: base.formatted, repaintSafety, profiler:this.profilerSnapshot };
  }
}
