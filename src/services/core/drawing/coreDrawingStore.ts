import {
  CoreDrawing,
  CoreDrawingCollection,
  cloneCoreDrawing,
  drawingCollection,
  markDrawingDeleted,
  normalizeCoreDrawing,
} from './coreDrawing';

export type CoreDrawingStoreSnapshot = { drawings: CoreDrawing[] };

export class CoreDrawingStore {
  private drawings = new Map<string, CoreDrawing>();
  private undoStack: CoreDrawingStoreSnapshot[] = [];
  private redoStack: CoreDrawingStoreSnapshot[] = [];
  private readonly maxHistory: number;

  constructor(initial: unknown[] = [], maxHistory = 100) {
    this.maxHistory = Math.max(1, Math.floor(maxHistory));
    for (const value of initial) {
      const drawing = normalizeCoreDrawing(value);
      if (drawing) this.drawings.set(drawing.id, drawing);
    }
  }

  list(includeDeleted = false): CoreDrawing[] {
    return [...this.drawings.values()]
      .filter(d => includeDeleted || d.lifecycle !== 'deleted')
      .sort((a, b) => a.zIndex - b.zIndex || String(a.id).localeCompare(String(b.id)))
      .map(cloneCoreDrawing);
  }

  get(id: string): CoreDrawing | undefined {
    const value = this.drawings.get(id);
    return value ? cloneCoreDrawing(value) : undefined;
  }

  add(input: unknown): CoreDrawing | null {
    const drawing = normalizeCoreDrawing(input);
    if (!drawing || this.drawings.has(drawing.id)) return null;
    this.commit();
    this.drawings.set(drawing.id, drawing);
    this.redoStack = [];
    return cloneCoreDrawing(drawing);
  }

  update(id: string, patch: Partial<CoreDrawing>): CoreDrawing | undefined {
    const current = this.drawings.get(id);
    if (!current) return undefined;
    const candidate = normalizeCoreDrawing({ ...current, ...patch, id });
    if (!candidate) return undefined;
    this.commit();
    this.drawings.set(id, candidate);
    this.redoStack = [];
    return cloneCoreDrawing(candidate);
  }

  setPoints(id: string, points: CoreDrawing['points']): CoreDrawing | undefined { return this.update(id, { points }); }
  setProperties(id: string, properties: Partial<Pick<CoreDrawing, 'style' | 'label' | 'metadata'>>): CoreDrawing | undefined { return this.update(id, properties); }
  setVisible(id: string, visible: boolean): CoreDrawing | undefined { return this.update(id, { visible, lifecycle: visible ? 'active' : 'hidden' }); }
  setSelectionEnabled(id: string, enabled: boolean): CoreDrawing | undefined { return this.update(id, { selectionEnabled: enabled }); }
  setLocked(id: string, locked: boolean): CoreDrawing | undefined { return this.update(id, { locked }); }
  setGroup(id: string, groupId?: string): CoreDrawing | undefined { return this.update(id, { groupId }); }

  bringToFront(id: string): CoreDrawing | undefined {
    const max = Math.max(0, ...this.list(true).map(d => d.zIndex));
    return this.update(id, { zIndex: max + 1 });
  }

  sendToBack(id: string): CoreDrawing | undefined {
    const min = Math.min(0, ...this.list(true).map(d => d.zIndex));
    return this.update(id, { zIndex: min - 1 });
  }

  remove(id: string): boolean {
    const current = this.drawings.get(id);
    if (!current || current.lifecycle === 'deleted') return false;
    this.commit();
    this.drawings.set(id, markDrawingDeleted(current));
    this.redoStack = [];
    return true;
  }

  clear(owner?: CoreDrawing['owner']): number {
    const ids = [...this.drawings.values()]
      .filter(d => d.lifecycle !== 'deleted' && (!owner || d.owner === owner))
      .map(d => d.id);
    if (!ids.length) return 0;
    this.commit();
    for (const id of ids) this.drawings.set(id, markDrawingDeleted(this.drawings.get(id)!));
    this.redoStack = [];
    return ids.length;
  }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(this.snapshot());
    this.restore(previous);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    return true;
  }

  toCollection(): CoreDrawingCollection { return drawingCollection(this.list()); }

  load(collection: unknown): void {
    const value = collection as CoreDrawingCollection | { version: 1; drawings: unknown[] };
    this.drawings.clear();
    if ((value?.version === 1 || value?.version === 2) && Array.isArray(value.drawings)) {
      for (const raw of value.drawings) {
        const drawing = normalizeCoreDrawing(raw);
        if (drawing) this.drawings.set(drawing.id, drawing);
      }
    }
    this.undoStack = [];
    this.redoStack = [];
  }

  private snapshot(): CoreDrawingStoreSnapshot { return { drawings: this.list(true) }; }

  private restore(snapshot: CoreDrawingStoreSnapshot): void {
    this.drawings.clear();
    for (const drawing of snapshot.drawings) this.drawings.set(drawing.id, cloneCoreDrawing(drawing));
  }

  private commit(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
  }
}
