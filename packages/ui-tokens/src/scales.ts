export const borderWidth = {
  hairline: "1px",
  default: "1px",
  strong: "2px",
} as const;

export const radius = {
  none: "0px",
  small: "4px",
  medium: "8px",
  large: "12px",
  xlarge: "16px",
  pill: "9999px",
} as const;

export const typography = {
  fontFamily: {
    sans: "Inter, ui-sans-serif, system-ui, sans-serif",
    mono: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace",
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    base: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
    "3xl": "1.875rem",
    "4xl": "2.25rem",
    "5xl": "3rem",
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    compact: 1.2,
    default: 1.5,
    relaxed: 1.625,
  },
  letterSpacing: {
    tight: "-0.01em",
    normal: "0em",
    wide: "0.025em",
  },
} as const;

export const spacing = {
  0: "0px",
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  8: "32px",
  10: "40px",
  12: "48px",
  16: "64px",
  20: "80px",
  24: "96px",
} as const;

export const motion = {
  duration: {
    instant: "0ms",
    micro: "120ms",
    fast: "180ms",
    standard: "240ms",
    deliberate: "360ms",
  },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    enter: "cubic-bezier(0, 0, 0, 1)",
    exit: "cubic-bezier(0.3, 0, 1, 1)",
    emphasized: "cubic-bezier(0.2, 0, 0, 1.2)",
  },
  spring: {
    gentle: { stiffness: 180, damping: 24, mass: 1 },
    responsive: { stiffness: 260, damping: 28, mass: 0.9 },
    firm: { stiffness: 360, damping: 32, mass: 0.8 },
  },
} as const;

export const breakpoints = {
  compact: "480px",
  mobile: "640px",
  tablet: "768px",
  laptop: "1024px",
  desktop: "1280px",
  wide: "1536px",
  ultraWide: "1920px",
} as const;

export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 100,
  sidebar: 200,
  dropdown: 300,
  overlay: 400,
  modal: 500,
  toast: 600,
  tooltip: 700,
  commandPalette: 800,
} as const;

export const opacity = {
  transparent: "0",
  subtle: "0.04",
  muted: "0.08",
  soft: "0.16",
  medium: "0.32",
  strong: "0.56",
  solid: "1",
} as const;

export const blur = {
  none: "0px",
  subtle: "4px",
  medium: "12px",
  strong: "20px",
  heavy: "32px",
} as const;

export const baseTokens = {
  borderWidth,
  radius,
  typography,
  spacing,
  motion,
  breakpoints,
  zIndex,
  opacity,
  blur,
} as const;
