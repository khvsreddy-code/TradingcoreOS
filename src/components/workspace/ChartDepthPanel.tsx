import { useSyncExternalStore } from 'react';
import type { NormalizedMarketTick } from '../../types/market';
import { chartMarketKey, chartMarketStore } from '../../services/marketData/chartMarketStore';

export function ChartDepthPanel({ brokerId, instrumentKey, visible }: { brokerId: string; instrumentKey: string; visible: boolean }) {
  const key = chartMarketKey(brokerId, instrumentKey);
  const snapshot = useSyncExternalStore(
    (listener) => chartMarketStore.subscribeSnapshot(key, listener),
    () => chartMarketStore.getSnapshot(key),
    () => chartMarketStore.getSnapshot(key),
  );
  if (!visible) return null;
  const tick: NormalizedMarketTick | undefined = snapshot.tick;

  return <div className="mb-2 rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-2)] px-2 py-1.5 font-mono text-[9px]">
    <div className="mb-1 flex items-center justify-between text-[var(--tco-dim)]">
      <span>L2 · 5-level market depth</span>
      <span className={tick?.bid?.length || tick?.ask?.length ? 'text-[#3b82f6]' : 'text-[var(--tco-dim)]'}>{tick?.bid?.length || tick?.ask?.length ? 'LIVE' : 'WAITING'}</span>
    </div>
    <div className="grid grid-cols-[1fr_80px_1fr] gap-1 text-[9px]">
      <div className="text-right text-[#3b82f6]">BID QTY · PRICE</div><div className="text-center text-[var(--tco-dim)]">LEVEL</div><div className="text-[#ef4444]">PRICE · ASK QTY</div>
      {Array.from({ length: 5 }, (_, i) => {
        const b = tick?.bid?.[i], a = tick?.ask?.[i];
        return <div key={i} className="contents"><div className="text-right text-[#3b82f6]">{b ? `${Math.round(b.quantity).toLocaleString()} · ${b.price.toFixed(2)}` : '—'}</div><div className="text-center text-[var(--tco-dim)]">{i + 1}</div><div className="text-[#ef4444]">{a ? `${a.price.toFixed(2)} · ${Math.round(a.quantity).toLocaleString()}` : '—'}</div></div>;
      })}
    </div>
  </div>;
}
