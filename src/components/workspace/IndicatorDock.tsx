import { useEffect, useMemo, useState } from 'react';
import { Code2, Eye, EyeOff, Settings2, Trash2, X } from 'lucide-react';
import type { IndicatorConfig } from '../../services/marketData/indicatorEngine';
import { INDICATOR_LIBRARY } from '../../services/marketData/indicatorEngine';
import { defaultIndicators, getIndicators, saveIndicators } from '../../services/workspace/workspaceState';
import { IndicatorSettingsPanel } from '../indicators/IndicatorSettingsPanel';
import { IndicatorSourceEditor } from '../indicators/IndicatorSourceEditor';
import { useAuth } from '../../auth/hooks/useAuth';

const fmtConfig = (x: IndicatorConfig) => {
  const parts: string[] = [];
  if (x.period) parts.push(`P${x.period}`);
  if (x.fast || x.slow || x.signal) parts.push(`${x.fast ?? '—'}/${x.slow ?? '—'}/${x.signal ?? '—'}`);
  if (x.multiplier) parts.push(`${x.multiplier}×`);
  if (x.smooth) parts.push(`S${x.smooth}`);
  return String(parts.join(' · '));
};

const defaultIds = new Set(defaultIndicators.map(x => x.id));

export function IndicatorDock() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [items, setItems] = useState<IndicatorConfig[]>(() => getIndicators());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [sourceEditing, setSourceEditing] = useState<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    const onPath = () => setPath(window.location.pathname);
    const onIndicators = (event: Event) => setItems((event as CustomEvent<IndicatorConfig[]>).detail || getIndicators());
    window.addEventListener('popstate', onPath);
    window.addEventListener('tradingcore:indicators', onIndicators);
    return () => {
      window.removeEventListener('popstate', onPath);
      window.removeEventListener('tradingcore:indicators', onIndicators);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (window.location.pathname !== path) setPath(window.location.pathname);
    }, 250);
    return () => window.clearInterval(timer);
  }, [path]);

  const active = useMemo(() => items.filter(x => x.enabled), [items]);
  const managed = useMemo(() => items.filter(x => x.enabled || !defaultIds.has(x.id)), [items]);
  if (path !== '/live') return null;

  const commit = (next: IndicatorConfig[]) => {
    setItems(next);
    saveIndicators(next);
  };
  const patch = (id: string, value: Partial<IndicatorConfig>) => commit(items.map(x => x.id === id ? { ...x, ...value } : x));
  const remove = (id: string) => { commit(items.filter(x => x.id !== id)); if (editing === id) setEditing(null); };

  return <div className="fixed z-[80] top-[185px] right-[310px] max-w-[360px] font-mono text-[10px] max-[1500px]:right-4 max-[900px]:top-[120px] max-[900px]:right-3">
    {!open ? <button onClick={() => setOpen(true)} className="rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-2)]/95 px-3 py-2 text-[var(--tco-text-2)] shadow-2xl backdrop-blur hover:border-[#3b82f6]/50 hover:text-white"><span className="text-[#3b82f6]">●</span> INDICATORS <b className="ml-1">{active.length}</b></button> :
      <div className="w-[360px] max-w-[calc(100vw-24px)] rounded-xl border border-[#2a3040] bg-[var(--tco-surface-2)]/98 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-[var(--tco-border)] px-3 py-2.5"><div><div className="text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">Chart indicators</div><div className="mt-0.5 text-xs font-semibold text-white">{active.length} active · {managed.length} added</div></div><button onClick={() => { setOpen(false); setEditing(null); }} className="rounded-md p-1 text-[var(--tco-dim)] hover:text-white"><X className="h-3.5 w-3.5"/></button></div>
        <div className="max-h-[520px] overflow-y-auto p-2">
          {managed.length ? managed.map(x => {
            const lib = INDICATOR_LIBRARY.find(l => l.kind === x.kind);
            const isEditing = editing === x.id;
            return <div key={x.id} className={`mb-1.5 rounded-lg border bg-[var(--tco-surface-2)] last:mb-0 ${x.enabled ? 'border-[var(--tco-border)]' : 'border-[var(--tco-border)]/70 opacity-70'}`}>
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button onClick={() => patch(x.id, { enabled: !x.enabled })} title={x.enabled ? 'Hide study' : 'Show study'} className={x.enabled ? 'text-[#3b82f6] hover:text-white' : 'text-[var(--tco-dim)] hover:text-white'}>{x.enabled ? <Eye className="h-3.5 w-3.5"/> : <EyeOff className="h-3.5 w-3.5"/>}</button>
                <button onClick={() => setEditing(isEditing ? null : x.id)} className="min-w-0 flex-1 text-left"><div className="truncate text-[10px] font-semibold text-[var(--tco-text-2)]">{x.customName || x.kind}</div><div className="mt-0.5 text-[8px] text-[var(--tco-dim)]">{String(x.enabled ? (fmtConfig(x) || (lib?.overlay ? 'Overlay' : 'Pane')) : 'Hidden · ' + (fmtConfig(x) || (lib?.overlay ? 'Overlay' : 'Pane')))}</div></button>
                <button onClick={() => setSourceEditing(x.id)} title="Edit CoreSpirit source" className="rounded-md p-1.5 text-[var(--tco-dim)] hover:text-[#60a5fa]"><Code2 className="h-3.5 w-3.5"/></button>
                <button onClick={() => setEditing(isEditing ? null : x.id)} title="Settings" className={`rounded-md p-1.5 ${isEditing ? 'bg-[#3b82f6]/10 text-[#3b82f6]' : 'text-[var(--tco-dim)] hover:text-white'}`}><Settings2 className="h-3.5 w-3.5"/></button>
                <button onClick={() => remove(x.id)} title="Delete study" className="rounded-md p-1.5 text-[var(--tco-dim)] hover:text-[#ef4444]"><Trash2 className="h-3.5 w-3.5"/></button>
              </div>
              {isEditing && <div className="border-t border-[var(--tco-border)] px-2.5 py-2.5"><IndicatorSettingsPanel item={x} compact onChange={value => patch(x.id, value)} onOpenSource={() => setSourceEditing(x.id)} /></div>}
            </div>;
          }) : <div className="px-2 py-5 text-center text-[var(--tco-dim)]">No active or user-added studies. Use + Indicator to add one.</div>}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--tco-border)] px-3 py-2 text-[8px] text-[var(--tco-dim)]"><span>Schema-driven settings</span><button onClick={() => commit(items.map(x => ({ ...x, enabled: false })))} className="text-[#ef4444] hover:text-white">Hide all</button></div>
      </div>}
      {sourceEditing && user && (() => { const item = items.find(x => x.id === sourceEditing); return item ? <IndicatorSourceEditor item={item} user={user} onClose={() => setSourceEditing(null)} onSaved={({ scriptId, source }) => { patch(item.id, { scriptId, sourceCode: source, isUserAuthored: true, authorName: user.name || 'Trader', customName: item.customName || item.kind }); }} /> : null; })()}
  </div>;
}
