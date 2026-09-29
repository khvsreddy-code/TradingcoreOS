export type ChartPerformanceSnapshot = {
  key: string;
  packets: number;
  rendererUpdates: number;
  reactNotificationRequests: number;
  reactFrames: number;
  coalescedReactNotifications: number;
  totalRendererMs: number;
  averageRendererMs: number;
  worstRendererMs: number;
  packetsPerRendererUpdate: number;
  reactCoalescingRate: number;
};

type MutableMetrics = {
  packets: number;
  rendererUpdates: number;
  reactNotificationRequests: number;
  reactFrames: number;
  totalRendererMs: number;
  worstRendererMs: number;
};

class ChartPerformanceTelemetry {
  private readonly metrics = new Map<string, MutableMetrics>();

  private entry(key: string): MutableMetrics {
    let value = this.metrics.get(key);
    if (!value) {
      value = { packets: 0, rendererUpdates: 0, reactNotificationRequests: 0, reactFrames: 0, totalRendererMs: 0, worstRendererMs: 0 };
      this.metrics.set(key, value);
    }
    return value;
  }

  recordPacket(key: string): void { this.entry(key).packets += 1; }
  recordReactNotificationRequest(key: string): void { this.entry(key).reactNotificationRequests += 1; }
  recordReactFrame(key: string): void { this.entry(key).reactFrames += 1; }

  recordRendererUpdate(key: string, durationMs: number): void {
    const m = this.entry(key);
    const duration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    m.rendererUpdates += 1;
    m.totalRendererMs += duration;
    m.worstRendererMs = Math.max(m.worstRendererMs, duration);
  }

  snapshot(key: string): ChartPerformanceSnapshot {
    const m = this.metrics.get(key) || { packets: 0, rendererUpdates: 0, reactNotificationRequests: 0, reactFrames: 0, totalRendererMs: 0, worstRendererMs: 0 };
    const coalesced = Math.max(0, m.reactNotificationRequests - m.reactFrames);
    return {
      key,
      packets: m.packets,
      rendererUpdates: m.rendererUpdates,
      reactNotificationRequests: m.reactNotificationRequests,
      reactFrames: m.reactFrames,
      coalescedReactNotifications: coalesced,
      totalRendererMs: m.totalRendererMs,
      averageRendererMs: m.rendererUpdates ? m.totalRendererMs / m.rendererUpdates : 0,
      worstRendererMs: m.worstRendererMs,
      packetsPerRendererUpdate: m.rendererUpdates ? m.packets / m.rendererUpdates : 0,
      reactCoalescingRate: m.reactNotificationRequests ? coalesced / m.reactNotificationRequests : 0,
    };
  }

  reset(key?: string): void {
    if (key == null) this.metrics.clear(); else this.metrics.delete(key);
  }
}

export const chartPerformanceTelemetry = new ChartPerformanceTelemetry();
