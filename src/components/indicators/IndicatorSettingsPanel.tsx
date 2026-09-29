import { useEffect, useMemo, useState } from 'react';
import { Code2, Palette, RotateCcw, Settings2 } from 'lucide-react';
import type { IndicatorConfig } from '../../services/marketData/indicatorEngine';
import {
  getIndicatorDefaultPatch,
  getIndicatorSettingsSchema,
  readIndicatorSettingValue,
  validateIndicatorSettingsSchema,
  writeIndicatorSettingValue,
  type IndicatorSettingField,
  type IndicatorSettingPrimitive,
  type IndicatorSettingsSection,
} from '../../services/coreSpirit/indicatorSettingsSchema';

export type IndicatorSettingsPanelProps = {
  item: IndicatorConfig;
  compact?: boolean;
  onChange: (patch: Partial<IndicatorConfig>) => void;
  onOpenSource?: () => void;
  onReset?: () => void;
};

const SECTION_ICONS = {
  inputs: Settings2,
  style: Palette,
  display: Settings2,
  behavior: Settings2,
  alerts: Settings2,
  visualization: Palette,
} as const;

function numericValue(value: unknown, fallback: number, min?: number, max?: number): number {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min ?? -Infinity, Math.min(max ?? Infinity, safe));
}

function matchesVisibility(item: IndicatorConfig, field: IndicatorSettingField): boolean {
  if (!field.visibleWhen) return true;
  const actual = readIndicatorSettingValue(item as Record<string, unknown>, field.visibleWhen.path);
  return actual === field.visibleWhen.equals;
}

function fieldValue(item: IndicatorConfig, field: IndicatorSettingField): unknown {
  return readIndicatorSettingValue(item as Record<string, unknown>, field.path) ?? field.defaultValue;
}

function renderField(
  item: IndicatorConfig,
  field: IndicatorSettingField,
  onChange: (patch: Partial<IndicatorConfig>) => void,
  compact: boolean,
) {
  if (!matchesVisibility(item, field)) return null;
  const value = fieldValue(item, field);
  const fieldClass = `mt-1 w-full rounded-md border border-[var(--tco-control)] bg-[var(--tco-bg)] ${compact ? 'px-2 py-1.5 text-[10px]' : 'px-2.5 py-2 text-[10px]'} text-white outline-none focus:border-[#3b82f6]/50 disabled:cursor-not-allowed disabled:opacity-60`;
  const patchValue = (next: IndicatorSettingPrimitive) => onChange(writeIndicatorSettingValue(item as Record<string, unknown>, field.path, next) as Partial<IndicatorConfig>);
  const description = field.description ? <span className="mt-0.5 block text-[8px] leading-3 text-[var(--tco-dim)]">{field.description}</span> : null;

  if (field.kind === 'boolean') {
    return <label key={field.id} className="flex min-h-9 items-center gap-2 rounded border border-[var(--tco-border)] bg-[var(--tco-bg)] px-2 py-2 text-[9px] text-[var(--tco-text-2)]">
      <input type="checkbox" checked={Boolean(value)} disabled={field.readonly} onChange={event => patchValue(event.target.checked)} />
      <span className="min-w-0 flex-1">{field.label}{description}</span>
    </label>;
  }

  if (field.kind === 'color') {
    return <label key={field.id} className="block text-[9px] font-mono text-[var(--tco-muted)]">
      {field.label}
      <input type="color" value={String(value || field.defaultValue)} disabled={field.readonly} onChange={event => patchValue(event.target.value)} className="mt-1 h-9 w-full rounded border border-[var(--tco-control)] bg-[var(--tco-bg)] p-1 disabled:opacity-60" />
      {description}
    </label>;
  }

  if (field.kind === 'select') {
    const selected = String(value);
    return <label key={field.id} className="block text-[9px] font-mono text-[var(--tco-muted)]">
      {field.label}
      <select value={selected} disabled={field.readonly} onChange={event => {
        const raw = event.target.value;
        const option = field.options?.find(item => String(item.value) === raw);
        patchValue(option?.value ?? raw);
      }} className={fieldClass}>
        {(field.options || []).map(option => <option key={`${field.id}:${String(option.value)}`} value={String(option.value)}>{option.label}</option>)}
      </select>
      {description}
    </label>;
  }

  if (field.kind === 'range') {
    const current = numericValue(value, Number(field.defaultValue), field.min, field.max);
    return <label key={field.id} className="block text-[9px] font-mono text-[var(--tco-muted)]">
      <span className="flex items-center justify-between gap-2"><span>{field.label}</span><span className="text-[var(--tco-dim)]">{current}{field.unit ? ` ${field.unit}` : ''}</span></span>
      <input type="range" min={field.min} max={field.max} step={field.step ?? 0.01} value={current} disabled={field.readonly} onChange={event => patchValue(numericValue(event.target.value, current, field.min, field.max))} className="mt-2 w-full accent-[#3b82f6] disabled:opacity-60" />
      {description}
    </label>;
  }

  if (field.kind === 'text') {
    return <label key={field.id} className="block text-[9px] font-mono text-[var(--tco-muted)]">
      {field.label}
      <input type="text" value={String(value ?? '')} maxLength={256} disabled={field.readonly} onChange={event => patchValue(event.target.value)} className={fieldClass} />
      {description}
    </label>;
  }

  const current = numericValue(value, Number(field.defaultValue), field.min, field.max);
  const isInteger = field.kind === 'integer';
  return <label key={field.id} className="block text-[9px] font-mono text-[var(--tco-muted)]">
    <span className="flex items-center justify-between gap-2"><span>{field.label}</span>{field.unit && <span className="text-[var(--tco-dim)]">{field.unit}</span>}</span>
    <input
      type="number"
      min={field.min}
      max={field.max}
      step={field.step ?? (isInteger ? 1 : 0.1)}
      value={current}
      disabled={field.readonly}
      onChange={event => patchValue(isInteger ? Math.round(numericValue(event.target.value, current, field.min, field.max)) : numericValue(event.target.value, current, field.min, field.max))}
      className={fieldClass}
    />
    {description}
  </label>;
}

