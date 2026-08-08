import type { ThemeTokens } from "../contract";

export const darkTheme = {
  color: {
    primary: { solid: "#6D8CFF", hover: "#849DFF", active: "#5576F5", contrast: "#FFFFFF" },
    secondary: { solid: "#334155", hover: "#475569", active: "#1E293B", contrast: "#F8FAFC" },
    accent: { solid: "#22D3EE", hover: "#67E8F9", active: "#06B6D4", contrast: "#082F49" },
    neutral: {
      "0": "#FFFFFF",
      "50": "#F8FAFC",
      "100": "#E2E8F0",
      "200": "#CBD5E1",
      "300": "#94A3B8",
      "400": "#64748B",
      "500": "#475569",
      "600": "#334155",
      "700": "#1E293B",
      "800": "#111827",
      "900": "#0B1120",
      "950": "#060A12",
    },
    semantic: {
      text: {
        primary: "#F8FAFC",
        secondary: "#CBD5E1",
        tertiary: "#94A3B8",
        disabled: "#64748B",
        inverse: "#0B1120",
      },
      icon: { primary: "#E2E8F0", secondary: "#94A3B8", disabled: "#64748B", inverse: "#0B1120" },
      focus: "#93C5FD",
      success: { foreground: "#86EFAC", surface: "#082F1C", border: "#166534" },
      warning: { foreground: "#FDE68A", surface: "#422006", border: "#A16207" },
      error: { foreground: "#FCA5A5", surface: "#450A0A", border: "#B91C1C" },
      info: { foreground: "#93C5FD", surface: "#0C2248", border: "#2563EB" },
      trade: {
        long: { foreground: "#86EFAC", surface: "#082F1C", border: "#166534" },
        short: { foreground: "#FCA5A5", surface: "#450A0A", border: "#B91C1C" },
      },
    },
  },
  background: {
    base: "#060A12",
    elevated: "#0B1120",
    overlay: "#111827",
    modal: "#111827",
    sidebar: "#080E1A",
    workspace: "#060A12",
  },
  glass: {
    blur: "20px",
    opacity: "0.72",
    border: "rgba(203, 213, 225, 0.16)",
    frost: "rgba(15, 23, 42, 0.72)",
    tint: "rgba(109, 140, 255, 0.08)",
  },
  border: {
    subtle: "#1E293B",
    strong: "#475569",
    focus: "#93C5FD",
    stroke: "rgba(203, 213, 225, 0.18)",
  },
  shadow: {
    soft: "0 2px 8px rgba(0, 0, 0, 0.18)",
    medium: "0 8px 24px rgba(0, 0, 0, 0.28)",
    large: "0 20px 48px rgba(0, 0, 0, 0.38)",
    glass: "0 12px 32px rgba(0, 0, 0, 0.24)",
  },
} as const satisfies ThemeTokens;
