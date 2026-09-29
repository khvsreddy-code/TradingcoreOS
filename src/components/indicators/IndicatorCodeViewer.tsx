import { useMemo } from 'react';
import { Clipboard, Code2, X } from 'lucide-react';
import type { IndicatorConfig } from '../../services/marketData/indicatorEngine';
import { getIndicatorSourceTemplate } from '../../services/coreSpirit/indicatorSourceTemplates';

export type IndicatorCodeViewerProps = { item: IndicatorConfig; onClose: () => void };

export function IndicatorCodeViewer({ item, onClose }: IndicatorCodeViewerProps) {
  const template = useMemo(() => getIndicatorSourceTemplate(item.kind, item), [item]);
  const copy = async () => { try { await navigator.clipboard?.writeText(template.source); } catch {} };
  return <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
    <div className="flex w-[min(760px,96vw)] max-h-[86vh] flex-col overflow-hidden rounded-xl border border-[var(--tco-control)] bg-[var(--tco-surface-2)] shadow-2xl" onMouseDown={e=>e.stopPropagation()}>
      <div className="flex items-center gap-2 border-b border-[var(--tco-border)] px-3 py-2">
        <Code2 className="h-4 w-4 text-[#60a5fa]" />
        <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold text-white">{item.kind} · source</div><div className="text-[8px] text-[var(--tco-dim)]">{template.executable?'CoreSpirit executable template':'CoreSpirit starter template'} · {template.editable?'editable':'read-only'}</div></div>
        <button type="button" title="Copy code" onClick={copy} className="rounded border border-[var(--tco-control)] p-1.5 text-[var(--tco-code-muted)] hover:bg-[var(--tco-hover)] hover:text-white"><Clipboard className="h-3.5 w-3.5"/></button>
        <button type="button" title="Close" onClick={onClose} className="rounded p-1.5 text-[var(--tco-code-muted)] hover:bg-[var(--tco-hover)] hover:text-white"><X className="h-4 w-4"/></button>
      </div>
      <div className="border-b border-[var(--tco-border)] px-3 py-2 text-[8px] leading-3 text-[var(--tco-dim)]">{template.note}</div>
      <pre className="min-h-0 flex-1 overflow-auto bg-[var(--tco-code-bg-deep)] p-4 font-mono text-[10px] leading-5 text-[var(--tco-code-text)]"><code>{template.source}</code></pre>
    </div>
  </div>;
}
