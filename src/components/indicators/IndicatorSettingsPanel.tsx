import { useEffect, useMemo, useState } from 'react';
import { Code2, Palette, RotateCcw, Save, Settings2 } from 'lucide-react';
import type { IndicatorConfig } from '../../services/marketData/indicatorEngine';
import {
  getIndicatorDefaultPatch,
  getIndicatorSettingsSchema,
  readIndicatorSettingValue,
  resolveIndicatorParameterState,
  validateIndicatorSettingValue,
  validateIndicatorSettingsSchema,
  writeIndicatorSettingValue,
  type IndicatorSettingField,
  type IndicatorSettingValue,
  type IndicatorSettingsSection,
  type ResolvedIndicatorParameterState,
} from '../../services/coreSpirit/indicatorSettingsSchema';
import { applyIndicatorPreset, createIndicatorPreset, listIndicatorPresets, saveIndicatorPreset, type IndicatorPresetScope } from '../../services/coreSpirit/indicatorPresetSystem';

export type IndicatorSettingsPanelProps = {
  item: IndicatorConfig;
  compact?: boolean;
  onChange: (patch: Partial<IndicatorConfig>) => void;
  onOpenSource?: () => void;
  onReset?: () => void;
  profileId?: string | null;
  workspaceId?: string | null;
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

function fieldValue(item: IndicatorConfig, field: IndicatorSettingField): unknown {
  return readIndicatorSettingValue(item as Record<string, unknown>, field.path) ?? field.defaultValue;
}

function renderField(
  item: IndicatorConfig,
  field: IndicatorSettingField,
  onChange: (patch: Partial<IndicatorConfig>) => void,
  compact: boolean,
  parameterState: ResolvedIndicatorParameterState,
) {
  if (!parameterState.visible[field.path]) return null;
  const isEnabled = parameterState.enabled[field.path] ?? !field.readonly;
  const value = fieldValue(item, field);
  const fieldError = validateIndicatorSettingValue(field, value);
  const fieldClass = `mt-1 w-full rounded-md border ${fieldError ? 'border-[#ef4444]/50' : 'border-[var(--tco-control)]'} bg-[var(--tco-bg)] ${compact ? 'px-2 py-1.5 text-[10px]' : 'px-2.5 py-2 text-[10px]'} text-white outline-none focus:border-[#3b82f6]/50 disabled:cursor-not-allowed disabled:opacity-60`;
  const patchValue = (next: IndicatorSettingValue) => onChange(writeIndicatorSettingValue(item as Record<string, unknown>, field.path, next) as Partial<IndicatorConfig>);
  const description = field.description ? <span className="mt-0.5 block text-[8px] leading-3 text-[var(--tco-dim)]">{field.description}</span> : null;
  const title = field.tooltip || field.description;

  if (field.kind === 'boolean') {
    return <label key={field.id} title={title} className="flex min-h-9 items-center gap-2 rounded border border-[var(--tco-border)] bg-[var(--tco-bg)] px-2 py-2 text-[9px] text-[var(--tco-text-2)]">
      <input type="checkbox" checked={Boolean(value)} disabled={!isEnabled} onChange={event => patchValue(event.target.checked)} />
      <span className="min-w-0 flex-1">{field.label}{description}{fieldError && <span className="mt-0.5 block text-[8px] text-[#fca5a5]">{fieldError}</span>}</span>
    </label>;
  }

  if (field.kind === 'multi-select') {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return <label key={field.id} title={title} className="block text-[9px] font-mono text-[var(--tco-muted)]">
      {field.label}
      <select multiple value={selected} disabled={!isEnabled} onChange={event => {
        const next = Array.from(event.currentTarget.selectedOptions).map(option => option.value).slice(0, 32);
        patchValue(next);
      }} className={`${fieldClass} min-h-20`}>
        {(field.options || []).map(option => <option key={`${field.id}:${String(option.value)}`} value={String(option.value)}>{option.label}</option>)}
      </select>
      {description}{fieldError && <span className="mt-0.5 block text-[8px] text-[#fca5a5]">{fieldError}</span>}
    </label>;
  }

  if (field.kind === 'color') {
    return <label key={field.id} title={title} className="block text-[9px] font-mono text-[var(--tco-muted)]">
      {field.label}
      <input type="color" value={String(value || field.defaultValue)} disabled={!isEnabled} onChange={event => patchValue(event.target.value)} className="mt-1 h-9 w-full rounded border border-[var(--tco-control)] bg-[var(--tco-bg)] p-1 disabled:opacity-60" />
      {description}{fieldError && <span className="mt-0.5 block text-[8px] text-[#fca5a5]">{fieldError}</span>}
    </label>;
  }

  if (field.kind === 'select' || field.kind === 'enum' || field.kind === 'source' || field.kind === 'timeframe') {
    const selected = String(value ?? field.defaultValue ?? '');
    return <label key={field.id} title={title} className="block text-[9px] font-mono text-[var(--tco-muted)]">
      {field.label}
      <select value={selected} disabled={!isEnabled} onChange={event => {
        const raw = event.target.value;
        const option = field.options?.find(candidate => String(candidate.value) === raw);
        patchValue(option?.value ?? raw);
      }} className={fieldClass}>
        {(field.options || []).map(option => <option key={`${field.id}:${String(option.value)}`} value={String(option.value)}>{option.label}</option>)}
      </select>
      {description}{fieldError && <span className="mt-0.5 block text-[8px] text-[#fca5a5]">{fieldError}</span>}
    </label>;
  }

  if (field.kind === 'string' || field.kind === 'text' || field.kind === 'symbol' || field.kind === 'session') {
    return <label key={field.id} title={title} className="block text-[9px] font-mono text-[var(--tco-muted)]">
      {field.label}
      <input type="text" value={String(value ?? '')} maxLength={field.validation?.maxLength ?? 256} placeholder={field.placeholder} disabled={!isEnabled} onChange={event => patchValue(event.target.value)} className={fieldClass} />
      {description}{fieldError && <span className="mt-0.5 block text-[8px] text-[#fca5a5]">{fieldError}</span>}
    </label>;
  }

  if (field.kind === 'range') {
    const current = numericValue(value, Number(field.defaultValue), field.min, field.max);
    return <label key={field.id} title={title} className="block text-[9px] font-mono text-[var(--tco-muted)]">
      <span className="flex items-center justify-between gap-2"><span>{field.label}</span><span className="text-[var(--tco-dim)]">{current}{field.unit ? ` ${field.unit}` : ''}</span></span>
      <input type="range" min={field.min} max={field.max} step={field.step ?? 0.01} value={current} disabled={!isEnabled} onChange={event => patchValue(numericValue(event.target.value, current, field.min, field.max))} className="mt-2 w-full accent-[#3b82f6] disabled:opacity-60" />
      {description}{fieldError && <span className="mt-0.5 block text-[8px] text-[#fca5a5]">{fieldError}</span>}
    </label>;
  }

  const current = numericValue(value, Number(field.defaultValue), field.min, field.max);
  const isInteger = field.kind === 'integer';
  const isPriceOrDecimal = field.kind === 'price' || field.kind === 'decimal';
  return <label key={field.id} title={title} className="block text-[9px] font-mono text-[var(--tco-muted)]">
    <span className="flex items-center justify-between gap-2"><span>{field.label}</span>{field.unit && <span className="text-[var(--tco-dim)]">{field.unit}</span>}</span>
    <input
      type="number"
      min={field.min}
      max={field.max}
      step={field.step ?? (isInteger || field.kind === 'duration' ? 1 : isPriceOrDecimal ? 0.01 : 0.1)}
      value={current}
      disabled={!isEnabled}
      onChange={event => patchValue(isInteger ? Math.round(numericValue(event.target.value, current, field.min, field.max)) : numericValue(event.target.value, current, field.min, field.max))}
      className={fieldClass}
    />
    {description}{fieldError && <span className="mt-0.5 block text-[8px] text-[#fca5a5]">{fieldError}</span>}
  </label>;
}

function SectionBody({ section, item, onChange, compact, showAdvanced, parameterState }: { section: IndicatorSettingsSection; item: IndicatorConfig; onChange: (patch: Partial<IndicatorConfig>) => void; compact: boolean; showAdvanced: boolean; parameterState: ResolvedIndicatorParameterState }) {
  if (!section.fields.length) {
    return <div className="space-y-2">
      {(section.notes || []).map(note => <div key={note} className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-bg)] px-2.5 py-2 text-[8px] leading-4 text-[var(--tco-dim)]">{note}</div>)}
    </div>;
  }
  const fields = section.fields.filter(field => showAdvanced || !field.advanced);
  const groups = fields.reduce<Array<{ name: string; fields: IndicatorSettingField[] }>>((out, field) => {
    const name = field.group || 'General';
    const group = out.find(candidate => candidate.name === name);
    if (group) group.fields.push(field); else out.push({ name, fields: [field] });
    return out;
  }, []);
  return <div className="space-y-3">{groups.map(group => <div key={group.name} className="space-y-2">
    {groups.length > 1 && <div className="px-0.5 text-[7px] font-semibold uppercase tracking-widest text-[var(--tco-dim)]">{group.name}</div>}
    <div className="grid grid-cols-2 gap-2">{group.fields.map(field => renderField(item, field, onChange, compact, parameterState))}</div>
  </div>)}</div>;
}

export function IndicatorSettingsPanel({ item, compact = false, onChange, onOpenSource, onReset, profileId = null, workspaceId = null }: IndicatorSettingsPanelProps) {
  const schema = useMemo(() => getIndicatorSettingsSchema(item.kind, item as Record<string, unknown>), [item.kind, item.settingsSchema]);
  const schemaErrors = useMemo(() => validateIndicatorSettingsSchema(schema), [schema]);
  const parameterState = useMemo(() => resolveIndicatorParameterState(schema, item as Record<string, unknown>), [schema, item]);
  const presetContext = useMemo(() => ({ userId: profileId, workspaceId }), [profileId, workspaceId]);
  const presets = useMemo(() => listIndicatorPresets(item as Record<string, unknown>, presetContext), [item, presetContext]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('My Setup');
  const [presetScope, setPresetScope] = useState<IndicatorPresetScope>('personal');
  const selectedPreset = presets.find(preset => preset.id === selectedPresetId);
  useEffect(() => { if (selectedPreset && selectedPreset.indicatorKind !== item.kind) setSelectedPresetId(''); }, [item.kind, selectedPreset]);
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
          <span>{String(schema.identity.source).toUpperCase()}</span><span>DEF v{schema.identity.definitionVersion}</span><span>{schema.outputs.length} output{schema.outputs.length === 1 ? '' : 's'}</span><span>{schema.capabilities.incrementalExecution ? 'INCREMENTAL' : 'BATCH'}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => { const defaults = getIndicatorDefaultPatch(item as Record<string, unknown>, item.kind); if (onReset) onReset(); else onChange(defaults as Partial<IndicatorConfig>); }} title="Reset settings" className="inline-flex items-center gap-1 rounded-md border border-[var(--tco-border)] px-2 py-1 text-[8px] font-mono text-[var(--tco-dim)] hover:text-white"><RotateCcw className="h-3 w-3"/> Reset</button>
        {onOpenSource && <button type="button" onClick={onOpenSource} title="View CoreSpirit source" className="inline-flex items-center gap-1 rounded-md border border-[#3b82f6]/30 px-2 py-1 text-[8px] font-mono text-[#93c5fd] hover:bg-[#3b82f6]/10"><Code2 className="h-3 w-3"/> Code</button>}
      </div>
    </div>

    {schemaErrors.length > 0 && <div className="rounded-md border border-[#ef4444]/30 bg-[#ef4444]/5 px-2.5 py-2 text-[8px] leading-4 text-[#fca5a5]">Settings schema is invalid: {schemaErrors.slice(0, 2).join(' · ')}</div>}

    <div className="rounded-md border border-[var(--tco-border)] bg-[var(--tco-bg)] p-2">
      <div className="mb-1 flex items-center gap-2 text-[8px] font-mono uppercase tracking-widest text-[var(--tco-dim)]"><Save className="h-3 w-3 text-[#60a5fa]"/> Presets</div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <select value={selectedPresetId} onChange={event => { const preset = presets.find(candidate => candidate.id === event.target.value); setSelectedPresetId(event.target.value); if (preset) { try { onChange(applyIndicatorPreset(item as Record<string, unknown>, preset) as Partial<IndicatorConfig>); } catch {} } }} className="w-full rounded-md border border-[var(--tco-control)] bg-[var(--tco-bg)] px-2 py-1.5 text-[9px] text-white">
          <option value="">Choose preset…</option>
          {presets.map(preset => <option key={preset.id} value={preset.id}>[{preset.scope}] {preset.name}</option>)}
        </select>
        <select value={presetScope} onChange={event => setPresetScope(event.target.value as IndicatorPresetScope)} className="rounded-md border border-[var(--tco-control)] bg-[var(--tco-bg)] px-2 py-1.5 text-[9px] text-white"><option value="personal">Personal</option><option value="workspace">Workspace</option></select>
      </div>
      <div className="mt-2 flex gap-2">
        <input value={presetName} onChange={event => setPresetName(event.target.value)} placeholder="Preset name" className="min-w-0 flex-1 rounded-md border border-[var(--tco-control)] bg-[var(--tco-bg)] px-2 py-1.5 text-[9px] text-white outline-none" />
        <button type="button" onClick={() => { try { const preset = createIndicatorPreset(item as Record<string, unknown>, presetName, presetScope, presetContext); saveIndicatorPreset(preset, presetContext); setPresetName('My Setup'); setSelectedPresetId(preset.id); } catch {} }} className="rounded-md border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-2.5 py-1.5 text-[8px] font-mono text-[#93c5fd]">Save</button>
      </div>
      <div className="mt-1 text-[7px] leading-3 text-[var(--tco-dim)]">Factory, script, template, personal, workspace and community presets use the same serializable parameter ABI.</div>
    </div>

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
          {section.id === 'style' && <div className="mt-1 text-[8px] font-mono text-[#60a5fa]">APPEARANCE-ONLY · changing these values does not recompute indicator math</div>}
        </div>
        {advancedCount > 0 && <button type="button" onClick={() => setShowAdvanced(value => !value)} className="shrink-0 rounded border border-[var(--tco-border)] px-2 py-1 text-[8px] font-mono text-[var(--tco-dim)] hover:text-white">{showAdvanced ? 'Basic' : `Advanced · ${advancedCount}`}</button>}
      </div>
      <SectionBody section={section} item={item} onChange={onChange} compact={compact} showAdvanced={showAdvanced} parameterState={parameterState} />
    </div>
  </div>;
}
