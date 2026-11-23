import { Navbar } from '../components/navigation/Navbar';
import { Hero } from '../components/hero/Hero';
import { LandingBelowFold } from './LandingBelowFold';
import type { NavbarProps } from '../types/navigation';

export function LandingPage({
  onOpenAuthModal,
  onLaunchPlatform,
  onNavigate,
  currentView = 'landing',
}: Omit<Pick<NavbarProps, 'onOpenAuthModal' | 'onLaunchPlatform' | 'onNavigate' | 'currentView'>, 'currentView'> & { currentView?: NavbarProps['currentView'] }) {
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
        <LandingBelowFold onLaunchPlatform={onLaunchPlatform} />
      </main>
    </div>
  );
}
