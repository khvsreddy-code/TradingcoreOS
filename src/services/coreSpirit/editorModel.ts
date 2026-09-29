import { CoreSpiritIncrementalCompiler } from './incrementalCompiler';
import { CoreSpiritIncrementalAst } from './incrementalAst';
import { getCoreSpiritEditorSnapshot, getCoreSpiritHover, getCoreSpiritCompletionContext, getCoreSpiritDefinitionAt, getCoreSpiritCodeActions, type CoreSpiritCompletion, type CoreSpiritEditorDiagnostic, type CoreSpiritSemanticToken, type CoreSpiritDefinition, type CoreSpiritCodeAction, type CoreSpiritFoldingRange } from './languageService';

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
  private readonly incrementalAst = new CoreSpiritIncrementalAst();
  private readonly incrementalCompiler = new CoreSpiritIncrementalCompiler();

  constructor(source = '') {
    this.source = source;
    this.snapshot = this.compute('');
  }

  getSnapshot() { return this.snapshot; }
  getSource() { return this.source; }
  getVersion() { return this.version; }

  updateSource(source: string, completionPrefix = '') {
    if (source === this.source && !completionPrefix) return this.snapshot;
    this.undoStack.push(this.source); if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    const old=this.source; this.source = source;
    this.version += 1;
    const change={start:0,end:old.length,text:source}; this.incrementalAst.update(source,change);
    this.snapshot = this.compute(completionPrefix);
    return this.snapshot;
  }

  applyEdit(edit: CoreSpiritEditorEdit, completionPrefix = '') {
    const start = Math.max(0, Math.min(edit.start, this.source.length));
    const end = Math.max(start, Math.min(edit.end, this.source.length));
    return this.updateSource(this.source.slice(0, start) + edit.text + this.source.slice(end), completionPrefix);
  }

  undo() { const previous=this.undoStack.pop(); if(previous===undefined) return this.snapshot; this.redoStack.push(this.source); this.source=previous; this.version+=1; this.lastCompileSource=''; this.snapshot=this.compute(''); return this.snapshot; }

  redo() { const next=this.redoStack.pop(); if(next===undefined) return this.snapshot; this.undoStack.push(this.source); this.source=next; this.version+=1; this.lastCompileSource=''; this.snapshot=this.compute(''); return this.snapshot; }

  completionAt(cursor:number) { const ctx=getCoreSpiritCompletionContext(this.source,cursor); return { ...ctx, completions:getCoreSpiritEditorSnapshot(this.source,ctx.prefix).completions }; }
  definitionAt(cursor:number) { return getCoreSpiritDefinitionAt(this.source,cursor); }
  codeActions(diagnostic:CoreSpiritEditorDiagnostic): CoreSpiritCodeAction[] { return getCoreSpiritCodeActions(this.source,diagnostic); }

  compile() {
    if (this.lastCompileSource === this.source && this.lastCompile) return this.lastCompile;
    this.lastCompileSource = this.source;
    this.lastCompile = this.incrementalCompiler.compile(this.source, 'editor');
    return this.lastCompile;
  }

  hover(name: string) { return getCoreSpiritHover(name); }

  private compute(prefix: string): CoreSpiritEditorModelSnapshot {
    const base = getCoreSpiritEditorSnapshot(this.source, prefix);
    const symbols: CoreSpiritSymbol[] = [];
    const lines = this.source.split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = line.match(/^\s*(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match) symbols.push({ name: match[1], kind: 'variable', line: index + 1, column: (match.index ?? 0) + line.slice(match.index ?? 0).indexOf(match[1]) + 1 });
    });
    return { source: this.source, version: this.version, diagnostics: base.diagnostics, completions: base.completions, tokens: base.tokens, symbols, definitions: base.definitions, folds: base.folds, formatted: base.formatted };
  }
}
