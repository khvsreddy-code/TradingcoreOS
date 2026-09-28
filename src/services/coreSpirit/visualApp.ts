/**
 * CoreSpirit visual-application/workspace contract — v52.
 *
 * An application is a declarative workspace description. It does not execute
 * broker operations or store renderer objects. Hosts project it into web,
 * desktop, replay, mobile or future 3D workspace surfaces.
 */
import type { CoreSpiritExecutionTarget } from './executionTarget';

export const CORE_SPIRIT_VISUAL_APP_VERSION = 1 as const;

export type CoreSpiritWorkspaceSlot = 'main' | 'left' | 'right' | 'top' | 'bottom' | 'overlay';
export type CoreSpiritWorkspaceWidgetKind = 'chart' | 'watchlist' | 'orderbook' | 'trade_log' | 'market_structure' | 'signals' | 'automation_preview' | 'custom';

export type CoreSpiritVisualAppWidget = Readonly<{
  id: string;
  kind: CoreSpiritWorkspaceWidgetKind;
  slot: CoreSpiritWorkspaceSlot;
  title?: string;
  sourceRef?: string;
  interactive?: boolean;
  props?: Readonly<Record<string, unknown>>;
}>;

export type CoreSpiritVisualAppManifest = Readonly<{
  version: typeof CORE_SPIRIT_VISUAL_APP_VERSION;
  id: string;
  title: string;
  revision: number;
  widgets: readonly CoreSpiritVisualAppWidget[];
  bindings: readonly Readonly<{
    event: string;
    actionId: string;
    sourceRef?: string;
  }>[];
  supportedTargets?: readonly CoreSpiritExecutionTarget[];
  requiredFeatures?: readonly string[];
}>;

export type CoreSpiritVisualAppState = CoreSpiritVisualAppManifest | null;

export function validateCoreSpiritVisualApp(manifest: CoreSpiritVisualAppManifest): string[] {
  const errors: string[] = [];
  const allowedKinds = new Set<CoreSpiritWorkspaceWidgetKind>(['chart','watchlist','orderbook','trade_log','market_structure','signals','automation_preview','custom']);
  if (!manifest.id.trim()) errors.push('app id must not be empty');
  if (!manifest.title.trim()) errors.push('app title must not be empty');
  const ids = new Set<string>();
  for (const widget of manifest.widgets) {
    if (ids.has(widget.id)) errors.push(`duplicate app widget '${widget.id}'`);
    ids.add(widget.id);
    if (!widget.id.trim()) errors.push('widget id must not be empty');
    if (!allowedKinds.has(widget.kind)) errors.push(`widget '${widget.id}' has unsupported kind '${widget.kind}'`);
    if (widget.kind === 'custom' && !widget.sourceRef) errors.push(`custom widget '${widget.id}' requires sourceRef`);
  }
  if (manifest.supportedTargets) {
    const validTargets = new Set<CoreSpiritExecutionTarget>(['chart','replay','backtest','scanner','alert','server','automation','research']);
    for (const target of manifest.supportedTargets) if (!validTargets.has(target)) errors.push(`unsupported app target '${target}'`);
  }
  for (const binding of manifest.bindings) {
    if (!binding.event.trim()) errors.push('app binding event must not be empty');
    if (!binding.actionId.trim()) errors.push('app binding actionId must not be empty');
  }
  return errors;
}

export class CoreSpiritVisualAppRuntime {
  private app: CoreSpiritVisualAppManifest | null = null;

  reset(): void { this.app = null; }
  create(title: string, id = 'main'): string {
    const safeTitle = String(title || 'Trading App').trim() || 'Trading App';
    this.app = { version: CORE_SPIRIT_VISUAL_APP_VERSION, id: id.trim() || 'main', title: safeTitle, revision: (this.app?.revision ?? 0) + 1, widgets: [], bindings: [], supportedTargets: ['chart','replay'], requiredFeatures: [] };
    return `app:${this.app.id}`;
  }
  private requireApp(): CoreSpiritVisualAppManifest {
    if (!this.app) throw new Error('CoreSpirit app has not been created; call app.create(...) first');
    return this.app;
  }
  private upsertWidget(widget: CoreSpiritVisualAppWidget): string {
    const app = this.requireApp();
    const widgets = [...app.widgets.filter(existing => existing.id !== widget.id), Object.freeze({ ...widget, props: widget.props ? Object.freeze({ ...widget.props }) : undefined })];
    this.app = Object.freeze({ ...app, revision: app.revision + 1, widgets: Object.freeze(widgets) });
    return `app:widget:${widget.id}`;
  }
  chart(id = 'main', slot: CoreSpiritWorkspaceSlot = 'main', sourceRef?: string): string {
    return this.upsertWidget({ id, kind:'chart', slot, sourceRef, interactive:true });
  }
  panel(slot: CoreSpiritWorkspaceSlot, kind: CoreSpiritWorkspaceWidgetKind, id?: string, title?: string, sourceRef?: string): string {
    const widgetId = id || `${slot}:${kind}`;
    return this.upsertWidget({ id: widgetId, kind, slot, title, sourceRef, interactive:true });
  }
  overlay(kind: CoreSpiritWorkspaceWidgetKind | 'custom', sourceRef?: string, id?: string): string {
    return this.upsertWidget({ id: id || `overlay:${kind}`, kind: kind as CoreSpiritWorkspaceWidgetKind, slot:'overlay', sourceRef, interactive:true });
  }
  targets(...targets: CoreSpiritExecutionTarget[]): void {
    const app = this.requireApp();
    const unique = [...new Set(targets)];
    if (!unique.length) throw new Error('app.targets requires at least one execution target');
    this.app = Object.freeze({ ...app, revision: app.revision + 1, supportedTargets: Object.freeze(unique) });
  }
  requireFeature(feature: string): void {
    const app = this.requireApp();
    const value = String(feature || '').trim();
    if (!value) throw new Error('app.require requires a non-empty feature');
    const features = [...new Set([...(app.requiredFeatures || []), value])];
    this.app = Object.freeze({ ...app, revision: app.revision + 1, requiredFeatures: Object.freeze(features) });
  }
  bind(event: string, actionId: string, sourceRef?: string): void {
    const app = this.requireApp();
    const bindings = [...app.bindings.filter(binding => binding.event !== event || binding.sourceRef !== sourceRef), { event, actionId, sourceRef }];
    this.app = Object.freeze({ ...app, revision: app.revision + 1, bindings: Object.freeze(bindings) });
  }
  snapshot(): CoreSpiritVisualAppState { return this.app; }
  restore(snapshot: CoreSpiritVisualAppState): void { this.app = snapshot ? Object.freeze({ ...snapshot, widgets:Object.freeze(snapshot.widgets.map(widget => Object.freeze({ ...widget }))), bindings:Object.freeze(snapshot.bindings.map(binding => Object.freeze({ ...binding }))) }) : null; }
}
