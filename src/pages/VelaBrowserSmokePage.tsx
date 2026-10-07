import { useEffect, useRef } from 'react';
import { Vela } from '../../vendor/vela/src';

type SmokeState = {
  phase: 'boot' | 'ready' | 'indicator-ready' | 'failed';
  bars: number;
  canvasCount: number;
  historyComplete: boolean;
  nativeIndicator: string | null;
  error: string | null;
};

declare global {
  interface Window {
    __TCO_VELA_SMOKE__?: SmokeState;
  }
}

function makeBars(count = 360) {
  const start = Date.UTC(2026, 0, 2, 9, 15);
  const step = 5 * 60_000;
  const bars = [];
  let close = 24_800;
  for (let i = 0; i < count; i += 1) {
    const wave = Math.sin(i / 17) * 22;
    const drift = (i / count) * 180;
    const open = close;
    close = open + Math.sin(i / 7) * 18 + wave * 0.35 + drift * 0.01;
    const high = Math.max(open, close) + 8 + Math.abs(Math.sin(i / 5)) * 7;
    const low = Math.min(open, close) - 8 - Math.abs(Math.cos(i / 6)) * 7;
    bars.push({
      time: start + i * step,
      open,
      high,
      low,
      close,
      volume: 1_000 + ((i * 37) % 700),
    });
  }
  return bars;
}

const INITIAL: SmokeState = {
  phase: 'boot',
  bars: 0,
  canvasCount: 0,
  historyComplete: false,
  nativeIndicator: null,
  error: null,
};

function publish(host: HTMLElement, patch: Partial<SmokeState>) {
  const prev = window.__TCO_VELA_SMOKE__ ?? INITIAL;
  const next = { ...prev, ...patch };
  window.__TCO_VELA_SMOKE__ = next;
  host.dataset.tcoVelaSmoke = next.phase;
  host.dataset.tcoVelaSmokeBars = String(next.bars);
  host.dataset.tcoVelaSmokeCanvasCount = String(next.canvasCount);
  host.dataset.tcoVelaSmokeHistoryComplete = String(next.historyComplete);
  host.dataset.tcoVelaSmokeIndicator = next.nativeIndicator ?? '';
  if (next.error) host.dataset.tcoVelaSmokeError = next.error;
  else delete host.dataset.tcoVelaSmokeError;
}

function waitForIndicator(handle: { on: (event: 'ready' | 'error', cb: (payload: any) => void) => () => void }): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    let offReady = () => {};
    let offError = () => {};
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      offReady();
      offError();
      error ? reject(error) : resolve();
    };
    offReady = handle.on('ready', () => finish());
    offError = handle.on('error', ({ error }: { error: Error }) => finish(error));
  });
}

export function VelaBrowserSmokePage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    const bars = makeBars();
    publish(host, INITIAL);

    const chart = new Vela(host, {
      data: bars,
      timeframe: '5',
      live: false,
      theme: 'dark',
      volume: true,
      drawings: false,
      currentPriceLine: true,
      nativeBackend: 'canvas2d',
      animations: false,
    });

    const refresh = () => {
      const canvasCount = host.querySelectorAll('canvas').length;
      publish(host, {
        bars: bars.length,
        canvasCount,
      });
    };

    const offReady = chart.on('ready', refresh);
    const offHistory = chart.on('history:complete', () => {
      if (disposed) return;
      publish(host, { historyComplete: true });
      refresh();
    });
    const offError = chart.on('indicator:error', ({ error }) => {
      if (!disposed) publish(host, { phase: 'failed', error: error.message });
    });

    void chart.ready()
      .then(async () => {
        if (disposed) return;
        refresh();

        const handle = chart.addNativeIndicator('sma', {
          inputs: { length: 20 },
        });
        publish(host, { nativeIndicator: handle.id });

        await waitForIndicator(handle);
        if (disposed) return;

        await chart.historyComplete();
        if (disposed) return;

        refresh();
        publish(host, { phase: 'indicator-ready', historyComplete: true });
      })
      .catch((error: unknown) => {
        if (!disposed) publish(host, {
          phase: 'failed',
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      disposed = true;
      offReady();
      offHistory();
      offError();
      chart.destroy();
      window.__TCO_VELA_SMOKE__ = undefined;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#070a10] p-4 text-[#f3f4f6]">
      <section
        ref={hostRef}
        data-tco-vela-smoke="boot"
        aria-label="TradingCoreOS Vela browser smoke chart"
        className="vela-workspace relative h-[680px] w-full overflow-hidden rounded-xl border border-[#252b3a] bg-[#070a10]"
      />
    </main>
  );
}
