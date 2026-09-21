import { CORE_SPIRIT_STDLIB } from './standardLibrary';
import { CoreSpiritParser } from './parser';
import { analyzeCoreSpirit } from './semanticAnalyzer';

export type CoreSpiritCompletion = { label: string; kind: 'function'|'keyword'|'series'|'visual'|'data'|'type'|'property'; detail: string; insertText?: string };
export type CoreSpiritTypeInfo = { name:string; type:string; detail:string };
export type CoreSpiritUdtInfo = { name:string; fields:Array<{name:string;type:string;detail:string}> };
export type CoreSpiritEditorDiagnostic = { message: string; line: number; column: number; severity: 'error'|'warning' };
export type CoreSpiritHover = { label: string; detail: string; documentation?: string };
export type CoreSpiritSemanticToken = { line: number; column: number; length: number; token: 'keyword'|'function'|'series'|'number'|'string'|'comment'|'identifier' };
export type CoreSpiritDefinition = { name: string; kind: 'variable'|'builtin'; line: number; column: number; start: number; end: number };
export type CoreSpiritCodeAction = { title: string; kind: 'quickfix'|'refactor'; edit?: { start: number; end: number; text: string } };
export type CoreSpiritFoldingRange = { startLine: number; endLine: number; kind: 'region'|'comment' };
export type CoreSpiritCompletionContext = { prefix: string; mode: 'global'|'call'|'member'|'argument'; trigger?: string; cursor?: number; memberTarget?: string };
export type CoreSpiritEditorSnapshot = { diagnostics: CoreSpiritEditorDiagnostic[]; completions: CoreSpiritCompletion[]; formatted: string; tokens: CoreSpiritSemanticToken[]; definitions: CoreSpiritDefinition[]; folds: CoreSpiritFoldingRange[] };

const SNAPSHOT_CACHE = new Map<string, CoreSpiritEditorSnapshot>();


const KEYWORDS: CoreSpiritCompletion[] = [
  { label: 'let', kind: 'keyword', detail: 'declare a value/series' },
  { label: 'if', kind: 'keyword', detail: 'conditional block' },
  { label: 'true', kind: 'keyword', detail: 'boolean literal' },
  { label: 'false', kind: 'keyword', detail: 'boolean literal' },
];
const SERIES: CoreSpiritCompletion[] = ['open','high','low','close','volume','time'].map(label => ({ label, kind:'series', detail:'built-in market series' }));
const DATA: CoreSpiritCompletion[] = ['request','lowerTf','depthImbalance','footprintDelta','footprintBuy','footprintSell','footprintPoc','footprintVah','footprintVal','footprintRows'].map(label => ({ label, kind:'data', detail:'host-provided market-data capability' }));

function getCoreSpiritUdtInfos(source: string): CoreSpiritUdtInfo[] {
  const out:CoreSpiritUdtInfo[]=[];
  const re=/\btype\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)\}/g; let m:RegExpExecArray|null;
  while((m=re.exec(source))){ const fields:Array<{name:string;type:string;detail:string}>=[]; const fr=/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:<[^>]+>)?)/g; let f:RegExpExecArray|null; while((f=fr.exec(m[2]))) fields.push({name:f[1],type:f[2],detail:`${m[1]}.${f[1]}: ${f[2]}`}); out.push({name:m[1],fields}); }
  return out;
}

export function getCoreSpiritUdtMembers(source:string, typeName:string):CoreSpiritCompletion[]{
  const udt=getCoreSpiritUdtInfos(source).find(x=>x.name===typeName);
  return udt?.fields.map(f=>({label:f.name,kind:'property',detail:f.detail,insertText:f.name})) || [];
}

