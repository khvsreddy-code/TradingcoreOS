import type { Millis } from './time';

export type SceneNodeKind =
    | 'pane'
    | 'layer'
    | 'series'
    | 'markers'
    | 'drawing'
    | 'heatmap'
    | 'label';

export interface SceneViewportBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SceneDataRange {
    from: Millis;
    to: Millis;
    min?: number;
    max?: number;
}

export const SceneDirty = {
    None: 0,
    Data: 1 << 0,
    Style: 1 << 1,
    Layout: 1 << 2,
    Transform: 1 << 3,
    Visibility: 1 << 4,
    Structure: 1 << 5,
    All: (1 << 6) - 1,
} as const;

export type SceneDirtyFlags = number;

export interface SceneNode<TPayload = unknown> {
    readonly id: string;
    readonly parentId?: string;
    readonly kind: SceneNodeKind;
    zIndex: number;
    visibility: boolean;
    dirty: SceneDirtyFlags;
    revision: number;
    viewportRevision: number;
    viewportBounds?: SceneViewportBounds;
    dataRange?: SceneDataRange;
    style?: unknown;
    payload?: TPayload;
}

export interface SceneViewport {
    from: Millis;
    to: Millis;
    bounds: SceneViewportBounds;
    revision: number;
}

/**
 * Renderer-neutral retained scene.
 *
 * It deliberately does not know how a node is painted. The renderer consumes only
 * the nodes that are dirty + visible for the current viewport. Large collections
 * (FVGs, heatmap cells, footprint bins, etc.) should be represented by ONE node
 * whose payload is an instance buffer, not one node per primitive.
 */
export class RetainedSceneGraph {
    private readonly nodes = new Map<string, SceneNode>();
    private readonly children = new Map<string, Set<string>>();
    private revisionCounter = 0;
    private viewport: SceneViewport | null = null;

    get size(): number {
        return this.nodes.size;
    }

    get viewportRevision(): number {
        return this.viewport?.revision ?? 0;
    }

    getNode(id: string): SceneNode | undefined {
        return this.nodes.get(id);
    }

    upsert<TPayload>(node: Omit<SceneNode<TPayload>, 'dirty' | 'revision' | 'viewportRevision'> & { dirty?: SceneDirtyFlags }): SceneNode<TPayload> {
        const previous = this.nodes.get(node.id);
        const dirty = node.dirty ?? (previous ? SceneDirty.Structure : SceneDirty.All);
        const next: SceneNode<TPayload> = {
            ...node,
            dirty,
            revision: ++this.revisionCounter,
            viewportRevision: this.viewport?.revision ?? 0,
        };
        this.nodes.set(node.id, next);
        this.relink(previous?.parentId, node.parentId, node.id);
        return next;
    }

    remove(id: string): boolean {
        const node = this.nodes.get(id);
        if (!node) return false;

        const descendantIds = this.descendants(id);
        for (const childId of descendantIds.reverse()) this.removeOne(childId);
        this.removeOne(id);
        return true;
    }

    removeChildren(parentId: string, keepIds?: ReadonlySet<string>): void {
        const ids = [...(this.children.get(parentId) ?? [])];
        for (const id of ids) {
            if (!keepIds?.has(id)) this.remove(id);
        }
    }

    markDirty(id: string, flags = SceneDirty.Data): void {
        const node = this.nodes.get(id);
        if (!node) return;
        node.dirty |= flags;
        node.revision = ++this.revisionCounter;
    }

    markSubtreeDirty(id: string, flags = SceneDirty.Data): void {
        this.markDirty(id, flags);
        for (const childId of this.children.get(id) ?? []) this.markSubtreeDirty(childId, flags);
    }

    markKindDirty(kind: SceneNodeKind, flags = SceneDirty.Data): void {
        for (const node of this.nodes.values()) {
            if (node.kind === kind) {
                node.dirty |= flags;
                node.revision = ++this.revisionCounter;
            }
        }
    }

