import { useEffect, useState, type ReactNode } from 'react';
import { Settings2, X } from 'lucide-react';
import { DEFAULT_DYNAMIC_LEVEL_SETTINGS, DynamicLevelSettings, getDynamicLevelSettings, saveDynamicLevelSettings } from '../../services/marketData/levelSettings';

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block text-[8px] uppercase tracking-wider text-[#7f8aa3]">
    <span>{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

const input = 'w-full rounded-md border border-[var(--tco-control)] bg-[var(--tco-bg)] px-2 py-1.5 text-[10px] text-white outline-none focus:border-[#3b82f6]/60';
const select = input;

const Toggle = ({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) => (
  <button type="button" onClick={() => onChange(!value)} className="flex w-full items-center justify-between rounded-md border border-[var(--tco-control)] bg-[var(--tco-bg)] px-2 py-1.5 text-[9px] text-[var(--tco-text-2)]">
    <span>{label}</span>
    <span className={`h-3.5 w-6 rounded-full p-0.5 ${value ? 'bg-[#3b82f6]' : 'bg-[var(--tco-control)]'}`}>
      <span className={`block h-2.5 w-2.5 rounded-full bg-white transition-transform ${value ? 'translate-x-2.5' : ''}`} />
    </span>
  </button>
);

export function LevelSettingsDock() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<DynamicLevelSettings>(() => getDynamicLevelSettings());

  useEffect(() => {
    const h = (e: Event) => setS((e as CustomEvent<DynamicLevelSettings>).detail || getDynamicLevelSettings());
    window.addEventListener('tradingcore:level-settings', h);
    return () => window.removeEventListener('tradingcore:level-settings', h);
  }, []);

  const patch = (v: Partial<DynamicLevelSettings>) => {
    const next = { ...s, ...v };
    setS(next);
    saveDynamicLevelSettings(next);
  };

  return (
    <div className="fixed z-[85] top-[185px] right-[660px] max-w-[330px] max-[1500px]:right-[360px] max-[900px]:top-[120px] max-[900px]:right-3 font-mono text-[10px]">
      {!open ? (
        <button onClick={() => setOpen(true)} className="flex h-8 items-center gap-2 rounded-md border border-[var(--tco-border)] bg-[var(--tco-surface-2)]/95 px-3 text-[var(--tco-text-2)] shadow-2xl backdrop-blur hover:border-[#3b82f6]/50 hover:text-white">
          <Settings2 className="h-3.5 w-3.5" />
          <span>LEVEL SETTINGS</span>
        </button>
      ) : (
        <div className="w-[330px] max-w-[calc(100vw-24px)] rounded-xl border border-[#2a3040] bg-[var(--tco-surface-2)]/98 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-[var(--tco-border)] px-3 py-2.5">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-[var(--tco-dim)]">Price Action Feature</div>
              <div className="mt-0.5 text-xs font-semibold text-white">Support & Resistance Levels</div>
            </div>
            <button onClick={() => setOpen(false)} className="rounded-md p-1 text-[var(--tco-dim)] hover:text-white"><X className="h-3.5 w-3.5" /></button>
          </div>

          <div className="max-h-[520px] space-y-3 overflow-y-auto p-3">
            <div className="rounded-md border border-[var(--tco-control)] bg-[var(--tco-surface-3)] px-2.5 py-2 text-[8px] leading-4 text-[var(--tco-dim)]">
              This is a chart feature, not an indicator. Turn <span className="text-white">Levels</span> on from the chart toolbar to display price-action support and resistance. Use these settings only to control how the feature finds and displays levels.
            </div>

            <div>
              <div className="mb-2 text-[8px] font-semibold uppercase tracking-widest text-[#3b82f6]">Level Detection</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Lookback Bars"><input className={input} type="number" min="50" max="5000" value={s.lookbackPeriod} onChange={e => patch({ lookbackPeriod: Math.max(50, Math.min(5000, Number(e.target.value) || 800)) })} /></Field>
                <Field label="Pivot Strength"><input className={input} type="number" min="2" max="50" value={s.pivotLength} onChange={e => patch({ pivotLength: Math.max(2, Math.min(50, Number(e.target.value) || 10)) })} /></Field>
                <Field label="Max Levels / Side"><input className={input} type="number" min="5" max="75" value={s.maxLevelsPerType} onChange={e => patch({ maxLevelsPerType: Math.max(5, Math.min(75, Number(e.target.value) || 30)) })} /></Field>
                <Field label="Merge Distance × ATR"><input className={input} type="number" min="0.1" max="5" step="0.1" value={s.mergeAtrMultiplier} onChange={e => patch({ mergeAtrMultiplier: Math.max(.1, Math.min(5, Number(e.target.value) || .5)) })} /></Field>
              </div>
              <div className="mt-2 space-y-1.5">
                <Toggle label="Merge Nearby Levels" value={s.mergeNearbyLevels} onChange={v => patch({ mergeNearbyLevels: v })} />
                <Toggle label="Use Wick-Dominance Filter" value={s.wickDominanceFilter} onChange={v => patch({ wickDominanceFilter: v })} />
              </div>
            </div>

            <div>
              <div className="mb-2 text-[8px] font-semibold uppercase tracking-widest text-[#3b82f6]">Display</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Historical Start"><select className={select} value={s.levelStartMode} onChange={e => patch({ levelStartMode: e.target.value as DynamicLevelSettings['levelStartMode'] })}><option>Confirmation</option><option>Pivot</option></select></Field>
                <Field label="Level Style"><select className={select} value={s.displayAsZones ? 'Zones' : 'Lines'} onChange={e => patch({ displayAsZones: e.target.value === 'Zones' })}><option>Lines</option><option>Zones</option></select></Field>
              </div>
              <div className="mt-2 space-y-1.5">
                <Toggle label="Show Price Labels" value={s.showLabels} onChange={v => patch({ showLabels: v })} />
                <Toggle label="Show Breakout / Reversal Events" value={s.showBreakouts || s.showReversals || s.showFailures} onChange={v => patch({ showBreakouts: v, showReversals: v, showFailures: v })} />
              </div>
            </div>

            <div className="rounded-md border border-[var(--tco-control)] bg-[var(--tco-surface-3)] px-2.5 py-2 text-[8px] leading-4 text-[var(--tco-dim)]">
              Levels come from confirmed price pivots and price action. ATR is used for spacing/merging and optional breakout buffering; it does not manufacture directional levels.
            </div>

            <button onClick={() => { saveDynamicLevelSettings(DEFAULT_DYNAMIC_LEVEL_SETTINGS); setS({ ...DEFAULT_DYNAMIC_LEVEL_SETTINGS }); }} className="w-full rounded-md border border-[var(--tco-control)] px-2 py-1.5 text-[9px] text-[var(--tco-code-muted)] hover:border-[#3b82f6]/50 hover:text-white">
              Reset Level Feature Defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
