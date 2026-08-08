import type { IconSize, IconSizeDefinition, IconStroke, IconStrokeToken } from "./types";

export const iconSizes: Record<IconSize, IconSizeDefinition> = {
  xs: { fontSize: "xs", slot: 3 },
  sm: { fontSize: "sm", slot: 4 },
  md: { fontSize: "base", slot: 4 },
  lg: { fontSize: "lg", slot: 5 },
  xl: { fontSize: "2xl", slot: 6 },
  xxl: { fontSize: "3xl", slot: 8 },
};

export const iconStrokeAliases: Record<IconStroke, IconStrokeToken> = {
  thin: "hairline",
  regular: "default",
  strong: "strong",
};
