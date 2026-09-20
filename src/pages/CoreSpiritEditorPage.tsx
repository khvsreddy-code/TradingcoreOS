import { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Play, Save, RotateCcw, CheckCircle2, AlertTriangle, BookOpen, Zap } from 'lucide-react';
import { WorkspaceModuleShell, ModuleHeader, Panel, WorkspaceRoute } from '../components/workspace/WorkspaceModuleShell';
import { CoreSpiritEditorModel, mountCoreSpiritMonaco, type CoreSpiritMonacoAdapter } from '../services/coreSpirit';
import { coreSpiritChartRegistry } from '../services/coreSpirit/chartRegistry';
import { loadEditorScript, saveEditorScript, saveExecutionRun } from '../services/coreSpirit/cloudPersistence';

const DEFAULT_SOURCE = `indicator("CoreSpirit Trend") {
    overlay: true
    input length = int(20, min: 1)
}

fast = ema(close, length)
slow = ema(close, length * 2)

plot fast
plot slow

if fast crossesAbove slow {
    signal "BUY"
}

if fast crossesBelow slow {
    signal "SELL"
}`;

const EXAMPLES: Array<[string, string]> = [
  ['Trend', DEFAULT_SOURCE],
  ['RSI signal', `indicator("RSI Signal")\n\nr = rsi(close, 14)\nplot(r, name = "RSI")\n\nif crossover(r, 30) {\n    signal("RSI RECOVERY")\n}`],
  ['Levels', `indicator("Range Levels")\n\nhi = highest(high, 20)\nlo = lowest(low, 20)\nplot(hi, name = "20-bar High")\nplot(lo, name = "20-bar Low")`],
];

function lineCount(source: string) { return Math.max(1, source.split('\n').length); }