function SectionBody({ section, item, onChange, compact, showAdvanced }: { section: IndicatorSettingsSection; item: IndicatorConfig; onChange: (patch: Partial<IndicatorConfig>) => void; compact: boolean; showAdvanced: boolean }) {
  if (!section.fields.length) {
    return <div className="space-y-2">
      {(section.notes || []).map(note => <div key={note} className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-bg)] px-2.5 py-2 text-[8px] leading-4 text-[var(--tco-dim)]">{note}</div>)}
    </div>;
  }
  const fields = section.fields.filter(field => showAdvanced || !field.advanced);
  return <div className="grid grid-cols-2 gap-2">{fields.map(field => renderField(item, field, onChange, compact))}</div>;
}

export function IndicatorSettingsPanel({ item, compact = false, onChange, onOpenSource, onReset }: IndicatorSettingsPanelProps) {
  const schema = useMemo(() => getIndicatorSettingsSchema(item.kind, item as Record<string, unknown>), [item.kind, item.settingsSchema]);
  const schemaErrors = useMemo(() => validateIndicatorSettingsSchema(schema), [schema]);
  const sections = useMemo(() => schema.sections.filter(section => section.fields.length > 0 || (section.notes?.length ?? 0) > 0), [schema]);
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? 'inputs');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const section = sections.find(candidate => candidate.id === activeSection) ?? sections[0];
  useEffect(() => { if (!sections.some(candidate => candidate.id === activeSection)) setActiveSection(sections[0]?.id ?? 'inputs'); }, [sections, activeSection]);
  const advancedCount = section ? section.fields.filter(field => field.advanced).length : 0;
  const title = item.customName || schema.identity.title || item.kind;

  if (!section) return null;

  return <div className={compact ? 'space-y-2' : 'space-y-3'}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--tco-dim)]"><Settings2 className="h-3 w-3 text-[#60a5fa]"/>{title} settings</div>
        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] font-mono text-[var(--tco-dim)]">
          <span>{schema.identity.source.toUpperCase()}</span><span>DEF v{schema.identity.definitionVersion}</span><span>{schema.outputs.length} output{schema.outputs.length === 1 ? '' : 's'}</span><span>{schema.capabilities.incrementalExecution ? 'INCREMENTAL' : 'BATCH'}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => { const defaults = getIndicatorDefaultPatch(item as Record<string, unknown>, item.kind); if (onReset) onReset(); else onChange(defaults as Partial<IndicatorConfig>); }} title="Reset settings" className="inline-flex items-center gap-1 rounded-md border border-[var(--tco-border)] px-2 py-1 text-[8px] font-mono text-[var(--tco-dim)] hover:text-white"><RotateCcw className="h-3 w-3"/> Reset</button>
        {onOpenSource && <button type="button" onClick={onOpenSource} title="View CoreSpirit source" className="inline-flex items-center gap-1 rounded-md border border-[#3b82f6]/30 px-2 py-1 text-[8px] font-mono text-[#93c5fd] hover:bg-[#3b82f6]/10"><Code2 className="h-3 w-3"/> Code</button>}
      </div>
    </div>

    {schemaErrors.length > 0 && <div className="rounded-md border border-[#ef4444]/30 bg-[#ef4444]/5 px-2.5 py-2 text-[8px] leading-4 text-[#fca5a5]">Settings schema is invalid: {schemaErrors.slice(0, 2).join(' · ')}</div>}

    <div className="flex gap-1 overflow-x-auto border-b border-[var(--tco-border)] pb-1">
      {sections.map(candidate => {
        const Icon = SECTION_ICONS[candidate.id] ?? Settings2;
        return <button key={candidate.id} type="button" onClick={() => setActiveSection(candidate.id)} className={`inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[8px] font-mono ${candidate.id === section.id ? 'bg-[#3b82f6]/10 text-[#60a5fa]' : 'text-[var(--tco-dim)] hover:text-white'}`}><Icon className="h-3 w-3"/>{candidate.label}</button>;
      })}
    </div>

    <div>
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-semibold text-[var(--tco-text-2)]">{section.label}</div>
          <div className="mt-0.5 text-[8px] leading-3 text-[var(--tco-dim)]">{section.description}</div>
        </div>
        {advancedCount > 0 && <button type="button" onClick={() => setShowAdvanced(value => !value)} className="shrink-0 rounded border border-[var(--tco-border)] px-2 py-1 text-[8px] font-mono text-[var(--tco-dim)] hover:text-white">{showAdvanced ? 'Basic' : `Advanced · ${advancedCount}`}</button>}
      </div>
      <SectionBody section={section} item={item} onChange={onChange} compact={compact} showAdvanced={showAdvanced} />
    </div>
  </div>;
}