export function getCoreSpiritTypeInfo(source:string, cursor:number):CoreSpiritTypeInfo|null {
  const before=source.slice(0,Math.max(0,cursor)); const word=before.match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0]; if(!word) return null;
  const lines=source.split(/\r?\n/); const defs=new Map<string,string>();
  for(const line of lines){ const m=line.match(/^\s*(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/); if(m){ const rhs=m[2].trim(); let t='unknown'; if(/^[-+]?\d/.test(rhs)) t='number'; else if(/^['"]/.test(rhs)) t='string'; else if(/^(true|false)$/.test(rhs)) t='boolean'; else if(/^(open|high|low|close|volume|time)\b/.test(rhs)) t='series<number>'; else { const u=getCoreSpiritUdtInfos(source).find(x=>x.name===rhs.split(/[.(]/)[0]); if(u)t=`udt:${u.name}`; else if(/^[A-Za-z_][A-Za-z0-9_]*\(\)$/.test(rhs)){ const ctor=getCoreSpiritUdtInfos(source).find(x=>x.name===rhs.slice(0,-2)); if(ctor)t=`udt:${ctor.name}`; } } defs.set(m[1],t); }}
  if(defs.has(word)) return {name:word,type:defs.get(word)!,detail:`${word}: ${defs.get(word)}`};
  const builtin=SERIES.find(x=>x.label===word); if(builtin)return {name:word,type:'series<number>',detail:'built-in market series'};
  const udt=getCoreSpiritUdtInfos(source).find(x=>x.name===word); if(udt)return {name:word,type:`type ${udt.name}`,detail:`${udt.fields.length} field(s)`};
  return null;
}

function allCompletions(): CoreSpiritCompletion[] {
  const functions = CORE_SPIRIT_STDLIB.map(x => ({ label:x.name, kind: x.name.match(/plot|label|box|zone|band|gradient|shape|heatmap|arrow|polyline|hline|bg|barcolor|table|footprint/) ? 'visual' as const : 'function' as const, detail:`${x.returnType}${x.capability ? ` • ${x.capability}` : ''}` }));
  return [...KEYWORDS, ...SERIES, ...DATA, ...functions];
}

export function getCoreSpiritCompletionContext(source: string, cursor = source.length): CoreSpiritCompletionContext {
  const before = source.slice(0, Math.max(0, cursor));
  const line = before.slice(before.lastIndexOf('\n') + 1);
  const word = line.match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] || '';
  if (/\.[A-Za-z_][A-Za-z0-9_]*$/.test(line)) return { prefix: word, mode: 'member', trigger: '.', cursor, memberTarget: line.match(/([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_][A-Za-z0-9_]*$/)?.[1] };
  if (/\b[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*$/.test(line)) return { prefix: word, mode: 'argument', trigger: '(' };
  if (/\b(?:plot|label|box|zone|band|gradient|shape|heatmap|arrow|polyline|hline|table)\s*\([^)]*$/.test(line)) return { prefix: word, mode: 'call' };
  return { prefix: word, mode: 'global' };
}

export function getCoreSpiritCompletions(prefix = '', context: Partial<CoreSpiritCompletionContext> = {}, source = ''): CoreSpiritCompletion[] {
  const all = [...allCompletions(), ...getCoreSpiritUdtInfos(source).map(u=>({label:u.name,kind:'type' as const,detail:`CoreSpirit type • ${u.fields.length} fields`}))];
  const needle = (prefix || context.prefix || '').trim().toLowerCase();
  if (context.mode === 'member') {
    const before=source.slice(0,Math.max(0,context.cursor ?? source.length)); const target=before.match(/([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_]*)$/)?.[1];
    const typeInfo=target ? getCoreSpiritTypeInfo(source, Math.max(0,before.lastIndexOf(target)+target.length)) : null;
    const udtType=typeInfo?.type?.startsWith('udt:') ? typeInfo.type.slice(4) : target;
    const members=udtType ? getCoreSpiritUdtMembers(source,udtType) : [];
    const memberFiltered=members.filter(x=>!needle||x.label.toLowerCase().startsWith(needle));
    if(memberFiltered.length) return memberFiltered;
  }
  const filtered = all.filter(x => !needle || x.label.toLowerCase().startsWith(needle));
  return filtered;
}

export function formatCoreSpiritSource(source: string): string {
  const normalized = source.replace(/\r\n?/g, '\n').split('\n').map(line => line.trimEnd());
  let indent = 0;
  return normalized.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('}')) indent = Math.max(0, indent - 1);
    const result = `${'  '.repeat(indent)}${trimmed}`;
    if (trimmed.endsWith('{')) indent += 1;
    return result;
  }).join('\n');
}

export function diagnoseCoreSpiritSource(source: string): CoreSpiritEditorDiagnostic[] {
  const parsed = new CoreSpiritParser(source).parseDetailed();
  const diagnostics: CoreSpiritEditorDiagnostic[] = parsed.diagnostics.map(d => ({ message:d.message, line:d.line, column:d.column, severity:'error' }));
  if (!diagnostics.length) {
    const semantic = analyzeCoreSpirit(parsed.ast);
    diagnostics.push(...semantic.diagnostics.map(d => ({ message:d.message, line:d.line || 1, column:d.column || 1, severity:d.severity })));
  }
  return diagnostics;
}

export function getCoreSpiritSignature(name: string): string | null {
  const builtin = CORE_SPIRIT_STDLIB.find(x => x.name === name);
  if (!builtin) return null;
  const max = builtin.maxArgs == null ? '…' : String(builtin.maxArgs);
  return `${name}(${builtin.minArgs}${builtin.maxArgs == null || builtin.maxArgs !== builtin.minArgs ? `..${max}` : ''}) → ${builtin.returnType}`;
}


export function getCoreSpiritHover(name: string): CoreSpiritHover | null {
  const builtin = CORE_SPIRIT_STDLIB.find(x => x.name === name);
  if (builtin) return { label: getCoreSpiritSignature(name) || name, detail: builtin.capability ? `capability: ${builtin.capability}` : `returns ${builtin.returnType}`, documentation: builtin.pure ? 'Deterministic within the current bar/context.' : 'May depend on runtime state or host market data.' };
  if (['open','high','low','close','volume','time'].includes(name)) return { label:name, detail:'built-in market series', documentation:'Current chart bar series value.' };
  const udt=getCoreSpiritUdtInfos('');
  if (udt.length) return { label:name, detail:'CoreSpirit user-defined type' };
  return null;
}

export function getCoreSpiritSemanticTokens(source: string): CoreSpiritSemanticToken[] {
  const out: CoreSpiritSemanticToken[]=[];
  const lines=source.replace(/\r/g,'').split('\n');
  lines.forEach((line,lineIndex)=>{
    const comment=line.indexOf('//'); if(comment>=0) out.push({line:lineIndex,column:comment,length:line.length-comment,token:'comment'});
    const re=/\b(?:let|if|else|true|false)\b|\b(?:open|high|low|close|volume|time)\b|\b(?:[A-Za-z_][A-Za-z0-9_]*)\b|\b(?:\d+(?:\.\d+)?)\b|"(?:[^"\\]|\\.)*"/g;
    let m:RegExpExecArray|null; while((m=re.exec(line))){ const text=m[0]; if(comment>=0 && m.index>=comment) break; let token:'keyword'|'function'|'series'|'number'|'string'|'identifier'='identifier'; if(/^(let|if|else|true|false)$/.test(text)) token='keyword'; else if(/^(open|high|low|close|volume|time)$/.test(text)) token='series'; else if(/^\d/.test(text)) token='number'; else if(/^"/.test(text)) token='string'; else if(/\s*\(/.test(line.slice(m.index+text.length))) token='function'; out.push({line:lineIndex,column:m.index,length:text.length,token}); }
  });
  return out;
}

export function getCoreSpiritDefinitions(source: string): CoreSpiritDefinition[] {
  const defs: CoreSpiritDefinition[] = [];
  const lines = source.replace(/\r/g, '').split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*(?:let\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m) {
      const start = offset + line.indexOf(m[1]);
      defs.push({ name:m[1], kind:'variable', line:i+1, column:line.indexOf(m[1])+1, start, end:start+m[1].length });
    }
    offset += line.length + 1;
  }
  for (const x of allCompletions()) {
    const start = source.indexOf(x.label);
    if (start >= 0) defs.push({ name:x.label, kind:'builtin', line:source.slice(0,start).split('\n').length, column:start-(source.lastIndexOf('\n',start-1)+1)+1, start, end:start+x.label.length });
  }
  return defs;
}

export function getCoreSpiritDefinitionAt(source: string, cursor: number): CoreSpiritDefinition | null {
  const start = Math.max(0, cursor);
  const left = source.slice(0, start).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] || '';
  if (!left) return null;
  const defs = getCoreSpiritDefinitions(source);
  const variable = defs.find(d => d.kind === 'variable' && d.name === left);
  if (variable) return variable;
  return defs.find(d => d.kind === 'builtin' && d.name === left) || null;
}

