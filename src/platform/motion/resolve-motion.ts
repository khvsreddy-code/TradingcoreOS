import type { RuntimeTheme } from "@/platform/theme";

import { motionPresets } from "./presets";
import type {
  MotionAccessibility,
  MotionDirection,
  MotionPreset,
  ResolvedMotionPlan,
  ResolvedMotionPreference,
} from "./types";

function resolvePreference(accessibility: MotionAccessibility): ResolvedMotionPreference {
  if (accessibility.preference === "disabled") {
    return "disabled";
  }

  if (accessibility.preference === "reduced" || accessibility.systemReducedMotion) {
    return "reduced";
  }

  return "full";
}

function resolveScale(theme: RuntimeTheme, value: "rest" | "subtle" | "emphasized"): number {
  const solid = Number(theme.scale.opacity.solid);
  const subtle = Number(theme.scale.opacity.subtle);

  if (value === "subtle") {
    return solid - subtle;
  }

  if (value === "emphasized") {
    return solid + subtle;
  }

  return solid;
}

function resolveTranslate(
  direction: MotionDirection,
  distance: string,
  zero: string,
): { x: string; y: string } {
  if (direction === "left") {
    return { x: `-${distance}`, y: zero };
  }

  if (direction === "right") {
    return { x: distance, y: zero };
  }

  if (direction === "up") {
    return { x: zero, y: `-${distance}` };
  }

  return { x: zero, y: direction === "down" ? distance : zero };
}

export function resolveMotionPlan(
  theme: RuntimeTheme,
  preset: MotionPreset,
  accessibility: MotionAccessibility,
): ResolvedMotionPlan {
  const definition = motionPresets[preset];
  const preference = resolvePreference(accessibility);

  if (preference === "disabled") {
    return {
      preset,
      category: definition.category,
      preference,
      transition: {
        type: "tween",
        duration: theme.scale.motion.duration.instant,
        delay: theme.scale.motion.duration.instant,
        easing: theme.scale.motion.easing.standard,
      },
      effects: {},
    };
  }

  const transition = {
    type: definition.transition.type,
    duration:
      preference === "reduced"
        ? theme.scale.motion.duration.instant
        : theme.scale.motion.duration[definition.transition.duration],
    delay: theme.scale.motion.duration[definition.transition.delay],
    easing: definition.transition.easing
      ? theme.scale.motion.easing[definition.transition.easing]
      : undefined,
    spring: definition.transition.spring
      ? theme.scale.motion.spring[definition.transition.spring]
      : undefined,
  } as const;

  return {
    preset,
    category: definition.category,
    preference,
    transition,
    effects: {
      opacity: definition.effects.opacity
        ? {
            from: theme.scale.opacity[definition.effects.opacity.from],
            to: theme.scale.opacity[definition.effects.opacity.to],
          }
        : undefined,
      scale: definition.effects.scale
        ? {
            from: resolveScale(theme, definition.effects.scale.from),
            to: resolveScale(theme, definition.effects.scale.to),
          }
        : undefined,
      translate: definition.effects.translate
        ? resolveTranslate(
            definition.effects.translate.direction,
            theme.scale.spacing[definition.effects.translate.distance],
            theme.scale.spacing[0],
          )
        : undefined,
      rotate: definition.effects.rotate
        ? {
            from: Number(theme.scale.opacity.transparent),
            to: Number(theme.scale.opacity.transparent),
          }
        : undefined,
      blur: definition.effects.blur
        ? {
            from: theme.scale.blur[definition.effects.blur.from],
            to: theme.scale.blur[definition.effects.blur.to],
          }
        : undefined,
    },
  };
}
