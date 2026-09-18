/**
 * TradingCore event bus.
 *
 * This is intentionally dependency-free and synchronous at the dispatch boundary.
 * Producers can publish market/replay/script/model events without knowing which
 * browser-OS modules consume them. Long-running work belongs outside listeners.
 */
export type CoreEventMap = {
  'market.bar': { symbol: string; timeframe: string; bar: Record<string, unknown> };
  'market.tick': { symbol: string; tick: Record<string, unknown>; brokerId?: string; receivedAt: number };
  'market.status': { brokerId?: string; status: string; timestamp: number };
  'market.error': { brokerId?: string; message: string; timestamp: number };
  'market.history.loaded': { symbol: string; timeframe: string; count: number; timestamp: number };
  'drawing.created': { drawing: Record<string, unknown> };
  'drawing.updated': { drawing: Record<string, unknown> };
  'drawing.deleted': { id: string; owner?: string; timestamp: number };
  'drawing.cleared': { owner?: string; timestamp: number };
  'chart.lifecycle': { chartId: string; state: 'ready' | 'loading' | 'updating' | 'error' | 'recovering' | 'disposed'; timestamp: number };
  'market.calculation': {
    symbol: string;
    timeframe: string;
    mode: 'tick' | 'bar';
    timestamp: number;
    barIndex: number;
    isBarClose: boolean;
    values: Record<string, number | null>;
  };
  'replay.started': { sessionId: string; symbol: string; timeframe: string; startTime: number; endTime: number };
  'replay.paused': { sessionId: string; cursorTime: number };
  'replay.stopped': { sessionId: string; cursorTime: number };
  'script.signal': { scriptId: string; time: number; type: string; metadata?: Record<string, unknown> };
  'script.alert': { scriptId: string; time: number; payload: Record<string, unknown> };
  'script.webhook': { scriptId: string; time: number; endpoint?: string; payload: Record<string, unknown> };
  'model.prediction': { modelId: string; symbol: string; timeframe: string; payload: Record<string, unknown> };
  'execution.intent': { source: string; payload: Record<string, unknown> };
};

export type CoreEventName = keyof CoreEventMap;
export type CoreEventListener<K extends CoreEventName> = (payload: CoreEventMap[K]) => void;

export class CoreEventBus {
  private listeners = new Map<CoreEventName, Set<CoreEventListener<any>>>();

  on<K extends CoreEventName>(event: K, listener: CoreEventListener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends CoreEventName>(event: K, listener: CoreEventListener<K>): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit<K extends CoreEventName>(event: K, payload: CoreEventMap[K]): void {
    // A faulty consumer must never prevent unrelated market/chart consumers from receiving an event.
    for (const listener of this.listeners.get(event) ?? []) {
      try { listener(payload); } catch (error) { console.warn(`[TradingCore] event listener failed for ${String(event)}`, error); }
    }
  }

  clear(): void { this.listeners.clear(); }
}

export const coreEventBus = new CoreEventBus();
