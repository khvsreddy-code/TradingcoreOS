import type { RuntimeTheme } from "@/platform/theme";

export type TypographyRole =
  "display" | "heading" | "title" | "subtitle" | "body" | "caption" | "label" | "code" | "numeric";

export type TypographyWeight =
  "thin" | "extraLight" | "light" | "regular" | "medium" | "semibold" | "bold" | "extraBold";

export type TypographyLineHeight = "dense" | "normal" | "relaxed" | "loose";
export type TypographyLetterSpacing = "compressed" | "normal" | "wide" | "monospace";
export type TypographyViewport = "desktop" | "tablet" | "mobile";

export type TypographyFontFamily = keyof RuntimeTheme["scale"]["typography"]["fontFamily"];
export type TypographyFontSize = keyof RuntimeTheme["scale"]["typography"]["fontSize"];
export type TypographyTokenWeight = keyof RuntimeTheme["scale"]["typography"]["fontWeight"];
export type TypographyTokenLineHeight = keyof RuntimeTheme["scale"]["typography"]["lineHeight"];
export type TypographyTokenLetterSpacing =
  keyof RuntimeTheme["scale"]["typography"]["letterSpacing"];

export type NumericTypographyFeatures = {
  tabular: boolean;
  lining: boolean;
  slashedZero: boolean;
};

export type TypographyRecipe = {
  family: TypographyFontFamily;
  size: Record<TypographyViewport, TypographyFontSize>;
  weight: TypographyWeight;
  lineHeight: TypographyLineHeight;
  letterSpacing: TypographyLetterSpacing;
  numericFeatures?: NumericTypographyFeatures;
};

export type ResolvedTypography = {
  role: TypographyRole;
  viewport: TypographyViewport;
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: string;
  fontVariantNumeric: string;
  fontScale: number;
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
  };
};
