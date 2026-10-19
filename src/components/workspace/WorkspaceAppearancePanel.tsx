import { useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import {
  applyWorkspaceAppearance,
  getWorkspaceAppearance,
  resetWorkspaceAppearance,
  WORKSPACE_COLOR_PRESETS,
  type WorkspaceAppearance,
} from '../../theme/workspaceAppearance';

type Props = { onClose: () => void };

export function WorkspaceAppearancePanel({ onClose }: Props) {
  const [settings, setSettings] = useState<WorkspaceAppearance>(() => getWorkspaceAppearance());
  const update = (patch: Partial<WorkspaceAppearance>) => {
    setSettings((current) => applyWorkspaceAppearance({ ...current, ...patch }));
  };
  const colorInput = (label: string, value: string, onChange: (value: string) => void, disabled = false) => (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--tco-border)] px-3 py-2 text-xs text-[var(--tco-text)]">
      <span>{label}</span>
      <span className="flex items-center gap-2"><span className="font-mono text-[10px] text-[var(--tco-dim)]">{value.toUpperCase()}</span><input aria-label={label} type="color" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent disabled:cursor-not-allowed disabled:opacity-40" /></span>
    </label>
  );
  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Workspace appearance" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-4 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-[var(--tco-heading)]">Workspace appearance</div><p className="mt-1 text-[10px] text-[var(--tco-dim)]">Personalize the live terminal, chart canvas and accent palette. Changes apply immediately and are saved on this device.</p></div><button onClick={onClose} aria-label="Close appearance settings" className="rounded-md border border-[var(--tco-border)] p-2 text-[var(--tco-muted)]"><X size={14}/></button></div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--tco-dim)]">Workspace accent</div>
          {colorInput('Accent color', settings.accentColor, value => update({ accentColor: value }))}
          <div className="grid grid-cols-6 gap-2">{WORKSPACE_COLOR_PRESETS.map(color => <button key={color} title={color} aria-label={'Use accent ' + color} onClick={() => update({ accentColor: color })} className={'h-7 rounded-md border ' + (settings.accentColor === color ? 'border-white ring-2 ring-[var(--tco-accent)]' : 'border-[var(--tco-border)]')} style={{ backgroundColor: color }} />)}</div>
          <div className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[var(--tco-dim)]">Workspace surfaces</div>
          <label className="flex items-start gap-2 rounded-lg border border-[var(--tco-border)] p-3 text-xs"><input type="checkbox" checked={settings.syncWorkspaceColors} onChange={event => update({ syncWorkspaceColors: event.target.checked })} className="mt-0.5"/><span><span className="block font-semibold">Sync workspace surface colors</span><span className="mt-1 block text-[10px] text-[var(--tco-dim)]">Keep the page, top bar and sidebars on one coordinated color.</span></span></label>
          {settings.syncWorkspaceColors
            ? colorInput('Synced workspace surface', settings.workspaceSurfaceColor, value => update({ workspaceSurfaceColor: value }))
            : <div className="space-y-2">{colorInput('Main page', settings.pageColor, value => update({ pageColor: value }))}{colorInput('Top bar', settings.topbarColor, value => update({ topbarColor: value }))}{colorInput('Sidebars', settings.sidebarColor, value => update({ sidebarColor: value }))}</div>}
        </div>
        <div className="space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--tco-dim)]">Chart canvas background</div>
          <div className="flex gap-2"><button onClick={() => update({ chartBackgroundMode: 'solid' })} className={'flex-1 rounded-lg border px-3 py-2 text-xs ' + (settings.chartBackgroundMode === 'solid' ? 'border-[var(--tco-accent)] bg-[var(--tco-accent)]/10 text-[var(--tco-text)]' : 'border-[var(--tco-border)] text-[var(--tco-muted)]')}>Solid</button><button onClick={() => update({ chartBackgroundMode: 'gradient' })} className={'flex-1 rounded-lg border px-3 py-2 text-xs ' + (settings.chartBackgroundMode === 'gradient' ? 'border-[var(--tco-accent)] bg-[var(--tco-accent)]/10 text-[var(--tco-text)]' : 'border-[var(--tco-border)] text-[var(--tco-muted)]')}>Gradient</button></div>
          {colorInput('Gradient start / solid', settings.chartBackgroundStart, value => update({ chartBackgroundStart: value }))}
          {settings.chartBackgroundMode === 'gradient' && <>
            {colorInput('Gradient end', settings.chartBackgroundEnd, value => update({ chartBackgroundEnd: value }))}
            <label className="block rounded-lg border border-[var(--tco-border)] p-3 text-xs text-[var(--tco-text)]"><span className="flex justify-between"><span>Gradient angle</span><span className="font-mono text-[var(--tco-dim)]">{settings.chartGradientAngle}°</span></span><input aria-label="Gradient angle" type="range" min="0" max="360" step="5" value={settings.chartGradientAngle} onChange={event => update({ chartGradientAngle: Number(event.target.value) })} className="mt-3 w-full"/></label>
          </>}
          <div className="h-20 rounded-xl border border-[var(--tco-border)]" style={{ background: settings.chartBackgroundMode === 'gradient' ? 'linear-gradient(' + settings.chartGradientAngle + 'deg, ' + settings.chartBackgroundStart + ', ' + settings.chartBackgroundEnd + ')' : settings.chartBackgroundStart }} />
          <p className="text-[10px] leading-relaxed text-[var(--tco-dim)]">Gradient is rendered behind the chart data and included in chart exports. Candle and indicator colors remain independently controlled.</p>
        </div>
      </div>
      <div className="mt-4 flex justify-between border-t border-[var(--tco-border)] pt-3"><button onClick={() => setSettings(resetWorkspaceAppearance())} className="flex items-center gap-2 rounded-lg border border-[var(--tco-border)] px-3 py-2 text-xs text-[var(--tco-muted)]"><RotateCcw size={13}/> Reset appearance</button><button onClick={onClose} className="rounded-lg bg-[var(--tco-accent)] px-4 py-2 text-xs font-semibold text-black">Done</button></div>
    </section>
  </div>;
}
