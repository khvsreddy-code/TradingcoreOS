"use client";

import { useTheme } from "@/platform/theme";

import { resolveMotionPlan } from "./resolve-motion";
import type { MotionPreference, MotionPreset, ResolvedMotionPlan } from "./types";

export function useMotion(
  preset: MotionPreset,
  preference: MotionPreference = "system",
): ResolvedMotionPlan {
  const { accessibility, theme } = useTheme();

  return resolveMotionPlan(theme, preset, {
    systemReducedMotion: accessibility.reducedMotion,
    preference,
  });
}
