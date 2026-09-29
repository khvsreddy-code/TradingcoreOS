/**
 * CoreSpirit language-driven UI runtime.
 *
 * UI definitions are declarative state, not DOM callbacks. The runtime stores
 * controls and action references; the host resolves actions when a user event
 * arrives. This keeps the VM deterministic and renderer-independent.
 */

export const CORE_SPIRIT_UI_VERSION = 1 as const;

export type CoreSpiritUiControlKind = 'number' | 'button' | 'toggle' | 'slider';

export type CoreSpiritUiControl = Readonly<{
  id: string;
  panelId: string;
  kind: CoreSpiritUiControlKind;
  label: string;
  value: number | boolean | string | null;
  min?: number;
  max?: number;
  step?: number;
  actionId?: string;
}>;

export type CoreSpiritUiPanel = Readonly<{
  id: string;
  title: string;
  controls: readonly CoreSpiritUiControl[];
  visible: boolean;
}>;

export type CoreSpiritUiState = Readonly<{
  version: typeof CORE_SPIRIT_UI_VERSION;
  revision: number;
  panels: readonly CoreSpiritUiPanel[];
}>;

export type CoreSpiritUiEvent = Readonly<{
  panelId: string;
  controlId: string;
  kind: CoreSpiritUiControlKind;
  value?: number | boolean | string | null;
  actionId?: string;
}>;

export type CoreSpiritUiAction = Readonly<{
  actionId: string;
  panelId: string;
  controlId: string;
  value: number | boolean | string | null;
}>;

type MutableControl = { id:string; panelId:string; kind:CoreSpiritUiControlKind; label:string; value:number|boolean|string|null; min?:number; max?:number; step?:number; actionId?:string };
type MutablePanel = { id: string; title: string; controls: Map<string, MutableControl>; visible: boolean };

export class CoreSpiritUiRuntime {
  private readonly panels = new Map<string, MutablePanel>();
  private revision = 0;

  reset(): void {
    this.panels.clear();
    this.revision = 0;
  }

  panel(id: string, title: string): string {
    const existing = this.panels.get(id);
    if (existing) {
      existing.title = title || existing.title;
      existing.visible = true;
      return `ui:panel:${id}`;
    }
    this.panels.set(id, { id, title, controls: new Map(), visible: true });
    this.revision++;
    return `ui:panel:${id}`;
  }

  number(panelHandle: unknown, label: string, value: unknown, actionId?: string): string {
    return this.upsertControl(panelHandle, 'number', label, Number(value), { actionId });
  }

  button(panelHandle: unknown, label: string, actionId?: string): string {
    return this.upsertControl(panelHandle, 'button', label, null, { actionId });
  }

  toggle(panelHandle: unknown, label: string, value: unknown, actionId?: string): string {
    return this.upsertControl(panelHandle, 'toggle', label, Boolean(value), { actionId });
  }

  slider(panelHandle: unknown, label: string, min: unknown, max: unknown, value: unknown, actionId?: string): string {
    return this.upsertControl(panelHandle, 'slider', label, Number(value), {
      min: Number(min),
      max: Number(max),
      actionId,
    });
  }

  dispatch(event: CoreSpiritUiEvent): CoreSpiritUiAction | undefined {
    const panel = this.panels.get(event.panelId);
    const control = panel?.controls.get(event.controlId);
    if (!panel || !control) return undefined;
    if (event.value !== undefined && control.kind !== 'button') {
      controlValue(control, event.value);
      this.revision++;
    }
    return control.actionId
      ? { actionId: control.actionId, panelId: event.panelId, controlId: event.controlId, value: control.value }
      : undefined;
  }

  snapshot(): CoreSpiritUiState {
    return {
      version: CORE_SPIRIT_UI_VERSION,
      revision: this.revision,
      panels: [...this.panels.values()].map(panel => ({
        id: panel.id,
        title: panel.title,
        visible: panel.visible,
        controls: [...panel.controls.values()].map(control => ({ ...control })),
      })),
    };
  }

  restore(snapshot: CoreSpiritUiState): void {
    this.panels.clear();
    this.revision = snapshot.revision;
    for (const panel of snapshot.panels) {
      this.panels.set(panel.id, {
        id: panel.id,
        title: panel.title,
        visible: panel.visible,
        controls: new Map(panel.controls.map(control => [control.id, { ...control }])),
      });
    }
  }

  private upsertControl(
    panelHandle: unknown,
    kind: CoreSpiritUiControlKind,
    label: string,
    value: number | boolean | string | null,
    options: { min?: number; max?: number; actionId?: string },
  ): string {
    const panelId = panelIdFromHandle(panelHandle);
    const panel = this.panels.get(panelId);
    if (!panel) throw new Error(`UI panel '${panelId}' does not exist`);
    const controlId = `${panelId}:${kind}:${slug(label)}`;
    const current = panel.controls.get(controlId);
    panel.controls.set(controlId, {
      id: controlId,
      panelId,
      kind,
      label,
      value,
      min: options.min,
      max: options.max,
      actionId: options.actionId,
    });
    if (!current || current.value !== value || current.actionId !== options.actionId) this.revision++;
    return `ui:control:${controlId}`;
  }
}

function panelIdFromHandle(handle: unknown): string {
  const text = String(handle ?? '');
  const match = /^ui:panel:(.+)$/.exec(text);
  if (!match) throw new Error('expected a CoreSpirit UI panel handle');
  return match[1];
}

function slug(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'control';
}

function controlValue(control: MutableControl, value: number | boolean | string | null): void {
  if (control.kind === 'slider') {
    const numeric = Number(value);
    const min = control.min ?? Number.NEGATIVE_INFINITY;
    const max = control.max ?? Number.POSITIVE_INFINITY;
    control.value = Math.max(min, Math.min(max, numeric));
    return;
  }
  if (control.kind === 'toggle') {
    control.value = Boolean(value);
    return;
  }
  if (control.kind === 'number') {
    const numeric = Number(value);
    control.value = Number.isFinite(numeric) ? numeric : control.value;
    return;
  }
}
