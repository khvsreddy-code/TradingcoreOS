import type {
  TypographyLetterSpacing,
  TypographyLineHeight,
  TypographyRecipe,
  TypographyRole,
  TypographyTokenLetterSpacing,
  TypographyTokenLineHeight,
  TypographyTokenWeight,
  TypographyWeight,
} from "./types";

export const weightAliases: Record<TypographyWeight, TypographyTokenWeight> = {
  thin: "regular",
  extraLight: "regular",
  light: "regular",
  regular: "regular",
  medium: "medium",
  semibold: "semibold",
  bold: "bold",
  extraBold: "bold",
};

export const lineHeightAliases: Record<TypographyLineHeight, TypographyTokenLineHeight> = {
  dense: "compact",
  normal: "default",
  relaxed: "relaxed",
  loose: "relaxed",
};

export const letterSpacingAliases: Record<TypographyLetterSpacing, TypographyTokenLetterSpacing> = {
  compressed: "tight",
  normal: "normal",
  wide: "wide",
  monospace: "normal",
};

export const typographyRecipes: Record<TypographyRole, TypographyRecipe> = {
  display: {
    family: "sans",
    size: { desktop: "5xl", tablet: "4xl", mobile: "3xl" },
    weight: "bold",
    lineHeight: "dense",
    letterSpacing: "compressed",
  },
  heading: {
    family: "sans",
    size: { desktop: "3xl", tablet: "2xl", mobile: "xl" },
    weight: "semibold",
    lineHeight: "dense",
    letterSpacing: "compressed",
  },
  title: {
    family: "sans",
    size: { desktop: "2xl", tablet: "xl", mobile: "lg" },
    weight: "semibold",
    lineHeight: "normal",
    letterSpacing: "normal",
  },
  subtitle: {
    family: "sans",
    size: { desktop: "lg", tablet: "lg", mobile: "base" },
    weight: "medium",
    lineHeight: "normal",
    letterSpacing: "normal",
  },
  body: {
    family: "sans",
    size: { desktop: "base", tablet: "base", mobile: "base" },
    weight: "regular",
    lineHeight: "relaxed",
    letterSpacing: "normal",
  },
  caption: {
    family: "sans",
    size: { desktop: "xs", tablet: "xs", mobile: "xs" },
    weight: "regular",
    lineHeight: "normal",
    letterSpacing: "normal",
  },
  label: {
    family: "sans",
    size: { desktop: "sm", tablet: "sm", mobile: "sm" },
    weight: "medium",
    lineHeight: "normal",
    letterSpacing: "wide",
  },
  code: {
    family: "mono",
    size: { desktop: "sm", tablet: "sm", mobile: "xs" },
    weight: "regular",
    lineHeight: "relaxed",
    letterSpacing: "monospace",
    numericFeatures: { tabular: true, lining: true, slashedZero: true },
  },
  numeric: {
    family: "mono",
    size: { desktop: "base", tablet: "base", mobile: "sm" },
    weight: "medium",
    lineHeight: "normal",
    letterSpacing: "monospace",
    numericFeatures: { tabular: true, lining: true, slashedZero: false },
  },
};
