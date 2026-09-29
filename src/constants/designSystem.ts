// TradingCore Design System v1.0
// Strict tokens adhering to the dark Linear-inspired system with a blue product accent

export const DS = {
  colors: {
    bg: '#090a0f',
    bgSurface: '#0c0e15',
    bgSubtle: '#11131c',
    bgHover: '#181b28',
    border: '#222636',
    borderHover: '#33384f',
    borderActive: '#3b82f6',
    
    // Text Hierarchy
    textPrimary: '#f3f4f6',
    textSecondary: '#8c93a6',
    textMuted: '#585e72',
    
    // Controlled Accents
    primaryBlue: '#3b82f6',
    primaryBlueHover: '#2563eb',
    negativeRed: '#ef4444',
    accentBlue: '#3b82f6',
    accentPurple: '#a855f7',
  },

  // Common Reusable Tailwind Class Compounds
  buttons: {
    primary:
      'inline-flex items-center justify-center gap-2 rounded-lg bg-[#3b82f6] px-5 py-2.5 font-sans text-xs font-bold text-[var(--tco-surface-2)] transition-all hover:bg-[#2563eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] disabled:opacity-50 cursor-pointer',
    secondary:
      'inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-3)] px-5 py-2.5 font-sans text-xs font-semibold text-[var(--tco-text)] transition-all hover:border-[#33384f] hover:bg-[var(--tco-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] disabled:opacity-50 cursor-pointer',
    ghost:
      'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-xs font-medium text-[var(--tco-muted)] transition-colors hover:bg-[var(--tco-surface-3)] hover:text-[var(--tco-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] cursor-pointer',
    buy:
      'inline-flex items-center justify-center rounded-lg bg-[#3b82f6] px-4 py-2 font-mono text-xs font-bold text-[var(--tco-surface-2)] transition-all hover:bg-[#2563eb] cursor-pointer',
    sell:
      'inline-flex items-center justify-center rounded-lg bg-[#ef4444] px-4 py-2 font-mono text-xs font-bold text-white transition-all hover:bg-[#dc2626] cursor-pointer',
  },

  cards: {
    default:
      'rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-6 transition-colors hover:border-[#33384f]',
    interactive:
      'rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface)] p-6 transition-all hover:border-[#33384f] hover:bg-[#11141d] cursor-pointer',
    highlight:
      'rounded-xl border border-[var(--tco-border)] bg-[var(--tco-surface-3)] p-6',
  },

  badges: {
    neutral:
      'inline-flex items-center gap-1.5 rounded-full border border-[var(--tco-border)] bg-[var(--tco-surface-3)] px-3 py-1 font-mono text-[11px] font-medium tracking-wide text-[var(--tco-muted)]',
    active:
      'inline-flex items-center gap-1.5 rounded-full border border-[#3b82f6]/30 bg-[#3b82f6]/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[#3b82f6]',
  },

  inputs: {
    default:
      'w-full rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-2)] px-3 py-2 font-mono text-xs text-[var(--tco-text)] placeholder-[#585e72] focus:border-[#3b82f6] focus:outline-none',
  },

  section: {
    wrapper: 'py-28 lg:py-36 bg-[var(--tco-surface-2)] border-t border-[#1e2230]',
    container: 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8',
    header: 'text-center max-w-3xl mx-auto mb-16',
  }
};
