import { useMemo, useState } from 'react';
import { Code2, Play, Save, RotateCcw, CheckCircle2, AlertTriangle, BookOpen, Zap } from 'lucide-react';
import { WorkspaceModuleShell, ModuleHeader, Panel, WorkspaceRoute } from '../components/workspace/WorkspaceModuleShell';
import { compileCoreSpirit } from '../services/coreSpirit';

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

export function CoreSpiritEditorPage({ onNavigate, onBackToLanding, onBroker }: { onNavigate: (path: WorkspaceRoute) => void; onBackToLanding: () => void; onBroker?: () => void }) {
  const [source, setSource] = useState(() => localStorage.getItem('tradingcore:corespirit:editor') || DEFAULT_SOURCE);
  const [diagnostics, setDiagnostics] = useState<Array<{ severity: string; message: string; line?: number }>>([]);
  const [compiled, setCompiled] = useState(false);
  const lines = useMemo(() => Array.from({ length: lineCount(source) }, (_, i) => i + 1), [source]);

  const compile = () => {
    try {
      const result = compileCoreSpirit(source, 'editor-preview');
      const next = (result.diagnostics || []).map((d: any) => ({ severity: String(d.severity || 'error'), message: String(d.message || d), line: d.line }));
      setDiagnostics(next);
      setCompiled(Boolean(result.ir && !next.some(x => x.severity === 'error')));
    } catch (error: any) {
      setDiagnostics([{ severity: 'error', message: String(error?.message || error) }]);
      setCompiled(false);
    }
  };

  const save = () => {
    localStorage.setItem('tradingcore:corespirit:editor', source);
    setDiagnostics([{ severity: 'info', message: 'Saved locally. Cloud script storage will be added to the CoreSpirit workspace layer.' }]);
  };

  return <WorkspaceModuleShell active="/corespirit" onNavigate={onNavigate} onBackToLanding={onBackToLanding} onBroker={onBroker}>
    <ModuleHeader eyebrow="CoreSpirit IDE" title="CoreSpirit Coder" description="A TradingView-style script workspace for TradingCoreOS. CoreSpirit is intentionally simpler than Pine and is being extended for webhooks, models, custom drawings, multi-symbol data and realtime automation." action={<div className="flex flex-wrap gap-2"><button onClick={save} className="premium-button"><Save className="w-4 h-4"/> Save</button><button onClick={compile} className="premium-button premium-button-primary"><Play className="w-4 h-4"/> Compile</button></div>} />
    <main className="grid min-h-[calc(100vh-170px)] gap-4 p-4 md:p-6 xl:grid-cols-[1fr_300px]">
      <Panel title="SCRIPT EDITOR" subtitle="CoreSpirit source • compile first, execute on the active chart in the next editor milestone" className="min-h-[650px] overflow-hidden">
        <div className="flex h-[610px] overflow-hidden rounded-lg border border-[#222636] bg-[#07090e] font-mono text-[12px]">
          <div className="w-12 shrink-0 select-none overflow-hidden border-r border-[#1b1f2a] bg-[#0a0c12] py-3 text-right text-[#475569]">{lines.map(n => <div key={n} className="h-[20px] pr-3 leading-[20px]">{n}</div>)}</div>
          <textarea value={source} onChange={e => { setSource(e.target.value); setCompiled(false); }} spellCheck={false} className="h-full min-w-0 flex-1 resize-none bg-transparent p-3 leading-[20px] text-[#dbe4ee] outline-none" aria-label="CoreSpirit source editor" />
        </div>
        <div className="mt-3 flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider"><span className={`rounded border px-2 py-1 ${compiled ? 'border-[#10b981]/30 text-[#10b981]' : 'border-[#303747] text-[#64748b]'}`}>{compiled ? 'COMPILED' : 'EDITING'}</span><span className="text-[#475569]">CoreSpirit compiler / IR</span></div>
        {diagnostics.length > 0 && <div className="mt-3 space-y-1 rounded-lg border border-[#222636] bg-[#090b11] p-3">{diagnostics.map((d, i) => <div key={i} className="flex gap-2 text-[10px] leading-5"><span className={d.severity === 'error' ? 'text-[#ef4444]' : 'text-[#10b981]'}>{d.severity === 'error' ? <AlertTriangle className="mt-0.5 h-3 w-3"/> : <CheckCircle2 className="mt-0.5 h-3 w-3"/>}</span><span className="text-[#94a3b8]">{d.line ? `Line ${d.line}: ` : ''}{d.message}</span></div>)}</div>}
      </Panel>

      <div className="space-y-4">
        <Panel title="EXAMPLES" subtitle="Starter CoreSpirit scripts"><div className="space-y-2">{EXAMPLES.map(([name, code]) => <button key={name} onClick={() => { setSource(code); setDiagnostics([]); setCompiled(false); }} className="flex w-full items-center gap-2 rounded-lg border border-[#222636] bg-[#090b11] p-3 text-left hover:border-[#10b981]/40"><BookOpen className="h-4 w-4 text-[#10b981]"/><span className="text-[10px] font-mono text-[#cbd5e1]">{name}</span></button>)}</div></Panel>
        <Panel title="CORESPIRIT SYNTAX" subtitle="The concise surface language lowers to the deterministic core"><div className="mb-3 rounded-lg border border-[#222636] bg-[#090b11] p-3 font-mono text-[9px] leading-4 text-[#94a3b8]">fast = ema(close, 20)<br/>plot fast<br/>if fast crossesAbove slow {'{'} ... {'}'}<br/>input length = int(20, min: 1)</div></Panel><Panel title="CORESPIRIT ROADMAP" subtitle="The editor will grow with the runtime"><div className="space-y-2 text-[10px] leading-5 text-[#7e889d]"><div><Zap className="mr-2 inline h-3 w-3 text-[#10b981]"/>Compile + diagnostics <b className="text-[#10b981]">ACTIVE</b></div><div>• Run on active chart</div><div>• Syntax highlighting / autocomplete</div><div>• Inputs with instant hot reload</div><div>• Plot / line / box / zone controls</div><div>• Webhooks + event handlers</div><div>• Models / feature calls</div><div>• Multi-symbol / multi-timeframe requests</div><div>• Replay / backtest / live execution modes</div></div></Panel>
        <Panel title="RESET"><button onClick={() => { setSource(DEFAULT_SOURCE); setDiagnostics([]); setCompiled(false); }} className="premium-button w-full"><RotateCcw className="h-4 w-4"/> Reset starter script</button></Panel>
      </div>
    </main>
  </WorkspaceModuleShell>;
}
