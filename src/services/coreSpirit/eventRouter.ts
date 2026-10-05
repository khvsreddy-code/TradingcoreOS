import { CoreEventBus, coreEventBus, type CoreEventMap, type CoreEventName } from '../core/event/eventBus';

export type CoreSpiritBufferedEvent<K extends CoreEventName = CoreEventName> = {
  event: K;
  payload: CoreEventMap[K];
  transactionId: string;
};

/**
 * Runtime event boundary. Realtime speculative evaluations are buffered so
 * rollback cannot leak signal/order/event side effects into the host bus.
 */
export class CoreSpiritEventRouter {
  private transactionActive = false;
  private transactionId?: string;
  private buffered: CoreSpiritBufferedEvent[] = [];

  constructor(private readonly bus: CoreEventBus = coreEventBus) {}

  beginTransaction(transactionId: string): void {
    if (!transactionId) throw new Error('CoreSpirit event transaction requires a transaction id');
    this.transactionActive = true;
    this.transactionId = transactionId;
    this.buffered = [];
  }

  emit<K extends CoreEventName>(event: K, payload: CoreEventMap[K]): void {
    if (this.transactionActive) {
      this.buffered.push({ event, payload, transactionId: this.transactionId! });
      return;
    }
    this.bus.emit(event, payload);
  }

  commitTransaction(transactionId: string): void {
    if (!this.transactionActive) return;
    if (this.transactionId !== transactionId) throw new Error(`stale CoreSpirit event transaction '${transactionId}' cannot commit '${this.transactionId}'`);
    const pending = this.buffered.filter(item => item.transactionId === transactionId);
    this.buffered = [];
    this.transactionActive = false;
    this.transactionId = undefined;
    for (const item of pending) this.bus.emit(item.event as any, item.payload as any);
  }

  rollbackTransaction(transactionId?: string): void {
    if (!this.transactionActive) return;
    if (transactionId && this.transactionId !== transactionId) {
      throw new Error(`stale CoreSpirit event transaction '${transactionId}' cannot rollback '${this.transactionId}'`);
    }
    this.buffered = [];
    this.transactionActive = false;
    this.transactionId = undefined;
  }

  scriptEvent(payload: CoreEventMap['script.event']): void { this.emit('script.event', payload); }
  marketTrade(payload: CoreEventMap['market.trade']): void { this.emit('market.trade', payload); }
  marketOrderBook(payload: CoreEventMap['market.orderbook']): void { this.emit('market.orderbook', payload); }
  executionOrder(payload: CoreEventMap['execution.order']): void { this.emit('execution.order', payload); }
  executionFill(payload: CoreEventMap['execution.fill']): void { this.emit('execution.fill', payload); }
  scriptSignal(payload: CoreEventMap['script.signal']): void { this.emit('script.signal', payload); }
  scriptAlert(payload: CoreEventMap['script.alert']): void { this.emit('script.alert', payload); }
  scriptWebhook(payload: CoreEventMap['script.webhook']): void { this.emit('script.webhook', payload); }
  executionIntent(source: string, payload: unknown): void { this.emit('execution.intent', { source, payload } as CoreEventMap['execution.intent']); }

  isTransactionActive(): boolean { return this.transactionActive; }
  getTransactionId(): string | undefined { return this.transactionId; }
  getPendingCount(): number { return this.buffered.length; }
}
