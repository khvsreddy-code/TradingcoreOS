import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'black' ? 'white' : 'black';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
      className={compact
        ? 'flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-3)] text-[var(--tco-muted)] transition-colors hover:text-[var(--tco-text)] hover:bg-[var(--tco-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]'
        : 'inline-flex items-center gap-2 rounded-lg border border-[var(--tco-border)] bg-[var(--tco-surface-3)] px-3 py-2 text-[10px] font-mono font-bold text-[var(--tco-muted)] transition-colors hover:bg-[var(--tco-hover)] hover:text-[var(--tco-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6]'}
    >
      {theme === 'black' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact && <span>{theme === 'black' ? 'WHITE' : 'BLACK'}</span>}
    </button>
  );
}
