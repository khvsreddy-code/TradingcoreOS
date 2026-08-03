export interface NavItem {
  label: string;
  href: string;
}

export interface NavbarProps {
  onOpenAuthModal: () => void;
  onLaunchPlatform: () => void;
  currentView?: 'landing' | 'app';
}
