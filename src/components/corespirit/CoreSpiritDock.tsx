import { useEffect, useRef, useState } from 'react';
import { Check, Clock3, Code2, PanelRightClose, Play, Save, UploadCloud, PencilLine } from 'lucide-react';
import { getSupabaseClient } from '../../services/auth/supabaseClient';
import { loadEditorScript } from '../../services/coreSpirit/cloudPersistence';
import { compileCoreSpiritSourceOffThread, type CoreSpiritOffThreadCompileResult } from '../../services/coreSpirit/coreSpiritCompilerClient';
import { publishUserIndicator, saveUserIndicatorDraft } from '../../services/coreSpirit/indicatorPublicationService';
import { versionedStorageKey } from '../../services/coreSpirit/storageSchema';

const LIVE_SOURCE_KEY = 'tradingcore:corespirit:chart-source';
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
type AuthoringLevel = 'beginner' | 'trader' | 'quant' | 'system';
type ScriptVersion = { id: string; version: number; source: string; compile_status: string; created_at: string };

function localSource(): string {
  try {
    return localStorage.getItem(versionedStorageKey('editor'))
      || localStorage.getItem('tradingcore:corespirit:editor')
      || localStorage.getItem(LIVE_SOURCE_KEY)
      || '';
  } catch { return ''; }
}
function persistLocalSource(source: string, name: string, scriptId?: string | null): void {
  try {
    localStorage.setItem(versionedStorageKey('editor'), source);
    localStorage.setItem('tradingcore:corespirit:editor', source);
    if (name.trim()) localStorage.setItem('tradingcore:corespirit:editor-name', name.trim());
    if (scriptId) localStorage.setItem(versionedStorageKey('editor-script-id'), scriptId);
    window.dispatchEvent(new CustomEvent('tco:corespirit:source-changed', { detail: { source, name: name.trim() } }));
  } catch { /* local persistence is best-effort; cloud persistence errors are surfaced separately */ }
}

export type CoreSpiritDockProps = {
  onClose: () => void;
  onAddToChart: (name: string, source: string) => Promise<void>;
};