function escapeHtml(value: string) { return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function highlightedLines(source: string, tokens: Array<{line:number;column:number;length:number;token:string}>) {
  const lines = source.replace(/\r/g,'').split('\n');
  const byLine = new Map<number, typeof tokens>();
  tokens.forEach(t => { const arr=byLine.get(t.line)||[]; arr.push(t); byLine.set(t.line,arr); });
  const cls: Record<string,string> = { keyword:'text-[#c084fc]', function:'text-[#60a5fa]', series:'text-[#34d399]', number:'text-[#fbbf24]', string:'text-[#fda4af]', comment:'text-[#64748b]', identifier:'text-[#dbe4ee]' };
  return lines.map((line,i)=>{
    const ts=(byLine.get(i+1)||[]).sort((a,b)=>a.column-b.column); let pos=0; const parts:string[]=[];
    ts.forEach(t=>{ const start=Math.max(0,t.column-1), end=start+t.length; if(start>pos) parts.push(escapeHtml(line.slice(pos,start))); parts.push(`<span class="${cls[t.token]||'text-[#dbe4ee]'}">${escapeHtml(line.slice(start,end))}</span>`); pos=end; });
    if(pos<line.length) parts.push(escapeHtml(line.slice(pos))); return parts.join('') || '&nbsp;';
  });
}

export function CoreSpiritEditorPage({ onNavigate, onBackToLanding, onBroker }: { onNavigate: (path: WorkspaceRoute) => void; onBackToLanding: () => void; onBroker?: () => void }) {
  const initialSource = useMemo(() => localStorage.getItem('tradingcore:corespirit:editor') || DEFAULT_SOURCE, []);
  const editorModel = useMemo(() => new CoreSpiritEditorModel(initialSource), [initialSource]);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const [source, setSource] = useState(initialSource);
  const [diagnostics, setDiagnostics] = useState<Array<{ severity: string; message: string; line?: number }>>([]);
  const [compiled, setCompiled] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'local' | 'loading' | 'saved' | 'error'>('local');
  const [cloudScriptId, setCloudScriptId] = useState<string | null>(null);
  const [lastCompile, setLastCompile] = useState<any>(null);
  const [runStatus, setRunStatus] = useState('');
  const [editorVersion, setEditorVersion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [showCompletions, setShowCompletions] = useState(false);
  const [useMonaco, setUseMonaco] = useState(true);
  const [monacoStatus, setMonacoStatus] = useState<'loading'|'ready'|'fallback'>('loading');
  const monacoRef = useRef<HTMLDivElement | null>(null);
  const monacoAdapterRef = useRef<CoreSpiritMonacoAdapter | null>(null);
  const [completionIndex, setCompletionIndex] = useState(0);
  const lines = useMemo(() => Array.from({ length: lineCount(source) }, (_, i) => i + 1), [source]);
  const editorSnapshot = editorModel.getSnapshot();
  const highlighted = useMemo(() => highlightedLines(source, editorSnapshot.tokens), [source, editorSnapshot.tokens]);
  const completionState = useMemo(() => editorModel.completionAt(cursor), [editorVersion, cursor, source]);
  const completionItems = completionState.completions.slice(0, 12);
  const lineHeight = 20;

  useEffect(() => {
    let active = true;
    loadEditorScript().then((script) => {
      if (!active || !script) return;
      const nextSource = script.source || DEFAULT_SOURCE;
      editorModel.updateSource(nextSource);
      setSource(nextSource);
      setEditorVersion(v => v + 1);
      setCloudScriptId(script.id);
      setCloudStatus('saved');
    }).catch(() => { if (active) setCloudStatus('local'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active=true;
    if (!useMonaco || !monacoRef.current) { monacoAdapterRef.current?.dispose(); monacoAdapterRef.current=null; if(active) setMonacoStatus('fallback'); return; }
    setMonacoStatus('loading');
    mountCoreSpiritMonaco(monacoRef.current, editorModel, (next)=>{ if(!active)return; editorModel.updateSource(next); setSource(next); setCompiled(false); setEditorVersion(v=>v+1); })
      .then(adapter=>{ if(!active){adapter.dispose();return;} monacoAdapterRef.current=adapter; setMonacoStatus('ready'); })
      .catch(()=>{ if(active)setMonacoStatus('fallback'); });
    return ()=>{active=false;monacoAdapterRef.current?.dispose();monacoAdapterRef.current=null;};
  }, [useMonaco, editorModel]);

  const compile = () => {
    try {
      const result = editorModel.compile();
      const next = (result.diagnostics || []).map((d: any) => ({ severity: String(d.severity || 'error'), message: String(d.message || d), line: d.line }));
      setDiagnostics(next);
      setLastCompile(result);
      setCompiled(Boolean(result.ir && !next.some(x => x.severity === 'error')));
    } catch (error: any) {
      setDiagnostics([{ severity: 'error', message: String(error?.message || error) }]);
      setCompiled(false);
    }
  };

  const runOnChart = async () => {
    try {
      const result = editorModel.compile();
      const errors = (result.diagnostics || []).filter((d: any) => d.severity === 'error');
      setDiagnostics((result.diagnostics || []).map((d: any) => ({ severity: String(d.severity || 'error'), message: String(d.message || d), line: d.line })));
      if (errors.length || !result.ir) { setCompiled(false); return; }
      setLastCompile(result); setCompiled(true); setRunStatus('Running on active chart…');
      const target = coreSpiritChartRegistry.getActive();
      if (!target) throw new Error('No active TradingCoreOS chart. Open a live chart and click it once.');
      const run = await target.run(source, 'coreSpirit-editor');
      setRunStatus(`${run.barsProcessed.toLocaleString()} bars · ${run.plotsEmitted} plots · ${run.signalsEmitted} signals`);
      if (cloudScriptId) { try { await saveExecutionRun({ scriptId: cloudScriptId, executionType: 'chart', symbol: target.symbol, timeframe: target.timeframe, status: run.diagnostics.length ? 'error' : 'success', barsProcessed: run.barsProcessed, plotsEmitted: run.plotsEmitted, signalsEmitted: run.signalsEmitted, metrics: { source: 'CoreSpirit Coder' } }); } catch {} }
      setDiagnostics(run.diagnostics.length ? run.diagnostics.map(message => ({ severity: 'warning', message })) : [{ severity: 'info', message: `CoreSpirit rendered on ${target.symbol} · ${target.timeframe}.` }]);
    } catch (error: any) {
      setRunStatus('Run failed');
      setDiagnostics([{ severity: 'error', message: String(error?.message || error) }]);
    }
  };

  const save = async () => {
    localStorage.setItem('tradingcore:corespirit:editor', source);
    setCloudStatus('loading');
    try {
      const result = await saveEditorScript(source, lastCompile || undefined);
      setCloudScriptId(result.script.id);
      setCloudStatus('saved');
      setDiagnostics([{ severity: 'info', message: `Saved CoreSpirit v${result.version.version} to cloud.` }]);
    } catch (error: any) {
      setCloudStatus('error');
      setDiagnostics([{ severity: 'info', message: `Saved locally. Cloud save unavailable: ${String(error?.message || error)}` }]);
    }
  };

  return <WorkspaceModuleShell active="/corespirit" onNavigate={onNavigate} onBackToLanding={onBackToLanding} onBroker={onBroker}>
    <ModuleHeader eyebrow="CoreSpirit IDE" title="CoreSpirit Coder" description="A TradingView-style script workspace for TradingCoreOS. CoreSpirit is intentionally simpler than Pine and is being extended for webhooks, models, custom drawings, multi-symbol data and realtime automation." action={<div className="flex flex-wrap gap-2"><button onClick={()=>setUseMonaco(v=>!v)} className="premium-button"><Code2 className="w-4 h-4"/>{useMonaco && monacoStatus==='ready' ? 'Classic Editor' : 'Monaco Editor'}</button><button onClick={save} className="premium-button"><Save className="w-4 h-4"/> Save</button><button onClick={compile} className="premium-button premium-button-primary"><Play className="w-4 h-4"/> Compile</button><button onClick={runOnChart} className="premium-button"><Zap className="w-4 h-4"/> Run on chart</button></div>} />
    <main className="grid min-h-[calc(100vh-170px)] gap-4 p-4 md:p-6 xl:grid-cols-[1fr_300px]">
      <Panel title="SCRIPT EDITOR" subtitle="CoreSpirit source • compile first, execute on the active chart in the next editor milestone" className="min-h-[650px] overflow-hidden">
        <div className="flex h-[610px] overflow-hidden rounded-lg border border-[#222636] bg-[#07090e] font-mono text-[12px]">
          <div className="w-12 shrink-0 select-none overflow-hidden border-r border-[#1b1f2a] bg-[#0a0c12] py-3 text-right text-[#475569]">{lines.map(n => <div key={n} className="h-[20px] pr-3 leading-[20px]">{n}</div>)}</div>
          <div className="relative min-w-0 flex-1 overflow-hidden">
            <div ref={monacoRef} className={`absolute inset-0 z-30 ${useMonaco && monacoStatus !== 'fallback' ? 'block' : 'hidden'}`} />
            <pre ref={highlightRef} aria-hidden className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre-wrap break-words p-3 leading-[20px] text-[#dbe4ee]">{highlighted.map((line,i)=><div key={i} className="h-[20px]">{line}</div>)}</pre>
            <textarea
              ref={editorRef}
              value={source}
              onChange={e => { editorModel.updateSource(e.target.value, completionState.prefix); setSource(e.target.value); setCompiled(false); setEditorVersion(v=>v+1); setCursor(e.target.selectionStart); setShowCompletions(true); }}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); void save(); return; }
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void runOnChart(); return; }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); const snap=editorModel.undo(); setSource(snap.source); setEditorVersion(v=>v+1); return; }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); const snap=editorModel.redo(); setSource(snap.source); setEditorVersion(v=>v+1); return; }
                if (showCompletions && e.key === 'ArrowDown') { e.preventDefault(); setCompletionIndex(i=>Math.min(i+1,Math.max(0,completionItems.length-1))); return; }
                if (showCompletions && e.key === 'ArrowUp') { e.preventDefault(); setCompletionIndex(i=>Math.max(0,i-1)); return; }
                if (showCompletions && e.key === 'Enter' && completionItems[completionIndex]) { e.preventDefault(); const item=completionItems[completionIndex]; const start=e.currentTarget.selectionStart-(completionState.prefix?.length||0); const next=editorModel.applyEdit({start,end:e.currentTarget.selectionStart,text:item.label}); setSource(next.source); setEditorVersion(v=>v+1); setShowCompletions(false); requestAnimationFrame(()=>{ const pos=start+item.label.length; editorRef.current?.setSelectionRange(pos,pos); }); return; }
                if (e.key === 'Escape') setShowCompletions(false);
              }}
              onKeyUp={e => { setCursor(e.currentTarget.selectionStart); if (/[A-Za-z_.]/.test(e.key) || e.key === 'Backspace') { setShowCompletions(true); setCompletionIndex(0); } }}
              onClick={e => { setCursor(e.currentTarget.selectionStart); setShowCompletions(false); }}
              onScroll={e => { if (highlightRef.current) { highlightRef.current.scrollTop=e.currentTarget.scrollTop; highlightRef.current.scrollLeft=e.currentTarget.scrollLeft; } }}
              spellCheck={false}
              className="relative z-10 h-full w-full resize-none overflow-auto bg-transparent p-3 leading-[20px] text-transparent caret-[#f8fafc] outline-none selection:bg-[#10b981]/20"
              aria-label="CoreSpirit source editor"
            />
            {showCompletions && completionItems.length > 0 && <div className="absolute left-4 top-14 z-20 w-72 overflow-hidden rounded-lg border border-[#303747] bg-[#0b0f17]/95 shadow-2xl backdrop-blur">{completionItems.map((item,i)=><button key={item.label} onMouseDown={e=>{e.preventDefault(); const ta=editorRef.current; if(!ta)return; const start=ta.selectionStart-(completionState.prefix?.length||0); const snap=editorModel.applyEdit({start,end:ta.selectionStart,text:item.label}); setSource(snap.source); setEditorVersion(v=>v+1); setShowCompletions(false); requestAnimationFrame(()=>{const pos=start+item.label.length; ta.focus(); ta.setSelectionRange(pos,pos);});}} className={`block w-full px-3 py-2 text-left text-[10px] ${i===completionIndex?'bg-[#10b981]/15 text-[#f8fafc]':'text-[#94a3b8]'} hover:bg-[#10b981]/10`}><span className="mr-2 text-[#60a5fa]">{item.kind}</span>{item.label}<span className="ml-2 text-[#475569]">{item.detail}</span></button>)}</div>}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider"><span className={`rounded border px-2 py-1 ${compiled ? 'border-[#10b981]/30 text-[#10b981]' : 'border-[#303747] text-[#64748b]'}`}>{compiled ? 'COMPILED' : 'EDITING'}</span><span className="text-[#475569]">CoreSpirit compiler / IR</span><span className="text-[#64748b]">{useMonaco ? `Monaco ${monacoStatus}` : 'Classic editor'}</span><span className="ml-2 text-[#94a3b8]">{runStatus}</span><span className={`ml-auto ${cloudStatus === 'saved' ? 'text-[#10b981]' : cloudStatus === 'error' ? 'text-[#f59e0b]' : 'text-[#64748b]'}`}>{cloudStatus === 'saved' ? `CLOUD${cloudScriptId ? ' • SYNCED' : ''}` : cloudStatus === 'loading' ? 'CLOUD • SAVING…' : cloudStatus === 'error' ? 'CLOUD • LOCAL FALLBACK' : 'LOCAL'}</span></div>
        {diagnostics.length > 0 && <div className="mt-3 space-y-2 rounded-lg border border-[#222636] bg-[#090b11] p-3">{diagnostics.map((d, i) => { const actions=editorModel.codeActions({message:d.message,line:d.line||1,column:1,severity:d.severity==='error'?'error':'warning'}); return <div key={i} className="rounded-md border border-transparent px-1 py-1 hover:border-[#222636]"><div className="flex gap-2 text-[10px] leading-5"><span className={d.severity === 'error' ? 'text-[#ef4444]' : 'text-[#10b981]'}>{d.severity === 'error' ? <AlertTriangle className="mt-0.5 h-3 w-3"/> : <CheckCircle2 className="mt-0.5 h-3 w-3"/>}</span><span className="text-[#94a3b8]">{d.line ? `Line ${d.line}: ` : ''}{d.message}</span></div>{actions.map(a=><button key={a.title} onClick={()=>{ if(!a.edit)return; const snap=editorModel.applyEdit(a.edit); setSource(snap.source); setEditorVersion(v=>v+1); setCompiled(false); }} className="ml-5 mt-1 text-[9px] text-[#60a5fa] hover:text-[#93c5fd]">{a.title}</button>)}</div>})}</div>}
      </Panel>

      <div className="space-y-4">
        <Panel title="EXAMPLES" subtitle="Starter CoreSpirit scripts"><div className="space-y-2">{EXAMPLES.map(([name, code]) => <button key={name} onClick={() => { setSource(code); setDiagnostics([]); setCompiled(false); }} className="flex w-full items-center gap-2 rounded-lg border border-[#222636] bg-[#090b11] p-3 text-left hover:border-[#10b981]/40"><BookOpen className="h-4 w-4 text-[#10b981]"/><span className="text-[10px] font-mono text-[#cbd5e1]">{name}</span></button>)}</div></Panel>
        <Panel title="CORESPIRIT SYNTAX" subtitle="The concise surface language lowers to the deterministic core"><div className="mb-3 rounded-lg border border-[#222636] bg-[#090b11] p-3 font-mono text-[9px] leading-4 text-[#94a3b8]">fast = ema(close, 20)<br/>plot fast<br/>if fast crossesAbove slow {'{'} ... {'}'}<br/>input length = int(20, min: 1)</div></Panel><Panel title="CORESPIRIT ROADMAP" subtitle="The editor will grow with the runtime"><div className="space-y-2 text-[10px] leading-5 text-[#7e889d]"><div><Zap className="mr-2 inline h-3 w-3 text-[#10b981]"/>Compile + diagnostics <b className="text-[#10b981]">ACTIVE</b></div><div>• Run on active chart <b className="text-[#10b981]">ACTIVE</b></div><div>• Syntax highlighting / autocomplete <b className="text-[#10b981]">ACTIVE</b></div><div>• Hover / outline / quick fixes <b className="text-[#10b981]">ACTIVE</b></div><div>• Inputs with instant hot reload <b className="text-[#f59e0b]">NEXT</b></div><div>• Plot / line / box / zone controls</div><div>• Webhooks + event handlers</div><div>• Models / feature calls</div><div>• Multi-symbol / multi-timeframe requests</div><div>• Replay / backtest / live execution modes</div></div></Panel>
        <Panel title="RESET"><button onClick={() => { setSource(DEFAULT_SOURCE); setDiagnostics([]); setCompiled(false); }} className="premium-button w-full"><RotateCcw className="h-4 w-4"/> Reset starter script</button></Panel>
      </div>
    </main>
  </WorkspaceModuleShell>;
}
