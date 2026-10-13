import { useCallback, useEffect, useRef, useState } from 'react';
import { Code2, Play, Check, X, LoaderCircle, Save, AlertTriangle } from 'lucide-react';
import { CoreSpiritEditorModel } from '../../services/coreSpirit/editorModel';
import { mountCoreSpiritMonaco, type CoreSpiritMonacoAdapter } from '../../services/coreSpirit/monacoAdapter';
import { compileCoreSpiritSourceOffThread } from '../../services/coreSpirit/coreSpiritCompilerClient';

const STORAGE_KEY = 'tradingcore:corespirit:chart-source';
const STARTER = `indicator("CoreSpirit Trend") {
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

type Props = {
  onClose: () => void;
  getActiveChart: () => any;
  getMarket: () => { symbol: string; timeframe: string };
};

export function CoreSpiritLiveEditor({ onClose, getActiveChart, getMarket }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const adapter = useRef<CoreSpiritMonacoAdapter | null>(null);
  const model = useRef<CoreSpiritEditorModel | null>(null);
  const sourceVersion = useRef(0);
  const [source, setSource] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || STARTER; } catch { return STARTER; }
  });
  const [monacoReady, setMonacoReady] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Array<{ severity?: string; message: string; line?: number; column?: number }>>([]);
  const [market, setMarket] = useState(() => getMarket());

  useEffect(() => {
    setMarket(getMarket());
  }, [getMarket]);

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    const editorModel = new CoreSpiritEditorModel(source);
    model.current = editorModel;
    void mountCoreSpiritMonaco(host.current, editorModel, (next) => {
      editorModel.updateSource(next);
      setSource(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      setStatus('Unsaved changes');
    }).then((mounted) => {
      if (disposed) { mounted.dispose(); return; }
      adapter.current = mounted;
      setMonacoReady(true);
    }).catch((error: unknown) => {
      if (!disposed) setStatus(error instanceof Error ? `Editor fallback: ${error.message}` : 'Editor fallback');
    });
    return () => {
      disposed = true;
      adapter.current?.dispose();
      adapter.current = null;
      model.current = null;
      setMonacoReady(false);
    };
  // The editor is mounted once for this dialog instance; source changes flow through onChange.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, source); setStatus('Saved to this browser'); }
    catch { setStatus('Could not save source locally'); }
  }, [source]);

  const compile = useCallback(async () => {
    setBusy(true);
    setStatus('Compiling in worker…');
    try {
      const result = await compileCoreSpiritSourceOffThread(source, ++sourceVersion.current, 'corespirit-live');
      const rows = (result.diagnostics ?? []) as Array<{ severity?: string; message: string; line?: number; column?: number }>;
      setDiagnostics(rows);
      adapter.current?.setDiagnostics(result.diagnostics ?? [], source);
      adapter.current?.setSymbolInfo(result.symbols ?? []);
      const errors = rows.filter((d) => d.severity === 'error');
      setStatus(errors.length ? `Compile failed · ${errors.length} error(s)` : `Compiled · ${result.symbols?.length ?? 0} symbols`);
      return errors.length === 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDiagnostics([{ severity: 'error', message }]);
      setStatus('Compile failed');
      return false;
    } finally {
      setBusy(false);
    }
  }, [source]);

  const run = useCallback(async () => {
    if (!(await compile())) return;
    setBusy(true);
    setStatus('Adding script to active chart…');
    try {
      const chart = getActiveChart();
      if (!chart) throw new Error('The active Vela chart is not ready yet.');
      save();
      const result = await chart.runIndicator(source, { language: 'corespirit' });
      if (!result?.ok) throw new Error(result?.error || 'CoreSpirit runtime rejected the script.');
      setStatus(`Running on chart · ${result.handle?.title || 'CoreSpirit indicator'}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [compile, getActiveChart, save, source]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void run(); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [onClose, run]);

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="flex h-[min(84vh,900px)] w-[min(1180px,96vw)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-[#303744] bg-[#101319] text-[#e6eaf2] shadow-[0_30px_100px_rgba(0,0,0,.65)]">
        <header className="flex items-center gap-3 border-b border-[#272d38] px-4 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-violet-400/25 bg-violet-400/10 text-violet-300"><Code2 size={18}/></div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold tracking-wide">CoreSpirit Studio</div>
            <div className="mt-0.5 truncate text-[11px] text-[#8993a5]">{market.symbol} · {market.timeframe} · Compile, inspect and run on the active Vela chart</div>
          </div>
          <span className="hidden rounded-md border border-[#303744] px-2 py-1 text-[10px] text-[#a4adbd] md:inline">Ctrl/⌘ + Enter to run</span>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-[#9ca6b8] hover:bg-[#242a35] hover:text-white" aria-label="Close CoreSpirit Studio"><X size={17}/></button>
        </header>
        <div className="flex items-center gap-2 border-b border-[#272d38] bg-[#151920] px-3 py-2">
          <span className="mr-auto text-[10px] font-semibold uppercase tracking-[.16em] text-[#8993a5]">CoreScript · progressive trading language</span>
          <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-md border border-[#333b49] px-3 py-1.5 text-xs text-[#c2cada] hover:bg-[#252b36] disabled:opacity-50"><Save size={13}/>Save</button>
          <button type="button" disabled={busy} onClick={() => void compile()} className="inline-flex items-center gap-1.5 rounded-md border border-[#333b49] px-3 py-1.5 text-xs text-[#c2cada] hover:bg-[#252b36] disabled:opacity-50">{busy ? <LoaderCircle size={13} className="animate-spin"/> : <Check size={13}/>}Compile</button>
          <button type="button" disabled={busy} onClick={() => void run()} className="inline-flex items-center gap-1.5 rounded-md bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-50">{busy ? <LoaderCircle size={13} className="animate-spin"/> : <Play size={13}/>}Run on chart</button>
        </div>
        <div className="relative min-h-0 flex-1 bg-[#0c0f14]">
          <div ref={host} className={`absolute inset-0 ${monacoReady ? '' : 'invisible'}`} />
          {!monacoReady && (
            <textarea aria-label="CoreSpirit source editor" value={source} onChange={(event) => { const next = event.target.value; setSource(next); model.current?.updateSource(next); try { localStorage.setItem(STORAGE_KEY, next); } catch {} }} spellCheck={false} className="absolute inset-0 h-full w-full resize-none bg-[#0c0f14] p-5 font-mono text-[13px] leading-6 text-[#d9e2f2] outline-none" />
          )}
        </div>
        <footer className="flex min-h-10 items-center gap-2 border-t border-[#272d38] bg-[#151920] px-4 py-2">
          {diagnostics.some((item) => item.severity === 'error') ? <AlertTriangle size={14} className="shrink-0 text-rose-400"/> : <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400"/>}
          <span className="min-w-0 flex-1 truncate text-[11px] text-[#b4bdcc]">{status}</span>
          <span className="text-[10px] text-[#687386]">{diagnostics.length ? `${diagnostics.length} diagnostic(s)` : 'No diagnostics'}</span>
        </footer>
        {diagnostics.length > 0 && (
          <div className="max-h-28 overflow-auto border-t border-[#272d38] bg-[#0d1016] px-4 py-2">
            {diagnostics.map((item, index) => <div key={index} className={`flex gap-2 py-0.5 font-mono text-[10px] ${item.severity === 'error' ? 'text-rose-300' : item.severity === 'warning' ? 'text-amber-300' : 'text-[#9aa5b8]'}`}><span className="w-16 shrink-0">{item.severity || 'info'}{item.line ? ` · ${item.line}:${item.column || 1}` : ''}</span><span>{item.message}</span></div>)}
          </div>
        )}
      </section>
    </div>
  );
}