export function getCoreSpiritFoldingRanges(source: string): CoreSpiritFoldingRange[] {
  const ranges: CoreSpiritFoldingRange[] = [];
  const lines = source.replace(/\r/g, '').split('\n');
  const stack: number[] = [];
  lines.forEach((line, i) => {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    for (let n=0;n<opens;n++) stack.push(i+1);
    for (let n=0;n<closes;n++) { const start=stack.pop(); if (start && i+1>start) ranges.push({startLine:start,endLine:i+1,kind:'region'}); }
  });
  return ranges;
}

export function getCoreSpiritCodeActions(source: string, diagnostic: CoreSpiritEditorDiagnostic): CoreSpiritCodeAction[] {
  const actions: CoreSpiritCodeAction[] = [];
  const lineIndex = Math.max(0, (diagnostic.line || 1) - 1);
  const lines = source.split(/\r?\n/);
  let offset = lines.slice(0,lineIndex).reduce((n,l)=>n+l.length+1,0);
  const line = lines[lineIndex] || '';
  if (/Expected \}/i.test(diagnostic.message)) actions.push({ title:'Insert closing }', kind:'quickfix', edit:{start:source.length,end:source.length,text:'\n}'}});
  if (/Expected \)/i.test(diagnostic.message)) { const at=Math.min(source.length, offset+line.length); actions.push({title:'Insert closing )',kind:'quickfix',edit:{start:at,end:at,text:')'}}); }
  if (/Unexpected character/.test(diagnostic.message)) {
    const bad = diagnostic.message.match(/'([^']+)'/)?.[1];
    if (bad) { const pos = Math.max(offset, source.indexOf(bad, offset)); actions.push({title:`Remove unexpected '${bad}'`,kind:'quickfix',edit:{start:pos,end:pos+bad.length,text:''}}); }
  }
  if (/Expected variable name/.test(diagnostic.message)) actions.push({title:'Insert variable name',kind:'quickfix',edit:{start:offset+line.indexOf('let')+3,end:offset+line.indexOf('let')+3,text:' value'}});
  return actions;
}

export function getCoreSpiritEditorSnapshot(source: string, prefix=''): CoreSpiritEditorSnapshot {
  const context=getCoreSpiritCompletionContext(source, source.length);
  const key=`${source}\u0000${prefix}\u0000${context.mode}`; const cached=SNAPSHOT_CACHE.get(key); if(cached) return cached;
  const snapshot={diagnostics:diagnoseCoreSpiritSource(source),completions:getCoreSpiritCompletions(prefix || context.prefix, {...context,cursor:source.length}, source),formatted:formatCoreSpiritSource(source),tokens:getCoreSpiritSemanticTokens(source),definitions:getCoreSpiritDefinitions(source),folds:getCoreSpiritFoldingRanges(source)};
  SNAPSHOT_CACHE.set(key,snapshot); if(SNAPSHOT_CACHE.size>200) SNAPSHOT_CACHE.delete(SNAPSHOT_CACHE.keys().next().value as string);
  return snapshot;
}
