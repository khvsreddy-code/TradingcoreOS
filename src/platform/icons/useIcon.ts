"use client";

import { useTheme } from "@/platform/theme";

import { resolveIcon } from "./resolve-icon";
import type { IconSpec, ResolvedIcon } from "./types";

export function useIcon(spec: IconSpec): ResolvedIcon {
  const { theme } = useTheme();

  return resolveIcon(theme, spec);
}
