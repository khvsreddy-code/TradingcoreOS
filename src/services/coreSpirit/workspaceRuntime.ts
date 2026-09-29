/** Runtime-owned state for declarative visuals and visual applications. */
import { buildCoreSpiritSceneFromDeclarativeVisuals, type CoreSpiritDeclarativeVisualSpec, type CoreSpiritDeclarativeVisualState, CORE_SPIRIT_DECLARATIVE_VISUAL_VERSION, normalizeCoreSpiritDeclarativeVisual, removeDeclarativeVisual, replaceDeclarativeVisual } from './declarativeVisual';
import { CoreSpiritVisualAppRuntime, type CoreSpiritVisualAppState } from './visualApp';
import type { CoreSpiritScene, CoreSpiritSceneIdentity } from './visualScene';

export type CoreSpiritWorkspaceState = Readonly<{
  visuals: CoreSpiritDeclarativeVisualState;
  app: CoreSpiritVisualAppState;
}>;

export class CoreSpiritWorkspaceRuntime {
  private visualState: CoreSpiritDeclarativeVisualState = Object.freeze({ version: CORE_SPIRIT_DECLARATIVE_VISUAL_VERSION, revision: 0, specs: Object.freeze([]) });
  private readonly appRuntime = new CoreSpiritVisualAppRuntime();

  reset(): void {
    this.visualState = Object.freeze({ version: CORE_SPIRIT_DECLARATIVE_VISUAL_VERSION, revision: 0, specs: Object.freeze([]) });
    this.appRuntime.reset();
  }

  declareVisual(spec: CoreSpiritDeclarativeVisualSpec): string {
    const normalized = normalizeCoreSpiritDeclarativeVisual(spec);
    this.visualState = replaceDeclarativeVisual(this.visualState, normalized);
    return `visual:${normalized.id}`;
  }

  removeVisual(id: string): void { this.visualState = removeDeclarativeVisual(this.visualState, id); }
  createApp(title: string, id?: string): string { return this.appRuntime.create(title, id); }
  appChart(id?: string, slot?: any, sourceRef?: string): string { return this.appRuntime.chart(id, slot, sourceRef); }
  appPanel(slot: any, kind: any, id?: string, title?: string, sourceRef?: string): string { return this.appRuntime.panel(slot, kind, id, title, sourceRef); }
  appOverlay(kind: any, sourceRef?: string, id?: string): string { return this.appRuntime.overlay(kind, sourceRef, id); }
  appTargets(...targets: any[]): void { this.appRuntime.targets(...targets); }
  appRequireFeature(feature: string): void { this.appRuntime.requireFeature(feature); }
  appBind(event: string, actionId: string, sourceRef?: string): void { this.appRuntime.bind(event, actionId, sourceRef); }

  snapshot(): CoreSpiritWorkspaceState { return Object.freeze({ visuals: Object.freeze({ ...this.visualState, specs:Object.freeze(this.visualState.specs.map(spec => Object.freeze({ ...spec, properties:Object.freeze({ ...spec.properties }) })))}), app: this.appRuntime.snapshot() }); }
  restore(snapshot: CoreSpiritWorkspaceState): void {
    this.visualState = Object.freeze({ version: CORE_SPIRIT_DECLARATIVE_VISUAL_VERSION, revision: snapshot.visuals.revision, specs:Object.freeze(snapshot.visuals.specs.map(spec => normalizeCoreSpiritDeclarativeVisual(spec))) });
    this.appRuntime.restore(snapshot.app);
  }
  getVisualState(): CoreSpiritDeclarativeVisualState { return this.visualState; }
  getAppState(): CoreSpiritVisualAppState { return this.appRuntime.snapshot(); }
  buildScene(identity: CoreSpiritSceneIdentity, sourceId: string, revision = this.visualState.revision): CoreSpiritScene {
    return buildCoreSpiritSceneFromDeclarativeVisuals(identity, this.visualState.specs, sourceId, revision);
  }
}
