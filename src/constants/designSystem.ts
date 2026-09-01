// TradingCore Design System v1.0
// Strict tokens adhering to Linear aesthetic & Emerald restraint

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
    primaryEmerald: '#10b981',
    primaryEmeraldHover: '#059669',
    negativeRed: '#ef4444',
    accentBlue: '#3b82f6',
    accentPurple: '#a855f7',
  },

  // Common Reusable Tailwind Class Compounds
  buttons: {
    primary:
      'inline-flex items-center justify-center gap-2 rounded-lg bg-[#10b981] px-5 py-2.5 font-sans text-xs font-bold text-[#090a0f] transition-all hover:bg-[#059669] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] disabled:opacity-50 cursor-pointer',
    secondary:
      'inline-flex items-center justify-center gap-2 rounded-lg border border-[#222636] bg-[#11131c] px-5 py-2.5 font-sans text-xs font-semibold text-[#f3f4f6] transition-all hover:border-[#33384f] hover:bg-[#181b28] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] disabled:opacity-50 cursor-pointer',
    ghost:
      'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-xs font-medium text-[#8c93a6] transition-colors hover:bg-[#11131c] hover:text-[#f3f4f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] cursor-pointer',
    buy:
      'inline-flex items-center justify-center rounded-lg bg-[#10b981] px-4 py-2 font-mono text-xs font-bold text-[#090a0f] transition-all hover:bg-[#059669] cursor-pointer',
    sell:
      'inline-flex items-center justify-center rounded-lg bg-[#ef4444] px-4 py-2 font-mono text-xs font-bold text-white transition-all hover:bg-[#dc2626] cursor-pointer',
  },

  cards: {
    default:
      'rounded-xl border border-[#222636] bg-[#0c0e15] p-6 transition-colors hover:border-[#33384f]',
    interactive:
      'rounded-xl border border-[#222636] bg-[#0c0e15] p-6 transition-all hover:border-[#33384f] hover:bg-[#11141d] cursor-pointer',
    highlight:
      'rounded-xl border border-[#222636] bg-[#11131c] p-6',
  },

  badges: {
    neutral:
      'inline-flex items-center gap-1.5 rounded-full border border-[#222636] bg-[#11131c] px-3 py-1 font-mono text-[11px] font-medium tracking-wide text-[#8c93a6]',
    active:
      'inline-flex items-center gap-1.5 rounded-full border border-[#10b981]/30 bg-[#10b981]/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[#10b981]',
  },

  inputs: {
    default:
      'w-full rounded-lg border border-[#222636] bg-[#090a0f] px-3 py-2 font-mono text-xs text-[#f3f4f6] placeholder-[#585e72] focus:border-[#10b981] focus:outline-none',
  },

  section: {
    wrapper: 'py-28 lg:py-36 bg-[#090a0f] border-t border-[#1e2230]',
    container: 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8',
    header: 'text-center max-w-3xl mx-auto mb-16',
  }
};
