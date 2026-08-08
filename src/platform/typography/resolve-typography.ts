import type { RuntimeTheme } from "@/platform/theme";

import {
  letterSpacingAliases,
  lineHeightAliases,
  typographyRecipes,
  weightAliases,
} from "./recipes";
import type {
  NumericTypographyFeatures,
  ResolvedTypography,
  TypographyRole,
  TypographyViewport,
} from "./types";

function resolveNumericFeatures(features?: NumericTypographyFeatures): string {
  if (!features) {
    return "normal";
  }

  return [
    features.tabular ? "tabular-nums" : "proportional-nums",
    features.lining ? "lining-nums" : "oldstyle-nums",
    features.slashedZero ? "slashed-zero" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function resolveTypography(
  theme: RuntimeTheme,
  role: TypographyRole,
  viewport: TypographyViewport,
  accessibility: ResolvedTypography["accessibility"] & { fontScale: number },
): ResolvedTypography {
  const recipe = typographyRecipes[role];
  const typography = theme.scale.typography;

  return {
    role,
    viewport,
    fontFamily: typography.fontFamily[recipe.family],
    fontSize: typography.fontSize[recipe.size[viewport]],
    fontWeight: typography.fontWeight[weightAliases[recipe.weight]],
    lineHeight: typography.lineHeight[lineHeightAliases[recipe.lineHeight]],
    letterSpacing: typography.letterSpacing[letterSpacingAliases[recipe.letterSpacing]],
    fontVariantNumeric: resolveNumericFeatures(recipe.numericFeatures),
    fontScale: accessibility.fontScale,
    accessibility: {
      reducedMotion: accessibility.reducedMotion,
      highContrast: accessibility.highContrast,
    },
  };
}
