import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyTheme, getCurrentTheme, subscribeTheme, type TradingCoreTheme } from './theme';

export type ThemeContextValue = {
  theme: TradingCoreTheme;
  setTheme: (theme: TradingCoreTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<TradingCoreTheme>(() => getCurrentTheme());
  useEffect(() => subscribeTheme(next => setThemeState(next)), []);
  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme: next => applyTheme(next),
    toggleTheme: () => applyTheme(theme === 'black' ? 'white' : 'black'),
  }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}
