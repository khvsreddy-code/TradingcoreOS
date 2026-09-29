export type CoreMarketStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | string;

export type CoreEventMap = {
  'market.bar': { symbol: string; timeframe: string; bar: Record<string, unknown>; sequence?: number; source?: 'live' | 'replay' };
  'market.tick': { symbol: string; timeframe?: string; tick: Record<string, unknown>; brokerId?: string; receivedAt?: number; sequence?: number; source?: 'live' | 'replay' };
  'market.calculation': { symbol: string; timeframe: string; mode: 'tick' | 'bar'; timestamp: number; barIndex: number; isBarClose: boolean; values: Record<string, number | null>; sequence?: number };
  'market.history.loaded': { symbol: string; timeframe: string; count: number; timestamp: number; sequence?: number };
  'market.status': { brokerId?: string; status: CoreMarketStatus; timestamp: number; sequence?: number };
  'market.error': { brokerId?: string; message: string; timestamp: number; sequence?: number };
  'replay.started': { sessionId: string; symbol: string; timeframe: string; startTime: number; endTime: number; sequence?: number };
  'replay.paused': { sessionId: string; cursorTime: number; sequence?: number };
  'replay.stopped': { sessionId: string; cursorTime: number; sequence?: number };
  'replay.step': { sessionId: string; cursorTime: number; index: number; sequence?: number };
  'script.signal': { scriptId: string; time: number; type: string; metadata?: Record<string, unknown>; sequence?: number };
  'script.event': { scriptId: string; time: number; name: string; destinations?: unknown[]; metadata?: Record<string, unknown>; sequence?: number };
  'script.alert': { scriptId: string; time: number; payload: Record<string, unknown>; sequence?: number };
  'script.webhook': { scriptId: string; time: number; endpoint?: string; payload: Record<string, unknown>; sequence?: number };
  'model.prediction': { modelId: string; symbol: string; timeframe: string; payload: Record<string, unknown>; sequence?: number };
  'execution.intent': { source: string; payload: Record<string, unknown>; sequence?: number };
  'drawing.created': { id: string; owner: string; drawing?: Record<string, unknown>; timestamp?: number; sequence?: number };
  'drawing.updated': { id: string; owner: string; drawing?: Record<string, unknown>; timestamp?: number; sequence?: number };
  'drawing.deleted': { id: string; owner: string; timestamp: number; sequence?: number };
  'drawing.cleared': { owner: string; timestamp: number; sequence?: number };
  'chart.lifecycle': { chartId: string; state: 'ready' | 'loading' | 'updating' | 'error' | 'recovering' | 'disposed'; timestamp: number; sequence?: number };
  'chart.telemetry': { chartId: string; symbol: string; timeframe: string; metric: 'history_to_paint_ms' | 'initial_candle_count' | 'switch_to_paint_ms' | 'history_cache_hit'; value: number; timestamp: number; sequence?: number };
};

export type CoreEventName = keyof CoreEventMap;
export type CoreEventListener<K extends CoreEventName> = (payload: CoreEventMap[K]) => void;

/** Typed, ordered, failure-isolated event boundary between Chart, CoreSpirit, replay, ML and execution. */
export class CoreEventBus {
  private listeners = new Map<CoreEventName, Set<CoreEventListener<any>>>();
  private sequence = 0;

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

  emit<K extends CoreEventName>(event: K, payload: CoreEventMap[K]): number {
    const sequence = payload.sequence ?? ++this.sequence;
    if (sequence > this.sequence) this.sequence = sequence;
    const sequenced = { ...payload, sequence } as CoreEventMap[K];
    for (const listener of this.listeners.get(event) ?? []) {
      try { listener(sequenced); }
      catch (error) { console.warn(`[TradingCore] event listener failed for ${String(event)}`, error); }
    }
    return sequence;
  }

  getSequence(): number { return this.sequence; }
  clear(): void { this.listeners.clear(); this.sequence = 0; }
}

export const coreEventBus = new CoreEventBus();
