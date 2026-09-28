/**
 * CoreSpirit renderer-neutral visual ABI — Stage 46.
 *
 * CoreSpirit produces scenes. Renderers consume scenes.
 * No DOM, Canvas, SVG, WebGL, Lightweight Charts, or native UI objects
 * may appear in the CoreSpirit scene/artifact contract.
 */

import {
  CORE_SPIRIT_SCENE_VERSION,
  type CoreSpiritScene,
  type CoreSpiritSceneDiff,
  type CoreSpiritSceneKind,
  type CoreSpiritSceneLayer,
} from "./visualScene";

export const CORE_SPIRIT_RENDERER_ABI_VERSION = 1 as const;

export type CoreSpiritRenderBackend =
  | "web"
  | "desktop"
  | "mobile"
  | "image"
  | "replay"
  | "headless";

export type CoreSpiritRendererCapability =
  | "2d"
  | "raster-export"
  | "vector-export"
  | "hit-testing"
  | "pointer-events"
  | "animation"
  | "high-dpi"
  | "offscreen"
  | "advanced-geometry"
  | "texture"
  | "animation-clock";

export interface CoreSpiritRendererTarget {
  id: string;
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface CoreSpiritRendererCapabilities {
  backend: CoreSpiritRenderBackend;
  supports: readonly CoreSpiritRendererCapability[];
}

export interface CoreSpiritRenderCommand {
  op: "upsert" | "remove";
  nodeId: string;
  kind?: CoreSpiritSceneKind;
  layer?: CoreSpiritSceneLayer;
  zIndex?: number;
  interactive?: boolean;
  actionIds?: readonly string[];
}

export interface CoreSpiritRenderFrame {
  abiVersion: typeof CORE_SPIRIT_RENDERER_ABI_VERSION;
  sceneVersion: typeof CORE_SPIRIT_SCENE_VERSION;
  backend: CoreSpiritRenderBackend;
  revision: number;
  sceneChecksum: string;
  commands: readonly CoreSpiritRenderCommand[];
}

export interface CoreSpiritRenderer {
  readonly capabilities: CoreSpiritRendererCapabilities;
  mount(target: CoreSpiritRendererTarget): void;
  render(scene: CoreSpiritScene): CoreSpiritRenderFrame;
  applyDiff(
    diff: CoreSpiritSceneDiff,
    nextScene: CoreSpiritScene,
  ): CoreSpiritRenderFrame;
  dispose(): void;
}

export interface CoreSpiritRendererFactory {
  readonly backend: CoreSpiritRenderBackend;
  create(): CoreSpiritRenderer;
}

export class CoreSpiritRendererRegistry {
  private readonly factories = new Map<CoreSpiritRenderBackend, CoreSpiritRendererFactory>();

  register(factory: CoreSpiritRendererFactory): void {
    if (this.factories.has(factory.backend)) {
      throw new Error(`renderer backend '${factory.backend}' is already registered`);
    }
    this.factories.set(factory.backend, factory);
  }

  has(backend: CoreSpiritRenderBackend): boolean {
    return this.factories.has(backend);
  }

  create(backend: CoreSpiritRenderBackend): CoreSpiritRenderer {
    const factory = this.factories.get(backend);
    if (!factory) throw new Error(`no CoreSpirit renderer registered for '${backend}'`);
    return factory.create();
  }

  list(): CoreSpiritRenderBackend[] {
    return [...this.factories.keys()].sort();
  }
}

/**
 * Deterministic renderer used by replay/export tests.
 * It stores no platform objects and therefore works without a browser.
 */
export class CoreSpiritHeadlessRenderer implements CoreSpiritRenderer {
  readonly capabilities: CoreSpiritRendererCapabilities = Object.freeze({
    backend: "headless",
    supports: ["2d", "raster-export", "vector-export", "offscreen", "advanced-geometry", "animation-clock"] as const,
  });

  private target?: CoreSpiritRendererTarget;
  private lastFrame?: CoreSpiritRenderFrame;

  mount(target: CoreSpiritRendererTarget): void {
    this.target = { ...target };
  }

  render(scene: CoreSpiritScene): CoreSpiritRenderFrame {
    this.lastFrame = {
      abiVersion: CORE_SPIRIT_RENDERER_ABI_VERSION,
      sceneVersion: scene.version,
      backend: "headless",
      revision: scene.revision,
      sceneChecksum: scene.checksum,
      commands: scene.nodes.map(node => ({
        op: "upsert",
        nodeId: node.id,
        kind: node.kind,
        layer: node.layer,
        zIndex: node.zIndex,
        interactive: node.interactive,
        actionIds: [node.interaction?.onClick?.actionId, node.interaction?.onHover?.actionId, node.interaction?.onContextMenu?.actionId].filter((x): x is string => Boolean(x)),
      })),
    };
    return this.lastFrame;
  }

  applyDiff(diff: CoreSpiritSceneDiff, nextScene: CoreSpiritScene): CoreSpiritRenderFrame {
    const commands: CoreSpiritRenderCommand[] = [
      ...diff.added.map(node => ({
        op: "upsert" as const,
        nodeId: node.id,
        kind: node.kind,
        layer: node.layer,
        zIndex: node.zIndex,
        interactive: node.interactive,
        actionIds: [node.interaction?.onClick?.actionId, node.interaction?.onHover?.actionId, node.interaction?.onContextMenu?.actionId].filter((x): x is string => Boolean(x)),
      })),
      ...diff.updated.map(node => ({
        op: "upsert" as const,
        nodeId: node.id,
        kind: node.kind,
        layer: node.layer,
        zIndex: node.zIndex,
        interactive: node.interactive,
        actionIds: [node.interaction?.onClick?.actionId, node.interaction?.onHover?.actionId, node.interaction?.onContextMenu?.actionId].filter((x): x is string => Boolean(x)),
      })),
      ...diff.removed.map(nodeId => ({ op: "remove" as const, nodeId })),
    ];

    this.lastFrame = {
      abiVersion: CORE_SPIRIT_RENDERER_ABI_VERSION,
      sceneVersion: nextScene.version,
      backend: "headless",
      revision: nextScene.revision,
      sceneChecksum: nextScene.checksum,
      commands,
    };
    return this.lastFrame;
  }

  getTarget(): CoreSpiritRendererTarget | undefined {
    return this.target ? { ...this.target } : undefined;
  }

  getLastFrame(): CoreSpiritRenderFrame | undefined {
    return this.lastFrame ? {
      ...this.lastFrame,
      commands: this.lastFrame.commands.map(command => ({ ...command })),
    } : undefined;
  }

  dispose(): void {
    this.target = undefined;
    this.lastFrame = undefined;
  }
}

export const coreSpiritRendererRegistry = new CoreSpiritRendererRegistry();

coreSpiritRendererRegistry.register({
  backend: "headless",
  create: () => new CoreSpiritHeadlessRenderer(),
});
