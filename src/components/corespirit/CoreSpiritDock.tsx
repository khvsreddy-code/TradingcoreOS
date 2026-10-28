import { useEffect, useRef, useState } from 'react';
import { Check, Clock3, Code2, Maximize2, Minimize2, Minus, Plus, X, Play, Save, UploadCloud, PencilLine } from 'lucide-react';
import { getSupabaseClient } from '../../services/auth/supabaseClient';
import { loadEditorScript } from '../../services/coreSpirit/cloudPersistence';
import { compileCoreSpiritSourceOffThread, type CoreSpiritOffThreadCompileResult } from '../../services/coreSpirit/coreSpiritCompilerClient';
import { publishUserIndicator, saveUserIndicatorDraft } from '../../services/coreSpirit/indicatorPublicationService';
import { versionedStorageKey } from '../../services/coreSpirit/storageSchema';
import { CORESPIRIT_LUXALGO_SMC_SOURCE } from '../../services/coreSpirit/luxAlgoSmcCoreSource';
import { validateExecutableArtifact, type CoreSpiritExecutableArtifact } from '../../services/coreSpirit/artifact';
import {
  CORE_SPIRIT_LIFECYCLE_STEPS, coreSpiritLifecycleDiagnostic, coreSpiritLifecycleLabel, coreSpiritLifecycleStageForError,
  publishCoreSpiritLifecycle, validateCoreSpiritChartCapabilities,
  type CoreSpiritChartManagedField, type CoreSpiritChartManagedIndicator, type CoreSpiritChartManagerBridge,
  type CoreSpiritLifecycleDiagnostic, type CoreSpiritLifecycleStage, type CoreSpiritChartManagedValue,
} from '../../services/coreSpirit/coreSpiritExecutionLifecycle';

const LIVE_SOURCE_KEY = 'tradingcore:corespirit:chart-source';
const DEFAULT_SOURCE = CORESPIRIT_LUXALGO_SMC_SOURCE;
const DEFAULT_SCRIPT_NAME = 'Smart Money Concepts [CoreSpirit]';
type AuthoringLevel = 'beginner' | 'trader' | 'quant' | 'system';
type ScriptVersion = { id: string; version: number; source: string; compile_status: string; created_at: string };

function isLegacyTrendStarter(source: string): boolean {
  return source.includes('indicator("CoreSpirit Trend")')
    && source.includes('fast = ema(close, length)')
    && source.includes('slow = ema(close, length * 2)')
    && source.includes('plot fast')
    && source.includes('plot slow')
    && source.includes('signal "BUY"')
    && source.includes('signal "SELL"');
}
function isLegacySmcStarter(source: string): boolean {
  // Only migrate the bundled early SMC port; preserve custom user scripts.
  return source.includes('indicator("Smart Money Concepts [CoreSpirit]")')
    && source.includes('plot(swingHigh, "#F23645", 1, 0, "Swing High")')
    && source.includes('plot(swingLow, "#089981", 1, 0, "Swing Low")')
    && source.includes('zone(time[2], time, low, high[2]')
    && source.split('\n').length <= 110;
}
function isBundledLegacyStarter(source: string): boolean {
  return isLegacyTrendStarter(source) || isLegacySmcStarter(source);
}
function localSource(): string {
  try {
    const saved = localStorage.getItem(versionedStorageKey('editor'))
      || localStorage.getItem('tradingcore:corespirit:editor')
      || localStorage.getItem(LIVE_SOURCE_KEY)
      || '';
    // Migrate only known bundled starter versions, not custom user scripts.
    return saved && !isBundledLegacyStarter(saved) ? saved : '';
  } catch { return ''; }
}
type CoreSpiritChartManagerWindow = Window & { __TCO_CORESPIRIT_CHART_MANAGER__?: CoreSpiritChartManagerBridge };

function chartManagerFromWindow(): CoreSpiritChartManagerBridge | undefined {
  return typeof window === 'undefined' ? undefined : (window as CoreSpiritChartManagerWindow).__TCO_CORESPIRIT_CHART_MANAGER__;
}

