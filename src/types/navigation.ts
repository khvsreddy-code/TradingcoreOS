export interface NavItem {
  label: string;
  href: string;
}

export interface NavbarProps {
  onOpenAuthModal: () => void;
  onLaunchPlatform: () => void;
  onNavigate?: (view: string) => void;
  currentView?: 'landing' | 'app' | 'broker-connection';
}
