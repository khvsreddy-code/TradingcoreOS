import { CoreDrawing, CoreDrawingOwner, normalizeCoreDrawing } from './coreDrawing';
import { CoreDrawingStore } from './coreDrawingStore';
import { CoreEventBus, coreEventBus } from '../event/eventBus';
import { CoreSpiritObject } from '../../coreSpirit/types';

/** Converts declarative CoreSpirit outputs into canonical CoreDrawing objects. */
export class CoreDrawingDispatcher {
  constructor(private readonly store: CoreDrawingStore, private readonly bus: CoreEventBus = coreEventBus) {}

  accept(output: CoreSpiritObject, sourceId = 'coreSpirit', owner: CoreDrawingOwner = 'script'): CoreDrawing | null {
    const now = Date.now();
    let raw: unknown;
    if (output.kind === 'line') raw = { id: `${sourceId}:line:${output.start.time}:${output.end.time}`, kind: 'trendline', points: [output.start, output.end], owner, sourceId, lifecycle: 'active', coordinateSpace: 'data', style: output.style, createdAt: now, updatedAt: now };
    else if (output.kind === 'zone') raw = { id: `${sourceId}:zone:${output.left}:${output.right}`, kind: 'zone', points: [{time:output.left,price:output.top},{time:output.right,price:output.bottom}], owner, sourceId, lifecycle: 'active', coordinateSpace: 'data', metadata: { state: output.state }, createdAt: now, updatedAt: now };
    else if (output.kind === 'marker') raw = { id: `${sourceId}:marker:${output.time}`, kind: 'marker', points: [{time:output.time,price:output.price}], owner, sourceId, lifecycle: 'active', coordinateSpace: 'data', metadata: output.metadata, createdAt: now, updatedAt: now };
    else return null;
    const drawing = normalizeCoreDrawing(raw, owner);
    if (!drawing) return null;
    const existing = this.store.get(drawing.id);
    if (existing) this.store.update(drawing.id, drawing);
    else this.store.add(drawing);
    this.bus.emit(existing ? 'drawing.updated' : 'drawing.created', { id: drawing.id, owner: drawing.owner, drawing: drawing as unknown as Record<string, unknown>, timestamp: now });
    return drawing;
  }
}
