export type TradingCoreTheme = 'black' | 'white';

const STORAGE_KEY = 'tradingcore:theme:v1';
const EVENT_NAME = 'tradingcore:theme-change';

export const THEME_STORAGE_KEY = STORAGE_KEY;

export const BLACK_THEME = Object.freeze({
  bg: '#070a10',
  surface: '#0c0e15',
  surface2: '#090a0f',
  surface3: '#11131c',
  hover: '#141824',
  border: '#222636',
  borderSoft: '#1b1f2a',
  text: '#f3f4f6',
  text2: '#e5e7eb',
  heading: '#f5f7fa',
  muted: '#8c93a6',
  dim: '#64748b',
  faint: '#59647a',
  strong: '#ffffff',
  grid: '#171b27',
  axis: '#252b3a',
  surfaceBlue: '#0c1728',
  codeBgDeep: '#06080d',
  accent: '#7c5cff',
  accentSoft: '#9b8aff',
});

export const WHITE_THEME = Object.freeze({
  bg: '#f7f8fa',
  surface: '#ffffff',
  surface2: '#f1f3f5',
  surface3: '#e8ebef',
  hover: '#e2e6eb',
  border: '#d3d9e2',
  borderSoft: '#e1e5eb',
  text: '#111827',
  text2: '#1f2937',
  heading: '#0f172a',
  muted: '#526174',
  dim: '#667085',
  faint: '#7b8797',
  strong: '#0b0f15',
  grid: '#dfe4ea',
  axis: '#c5ccd5',
  surfaceBlue: '#eef3f8',
  codeBgDeep: '#e7ebf0',
  accent: '#6648d8',
  accentSoft: '#3b82f6',
});

export function getInitialTheme(): TradingCoreTheme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'white' || stored === 'black') return stored;
  } catch {}
  return 'black';
}

export function getThemePalette(theme?: TradingCoreTheme) {
  return theme === 'white' ? WHITE_THEME : BLACK_THEME;
}

export function applyTheme(theme: TradingCoreTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.tcoTheme = theme;
  document.documentElement.style.colorScheme = theme === 'white' ? 'light' : 'dark';
  try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { theme } }));
}

export function toggleTheme(): TradingCoreTheme {
  const next = getCurrentTheme() === 'black' ? 'white' : 'black';
  applyTheme(next);
  return next;
}

export function getCurrentTheme(): TradingCoreTheme {
  if (typeof document !== 'undefined' && (document.documentElement.dataset.tcoTheme === 'white' || document.documentElement.dataset.tcoTheme === 'black')) {
    return document.documentElement.dataset.tcoTheme as TradingCoreTheme;
  }
  return getInitialTheme();
}

export function subscribeTheme(listener: (theme: TradingCoreTheme) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ theme?: TradingCoreTheme }>).detail;
    if (detail?.theme) listener(detail.theme);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function bootstrapTheme(): TradingCoreTheme {
  const theme = getInitialTheme();
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.tcoTheme = theme;
    document.documentElement.style.colorScheme = theme === 'white' ? 'light' : 'dark';
  }
  return theme;
}