function displayManagerValue(value: CoreSpiritChartManagedValue): string {
  return typeof value === 'boolean' ? (value ? 'On' : 'Off') : String(value);
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
  /** The host must validate the exact-source identity again before execution. */
  onAddToChart: (name: string, source: string, artifact: CoreSpiritExecutableArtifact, scriptId?: string | null) => Promise<void>;
  /** Render inside Vela's docked side-panel instead of a floating overlay. */
  embedded?: boolean;
  /** Updates Vela's own panel maximization state. */
  onFullscreenChange?: (fullscreen: boolean) => void;
};

export function CoreSpiritDock({ onClose, onAddToChart, embedded = false, onFullscreenChange }: CoreSpiritDockProps) {
  const [source, setSource] = useState(() => localSource() || DEFAULT_SOURCE);
  const [name, setName] = useState(() => {
    try {
      const savedName = localStorage.getItem('tradingcore:corespirit:editor-name') || '';
      const savedSource = localStorage.getItem(versionedStorageKey('editor'))
        || localStorage.getItem('tradingcore:corespirit:editor')
        || localStorage.getItem(LIVE_SOURCE_KEY)
        || '';
      return savedName && !(savedName === 'CoreSpirit Trend' && isLegacyTrendStarter(savedSource))
        ? savedName : DEFAULT_SCRIPT_NAME;
    } catch { return DEFAULT_SCRIPT_NAME; }
  });
  const [nameDraft, setNameDraft] = useState(name);
  const [level, setLevel] = useState<AuthoringLevel>('trader');
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [status, setStatus] = useState('Draft is local until saved.');
  const [busy, setBusy] = useState<'compile' | 'save' | 'rename' | 'publish' | 'add' | null>(null);
  const [compileResult, setCompileResult] = useState<CoreSpiritOffThreadCompileResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [lifecycleStage, setLifecycleStage] = useState<CoreSpiritLifecycleStage>('editing');
  const [lifecycleDiagnostics, setLifecycleDiagnostics] = useState<CoreSpiritLifecycleDiagnostic[]>([]);
  const [chartIndicators, setChartIndicators] = useState<readonly CoreSpiritChartManagedIndicator[]>([]);
  const [chartManagerOpen, setChartManagerOpen] = useState(true);
  const [managerError, setManagerError] = useState('');
  const sourceVersion = useRef(0);

  const reportStage = (stage: CoreSpiritLifecycleStage, message?: string, extra: Partial<CoreSpiritLifecycleDiagnostic> = {}) => {
    setLifecycleStage(stage);
    if (message) setStatus(message);
    publishCoreSpiritLifecycle({
      stage, scriptId, scriptName: nameDraft.trim() || name,
      sourceHash: compileResult?.artifact?.abi?.sourceHash,
      artifactHash: compileResult?.artifact?.abi?.artifactHash,
      diagnostics: extra.code ? [{ severity: extra.severity || 'error', stage, code: extra.code, message: extra.message || message || coreSpiritLifecycleLabel(stage), ...extra }] : undefined,
      previousOutputPreserved: extra.previousOutputPreserved,
      message: message || coreSpiritLifecycleLabel(stage),
    });
  };

  useEffect(() => {
    const onLifecycle = (event: Event) => {
      const detail = (event as CustomEvent<{ stage?: CoreSpiritLifecycleStage; scriptId?: string | null; scriptName?: string; message?: string; diagnostics?: CoreSpiritLifecycleDiagnostic[] }>).detail;
      if (!detail?.stage) return;
      const matches = (detail.scriptId && scriptId && detail.scriptId === scriptId) ||
        (detail.scriptName && detail.scriptName === (nameDraft.trim() || name));
      if (!matches) return;
      setLifecycleStage(detail.stage);
      if (detail.message) setStatus(detail.message);
      if (detail.diagnostics?.length) {
        setLifecycleDiagnostics(detail.diagnostics);
        setDiagnostics(detail.diagnostics.map(item =>
          (item.code ? '[' + item.code + '] ' : '') +
          (item.line == null ? '' : 'Line ' + item.line + (item.column == null ? '' : ':' + item.column) + ': ') +
          item.message,
        ).slice(0, 10));
      }
    };
    window.addEventListener('tco:corespirit:lifecycle', onLifecycle);
    return () => window.removeEventListener('tco:corespirit:lifecycle', onLifecycle);
  }, [scriptId, name, nameDraft]);

  const compileSource = async (value: string) => {
    const requestedVersion = ++sourceVersion.current;
    reportStage('compiling', 'Compiling the current source revision…');
    const initial = await compileCoreSpiritSourceOffThread(value, requestedVersion, 'corespirit-live-dock', { layer: 'script' });
    // The textarea remains editable while workers run. Never publish diagnostics
    // or apply an artifact from a compile whose source was superseded in the editor.
    if (requestedVersion !== sourceVersion.current) {
      const error = new Error('The source changed while CoreSpirit was compiling. Compile the latest source before applying it to the chart.');
      reportStage('stale', error.message);
      throw error;
    }
    if (initial.sourceVersion !== requestedVersion) {
      const error = new Error('CoreSpirit compiler returned a result for a different source revision.');
      reportStage('compile-failed', error.message, { code: 'CORESPIRIT_SOURCE_VERSION_MISMATCH' });
      throw error;
    }
    reportStage('validating-capabilities', 'Validating the compiled artifact and chart capabilities…');
    const policyDiagnostics = validateCoreSpiritChartCapabilities(initial.ir);
    const result: CoreSpiritOffThreadCompileResult = {
      ...initial,
      diagnostics: [...(initial.diagnostics || []), ...policyDiagnostics],
    };
    setCompileResult(result);
    const errors = result.diagnostics.filter(item => item.severity === 'error');
    setDiagnostics(result.diagnostics.map(item => {
      const location = item.line == null ? '' : 'L' + item.line + (item.column == null ? '' : ':' + item.column) + ': ';
      return (item.code ? '[' + item.code + '] ' : '') + location + item.message;
    }).slice(0, 10));
    setLifecycleDiagnostics(result.diagnostics.map(item => ({
      severity: item.severity === 'warning' ? 'warning' as const : item.severity === 'info' ? 'info' as const : 'error' as const,
      stage: item.code === 'CHART_CAPABILITY_DENIED' || item.code === 'CHART_SANDBOX_ARCHITECTURE' ? 'capability-denied' as const : errors.length ? 'compile-failed' as const : 'compiled' as const,
      code: item.code || 'CORESPIRIT_COMPILE_DIAGNOSTIC', message: item.message,
      ...(item.line == null ? {} : { line: item.line }), ...(item.column == null ? {} : { column: item.column }),
      previousOutputPreserved: true,
    })).slice(0, 10));
    if (errors.length) {
      const capabilityDenied = errors.some(item => item.code === 'CHART_CAPABILITY_DENIED' || item.code === 'CHART_SANDBOX_ARCHITECTURE');
      const stage: CoreSpiritLifecycleStage = capabilityDenied ? 'capability-denied' : 'compile-failed';
      reportStage(stage, errors[0]?.message || 'CoreSpirit compilation failed.', { code: errors[0]?.code || (capabilityDenied ? 'CHART_CAPABILITY_DENIED' : 'CORESPIRIT_COMPILE_FAILED'), previousOutputPreserved: true });
      throw new Error(errors[0]?.message || 'CoreSpirit compilation failed.');
    }
    if (!result.artifact || !result.ir || !validateExecutableArtifact(result.artifact)) {
      const error = new Error('CoreSpirit did not produce a valid executable artifact.');
      reportStage('compile-failed', error.message, { code: 'CORESPIRIT_ARTIFACT_VALIDATION_FAILED', previousOutputPreserved: true });
      throw error;
    }
    reportStage('compiled', 'Compiled · chart capabilities validated · artifact identity verified.');
    return result;
  };

  useEffect(() => {
    const refreshChartManager = () => {
      try {
        setChartIndicators(chartManagerFromWindow()?.list() ?? []);
        setManagerError('');
      } catch (error) {
        setManagerError(error instanceof Error ? error.message : String(error));
      }
    };
    refreshChartManager();
    window.addEventListener('tco:corespirit:chart-manager-changed', refreshChartManager);
    window.addEventListener('tco:corespirit:lifecycle', refreshChartManager);
    return () => {
      window.removeEventListener('tco:corespirit:chart-manager-changed', refreshChartManager);
      window.removeEventListener('tco:corespirit:lifecycle', refreshChartManager);
    };
  }, []);

  const updateManagedField = (instance: CoreSpiritChartManagedIndicator, field: CoreSpiritChartManagedField, value: CoreSpiritChartManagedValue, prop = false) => {
    const manager = chartManagerFromWindow();
    if (!manager) { setManagerError('The active Vela chart manager is not available.'); return; }
    const ok = prop ? manager.setProp(instance.id, field.key, value) : manager.setInput(instance.id, field.key, value);
    if (!ok) { setManagerError('Could not update ' + field.title + '. The indicator may have been removed or its input schema changed.'); return; }
    setStatus('Input accepted · executing ' + instance.name + ' against current chart history…');
    setLifecycleStage('executing-historical');
    window.dispatchEvent(new CustomEvent('tco:corespirit:chart-manager-changed'));
  };

  const loadManagedSource = (instance: CoreSpiritChartManagedIndicator) => {
    setSource(instance.source);
    sourceVersion.current += 1;
    setName(instance.name);
    setNameDraft(instance.name);
    // Vela's instance ID is not the user's cloud script ID. Keep this as a local
    // working copy so Save cannot accidentally overwrite a different cloud script.
    setScriptId(null);
    setCompileResult(null);
    setDiagnostics([]);
    setLifecycleDiagnostics([]);
    setSelectedVersion('');
    reportStage('editing', 'Loaded the running chart source into a local working copy. The chart keeps running this version until Compile & Run succeeds.');
    persistLocalSource(instance.source, instance.name, null);
  };

  const toggleManagedVisibility = (instance: CoreSpiritChartManagedIndicator) => {
    const ok = chartManagerFromWindow()?.setVisible(instance.id, !instance.visible);
    if (!ok) { setManagerError('Could not change visibility. Refresh the chart manager and retry.'); return; }
    setChartIndicators(chartManagerFromWindow()?.list() ?? []);
  };

  const removeManagedInstance = (instance: CoreSpiritChartManagedIndicator) => {
    if (!window.confirm('Remove ' + instance.name + ' from the active Vela chart? This does not delete its saved source.')) return;
    const ok = chartManagerFromWindow()?.remove(instance.id);
    if (!ok) { setManagerError('Could not remove ' + instance.name + '. It may already have been removed.'); return; }
    setChartIndicators(chartManagerFromWindow()?.list() ?? []);
    setStatus('Removed ' + instance.name + ' from the active chart. Saved source remains available.');
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
        const cloudSource = script.source || DEFAULT_SOURCE;
        const migrateCloudStarter = isBundledLegacyStarter(cloudSource);
        const cloudName = migrateCloudStarter ? DEFAULT_SCRIPT_NAME : (script.name || DEFAULT_SCRIPT_NAME);
        setName(cloudName);
        setNameDraft(cloudName);
        // Keep a custom local draft if one exists. Migrate only the known generated
        // trend-cross sample; never replace another locally authored script.
        if (!localSource()) {
          const hydratedSource = migrateCloudStarter ? DEFAULT_SOURCE : cloudSource;
          setSource(hydratedSource);
          if (migrateCloudStarter) persistLocalSource(hydratedSource, DEFAULT_SCRIPT_NAME, script.id);
        }
        const user = await getSupabaseClient().auth.getUser();
        if (user.error || !user.data.user || cancelled) return;
        await refreshVersions(script.id, user.data.user.id);
        if (!cancelled) setStatus(migrateCloudStarter
          ? 'Migrated the generated starter to Smart Money Concepts [CoreSpirit]. Compile it, then Add to Chart.'
          : `Loaded ${cloudName} from your CoreSpirit library.`);
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
      const scriptKind = /\bstrategy\b/i.test(source) ? 'strategy' : 'indicator';
      const published = await publishUserIndicator({
        scriptId,
        title: cleanName,
        description: 'A CoreSpirit script published from the TradingCoreOS live terminal. Verify its documented semantics and chart visuals before relying on trading signals.',
        source,
        compile: compiled,
        category: scriptKind === 'strategy' ? 'CoreSpirit Strategies' : 'CoreSpirit Indicators',
        tags: ['corespirit', 'custom'],
        profile: {
          name: String(user.user_metadata?.full_name || user.email || 'TradingCore Trader'),
          avatar: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
        },
        openSource: false,
        visibility: 'public',
        license: 'All Rights Reserved',
        scriptKind,
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
      const compiled = await compileSource(source);
      const artifact = compiled.artifact;
      if (!artifact) throw new Error('CoreSpirit compiled without an executable artifact.');
      await onAddToChart(cleanName, source, artifact, scriptId);
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
    setLifecycleDiagnostics([]);
    reportStage('editing', 'Unsaved source edits · the active chart continues running its last valid version.');
    persistLocalSource(value, nameDraft, scriptId);
  };

  const busyText = busy === 'compile' ? 'Compiling…' : busy === 'save' ? 'Saving…' : busy === 'rename' ? 'Renaming…' : busy === 'publish' ? 'Publishing…' : busy === 'add' ? 'Adding…' : '';

  const closeTerminal = () => {
    if (fullscreen) {
      setFullscreen(false);
      onFullscreenChange?.(false);
    }
    onClose();
  };
  const toggleFullscreen = () => {
    const next = !fullscreen;
    setFullscreen(next);
    onFullscreenChange?.(next);
  };

  return (
    <section className={embedded
      ? "flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#0b101a] text-slate-100"
      : "absolute right-14 top-2 bottom-2 z-[125] flex w-[min(560px,calc(100vw-68px))] flex-col overflow-hidden rounded-xl border border-[#293244] bg-[#0b101a]/[0.98] text-slate-100 shadow-[0_28px_80px_rgba(0,0,0,.7)] backdrop-blur-2xl"} aria-label="CoreSpirit coding terminal">
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
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setMinimized(value => !value)} aria-label={minimized ? "Restore CoreSpirit editor" : "Minimize CoreSpirit editor"} title={minimized ? "Restore editor" : "Minimize editor"} className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
            {minimized ? <Plus size={15}/> : <Minus size={15}/>}
          </button>
          <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Restore CoreSpirit panel size" : "Fullscreen CoreSpirit editor"} title={fullscreen ? "Restore" : "Fullscreen"} className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
            {fullscreen ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}
          </button>
          <button type="button" onClick={closeTerminal} aria-label="Close CoreSpirit terminal" title="Close terminal" className="rounded-md p-2 text-slate-400 hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
            <X size={16}/>
          </button>
        </div>
      </header>

      {!minimized && (<>
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

      <div className="mx-3 mb-2 rounded-lg border border-[#263249] bg-[#0a101a] px-3 py-2" aria-label="CoreSpirit execution lifecycle">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Execution pipeline</span>
          <span className="text-[9px] text-slate-300">{coreSpiritLifecycleLabel(lifecycleStage)}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {CORE_SPIRIT_LIFECYCLE_STEPS.map((stage, index) => {
            const currentIndex = CORE_SPIRIT_LIFECYCLE_STEPS.indexOf(lifecycleStage);
            const terminalError = ['compile-failed','capability-denied','execution-failed','output-rejected','rendering-failed'].includes(lifecycleStage);
            const active = stage === lifecycleStage;
            const complete = currentIndex >= 0 && index < currentIndex || lifecycleStage === 'rendered';
            return <span key={stage} className={'rounded border px-1.5 py-1 text-[8px] ' + (active ? (terminalError ? 'border-rose-500/50 text-rose-200' : 'border-sky-400/50 text-sky-200') : complete ? 'border-emerald-500/30 text-emerald-200' : 'border-[#293244] text-slate-600')}>{coreSpiritLifecycleLabel(stage)}</span>;
          })}
        </div>
      </div>
      {lifecycleDiagnostics.length > 0 && (
        <div className="mx-3 mb-2 max-h-28 overflow-auto rounded-lg border border-rose-900/70 bg-rose-950/30 px-3 py-2" role="log" aria-label="CoreSpirit structured diagnostics" aria-live="polite">
          {lifecycleDiagnostics.map((item, index) => <div key={item.code + ':' + index} className="mb-2 last:mb-0">
            <div className="font-mono text-[9px] text-rose-200">[{item.code}] {item.line == null ? '' : 'Line ' + item.line + (item.column == null ? '' : ':' + item.column) + ' · '}{item.outputId ? 'Output ' + item.outputId + ' · ' : ''}{item.message}</div>
            {item.suggestedCorrection && <div className="mt-1 text-[9px] text-slate-300">Suggested correction: {item.suggestedCorrection}</div>}
            {item.previousOutputPreserved != null && <div className="mt-1 text-[8px] text-slate-500">Previous chart state {item.previousOutputPreserved ? 'preserved' : 'not preserved'}.</div>}
          </div>)}
        </div>
      )}
      {diagnostics.length > 0 && (
        <div className="mx-3 mb-2 max-h-20 overflow-auto rounded-lg border border-[#263249] bg-[#090d14] px-3 py-2 text-[10px] text-slate-300" role="status" aria-live="polite">
          {diagnostics.map((message, index) => <div key={index}>{message}</div>)}
        </div>
      )}
      <div className="mx-3 mb-2 truncate text-[10px] text-slate-400" role="status" aria-live="polite">{busyText || status}</div>
      <div className="mx-3 mb-2 rounded-lg border border-[#263249] bg-[#0a1018]">
        <button type="button" onClick={() => { setChartManagerOpen(value => !value); setChartIndicators(chartManagerFromWindow()?.list() ?? []); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wider text-slate-300" aria-expanded={chartManagerOpen}>
          <span>Chart-side indicator manager · {chartIndicators.length}</span><span>{chartManagerOpen ? '−' : '+'}</span>
        </button>
        {chartManagerOpen && <div className="max-h-64 space-y-2 overflow-auto px-3 pb-3">
          {managerError && <div className="text-[9px] text-rose-300">{managerError}</div>}
          {chartIndicators.length === 0 && <div className="py-2 text-[9px] text-slate-500">No CoreSpirit scripts are attached to the active Vela chart.</div>}
          {chartIndicators.map(instance => {
            const editorDiffers = instance.name === (nameDraft.trim() || name) && instance.source !== source;
            const renderField = (field: CoreSpiritChartManagedField, prop: boolean) => {
              const value = field.value;
              const controlClass = 'min-w-0 rounded border border-[#29364a] bg-[#070b12] px-2 py-1 text-[9px] text-slate-200';
              const onValue = (raw: string | boolean) => {
                let next: CoreSpiritChartManagedValue;
                if (typeof raw === 'boolean') next = raw;
                else if (field.type === 'int' || field.type === 'float' || field.type === 'price' || field.type === 'time') {
                  if (!raw.trim()) { setManagerError(field.title + ' requires a numeric value.'); return; }
                  const numeric = Number(raw);
                  if (!Number.isFinite(numeric)) { setManagerError(field.title + ' must be finite.'); return; }
                  if (field.type === 'int' && !Number.isInteger(numeric)) { setManagerError(field.title + ' must be a whole number.'); return; }
                  if (field.min != null && numeric < field.min) { setManagerError(field.title + ' must be at least ' + field.min + '.'); return; }
                  if (field.max != null && numeric > field.max) { setManagerError(field.title + ' must be no greater than ' + field.max + '.'); return; }
                  next = numeric;
                } else next = raw;
                setManagerError('');
                updateManagedField(instance, field, next, prop);
              };
              if (field.type === 'bool') return <label key={field.key} className="flex items-center gap-2 text-[9px] text-slate-300"><input type="checkbox" checked={Boolean(value)} onChange={event => onValue(event.target.checked)}/>{field.title}</label>;
              if (field.options?.length) return <label key={field.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-[9px] text-slate-300"><span>{field.title}</span><select className={controlClass} value={String(value)} onChange={event => onValue(event.target.value)}>{field.options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>;
              if (field.type === 'int' || field.type === 'float' || field.type === 'price' || field.type === 'time') return <label key={field.key + ':' + displayManagerValue(value)} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-[9px] text-slate-300"><span>{field.title}</span><input className={controlClass} type="number" defaultValue={Number(value)} min={field.min} max={field.max} step={field.step ?? (field.type === 'int' ? 1 : 'any')} onBlur={event => { if (event.currentTarget.value !== String(value)) onValue(event.currentTarget.value); }}/></label>;
              return <label key={field.key + ':' + displayManagerValue(value)} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-[9px] text-slate-300"><span>{field.title}</span><input className={controlClass} type={field.type === 'color' ? 'color' : 'text'} defaultValue={String(value)} onBlur={event => { if (event.currentTarget.value !== String(value)) onValue(event.currentTarget.value); }}/></label>;
            };
            return <div key={instance.id} className="rounded-md border border-[#263249] bg-[#0c121d] p-2">
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => loadManagedSource(instance)} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[10px] font-semibold text-slate-100">{instance.name}</span>
                  <span className="mt-0.5 block text-[8px] text-slate-500">{editorDiffers ? 'Editor differs · chart still runs this saved source' : 'Editor matches running source'}</span>
                </button>
                <button type="button" onClick={() => toggleManagedVisibility(instance)} className="rounded border border-[#29364a] px-2 py-1 text-[8px] text-slate-300">{instance.visible ? 'Hide' : 'Show'}</button>
                <button type="button" onClick={() => removeManagedInstance(instance)} className="rounded border border-rose-900/60 px-2 py-1 text-[8px] text-rose-200">Remove</button>
              </div>
              <div className="mt-2 space-y-1">
                {instance.inputs.length > 0 && <details><summary className="cursor-pointer text-[8px] uppercase tracking-wider text-slate-500">Inputs · {instance.inputs.length}</summary><div className="mt-2 space-y-2">{instance.inputs.map(field => renderField(field, false))}</div></details>}
                {instance.props.length > 0 && <details><summary className="cursor-pointer text-[8px] uppercase tracking-wider text-slate-500">Appearance · {instance.props.length}</summary><div className="mt-2 space-y-2">{instance.props.map(field => renderField(field, true))}</div></details>}
              </div>
            </div>;
          })}
        </div>}
      </div>
      <footer className="flex flex-wrap gap-2 border-t border-[#293244] p-3">
        <button type="button" onClick={() => { const cleanName = nameDraft.trim() || name || 'CoreSpirit Script'; setBusy('compile'); reportStage('compiling', 'Compiling CoreSpirit and preparing chart output…'); void compileSource(source).then(async compiled => { const artifact = compiled.artifact; if (!artifact) throw new Error('CoreSpirit compiled without an executable artifact.'); reportStage('applying-chart-output', 'Submitting the validated artifact to the active Vela chart…'); await onAddToChart(cleanName, source, artifact, scriptId); setName(cleanName); persistLocalSource(source, cleanName, scriptId); reportStage('rendered', 'Rendered · “' + cleanName + '” is running on the active Vela chart.'); }).catch(error => { const stage = coreSpiritLifecycleStageForError(error, lifecycleStage); const diagnostic = coreSpiritLifecycleDiagnostic(error, stage, { previousOutputPreserved: true }); setLifecycleDiagnostics([diagnostic]); reportStage(stage, diagnostic.message, diagnostic); }).finally(() => setBusy(null)); }} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md border border-[#303b4f] px-3 py-2 text-[10px] font-semibold hover:bg-white/5 disabled:opacity-50"><Play size={13}/> Compile & Run</button>
        <button type="button" onClick={() => void save()} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md border border-[#303b4f] px-3 py-2 text-[10px] font-semibold hover:bg-white/5 disabled:opacity-50"><Save size={13}/> Save</button>
        <button type="button" onClick={() => void publish()} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-md border border-[#303b4f] px-3 py-2 text-[10px] font-semibold hover:bg-white/5 disabled:opacity-50"><UploadCloud size={13}/> Publish</button>
        <button type="button" onClick={() => void addToChart()} disabled={busy !== null} className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-2 text-[10px] font-bold text-black hover:bg-orange-400 disabled:opacity-50"><Check size={13}/> Add to chart</button>
      </footer>
      </>)}
    </section>
  );
}
