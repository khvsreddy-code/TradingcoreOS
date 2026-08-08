import type { ThemeTokens } from "../contract";

export const highContrastTheme = {
  color: {
    primary: { solid: "#7DD3FC", hover: "#BAE6FD", active: "#38BDF8", contrast: "#000000" },
    secondary: { solid: "#FFFFFF", hover: "#E5E7EB", active: "#D1D5DB", contrast: "#000000" },
    accent: { solid: "#FDE047", hover: "#FEF08A", active: "#FACC15", contrast: "#000000" },
    neutral: {
      "0": "#FFFFFF",
      "50": "#F5F5F5",
      "100": "#E5E5E5",
      "200": "#D4D4D4",
      "300": "#A3A3A3",
      "400": "#737373",
      "500": "#525252",
      "600": "#404040",
      "700": "#262626",
      "800": "#171717",
      "900": "#0A0A0A",
      "950": "#000000",
    },
    semantic: {
      text: {
        primary: "#FFFFFF",
        secondary: "#FFFFFF",
        tertiary: "#E5E5E5",
        disabled: "#A3A3A3",
        inverse: "#000000",
      },
      icon: { primary: "#FFFFFF", secondary: "#E5E5E5", disabled: "#A3A3A3", inverse: "#000000" },
      focus: "#FDE047",
      success: { foreground: "#86EFAC", surface: "#000000", border: "#86EFAC" },
      warning: { foreground: "#FDE047", surface: "#000000", border: "#FDE047" },
      error: { foreground: "#FCA5A5", surface: "#000000", border: "#FCA5A5" },
      info: { foreground: "#7DD3FC", surface: "#000000", border: "#7DD3FC" },
      trade: {
        long: { foreground: "#86EFAC", surface: "#000000", border: "#86EFAC" },
        short: { foreground: "#FCA5A5", surface: "#000000", border: "#FCA5A5" },
      },
    },
  },
  background: {
    base: "#000000",
    elevated: "#000000",
    overlay: "#000000",
    modal: "#000000",
    sidebar: "#000000",
    workspace: "#000000",
  },
  glass: { blur: "0px", opacity: "1", border: "#FFFFFF", frost: "#000000", tint: "#000000" },
  border: { subtle: "#FFFFFF", strong: "#FFFFFF", focus: "#FDE047", stroke: "#FFFFFF" },
  shadow: { soft: "none", medium: "none", large: "none", glass: "none" },
} as const satisfies ThemeTokens;
