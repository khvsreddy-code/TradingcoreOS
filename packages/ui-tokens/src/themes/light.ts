import type { ThemeTokens } from "../contract";

export const lightTheme = {
  color: {
    primary: { solid: "#3658D4", hover: "#2D4BBB", active: "#2440A3", contrast: "#FFFFFF" },
    secondary: { solid: "#E2E8F0", hover: "#CBD5E1", active: "#94A3B8", contrast: "#0F172A" },
    accent: { solid: "#0891B2", hover: "#0E7490", active: "#155E75", contrast: "#FFFFFF" },
    neutral: {
      "0": "#FFFFFF",
      "50": "#F8FAFC",
      "100": "#F1F5F9",
      "200": "#E2E8F0",
      "300": "#CBD5E1",
      "400": "#94A3B8",
      "500": "#64748B",
      "600": "#475569",
      "700": "#334155",
      "800": "#1E293B",
      "900": "#0F172A",
      "950": "#020617",
    },
    semantic: {
      text: {
        primary: "#0F172A",
        secondary: "#334155",
        tertiary: "#64748B",
        disabled: "#94A3B8",
        inverse: "#FFFFFF",
      },
      icon: { primary: "#1E293B", secondary: "#64748B", disabled: "#94A3B8", inverse: "#FFFFFF" },
      focus: "#1D4ED8",
      success: { foreground: "#166534", surface: "#DCFCE7", border: "#86EFAC" },
      warning: { foreground: "#92400E", surface: "#FEF3C7", border: "#FCD34D" },
      error: { foreground: "#B91C1C", surface: "#FEE2E2", border: "#FCA5A5" },
      info: { foreground: "#1D4ED8", surface: "#DBEAFE", border: "#93C5FD" },
      trade: {
        long: { foreground: "#166534", surface: "#DCFCE7", border: "#86EFAC" },
        short: { foreground: "#B91C1C", surface: "#FEE2E2", border: "#FCA5A5" },
      },
    },
  },
  background: {
    base: "#F8FAFC",
    elevated: "#FFFFFF",
    overlay: "#F1F5F9",
    modal: "#FFFFFF",
    sidebar: "#FFFFFF",
    workspace: "#F8FAFC",
  },
  glass: {
    blur: "20px",
    opacity: "0.82",
    border: "rgba(51, 65, 85, 0.14)",
    frost: "rgba(255, 255, 255, 0.82)",
    tint: "rgba(54, 88, 212, 0.05)",
  },
  border: {
    subtle: "#E2E8F0",
    strong: "#94A3B8",
    focus: "#1D4ED8",
    stroke: "rgba(51, 65, 85, 0.16)",
  },
  shadow: {
    soft: "0 2px 8px rgba(15, 23, 42, 0.08)",
    medium: "0 8px 24px rgba(15, 23, 42, 0.12)",
    large: "0 20px 48px rgba(15, 23, 42, 0.16)",
    glass: "0 12px 32px rgba(15, 23, 42, 0.1)",
  },
} as const satisfies ThemeTokens;
