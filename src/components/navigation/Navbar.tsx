import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { NavbarProps, NavItem } from '../../types/navigation';
import { useAuth } from '../../auth/hooks/useAuth';
import { UserMenu } from '../../auth/components/UserMenu';
import { ThemeToggle } from '../common/ThemeToggle';

const NAV_ITEMS: NavItem[] = [
  { label: 'Workspace', href: '#workspace-entry' },
  { label: 'CoreSpirit', href: '/explore/indicators' },
  { label: 'Modules', href: '#workspace-modules' },
  { label: 'Access', href: '#access-model-title' },
];

export const Navbar: React.FC<NavbarProps> = ({
  onLaunchPlatform,
  onNavigate,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 h-14 border-b border-white/[0.06] bg-[var(--tco-bg)]/85 shadow-[0_10px_40px_rgba(0,0,0,.16)] backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a
            href="/"
            onClick={(event) => { event.preventDefault(); onNavigate?.('landing'); }}
            className="group flex items-center gap-2 rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tco-accent)]"
            aria-label="TradingCore home"
          >
            <img src="/tradingcoreos-logo.svg" alt="" aria-hidden="true" className="h-9 w-9 shrink-0 rounded-md object-contain" />
            <span className="text-sm font-bold tracking-tight text-[var(--tco-text)]">
              Trading<span className="text-[var(--tco-accent)]">Core</span>
            </span>
          </a>
          <span className="hidden rounded-full border border-[#1e2230] bg-[var(--tco-surface-3)] px-2.5 py-1 font-mono text-[9px] font-medium tracking-wide text-[var(--tco-muted)] sm:inline-flex">
            OS PREVIEW
          </span>
        </div>

        <nav className="hidden items-center gap-3 lg:flex" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-2.5 py-1.5 text-[12px] font-medium text-[#8791a5] transition-colors hover:bg-white/[0.035] hover:text-[var(--tco-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tco-accent)]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <ThemeToggle />
          {isAuthenticated ? (
            <UserMenu onNavigate={onNavigate} />
          ) : (
            <>
              <button
                type="button"
                onClick={() => onNavigate?.('login')}
                className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3.5 py-2 text-[12px] font-medium text-[var(--tco-text-2)] transition-colors hover:border-white/[0.15] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tco-accent)]"
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={onLaunchPlatform}
                className="group inline-flex items-center gap-1.5 rounded-lg bg-[var(--tco-accent)] px-4 py-2 text-[12px] font-semibold text-[var(--tco-surface-2)] shadow-[0_8px_24px_rgba(59,130,246,.14)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(59,130,246,.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tco-accent)]"
              >
                Open workspace
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle compact />
          {isAuthenticated ? (
            <UserMenu onNavigate={onNavigate} />
          ) : (
            <button
              type="button"
              onClick={onLaunchPlatform}
              className="rounded-lg bg-[var(--tco-accent)] px-3 py-2 text-[11px] font-semibold text-[var(--tco-surface-2)]"
            >
              Open workspace
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-3)] text-[var(--tco-muted)] transition-colors hover:text-[var(--tco-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tco-accent)]"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-b border-[var(--tco-border)] bg-[var(--tco-surface-2)] lg:hidden"
          >
            <div className="flex flex-col gap-1 px-5 pb-5 pt-3">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={closeMobileMenu}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--tco-muted)] transition-colors hover:bg-[var(--tco-surface-3)] hover:text-[var(--tco-text)]"
                >
                  {item.label}
                </a>
              ))}
              {!isAuthenticated && (
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--tco-border)] pt-3">
                  <button
                    type="button"
                    onClick={() => { closeMobileMenu(); onNavigate?.('login'); }}
                    className="rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-3)] py-2.5 text-sm font-medium text-[var(--tco-text)]"
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => { closeMobileMenu(); onLaunchPlatform(); }}
                    className="rounded-lg bg-[var(--tco-accent)] py-2.5 text-sm font-semibold text-[var(--tco-surface-2)]"
                  >
                    Open workspace
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
