"use client";

import { useTheme } from "@/platform/theme";

import { resolveTypography } from "./resolve-typography";
import type { ResolvedTypography, TypographyRole, TypographyViewport } from "./types";

export function useTypography(
  role: TypographyRole,
  viewport: TypographyViewport = "desktop",
): ResolvedTypography {
  const { accessibility, theme } = useTheme();

  return resolveTypography(theme, role, viewport, accessibility);
}
