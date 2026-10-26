import { ReactNode, useEffect, useState } from 'react';
import {
  Activity, Bot, BrainCircuit, Gauge, BriefcaseBusiness, UserCircle,
  SlidersHorizontal, LayoutDashboard, Code2, Newspaper, BookOpen, ArrowUpRight,
} from 'lucide-react';
import { loadTradingCoreRuntime, type TradingCoreRuntimeApi } from '../../services/runtime/tradingCoreRuntimeLoader';
import { ThemeToggle } from '../common/ThemeToggle';
import { FyersConnectionPrompt } from '../brokers/FyersConnectionPrompt';
import type { WorkspaceRoute } from './WorkspaceModuleShellTypes';
export type { WorkspaceRoute } from './WorkspaceModuleShellTypes';

const nav: Array<{ path: WorkspaceRoute; label: string; icon: typeof Activity }> = [
  { path: '/dashboard', label: 'Command Center', icon: LayoutDashboard },
  { path: '/live', label: 'Live Trading', icon: Activity },
  { path: '/corespirit', label: 'CoreSpirit IDE', icon: Code2 },
  { path: '/indicators', label: 'Indicators', icon: Gauge },
  { path: '/models', label: 'Models', icon: BrainCircuit },
  { path: '/predictions', label: 'Predictions', icon: BrainCircuit },
  { path: '/automations', label: 'Automations', icon: Bot },
  { path: '/portfolio', label: 'Portfolio', icon: BriefcaseBusiness },
  { path: '/news', label: 'Market News', icon: Newspaper },
];

type Props = {
  active: WorkspaceRoute;
  children: ReactNode;
  onNavigate: (path: WorkspaceRoute) => void;
  onBackToLanding: () => void;
  onBroker?: () => void;
};

export function WorkspaceModuleShell({ active, children, onNavigate, onBackToLanding, onBroker }: Props) {
  const [brokerState, setBrokerState] = useState<{
    active: ReturnType<TradingCoreRuntimeApi['getPrimaryBrokerInfo']>;
    count: number;
  }>({ active: null, count: 0 });

  useEffect(() => {
    let cancelled = false;
    let disposers: Array<() => void> = [];
    void loadTradingCoreRuntime().then(loaded => {
      if (cancelled) return;
      const refresh = () => setBrokerState({
        active: loaded.getPrimaryBrokerInfo(),
        count: loaded.getAllConnections().filter(connection =>
          (connection.status === 'Connected' || connection.status === 'Read Only') &&
          Number.isFinite(Date.parse(String(connection.tokenExpiry || ''))) &&
          Date.parse(String(connection.tokenExpiry || '')) > Date.now() + 5_000,
        ).length,
      });
      refresh();
      disposers = [
        loaded.on('STATUS_CHANGED', refresh),
        loaded.on('BROKER_CONNECTED', refresh),
        loaded.on('BROKER_DISCONNECTED', refresh),
      ];
      const expiryTimer = globalThis.setInterval(refresh, 15_000);
      disposers.push(() => globalThis.clearInterval(expiryTimer));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      disposers.forEach(stop => stop());
    };
  }, []);

  const broker = brokerState.active;
  return (
    <div className="tco-stitch-shell min-h-screen bg-[var(--tco-bg)] text-[var(--tco-text)] font-sans">
      <a href="#workspace-content" className="sr-only z-50 rounded-md bg-[var(--tco-surface)] p-3 text-sm text-[var(--tco-text)] focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--tco-accent)]">
        Skip to workspace content
      </a>
      <header className="tco-stitch-topbar sticky top-0 z-40 border-b border-[var(--tco-border)] bg-[var(--tco-surface)]/95 backdrop-blur-xl">
        <div className="tco-stitch-topbar-inner">
          <button type="button" onClick={onBackToLanding} title="Go to Command Center" aria-label="Go to Command Center" className="tco-stitch-brand shrink-0">
            <span className="tco-stitch-brand-mark">TC</span>
            <span className="tco-stitch-brand-name">TRADINGCORE<span>OS</span></span>
          </button>

          <nav aria-label="Primary workspace navigation" className="tco-stitch-nav">
            {nav.map(({ path, label, icon: Icon }) => (
              <button
                type="button"
                key={path}
                title={label}
                aria-label={label}
                aria-current={active === path ? 'page' : undefined}
                onClick={() => onNavigate(path)}
                className={`tco-stitch-nav-item ${active === path ? 'is-active' : ''}`}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className="tco-stitch-nav-label">{label}</span>
              </button>
            ))}
            <button
              type="button"
              title="CoreSpirit Language Docs"
              aria-label="CoreSpirit Language Docs"
              aria-current={active === '/corespirit/docs' ? 'page' : undefined}
              onClick={() => onNavigate('/corespirit/docs')}
              className={`tco-stitch-nav-item ${active === '/corespirit/docs' ? 'is-active' : ''}`}
            >
              <BookOpen aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="tco-stitch-nav-label">Docs</span>
            </button>
          </nav>

          <div className="tco-stitch-topbar-actions">
            <span className={`tco-stitch-broker-pill ${broker ? 'is-connected' : ''}`} title={broker ? `Connected: ${broker.name}` : 'No connected broker'}>
              <span className="tco-stitch-status-dot" />
              <span>{broker ? broker.name : 'NO BROKER'}</span>
              <span className="tco-stitch-broker-count">{brokerState.count}</span>
            </span>
            <a href="/explore/scripts" className="tco-stitch-icon-link" aria-label="Open community scripts" title="Community scripts">
              <ArrowUpRight className="h-4 w-4" />
            </a>
            <button type="button" onClick={() => onNavigate('/profile')} className={`tco-stitch-icon-button ${active === '/profile' ? 'is-active' : ''}`} aria-label="Profile and security" title="Profile and security">
              <UserCircle className="h-4 w-4" />
            </button>
            <ThemeToggle compact />
            <button type="button" onClick={onBroker} className="tco-stitch-broker-button" title="Connect or manage brokers">
              <SlidersHorizontal className="h-4 w-4" />
              <span>Broker</span>
            </button>
          </div>
        </div>
      </header>
      <FyersConnectionPrompt onConnect={() => onBroker?.()} />
      <div id="workspace-content" tabIndex={-1}>{children}</div>
    </div>
  );
}

export function ModuleHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="tco-stitch-module-header border-b border-[var(--tco-border)] bg-[var(--tco-surface)] px-5 py-6 md:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-[9px] font-mono uppercase tracking-[.2em] text-[var(--tco-accent)]">{eyebrow}</div>
          <h1 className="mt-1 text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--tco-muted)]">{description}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

export function Panel({ title, subtitle, children, className = '' }: { title: string; subtitle?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`tco-stitch-panel rounded-2xl border border-[var(--tco-border)] bg-[var(--tco-surface)] shadow-[0_10px_30px_rgba(0,0,0,.10)] ${className}`}>
      <div className="border-b border-[var(--tco-border-soft)] px-4 py-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--tco-text-2)]">{title}</div>
        {subtitle && <div className="mt-1 text-[10px] text-[var(--tco-dim)]">{subtitle}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
