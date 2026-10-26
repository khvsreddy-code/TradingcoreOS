import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, X } from 'lucide-react';
import { loadTradingCoreRuntime, type TradingCoreRuntimeApi } from '../../services/runtime/tradingCoreRuntimeLoader';
import { hasValidFyersSession } from '../../services/marketData/yahooFallback';

const DAILY_DISMISS_KEY_PREFIX = 'tradingcore:fyers-prompt-dismissed:v1:';
const CHECK_INTERVAL_MS = 15_000;

function localDateKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function readDismissedToday(): boolean {
  try { return localStorage.getItem(DAILY_DISMISS_KEY_PREFIX + localDateKey()) === '1'; } catch { return false; }
}

function writeDismissedToday(): void {
  try { localStorage.setItem(DAILY_DISMISS_KEY_PREFIX + localDateKey(), '1'); } catch {}
}

function expiredFyersConnection(runtime: TradingCoreRuntimeApi | null): boolean {
  const fyers = runtime?.getAllConnections().find(connection => String(connection.brokerId).toLowerCase() === 'fyers');
  if (!fyers) return false;
  const expiresAt = Date.parse(String(fyers.tokenExpiry || ''));
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() + 5_000;
}

export function fyersPromptDismissedToday(): boolean {
  return readDismissedToday();
}

export function dismissFyersPromptForToday(): void {
  writeDismissedToday();
}

export function FyersConnectionPrompt({
  onConnect,
  floating = false,
}: {
  onConnect: () => void;
  floating?: boolean;
}) {
  const [runtime, setRuntime] = useState<TradingCoreRuntimeApi | null>(null);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(() => !readDismissedToday());
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const evaluate = (loaded: TradingCoreRuntimeApi) => {
      if (cancelled) return;
      const valid = hasValidFyersSession(loaded.getAllConnections());
      const expiredNow = expiredFyersConnection(loaded);
      setExpired(expiredNow);
      setReady(valid);
      setVisible(!valid && !readDismissedToday());
    };
    void loadTradingCoreRuntime().then(async loaded => {
      try { await loaded.restoreBrokerConnections(); } catch { /* fallback mode must not depend on FYERS session restore */ }
      if (cancelled) return;
      setRuntime(loaded);
      evaluate(loaded);
      timer = setInterval(() => evaluate(loaded), CHECK_INTERVAL_MS);
      const offConnected = loaded.on('BROKER_CONNECTED', () => evaluate(loaded));
      const offDisconnected = loaded.on('BROKER_DISCONNECTED', () => evaluate(loaded));
      const offStatus = loaded.on('STATUS_CHANGED', () => evaluate(loaded));
      // Reuse the same lifetime for event subscriptions and polling.
      cleanupEvents = () => { offConnected(); offDisconnected(); offStatus(); };
    }).catch(() => {
      if (!cancelled) {
        setReady(false);
        setExpired(false);
        setVisible(!readDismissedToday());
      }
    });
    let cleanupEvents: (() => void) | undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      cleanupEvents?.();
    };
  }, []);

  if (ready || !visible) return null;

  const dismiss = () => {
    writeDismissedToday();
    setVisible(false);
  };

  return (
    <section
      role="status"
      aria-live="polite"
      className={floating
        ? 'tco-fyers-prompt tco-fyers-prompt-floating'
        : 'tco-fyers-prompt tco-fyers-prompt-inline'}
    >
      <div className="tco-fyers-prompt-icon" aria-hidden="true">
        {expired ? <Clock3 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </div>
      <div className="tco-fyers-prompt-copy">
        <div className="tco-fyers-prompt-title">{expired ? 'Your FYERS session has expired' : 'Connect FYERS for live broker data'}</div>
        <p>
          {expired
            ? 'FYERS access tokens expire daily. Reauthorize to resume broker-backed quotes, options data and live trading.'
            : 'You can connect FYERS now or continue with delayed Yahoo Finance charts and quotes. Yahoo data is checked every 4 seconds; availability and delay vary by symbol.'}
        </p>
        <div className="tco-fyers-prompt-caption">
          <span><Clock3 className="h-3 w-3" /> Yahoo fallback · 4-second refresh checks</span>
          <span><CheckCircle2 className="h-3 w-3" /> Yahoo data is for charting/research; live orders still require broker authorization and risk checks</span>
        </div>
      </div>
      <div className="tco-fyers-prompt-actions">
        <button type="button" className="tco-fyers-prompt-primary" onClick={onConnect}>
          Connect FYERS <ArrowRight className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="tco-fyers-prompt-secondary" onClick={dismiss}>
          Continue with delayed data
        </button>
      </div>
      <button type="button" className="tco-fyers-prompt-close" aria-label="Dismiss FYERS connection reminder for today" title="Remind me tomorrow" onClick={dismiss}>
        <X className="h-3.5 w-3.5" />
      </button>
    </section>
  );
}
