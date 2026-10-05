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

    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      setLoadBelowFold(true);
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
    };

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) load();
    }, { rootMargin: '0px 0px 500px 0px' });

    observer.observe(sentinel);
    const fallbackTimer = window.setTimeout(load, 1200);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[var(--tco-surface-2)] text-[var(--tco-text)] font-sans selection:bg-[#3b82f6]/30 selection:text-[#3b82f6] overflow-x-hidden">
      <Navbar
        onOpenAuthModal={onOpenAuthModal}
        onLaunchPlatform={onLaunchPlatform}
        onNavigate={onNavigate}
        currentView={currentView}
      />
      <main className="pt-16">
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