    setVisibility(id: string, visible: boolean): void {
        const node = this.nodes.get(id);
        if (!node || node.visibility === visible) return;
        node.visibility = visible;
        this.markDirty(id, SceneDirty.Visibility);
        for (const childId of this.children.get(id) ?? []) this.setVisibility(childId, visible);
    }

    setViewport(viewport: Omit<SceneViewport, 'revision'>): boolean {
        const previous = this.viewport;
        const nextRevision = (previous?.revision ?? 0) + 1;
        const next: SceneViewport = { ...viewport, revision: nextRevision };
        const changed = !previous
            || previous.from !== next.from
            || previous.to !== next.to
            || previous.bounds.x !== next.bounds.x
            || previous.bounds.y !== next.bounds.y
            || previous.bounds.width !== next.bounds.width
            || previous.bounds.height !== next.bounds.height;

        this.viewport = next;
        if (!changed) return false;

        for (const node of this.nodes.values()) {
            if (!node.visibility) continue;
            node.dirty |= SceneDirty.Transform;
            node.revision = ++this.revisionCounter;
            node.viewportRevision = nextRevision;
        }
        return true;
    }

    setDataRange(id: string, range: SceneDataRange | undefined): void {
        const node = this.nodes.get(id);
        if (!node) return;
        node.dataRange = range;
        this.markDirty(id, SceneDirty.Data);
    }

    setViewportBounds(id: string, bounds: SceneViewportBounds | undefined): void {
        const node = this.nodes.get(id);
        if (!node) return;
        node.viewportBounds = bounds;
        this.markDirty(id, SceneDirty.Layout | SceneDirty.Transform);
    }

    queryDirty(options: {
        kinds?: readonly SceneNodeKind[];
        includeHidden?: boolean;
        flags?: SceneDirtyFlags;
    } = {}): SceneNode[] {
        const allowedKinds = options.kinds ? new Set(options.kinds) : null;
        const required = options.flags ?? SceneDirty.All;

        return [...this.nodes.values()]
            .filter((node) => (allowedKinds == null || allowedKinds.has(node.kind)))
            .filter((node) => options.includeHidden || node.visibility)
            .filter((node) => (node.dirty & required) !== 0)
            .filter((node) => this.intersectsViewport(node))
            .sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
    }

    clearDirty(id: string, flags = SceneDirty.All): void {
        const node = this.nodes.get(id);
        if (!node) return;
        node.dirty &= ~flags;
    }

    clearDirtyNodes(nodes: readonly SceneNode[], flags = SceneDirty.All): void {
        for (const node of nodes) this.clearDirty(node.id, flags);
    }

    snapshot(): SceneNode[] {
        return [...this.nodes.values()].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
    }

    private intersectsViewport(node: SceneNode): boolean {
        const viewport = this.viewport;
        const range = node.dataRange;
        if (!viewport || !range) return true;
        return range.to >= viewport.from && range.from <= viewport.to;
    }

    private descendants(id: string): string[] {
        const out: string[] = [];
        const visit = (parentId: string): void => {
            for (const childId of this.children.get(parentId) ?? []) {
                out.push(childId);
                visit(childId);
            }
        };
        visit(id);
        return out;
    }

    private relink(previousParent: string | undefined, nextParent: string | undefined, id: string): void {
        if (previousParent === nextParent) return;
        if (previousParent) this.children.get(previousParent)?.delete(id);
        if (!nextParent) return;
        let set = this.children.get(nextParent);
        if (!set) {
            set = new Set<string>();
            this.children.set(nextParent, set);
        }
        set.add(id);
    }

    private removeOne(id: string): void {
        const node = this.nodes.get(id);
        if (!node) return;
        if (node.parentId) this.children.get(node.parentId)?.delete(id);
        this.children.delete(id);
        this.nodes.delete(id);
    }
}