export function CoreSpiritDock({ onClose, onAddToChart }: CoreSpiritDockProps) {
  const [source, setSource] = useState(() => localSource() || DEFAULT_SOURCE);
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('tradingcore:corespirit:editor-name') || 'CoreSpirit Trend'; }
    catch { return 'CoreSpirit Trend'; }
  });
  const [nameDraft, setNameDraft] = useState(name);
  const [level, setLevel] = useState<AuthoringLevel>('trader');
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [status, setStatus] = useState('Draft is local until saved.');
  const [busy, setBusy] = useState<'compile' | 'save' | 'rename' | 'publish' | 'add' | null>(null);
  const [compileResult, setCompileResult] = useState<CoreSpiritOffThreadCompileResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const sourceVersion = useRef(0);

  const compileSource = async (value: string) => {
    const result = await compileCoreSpiritSourceOffThread(value, ++sourceVersion.current, 'corespirit-live-dock', { layer: 'script' });
    setCompileResult(result);
    const errors = result.diagnostics.filter(item => item.severity === 'error');
    setDiagnostics(result.diagnostics.map(item => {
      const location = item.line == null ? '' : `L${item.line}${item.column == null ? '' : `:${item.column}`}: `;
      return `${location}${item.message}`;
    }).slice(0, 10));
    if (errors.length) throw new Error(errors[0]?.message || 'CoreSpirit compilation failed.');
    if (!result.artifact || !result.ir) throw new Error('CoreSpirit did not produce an executable artifact.');
    return result;
  };

  const refreshVersions = async (id: string, userId: string) => {
    const { data, error } = await getSupabaseClient()
      .from('corespirit_script_versions')
      .select('id,version,source,compile_status,created_at')
      .eq('script_id', id)
      .eq('user_id', userId)
      .order('version', { ascending: false })
      .limit(40);
    if (error) throw error;
    setVersions((data || []) as ScriptVersion[]);
    setSelectedVersion(data?.[0]?.id || '');
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const script = await loadEditorScript();
        if (!script || cancelled) return;
        setScriptId(script.id);
        setName(script.name || 'CoreSpirit Trend');
        setNameDraft(script.name || 'CoreSpirit Trend');
        // Keep the active local draft if one exists; otherwise hydrate the latest cloud source.
        if (!localSource()) {
          setSource(script.source || DEFAULT_SOURCE);
        }
        const user = await getSupabaseClient().auth.getUser();
        if (user.error || !user.data.user || cancelled) return;
        await refreshVersions(script.id, user.data.user.id);
        if (!cancelled) setStatus(`Loaded ${script.name || 'CoreSpirit Trend'} from your CoreSpirit library.`);
      } catch {
        if (!cancelled) setStatus('Local editor ready. Sign in and save to enable cloud versions.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    const cleanName = nameDraft.trim() || 'Untitled CoreSpirit Script';
    persistLocalSource(source, cleanName, scriptId);
    setBusy('save');
    try {
      const compiled = await compileSource(source);
      const { data: userData, error: userError } = await getSupabaseClient().auth.getUser();
      if (userError || !userData.user) {
        setStatus('Saved locally. Sign in to sync the script and version history to the cloud.');
        return;
      }
      const saved = await saveUserIndicatorDraft({
        scriptId,
        title: cleanName,
        description: 'CoreSpirit script saved from the live chart terminal.',
        source,
        compile: compiled,
        metadata: { language: 'corespirit', authoringLevel: level, origin: 'live-terminal' },
      });
      setScriptId(saved.script.id);
      setName(saved.script.name);
      setNameDraft(saved.script.name);
      persistLocalSource(source, saved.script.name, saved.script.id);
      await refreshVersions(saved.script.id, userData.user.id);
      setStatus(`Saved ${saved.script.name} · version v${saved.version.version}.`);
    } catch (error) {
      setStatus(`Local draft saved. Cloud save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const rename = async () => {
    const cleanName = nameDraft.trim();
    if (!cleanName) { setStatus('Enter a script name first.'); return; }
    setBusy('rename');
    try {
      if (scriptId) {
        const { data: userData, error: userError } = await getSupabaseClient().auth.getUser();
        if (userError || !userData.user) throw new Error('Sign in to rename a cloud script.');
        const { error } = await getSupabaseClient().from('corespirit_scripts')
          .update({ name: cleanName, updated_at: new Date().toISOString() })
          .eq('id', scriptId).eq('user_id', userData.user.id);
        if (error) throw error;
      }
      setName(cleanName);
      persistLocalSource(source, cleanName, scriptId);
      setStatus(scriptId ? `Renamed script to “${cleanName}”.` : `Renamed local draft to “${cleanName}”. Save it to create a versioned cloud script.`);
    } catch (error) {
      setStatus(`Rename failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    const cleanName = nameDraft.trim() || name || 'CoreSpirit Script';
    setBusy('publish');
    try {
      const compiled = await compileSource(source);
      const { data, error } = await getSupabaseClient().auth.getUser();
      const user = data.user;
      if (error || !user) throw new Error('Sign in to publish a CoreSpirit script.');
      const published = await publishUserIndicator({
        scriptId,
        title: cleanName,
        description: 'A CoreSpirit indicator published from the TradingCoreOS live terminal.',
        source,
        compile: compiled,
        category: 'CoreSpirit',
        tags: ['corespirit', 'custom'],
        profile: {
          name: String(user.user_metadata?.full_name || user.email || 'TradingCore Trader'),
          avatar: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
        },
        openSource: false,
        visibility: 'public',
        license: 'All Rights Reserved',
        scriptKind: /\bstrategy\b/i.test(source) ? 'strategy' : 'indicator',
      });
      setScriptId(published.script.id);
      setName(published.script.name);
      setNameDraft(published.script.name);
      persistLocalSource(source, published.script.name, published.script.id);
      await refreshVersions(published.script.id, user.id);
      setStatus(`Published ${published.script.name} to the CoreSpirit public catalog.`);
    } catch (error) {
      setStatus(`Publish failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const addToChart = async () => {
    const cleanName = nameDraft.trim() || name || 'CoreSpirit Script';
    setBusy('add');
    try {
      await compileSource(source);
      await onAddToChart(cleanName, source);
      setName(cleanName);
      persistLocalSource(source, cleanName, scriptId);
      setStatus(`Added “${cleanName}” to the active Vela chart.`);
    } catch (error) {
      setStatus(`Add to chart failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const selectVersion = (id: string) => {
    const version = versions.find(item => item.id === id);
    if (!version) return;
    setSource(version.source);
    sourceVersion.current += 1;
    setSelectedVersion(id);
    setDiagnostics([]);
    setCompileResult(null);
    setStatus(`Loaded version v${version.version}. Save to create a new version from this source.`);
  };

  const changeSource = (value: string) => {
    setSource(value);
    sourceVersion.current += 1;
    setSelectedVersion('');
    setCompileResult(null);
    setDiagnostics([]);
    persistLocalSource(value, nameDraft, scriptId);
  };

  const busyText = busy === 'compile' ? 'Compiling…' : busy === 'save' ? 'Saving…' : busy === 'rename' ? 'Renaming…' : busy === 'publish' ? 'Publishing…' : busy === 'add' ? 'Adding…' : '';

  return (
    <section className="absolute right-14 top-2 bottom-2 z-[125] flex w-[min(560px,calc(100vw-68px))] flex-col overflow-hidden rounded-xl border border-[#293244] bg-[#0b101a]/[0.98] text-slate-100 shadow-[0_28px_80px_rgba(0,0,0,.7)] backdrop-blur-2xl" aria-label="CoreSpirit coding terminal">
      <header className="flex items-center justify-between gap-3 border-b border-[#293244] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10">
            <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
              <defs><linearGradient id="corespirit-fire" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#ef4444"/><stop offset="1" stopColor="#fbbf24"/></linearGradient></defs>
              <path d="M16 2 C18 8 27 10 26 19 C25 26 20 30 14 29 C6 28 3 22 6 16 C8 12 12 10 12 5 C15 8 17 10 17 13 C20 10 18 6 16 2Z" fill="none" stroke="url(#corespirit-fire)" strokeWidth="2.2" strokeLinejoin="round"/>
              <path d="M16 10 L18 12 L21 12 L21 15 L23 17 L21 19 L21 22 L18 22 L16 24 L14 22 L11 22 L11 19 L9 17 L11 15 L11 12 L14 12Z" fill="#101827" stroke="#67e8f9" strokeWidth="1.3" strokeLinejoin="round"/>
              <circle cx="16" cy="17" r="3.2" fill="none" stroke="#a5f3fc" strokeWidth="1.4"/>
              <circle cx="16" cy="17" r="1" fill="#f8fafc"/>
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-black tracking-[.18em] text-slate-100">CORESPIRIT</div>
            <div className="mt-1 truncate text-[10px] text-slate-400">Script terminal · live chart engine</div>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close CoreSpirit terminal" title="Close terminal" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
          <PanelRightClose size={16}/>
        </button>
      </header>

      <div className="flex items-center gap-2 border-b border-[#293244] px-3 py-2">
        <label className="sr-only" htmlFor="corespirit-script-name">Script name</label>
        <input id="corespirit-script-name" value={nameDraft} onChange={event => setNameDraft(event.target.value)} className="min-w-0 flex-1 rounded-md border border-[#303b4f] bg-[#101827] px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-sky-500" aria-label="Script name"/>
        <button type="button" onClick={() => void rename()} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-md border border-[#303b4f] px-2.5 py-2 text-[10px] font-semibold hover:bg-white/5 disabled:opacity-50" title="Rename script"><PencilLine size={13}/> Rename</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-[#293244] px-3 py-2">
        <span className="text-[10px] text-slate-400">LEVEL</span>
        <select value={level} onChange={event => setLevel(event.target.value as AuthoringLevel)} className="rounded-md border border-[#303b4f] bg-[#101827] px-2 py-1.5 text-[10px] text-slate-200" aria-label="CoreSpirit authoring level">
          <option value="beginner">Beginner</option><option value="trader">Trader</option><option value="quant">Quant</option><option value="system">System</option>
        </select>
        <span className="ml-auto text-[10px] text-slate-500">{scriptId ? 'CLOUD VERSIONING' : 'LOCAL DRAFT'}</span>
        {versions.length > 0 && (
          <div className="flex items-center gap-1">
            <Clock3 size={13} className="text-slate-400"/>
            <select value={selectedVersion} onChange={event => selectVersion(event.target.value)} className="max-w-[180px] rounded-md border border-[#303b4f] bg-[#101827] px-2 py-1.5 text-[10px] text-slate-200" aria-label="Script version history">
              {versions.map(version => <option key={version.id} value={version.id}>v{version.version} · {new Date(version.created_at).toLocaleString()}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] text-slate-400"><Code2 size={13}/> CoreSpirit Script</div>
          <span className="text-[10px] text-slate-500">UTF-8 · {source.split('\n').length} lines</span>
        </div>
        <textarea value={source} onChange={event => changeSource(event.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label="CoreSpirit source editor" className="min-h-[200px] flex-1 resize-none rounded-lg border border-[#263249] bg-[#070b12] p-3 font-mono text-[12px] leading-[1.65] text-[#c6ddf8] outline-none focus:border-sky-500/70" />
      </div>

      {diagnostics.length > 0 && (
        <div className="mx-3 mb-2 max-h-24 overflow-auto rounded-lg border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-[10px] text-rose-200" role="status" aria-live="polite">
          {diagnostics.map((message, index) => <div key={index}>{message}</div>)}
        </div>
      )}
      <div className="mx-3 mb-2 truncate text-[10px] text-slate-400" role="status" aria-live="polite">{busyText || status}</div>
      <footer className="flex flex-wrap gap-2 border-t border-[#293244] p-3">
        <button type="button" onClick={() => { setBusy('compile'); void compileSource(source).then(() => setStatus('Compilation passed.')).catch(error => setStatus(error instanceof Error ? error.message : String(error))).finally(() => setBusy(null)); }} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md border border-[#303b4f] px-3 py-2 text-[10px] font-semibold hover:bg-white/5 disabled:opacity-50"><Play size={13}/> Compile</button>
        <button type="button" onClick={() => void save()} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md border border-[#303b4f] px-3 py-2 text-[10px] font-semibold hover:bg-white/5 disabled:opacity-50"><Save size={13}/> Save</button>
        <button type="button" onClick={() => void publish()} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md border border-[#303b4f] px-3 py-2 text-[10px] font-semibold hover:bg-white/5 disabled:opacity-50"><UploadCloud size={13}/> Publish</button>
        <button type="button" onClick={() => void addToChart()} disabled={busy !== null} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-2 text-[10px] font-bold text-black hover:bg-orange-400 disabled:opacity-50"><Check size={13}/> Add to chart</button>
      </footer>
    </section>
  );
}
