import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { NavbarProps, NavItem } from '../../types/navigation';
import { useAuth } from '../../auth/hooks/useAuth';
import { UserMenu } from '../../auth/components/UserMenu';

const NAV_ITEMS: NavItem[] = [
  { label: 'Architecture', href: '#architecture' },
  { label: 'Why TradingCore', href: '#why-tradingcore' },
  { label: 'Brokers', href: '#brokers' },
  { label: 'Workspace', href: '#workspace-preview' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Modules', href: '#future-modules' },
  { label: 'FAQ', href: '#faq' },
];

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAuthModal,
  onLaunchPlatform,
  onNavigate,
  currentView = 'landing',
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  const toggleMobileMenu = () => {
    setMobileMenuOpen((prev) => !prev);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-white/[0.06] bg-[#070a10]/80 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,.18)]">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
        {/* Left: Brand Monogram & Badge */}
        <div className="flex items-center gap-3">
          <a
            href="/" onClick={(e) => { e.preventDefault(); onNavigate?.('landing'); }}
            className="group flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] rounded-md p-1"
            aria-label="TradingCore Home"
          >
            {/* Monogram Geometric Logo */}
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#11131c] border border-[#222636] text-[#10b981] transition-colors group-hover:border-[#33384f]">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
              </svg>
            </div>
            <span className="text-sm font-bold tracking-tight text-[#f3f4f6]">
              Trading<span className="text-[#10b981]">Core</span>
            </span>
          </a>

          {/* Version Badge */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-[#1e2230] bg-[#11131c] px-2.5 py-0.5 font-mono text-[10px] font-medium text-[#8c93a6]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            OS PREVIEW
          </div>
        </div>

        {/* Center: Navigation Links (Desktop >= 1024px) */}
        <nav
          className="hidden lg:flex items-center gap-5"
          aria-label="Main Navigation"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-2 py-1 text-[12px] font-medium text-[#7f899e] transition-all duration-200 hover:bg-white/[0.035] hover:text-[#f3f4f6] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#10b981]" 
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Right: Action CTA Buttons (Desktop) */}
        <div className="hidden lg:flex items-center gap-3">
          {isAuthenticated ? (
            <UserMenu onNavigate={onNavigate} />
          ) : (
            <>
              <button
                onClick={() => onNavigate?.('login')}
                className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-sm font-medium text-[#e5e7eb] transition-all hover:border-white/[0.15] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]" 
              >
                Sign In
              </button>
              <button
                onClick={onLaunchPlatform}
                className="group flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#34d399] via-[#10b981] to-[#14b8a6] px-4 py-2 text-sm font-semibold text-[#04110c] shadow-[0_8px_24px_rgba(16,185,129,.14)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(16,185,129,.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]" 
              >
                Launch Platform
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle Button (< 1024px) */}
        <div className="flex items-center gap-2 lg:hidden">
          {isAuthenticated ? (
            <UserMenu onNavigate={onNavigate} />
          ) : (
            <button
              onClick={onLaunchPlatform}
              className="flex items-center gap-1 rounded-lg bg-[#10b981] px-3 py-1.5 text-xs font-semibold text-[#090a0f] transition-all hover:bg-[#059669]"
            >
              Launch
            </button>
          )}
          <button
            onClick={toggleMobileMenu}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#222636] bg-[#11131c] text-[#8c93a6] transition-colors hover:text-[#f3f4f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-menu"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Slide-down Drawer Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-b border-[#222636] bg-[#090a0f] lg:hidden"
          >
            <div className="flex flex-col gap-1 px-6 pt-4 pb-6">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#222636]/60">
                <span className="h-2 w-2 rounded-full bg-[#10b981]" />
                <span className="font-mono text-xs text-[#8c93a6]">
                  INDIA FIRST · TRADING OS
                </span>
              </div>

              {NAV_ITEMS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={closeMobileMenu}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#8c93a6] transition-colors hover:bg-[#11131c] hover:text-[#f3f4f6]"
                >
                  {item.label}
                </a>
              ))}

              <div className="mt-4 pt-4 border-t border-[#222636] flex flex-col gap-2.5">
                {isAuthenticated ? (
                  <div className="py-2">
                    <UserMenu onNavigate={onNavigate} />
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        closeMobileMenu();
                        onNavigate?.('login');
                      }}
                      className="w-full rounded-lg border border-[#222636] bg-[#11131c] py-2.5 text-sm font-medium text-[#f3f4f6] transition-colors hover:bg-[#181b28]"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => {
                        closeMobileMenu();
                        onLaunchPlatform();
                      }}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#10b981] py-2.5 text-sm font-semibold text-[#090a0f] transition-colors hover:bg-[#059669]"
                    >
                      Launch Platform
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

