export const themeNames = ["dark", "light", "high-contrast"] as const;

export type ThemeName = (typeof themeNames)[number];

export type ColorTokens = {
  primary: { solid: string; hover: string; active: string; contrast: string };
  secondary: { solid: string; hover: string; active: string; contrast: string };
  accent: { solid: string; hover: string; active: string; contrast: string };
  neutral: Record<
    "0" | "50" | "100" | "200" | "300" | "400" | "500" | "600" | "700" | "800" | "900" | "950",
    string
  >;
  semantic: {
    text: {
      primary: string;
      secondary: string;
      tertiary: string;
      disabled: string;
      inverse: string;
    };
    icon: { primary: string; secondary: string; disabled: string; inverse: string };
    focus: string;
    success: { foreground: string; surface: string; border: string };
    warning: { foreground: string; surface: string; border: string };
    error: { foreground: string; surface: string; border: string };
    info: { foreground: string; surface: string; border: string };
    trade: {
      long: { foreground: string; surface: string; border: string };
      short: { foreground: string; surface: string; border: string };
    };
  };
};

export type BackgroundTokens = {
  base: string;
  elevated: string;
  overlay: string;
  modal: string;
  sidebar: string;
  workspace: string;
};

export type GlassTokens = {
  blur: string;
  opacity: string;
  border: string;
  frost: string;
  tint: string;
};

export type BorderTokens = {
  subtle: string;
  strong: string;
  focus: string;
  stroke: string;
};

export type ShadowTokens = {
  soft: string;
  medium: string;
  large: string;
  glass: string;
};

export type ThemeTokens = {
  color: ColorTokens;
  background: BackgroundTokens;
  glass: GlassTokens;
  border: BorderTokens;
  shadow: ShadowTokens;
};

export type TokenThemes = Record<ThemeName, ThemeTokens>;
