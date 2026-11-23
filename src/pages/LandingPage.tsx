import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navbar } from '../components/navigation/Navbar';
import { Hero } from '../components/hero/Hero';
import type { NavbarProps } from '../types/navigation';

const LandingBelowFold = lazy(() => import('./LandingBelowFold').then(m => ({ default: m.LandingBelowFold })));

export function LandingPage({
  onOpenAuthModal,
  onLaunchPlatform,
  onNavigate,
  currentView = 'landing',
}: Omit<Pick<NavbarProps, 'onOpenAuthModal' | 'onLaunchPlatform' | 'onNavigate' | 'currentView'>, 'currentView'> & { currentView?: NavbarProps['currentView'] }) {
  const [loadBelowFold, setLoadBelowFold] = useState(false);
  const loadSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = loadSentinelRef.current;
    if (!sentinel) return;

    if (!('IntersectionObserver' in window)) {
      setLoadBelowFold(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setLoadBelowFold(true);
        observer.disconnect();
      }
    }, { rootMargin: '480px 0px' });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--tco-surface-2)] font-sans text-[var(--tco-text)] selection:bg-[#3b82f6]/30 selection:text-[#3b82f6]">
      <Navbar
        onOpenAuthModal={onOpenAuthModal}
        onLaunchPlatform={onLaunchPlatform}
        onNavigate={onNavigate}
        currentView={currentView}
      />
      <main className="pt-14">
        <Hero onLaunch={onLaunchPlatform} />
        <div ref={loadSentinelRef} aria-hidden="true" className="h-px" />
        {loadBelowFold && (
          <Suspense fallback={null}>
            <LandingBelowFold onLaunchPlatform={onLaunchPlatform} />
          </Suspense>
        )}
      </main>
    </div>
  );
}
