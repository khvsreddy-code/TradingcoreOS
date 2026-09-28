import type { CoreEventBus } from '../event/eventBus';
import { coreEventBus } from '../event/eventBus';
import type { CoreDrawing, CoreDrawingOwner, CoreDrawingPoint, CoreDrawingViewportAnchor, CoreDrawingStyle } from './coreDrawing';
import { CoreDrawingStore } from './coreDrawingStore';
import { getCoreDrawingTool } from './drawingTools';

export type CreateDrawingOptions = {
  id?: string;
  owner?: CoreDrawingOwner;
  sourceId?: string;
  paneId?: string;
  seriesId?: string;
  style?: CoreDrawingStyle;
  label?: string;
  metadata?: Record<string, unknown>;
  locked?: boolean;
  visible?: boolean;
  selectionEnabled?: boolean;
  zIndex?: number;
  groupId?: string;
  disableUndo?: boolean;
};

export type DrawingEvent = 'create' | 'update' | 'move' | 'points_changed' | 'remove' | 'visibility_changed' | 'properties_changed' | 'selection_changed';

export type DrawingEventPayload = Readonly<{ id: string; type: DrawingEvent; drawing?: CoreDrawing; timestamp: number }>;

function now() { return Date.now(); }

export class CoreDrawingApi {
  private listeners = new Set<(event: DrawingEventPayload) => void>();

  constructor(
    readonly store = new CoreDrawingStore(),
    private readonly bus: CoreEventBus = coreEventBus,
  ) {}

  createPointDrawing(point: CoreDrawingPoint, options: CreateDrawingOptions & { kind: CoreDrawing['kind'] }): string {
    return this.createDataDrawing([point], options);
  }

  createDataDrawing(points: readonly CoreDrawingPoint[], options: CreateDrawingOptions & { kind: CoreDrawing['kind'] }): string {
    const kind = options.kind;
    const definition = getCoreDrawingTool(kind);
    if (definition?.coordinateSpace !== 'data') throw new Error(`Drawing '${kind}' is not a data-coordinate tool.`);
    if (definition && !definition.accepts(points.length)) throw new Error(`Drawing '${kind}' requires ${definition.minPoints}${definition.maxPoints ? `-${definition.maxPoints}` : '+'} points.`);
    const timestamp = now();
    const drawing = this.store.add({
      id: options.id,
      kind,
      points: points.map(point => ({ time: Number(point.time), price: Number(point.price) })),
      coordinateSpace: 'data',
      owner: options.owner ?? 'user',
      sourceId: options.sourceId,
      paneId: options.paneId,
      seriesId: options.seriesId,
      style: options.style,
      label: options.label,
      metadata: options.metadata,
      locked: options.locked,
      visible: options.visible,
      selectionEnabled: options.selectionEnabled,
      zIndex: options.zIndex,
      groupId: options.groupId,
      lifecycle: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (!drawing) throw new Error('Drawing id already exists or definition is invalid.');
    this.emit({ id: drawing.id, type: 'create', drawing, timestamp });
    return drawing.id;
  }

  createAnchoredDrawing(anchor: CoreDrawingViewportAnchor, options: CreateDrawingOptions & { kind: CoreDrawing['kind'] }): string {
    const definition = getCoreDrawingTool(options.kind);
    if (definition?.coordinateSpace !== 'viewport') throw new Error(`Drawing '${options.kind}' is not a viewport-anchored tool.`);
    const timestamp = now();
    const drawing = this.store.add({
      id: options.id,
      kind: options.kind,
      points: [],
      anchor,
      coordinateSpace: 'viewport',
      owner: options.owner ?? 'user',
      sourceId: options.sourceId,
      paneId: options.paneId,
      style: options.style,
      label: options.label,
      metadata: options.metadata,
      locked: options.locked,
      visible: options.visible,
      selectionEnabled: options.selectionEnabled,
      zIndex: options.zIndex,
      groupId: options.groupId,
      lifecycle: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    if (!drawing) throw new Error('Anchored drawing id already exists or is invalid.');
    this.emit({ id: drawing.id, type: 'create', drawing, timestamp });
    return drawing.id;
  }

  getDrawingById(id: string): CoreDrawing | undefined { return this.store.get(id); }
  getAllDrawings(): Array<{ id: string; kind: CoreDrawing['kind'] }> { return this.store.list().map(d => ({ id: d.id, kind: d.kind })); }
  listDrawings(): CoreDrawing[] { return this.store.list(); }

  setProperties(id: string, properties: Partial<Pick<CoreDrawing, 'style' | 'label' | 'metadata'>>): void {
    const drawing = this.store.setProperties(id, properties);
    if (!drawing) return;
    this.emit({ id, type: 'properties_changed', drawing, timestamp: now() });
  }

  setPoints(id: string, points: CoreDrawingPoint[]): void {
    const drawing = this.store.setPoints(id, points);
    if (!drawing) return;
    this.emit({ id, type: 'points_changed', drawing, timestamp: now() });
  }

  setVisible(id: string, visible: boolean): void {
    const drawing = this.store.setVisible(id, visible);
    if (!drawing) return;
    this.emit({ id, type: 'visibility_changed', drawing, timestamp: now() });
  }

  setSelectionEnabled(id: string, enabled: boolean): void {
    const drawing = this.store.setSelectionEnabled(id, enabled);
    if (!drawing) return;
    this.emit({ id, type: 'selection_changed', drawing, timestamp: now() });
  }

  setLocked(id: string, locked: boolean): void { this.store.setLocked(id, locked); }
  bringToFront(id: string): void { const drawing = this.store.bringToFront(id); if (drawing) this.emit({ id, type: 'update', drawing, timestamp: now() }); }
  sendToBack(id: string): void { const drawing = this.store.sendToBack(id); if (drawing) this.emit({ id, type: 'update', drawing, timestamp: now() }); }

  removeEntity(id: string): void {
    const drawing = this.store.get(id);
    if (!drawing || drawing.locked) return;
    if (!this.store.remove(id)) return;
    const deleted = this.store.get(id);
    this.emit({ id, type: 'remove', drawing: deleted, timestamp: now() });
  }

  removeAllDrawings(owner?: CoreDrawingOwner): void {
    const removed = this.store.list().filter(d => !d.locked && (!owner || d.owner === owner)).map(d => d.id);
    for (const id of removed) this.store.remove(id);
    const timestamp = now();
    for (const id of removed) this.emit({ id, type: 'remove', drawing: this.store.get(id), timestamp });
  }

  undo(): boolean { return this.store.undo(); }
  redo(): boolean { return this.store.redo(); }

  createGroupFromSelection(ids: readonly string[], groupId = `group-${now().toString(36)}`): string {
    for (const id of ids) this.store.setGroup(id, groupId);
    return groupId;
  }

  onDrawingEvent(listener: (event: DrawingEventPayload) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: DrawingEventPayload): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch {}
    }
    if (event.type === 'create') this.bus.emit('drawing.created', { id: event.id, owner: event.drawing?.owner ?? 'user', drawing: event.drawing as unknown as Record<string, unknown>, timestamp: event.timestamp });
    else if (event.type === 'remove') this.bus.emit('drawing.deleted', { id: event.id, owner: event.drawing?.owner ?? 'user', timestamp: event.timestamp });
    else this.bus.emit('drawing.updated', { id: event.id, owner: event.drawing?.owner ?? 'user', drawing: event.drawing as unknown as Record<string, unknown>, timestamp: event.timestamp });
  }
}
